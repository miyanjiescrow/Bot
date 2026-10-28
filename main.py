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

def run_flask():
    # Render provides the port via the PORT environment variable
    port = int(os.environ.get("PORT", 3000))
    logger.info(f"🌐 Starting health check server on port {port}...")
    try:
        # Use a more robust way to run Flask in a thread
        from werkzeug.serving import make_server
        srv = make_server('0.0.0.0', port, app)
        srv.serve_forever()
    except Exception as e:
        logger.error(f"❌ Flask server failed: {e}")

import signal

def main():
    # ۱. راه‌اندازی سریع سرور سلامت (Health Check) برای Render
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    logger.info("🚀 Starting Miyanji Smart Escrow Application...")
    
    # ۲. بررسی اتصال دیتابیس
    if not db.supabase:
        logger.error("❌ Critical: Supabase client failed to initialize!")
    else:
        logger.info("🔗 Supabase connection established.")

    # ۳. پیکربندی ربات
    bot = telebot.TeleBot(config.BOT_TOKEN, threaded=True, num_threads=40)

    # مدیریت سیگنال‌های سیستمی جهت خروج امن و آزادسازی نشست در Render
    def shutdown_handler(signum, frame):
        logger.info("🛑 Received termination signal (SIGTERM/SIGINT). Stopping polling...")
        try:
            bot.stop_polling()
        except Exception:
            pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)

    # ۴. ثبت تمامی هندلرها با ترتیب اولویت
    try:
        logger.info("🛠 Registering handlers...")
        auth_handlers.register_auth_handlers(bot)
        admin.register_admin_handlers(bot)
        admin_settings.register_admin_settings_handlers(bot)
        user.register_user_handlers(bot)
        reminders.start_reminder_service(bot)
        logger.info("✅ All handlers registered successfully.")
    except Exception as e:
        logger.error(f"💥 Failed to register handlers: {e}", exc_info=True)
        return

    # ۵. پاکسازی نشست‌های قبلی و حذف وب‌هوک
    try:
        bot.remove_webhook()
        bot.delete_webhook(drop_pending_updates=True)
        logger.info("🧹 Webhooks cleared and pending updates dropped.")
        time.sleep(3) 
    except Exception as e:
        logger.warning(f"⚠️ Webhook notice: {e}")

    # ۶. شروع پولینگ بی‌نهایت با مدیریت خطای ۴۰۹
    logger.info("📡 Bot is now polling for updates...")
    while True:
        try:
            bot.infinity_polling(
                timeout=20, 
                long_polling_timeout=10, 
                skip_pending=True,
                logger_level=logging.ERROR
            )
        except Exception as e:
            err_msg = str(e)
            if "409" in err_msg or "Conflict" in err_msg:
                logger.warning("⚔️ Polling Conflict (409) detected. Waiting 15s to release session...")
                time.sleep(15)
            else:
                logger.error(f"💥 Polling Error: {e}")
                time.sleep(5)

if __name__ == "__main__":
    main()
