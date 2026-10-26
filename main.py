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
    logger.info("🎬 Starting Miyanji Smart Escrow Application...")
    
    if not db.supabase:
        logger.error("❌ Supabase client failed to initialize!")
        # Fallback to local memory mode but keep running for health checks
        logger.warning("⚠️ Running in local-memory mode (DB limited).")

    # Start the web server in a background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Bot Initialization
    bot = telebot.TeleBot(config.BOT_TOKEN, threaded=True, num_threads=40)

    def register_all():
        try:
            logger.info("🛠 Registering handlers in priority order...")
            # We register user handlers FIRST if we want them to have priority over generic ones
            # But auth handlers should be first for session check.
            auth_handlers.register_auth_handlers(bot)
            admin.register_admin_handlers(bot)
            admin_settings.register_admin_settings_handlers(bot)
            user.register_user_handlers(bot)
            reminders.start_reminder_service(bot)
            logger.info("✅ All components registered and coordinated.")
        except Exception as e:
            logger.error(f"💥 Handler registration failed: {e}", exc_info=True)
            sys.exit(1)

    register_all()
    
    # Webhook Cleanup
    try:
        bot.remove_webhook()
        logger.info("🧹 Webhooks cleared. Waiting for potential overlaps to settle...")
        time.sleep(5) # Increased wait time
    except Exception as e:
        logger.warning(f"⚠️ Webhook cleanup notice: {e}")

    # Infinity Polling Loop
    while True:
        try:
            logger.info("🚀 Bot is now polling for updates...")
            bot.infinity_polling(
                timeout=60, 
                long_polling_timeout=20, 
                skip_pending=True
            )
        except Exception as e:
            err_msg = str(e)
            if "409" in err_msg or "Conflict" in err_msg:
                logger.warning("⚔️ Polling Conflict (409) detected. Backing off for 30s...")
                time.sleep(30)
            else:
                logger.error(f"💥 Polling Error: {e}")
                time.sleep(10)

if __name__ == "__main__":
    main()
