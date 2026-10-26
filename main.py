import sys
import logging
import time
import telebot
import os
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

def main():
    logger.info("🎬 Starting Miyanji Smart Escrow Application...")
    
    # 2. Database Connectivity Check
    if not db.supabase:
        logger.error("❌ Supabase client failed to initialize! Check environment variables.")
        return
    logger.info("🔗 Supabase connection verified.")

    # 3. Bot Initialization (Threaded mode for high performance)
    bot = telebot.TeleBot(config.BOT_TOKEN, threaded=True, num_threads=50)

    # 4. Handler Registration (ORDER MATTERS)
    # Auth handlers MUST come first to intercept /start and auth states
    # User handlers come last as they contain fallback logic
    def register_all():
        try:
            logger.info("🛠 Registering handlers in priority order...")
            auth_handlers.register_auth_handlers(bot)
            admin.register_admin_handlers(bot)
            admin_settings.register_admin_settings_handlers(bot)
            user.register_user_handlers(bot) # Fallbacks are here
            reminders.start_reminder_service(bot)
            logger.info("✅ All components registered and coordinated.")
        except Exception as e:
            logger.error(f"💥 Handler registration failed: {e}", exc_info=True)
            sys.exit(1)

    register_all()
    
    # 5. Webhook Cleanup
    try:
        bot.delete_webhook(drop_pending_updates=True)
        logger.info("🧹 Old webhooks cleared (Polling Mode Active).")
    except Exception as e:
        logger.warning(f"⚠️ Webhook cleanup notice: {e}")

    # 6. Infinity Polling Loop
    while True:
        try:
            logger.info("🚀 Bot is now polling for updates...")
            bot.infinity_polling(
                timeout=60, 
                long_polling_timeout=30, 
                skip_pending=True
            )
        except Exception as e:
            logger.error(f"💥 Critical Polling Error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    main()
