import sys
import logging
import time
import telebot
import os
import signal
import json
import urllib.request
import fcntl
from logging.handlers import RotatingFileHandler
from config import config
import database as db

# Import modules to register handlers
import auth_handlers
import admin
import admin_settings
import user
import reminders

# Logging Configuration (Pure Telegram Bot - No Web Service)
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log_file = 'bot.log'
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_formatter)
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
file_handler.setFormatter(log_formatter)

logging.basicConfig(level=logging.INFO, handlers=[stream_handler, file_handler])
logger = logging.getLogger("Miyanji_Main")


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

def is_valid_telegram_token(token: str) -> bool:
    """بررسی اعتبارسنجی دقیق توکن تلگرام جهت جلوگیری از خطای 401 Unauthorized"""
    if not token or not isinstance(token, str):
        return False
    clean = token.strip()
    if ":" not in clean:
        return False
    parts = clean.split(":", 1)
    if not parts[0].isdigit() or len(parts[0]) < 6:
        return False
    if len(parts[1]) < 20:
        return False
    # شناسایی توکن‌های تستی یا پیش‌فرض
    if parts[0] == "123456789" or "ABCdefGhIJKlmNo" in parts[1] or "placeholder" in clean.lower():
        return False
    return True

def start_render_health_server():
    """
    راه‌اندازی سرور HTTP سبک داخلی روی پورت محیطی ($PORT) برای سرویس‌های رندر (Render Web Service).
    این وب‌سرور مینیمال در یک ترد دیمون مستقل (Daemon Thread) اجرا می‌شود تا:
    ۱. سرویس رندر فوراً وضعیت لایو (Live) دریافت کند.
    ۲. از خطای متداول 'Port scan timeout' در پلن‌های رایگان رندر جلوگیری کند.
    ۳. امکان پینگ دوره‌ای و مانیتورینگ آنلاین سرویس فراهم شود.
    """
    port_env = os.getenv("PORT")
    if not port_env:
        return None

    try:
        port = int(port_env)
    except (ValueError, TypeError):
        return None

    from http.server import HTTPServer, BaseHTTPRequestHandler
    import threading

    class RenderHealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            raw_token = getattr(config, "BOT_TOKEN", "")
            has_token = is_valid_telegram_token(raw_token)
            status_data = {
                "status": "live",
                "service": "Miyanji Smart Escrow Telegram Bot",
                "engine": "Python TeleBot",
                "bot_configured": has_token,
                "bot_username": getattr(config, "BOT_USERNAME", "mianji_ir_bot"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            self.wfile.write(json.dumps(status_data, ensure_ascii=False).encode("utf-8"))

        def do_HEAD(self):
            self.send_response(200)
            self.end_headers()

        def log_message(self, format, *args):
            # جلوگیری از پر شدن فایل لاگ با پینگ‌های مکرر هلث‌چک
            pass

    try:
        server = HTTPServer(("0.0.0.0", port), RenderHealthHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True, name="RenderHealthServer")
        server_thread.start()
        logger.info(f"🌐 [RENDER_HEALTH] Health check HTTP server active on 0.0.0.0:{port} -> Service marked as LIVE 🎉")
        return server
    except Exception as e:
        logger.warning(f"Notice starting Render health server on port {port}: {e}")
        return None

def main():
    # ۱. راه‌اندازی فوری سرور هلث‌چک برای رندر جهت دریافت وضعیت Live
    start_render_health_server()

    # ۲. ثبت قفل تک‌نسخه‌ای جهت جلوگیری از اجرای چندگانه روی یک سرور
    acquire_single_instance_lock()
    
    logger.info("🚀 Starting Miyanji Smart Escrow Application (Pure Telegram Bot)...")

    # ۳. بررسی اتصال دیتابیس
    if not db.supabase:
        logger.warning("⚠️ Notice: Supabase cloud client is running with SQLite local persistent storage fallback.")
    else:
        logger.info("🔗 Supabase connection established.")

    # ۴. پیکربندی و اعتبارسنجی توکن ربات تلگرام
    raw_token = config.BOT_TOKEN
    has_real_token = is_valid_telegram_token(raw_token)

    if not has_real_token:
        logger.warning(
            "⚠️ [BOT_TOKEN_REQUIRED] توکن معتبر ربات تلگرام در متغیرهای محیطی یافت نشد!\n"
            "   برای اینکه ربات به تلگرام متصل و آنلاین شود:\n"
            "   ۱. در پنل هاست یا رندر (Render Dashboard)، به تب Environment بروید.\n"
            "   ۲. متغیر BOT_TOKEN را با توکن دریافتی از @BotFather مقداردهی کنید.\n"
            "   سرویس هم‌اکنون در وضعیت Live و هلث‌چک فعال باقی مانده است."
        )
        token = "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ1234567"
    else:
        token = raw_token.strip()

    bot = telebot.TeleBot(
        token, 
        threaded=True, 
        num_threads=40,
        exception_handler=BotWorkerExceptionHandler()
    )

    if has_real_token:
        try:
            bot_info = bot.get_me()
            if bot_info and bot_info.username:
                verified_username = bot_info.username.lstrip("@").strip()
                config.BOT_USERNAME = verified_username
                os.environ["BOT_USERNAME"] = verified_username
                logger.info(f"🤖 Verified Telegram Bot Identity: @{verified_username} ({bot_info.first_name}) [ID: {bot_info.id}]")
        except Exception as e:
            logger.warning(f"Notice connecting to Telegram getMe: {e}")

    # ۵. مدیریت سیگنال‌های سیستمی جهت خروج امن و آزادسازی فوری نشست در Render (Rolling Update)
    def shutdown_handler(signum, frame):
        logger.info(f"🛑 Received termination signal ({signum}). Stopping polling and releasing session...")
        try:
            bot.stop_polling()
        except Exception:
            pass
        if has_real_token:
            try:
                cleanup_and_reset_telegram_session(token, bot)
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

    # ۶. ثبت تمامی هندلرها با ترتیب اولویت
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

    # ۷. در صورت عدم وجود توکن واقعی، در حالت استندبای فعال می‌ماند تا سرویس کرش نکند
    if not has_real_token:
        logger.info("💤 Bot handlers verified successfully. Set BOT_TOKEN in environment to begin live Telegram polling.")
        while True:
            time.sleep(30)

    # پاکسازی مطمئن وبهوک یک‌بار در ابتدای استارت سیستم
    cleanup_and_reset_telegram_session(token, bot, drop_pending_updates=True)

    # ۸. شروع پولینگ پایدار و دائمی
    conflict_count = 0
    while True:
        try:
            logger.info("📡 Bot is now polling for updates (infinity_polling)...")
            bot.infinity_polling(
                timeout=20,
                long_polling_timeout=20,
                skip_pending=True,
                logger_level=logging.INFO
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
                cleanup_and_reset_telegram_session(token, bot, drop_pending_updates=True)
                time.sleep(2)
            elif e.error_code == 429:
                wait_time = int(getattr(e, 'parameters', {}).get('retry_after', 15) if getattr(e, 'parameters', None) else 15)
                logger.warning(f"⚠️ Telegram Rate Limit (429). Retrying after {wait_time}s...")
                time.sleep(wait_time)
            elif e.error_code == 401:
                logger.error("❌ Telegram Token is invalid or revoked (401 Unauthorized). Please check BOT_TOKEN in environment variables.")
                time.sleep(30)
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
                cleanup_and_reset_telegram_session(token, bot, drop_pending_updates=True)
                time.sleep(2)
            else:
                conflict_count = 0
                logger.error(f"💥 General Polling Error: {e}", exc_info=True)
                time.sleep(5)

if __name__ == "__main__":
    main()
