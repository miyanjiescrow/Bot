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

def main():
    # 1. Start health check server ASAP to satisfy Render
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    logger.info("🎬 Starting Miyanji Smart Escrow Application...")
    
    # 2. Check Database Connection
    if not db.supabase:
        logger.error("❌ Supabase client failed to initialize!")
        # We continue to allow health checks but bot features will be limited
        logger.warning("⚠️ Running in local-memory mode (DB limited).")
    else:
        logger.info("🔗 Supabase connection verified.")

    # 3. Initialize Bot
    bot = telebot.TeleBot(config.BOT_TOKEN, threaded=True, num_threads=40)

    def register_all():
        try:
            logger.info("🛠 Registering handlers in priority order...")
            auth_handlers.register_auth_handlers(bot)
            admin.register_admin_handlers(bot)
            admin_settings.register_admin_settings_handlers(bot)
            user.register_user_handlers(bot)
            reminders.start_reminder_service(bot)
            logger.info("✅ All handlers registered.")
        except Exception as e:
            logger.error(f"💥 Handler registration failed: {e}", exc_info=True)
            sys.exit(1)

    register_all()
    
    # 4. Clean up Webhooks and wait for session release
    try:
        # Crucial: Drop pending updates to avoid 409 conflict during rolling updates
        bot.remove_webhook()
        bot.delete_webhook(drop_pending_updates=True)
        logger.info("🧹 Webhooks cleared and pending updates dropped.")
        # Give Render and Telegram time to recognize the new connection
        time.sleep(12) 
    except Exception as e:
        logger.warning(f"⚠️ Webhook cleanup notice: {e}")

    # 5. Infinity Polling Loop
    logger.info("🚀 Bot is now polling for updates...")
    while True:
        try:
            bot.infinity_polling(
                timeout=90, 
                long_polling_timeout=20, 
                skip_pending=True,
                logger_level=logging.ERROR # Reduce log noise
            )
        except Exception as e:
            err_msg = str(e)
            if "409" in err_msg or "Conflict" in err_msg:
                logger.warning("⚔️ Polling Conflict (409). Another instance is fighting for updates. Backing off for 40s...")
                time.sleep(40)
            else:
                logger.error(f"💥 Polling Error: {e}")
                time.sleep(10)

if __name__ == "__main__":
    main()
