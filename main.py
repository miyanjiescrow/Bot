import sys
import logging
import time
import telebot
import os
import threading
from flask import Flask
from logging.handlers import RotatingFileHandler
from config import config
import database as db

# Import modules to register handlers
import auth_handlers
import admin
import admin_settings
import user
import reminders

# 1. Advanced Logging Configuration
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log_file = 'bot.log'
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_formatter)
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
file_handler.setFormatter(log_formatter)

logging.basicConfig(level=logging.INFO, handlers=[stream_handler, file_handler])
logger = logging.getLogger("Miyanji_Main")

# 2. Minimal Flask Server for Render Port Binding
app = Flask(__name__)

@app.route('/')
def health_check():
    return "Miyanji Bot is alive and polling!", 200

@app.route('/healthz')
def healthz():
    return "OK", 200

def run_flask():
    preferred_port = int(os.environ.get("PORT") or os.environ.get("FLASK_PORT") or 8888)
    ports_to_try = [preferred_port, 8888, 8889, 8890]
    for p in ports_to_try:
        try:
            from werkzeug.serving import make_server
            srv = make_server('0.0.0.0', p, app)
            logger.info(f"🌐 Starting health check server on port {p}...")
            srv.serve_forever()
            break
        except Exception as e:
            logger.debug(f"Port {p} not available: {e}")

import signal
import json
import urllib.request
import fcntl

PID_FILE = "/tmp/miyanji_bot.pid"
_flock_handle = None

def acquire_single_instance_lock():
    """
    اطمینان از اجرای تنها یک اینستنس از ربات روی سرور و بستن پروسه‌های معلق قبلی.
    از فایل PID و قفل fcntl برای تضمین عدم اجرای چندگانه استفاده می‌کند.
    """
    global _flock_handle
    current_pid = os.getpid()

    # ۱. بررسی پروسه قبلی از روی فایل PID
    if os.path.exists(PID_FILE):
        try:
            with open(PID_FILE, "r") as f:
                content = f.read().strip()
                old_pid = int(content) if content.isdigit() else None
            if old_pid and old_pid != current_pid:
                logger.warning(f"⚠️ Found existing bot process with PID {old_pid}. Terminating it...")
                try:
                    os.kill(old_pid, signal.SIGTERM)
                    time.sleep(1.5)
                    os.kill(old_pid, signal.SIGKILL)
                except OSError:
                    pass
        except Exception as e:
            logger.warning(f"Notice handling PID lock file: {e}")

    try:
        with open(PID_FILE, "w") as f:
            f.write(str(current_pid))
    except Exception as e:
        logger.warning(f"Notice writing PID lock: {e}")

    # ۲. ثبت قفل سیستمی غیرمسدودکننده (System File Lock)
    try:
        _flock_handle = open("/tmp/miyanji_bot.flock", "w")
        fcntl.flock(_flock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except Exception:
        logger.warning("Another process might be holding the flock lock.")

def cleanup_and_reset_telegram_session(token: str, bot_instance=None, drop_pending_updates: bool = True):
    """
    پاکسازی مطمئن و استاندارد وبهوک تلگرام جهت آغاز پولینگ.
    """
    if not token:
        logger.warning("BOT_TOKEN is empty, skipping session reset.")
        return

    base_url = f"https://api.telegram.org/bot{token}"
    logger.info(f"🧹 Clearing webhook (drop_pending_updates={drop_pending_updates})...")
    
    if bot_instance:
        try:
            bot_instance.remove_webhook()
            bot_instance.delete_webhook(drop_pending_updates=drop_pending_updates)
            logger.info("✅ Webhook removed via bot_instance.")
        except Exception as e:
            logger.debug(f"Notice bot_instance webhook removal: {e}")

    try:
        telebot.apihelper.delete_webhook(token, drop_pending_updates=drop_pending_updates)
    except Exception as e:
        logger.debug(f"Notice apihelper webhook purge: {e}")

    try:
        drop_param = "true" if drop_pending_updates else "false"
        url = f"{base_url}/deleteWebhook?drop_pending_updates={drop_param}"
        req = urllib.request.Request(url, headers={"User-Agent": "MiyanjiEscrowBot/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except Exception as e:
        logger.debug(f"Direct Webhook purge notice: {e}")

    time.sleep(1.0)

class BotWorkerExceptionHandler(telebot.ExceptionHandler):
    def handle(self, exception):
        # Do not swallow polling-level API exceptions or conflicts (409, 429, etc.)
        # Returning False allows telebot to break out of __threaded_polling so our
        # outer supervisor loop can back off, wait for the old container to shut down, and reconnect.
        if isinstance(exception, telebot.apihelper.ApiTelegramException):
            if exception.error_code in (409, 429, 502, 503, 504):
                logger.warning(f"⚔️ Telebot ApiTelegramException ({exception.error_code}): {exception.description} -> Triggering outer recovery loop")
                return False
        err_str = str(exception)
        if any(term in err_str for term in ["Conflict", "409", "terminated by other getUpdates"]):
            logger.warning("⚔️ Polling Conflict error caught -> Triggering outer recovery loop")
            return False
        logger.error(f"🚨 [BOT_WORKER_ERROR] Exception in message handler: {exception}", exc_info=True)
        return True

def main():
    # ۱. ثبت قفل تک‌نسخه‌ای جهت جلوگیری از اجرای چندگانه روی یک سرور
    acquire_single_instance_lock()

    # ۲. راه‌اندازی سریع سرور سلامت (Health Check) برای Render
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    logger.info("🚀 Starting Miyanji Smart Escrow Application...")
    
    # ۳. بررسی اتصال دیتابیس
    if not db.supabase:
        logger.error("❌ Critical: Supabase client failed to initialize!")
    else:
        logger.info("🔗 Supabase connection established.")

    # ۴. پیکربندی ربات تلگرام با هندلر خطا برای تردها
    token = config.BOT_TOKEN
    has_real_token = bool(token and ":" in token)

    if not has_real_token:
        logger.warning("⚠️ BOT_TOKEN is not configured or invalid in environment variables.")
        logger.info("ℹ️ Handlers and database services will be validated in standby mode.")
        token = "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ1234567"

    bot = telebot.TeleBot(
        token, 
        threaded=True, 
        num_threads=40,
        exception_handler=BotWorkerExceptionHandler()
    )

    # مدیریت سیگنال‌های سیستمی جهت خروج امن و آزادسازی فوری نشست در Render (Rolling Update)
    def shutdown_handler(signum, frame):
        logger.info(f"🛑 Received termination signal ({signum}). Stopping polling and releasing session...")
        try:
            bot.stop_polling()
        except Exception:
            pass
        if has_real_token:
            try:
                cleanup_and_reset_telegram_session(config.BOT_TOKEN, bot)
            except Exception:
                pass
        try:
            if os.path.exists(PID_FILE):
                os.remove(PID_FILE)
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)

    # ۵. ثبت تمامی هندلرها با ترتیب اولویت
    try:
        logger.info("🛠 Registering handlers...")
        auth_handlers.register_auth_handlers(bot)
        admin.register_admin_handlers(bot)
        admin_settings.register_admin_settings_handlers(bot)
        user.register_user_handlers(bot)
        if has_real_token:
            reminders.start_reminder_service(bot)
        logger.info("✅ All handlers registered successfully.")
    except Exception as e:
        logger.error(f"💥 Failed to register handlers: {e}", exc_info=True)
        return

    # ۶. بررسی وجود توکن ربات تلگرام جهت آغاز پولینگ واقعی
    if not has_real_token:
        logger.info("💤 Bot handlers verified successfully. Set BOT_TOKEN in .env to begin live Telegram polling.")
        while True:
            time.sleep(30)

    # پاکسازی مطمئن وبهوک یک‌بار در ابتدای استارت سیستم
    cleanup_and_reset_telegram_session(config.BOT_TOKEN, bot, drop_pending_updates=True)

    # ۷. شروع پولینگ پایدار و دائمی بدون دور ریختن پیام‌های ورودی
    conflict_count = 0
    while True:
        try:
            logger.info("📡 Bot is now polling for updates...")
            bot.polling(
                none_stop=True,
                timeout=25,
                long_polling_timeout=20,
                skip_pending=True
            )
            conflict_count = 0
            time.sleep(1)
        except telebot.apihelper.ApiTelegramException as e:
            try:
                bot.stop_polling()
            except Exception:
                pass
            if e.error_code == 409 or "Conflict" in str(e) or "terminated by other getUpdates" in str(e):
                conflict_count += 1
                wait_time = min(15 + conflict_count * 10, 60)
                logger.warning(
                    f"⚔️ [CONFLICT_409] Duplicate bot instance detected on Telegram API! [Attempt #{conflict_count}]\n"
                    f"   Detail: {e.description}\n"
                    f"   Another instance (e.g., previous deployment on Render, or local terminal) is calling getUpdates.\n"
                    f"   Pausing polling for {wait_time}s to allow the competing instance to release session..."
                )
                time.sleep(wait_time)
                cleanup_and_reset_telegram_session(config.BOT_TOKEN, bot, drop_pending_updates=True)
                time.sleep(2)
            elif e.error_code == 429:
                wait_time = int(getattr(e, 'parameters', {}).get('retry_after', 15) if getattr(e, 'parameters', None) else 15)
                logger.warning(f"⚠️ Telegram Rate Limit (429). Retrying after {wait_time}s...")
                time.sleep(wait_time)
            else:
                conflict_count = 0
                logger.error(f"💥 Telegram API error ({e.error_code}): {e.description}")
                time.sleep(5)
        except Exception as e:
            try:
                bot.stop_polling()
            except Exception:
                pass
            err_msg = str(e)
            if "409" in err_msg or "Conflict" in err_msg or "terminated by other getUpdates" in err_msg:
                conflict_count += 1
                wait_time = min(15 + conflict_count * 10, 60)
                logger.warning(
                    f"⚔️ [CONFLICT_409] String matched [Attempt #{conflict_count}]: {err_msg}. "
                    f"Waiting {wait_time}s for competing instance to release session..."
                )
                time.sleep(wait_time)
                cleanup_and_reset_telegram_session(config.BOT_TOKEN, bot, drop_pending_updates=True)
                time.sleep(2)
            else:
                conflict_count = 0
                logger.error(f"💥 General Polling Error: {e}", exc_info=True)
                time.sleep(5)

if __name__ == "__main__":
    main()
