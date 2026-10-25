import os
import sys
import threading
import logging
import time
from flask import Flask
import telebot
from config import config
import database as db
import auth_handlers
import admin
import user
import admin_settings
import reminders

# پیکربندی لاگ‌گیری استاندارد
logging.basicConfig(
    stream=sys.stdout,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger("Miyanji_Main")

# سرور Flask سبک برای Render Web Service
app = Flask(__name__)

@app.route('/', methods=['GET', 'HEAD'])
def index():
    return "Miyanji Telegram Bot is live.", 200

@app.route('/health', methods=['GET', 'HEAD'])
def health_check():
    return "OK", 200

def run_flask_server():
    # استفاده از پورت تعیین شده توسط رندر یا پیش‌فرض ۳۰۰۰
    port = int(os.environ.get("PORT", config.PORT))
    logger.info(f"🚀 Flask Web Server starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

def main():
    logger.info("🎬 Starting Miyanji application...")
    
    # اجرای سرور Flask در ترد جداگانه
    threading.Thread(target=run_flask_server, daemon=True).start()
    
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
