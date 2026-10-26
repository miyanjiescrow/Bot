import sys
import logging
import time
import telebot
from config import config
import database as db
import auth_handlers
import admin
import user
import admin_settings
import reminders

import os
import logging
from logging.handlers import RotatingFileHandler

# پیکربندی لاگ‌گیری پیشرفته با قابلیت چرخش فایل
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log_file = 'bot.log'

# هندلر برای خروجی استاندارد
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_formatter)

# هندلر برای فایل با قابلیت چرخش (حداکثر ۵ مگابایت، تا ۵ فایل پشتیبان)
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
file_handler.setFormatter(log_formatter)

logging.basicConfig(
    level=logging.INFO,
    handlers=[stream_handler, file_handler]
)
logger = logging.getLogger("Miyanji_Main")

def main():
    logger.info("🎬 Starting Miyanji application...")
    
    # تست اتصال دیتابیس سوپابیس
    if db.supabase:
        logger.info("🔗 Testing Supabase connection...")
    else:
        logger.error("❌ Supabase client failed to initialize!")

    # راه‌اندازی ربات با تردینگ فعال برای پردازش همزمان
    bot = telebot.TeleBot(config.BOT_TOKEN, threaded=True, num_threads=50)

    # ثبت هندلرها با مدیریت خطا
    def register_all():
        try:
            auth_handlers.register_auth_handlers(bot)
            admin.register_admin_handlers(bot)
            user.register_user_handlers(bot)
            admin_settings.register_admin_settings_handlers(bot)
            reminders.start_reminder_service(bot)
            logger.info("✅ All handlers registered successfully.")
        except Exception as e:
            logger.error(f"💥 Handler registration failed: {e}")

    register_all()
    
    # حذف وب‌هوک‌های قدیمی برای جلوگیری از تداخل
    try:
        bot.delete_webhook(drop_pending_updates=True)
    except Exception as e:
        logger.warning(f"⚠️ Could not delete webhook: {e}")

    # اجرای حلقه پولینگ ربات
    while True:
        try:
            logger.info("🚀 Starting bot polling...")
            bot.infinity_polling(
                timeout=60, 
                long_polling_timeout=30, 
                skip_pending=True
            )
        except Exception as e:
            logger.error(f"💥 Polling error: {e}")
            time.sleep(10) # تاخیر برای جلوگیری از اسپم شدن خطاها

if __name__ == "__main__":
    main()
