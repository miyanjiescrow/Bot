"""
==============================================================================
سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow)
هندلرهای اختصاصی ورود، ثبت‌نام و پروفایل کاربری با احراز هویت تدریجی (Progressive Profiling)
==============================================================================
"""

import logging
from telebot import TeleBot
from telebot.types import (
    Message, 
    CallbackQuery, 
    ReplyKeyboardMarkup, 
    KeyboardButton, 
    ReplyKeyboardRemove, 
    InlineKeyboardMarkup, 
    InlineKeyboardButton
)
import database as db
import keyboards as kb
from config import config
from phone_utils import normalize_phone_number
import auth_service as auth_svc
import utils

logger = logging.getLogger("Miyanji_AuthHandlers")


def get_contact_share_keyboard() -> ReplyKeyboardMarkup:
    """
    کیبورد تک‌دکمه‌ای اختصاصی دریافت شماره تماس تلگرام (Share Contact)
    """
    markup = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    markup.add(KeyboardButton("📱 تایید و ارسال شماره تماس", request_contact=True))
    return markup


def show_welcome_landing(bot: TeleBot, chat_id: int, pending_contract_id: str = None):
    """
    نمایش پیام رسمی خوش‌آمدگویی و درخواست تایید شماره تماس با تک‌دکمه
    """
    text = (
        "🛡 به پلتفرم واسطه‌گری و پرداخت امن «میانجی» خوش آمدید\n\n"
        "با میانجی می‌توانید پروژه‌ها و معاملات خود را در محیطی امن، قانونی و با ضمانت کامل بازگشت یا آزادسازی وجه انجام دهید.\n\n"
        "📱 برای شروع استفاده از امکانات ربات، لطفاً از دکمه زیر شماره تماس خود را تایید کنید:"
    )
    bot.send_message(
        chat_id, 
        text, 
        reply_markup=get_contact_share_keyboard()
    )


def show_main_dashboard(bot: TeleBot, chat_id: int, user_id: int):
    """
    نمایش منوی اصلی ربات برای کاربران احراز هویت شده
    """
    user = db.get_user(user_id) or {}
    full_name = user.get("full_name") or f"کاربر {user_id}"
    phone = user.get("phone_number") or db.get_current_user_phone(user_id) or ""
    masked_phone = f"{phone[:4]}***{phone[-4:]}" if len(phone) >= 10 else phone
    
    text = (
        f"🏠 **پنل کاربری میانجی | خوش آمدید {utils.escape_markdown(full_name)}**\n\n"
        f"📱 شماره تماس فعال: `{masked_phone}`\n"
        f"🆔 شناسه یکتای تلگرام: `{user_id}`\n\n"
        "از منوی زیر می‌توانید نسبت به ثبت معامله جدید، مدیریت قراردادها یا کیف پول اقدام فرمایید:"
    )
    is_admin = (user_id == getattr(config, 'OWNER_ID', None) or user_id in getattr(config, 'ADMIN_IDS', []))
    markup = kb.get_main_menu(is_admin=is_admin, is_verified=True)
    bot.send_message(chat_id, text, reply_markup=markup, parse_mode="Markdown")


def show_user_profile(bot: TeleBot, chat_id: int, user_id: int):
    """
    نمایش کارت مشخصات پروفایل کاربری از دیتابیس Supabase
    در صورتی که شماره ثبت شده باشد، کارت کامل شامل امتیاز اعتبار و دکمه‌ها نشان داده می‌شود.
    تنها در صورتی که کاربر هنوز شماره‌اش را ثبت نکرده باشد، درخواست ارسال شماره داده می‌شود.
    """
    user = db.get_user(user_id) or {}
    phone = user.get("phone_number") or db.get_current_user_phone(user_id)

    # اگر کاربر هنوز شماره‌اش را ثبت نکرده باشد، درخواست ارسال شماره داده می‌شود
    if not phone:
        show_welcome_landing(bot, chat_id)
        return

    full_name = user.get("full_name") or f"کاربر {user_id}"
    raw_nid = user.get("national_id")
    has_nid = bool(raw_nid and len(str(raw_nid).strip()) == 10)
    national_id = str(raw_nid).strip() if has_nid else "ثبت نشده (امضا در اولین معامله)"
    
    # محاسبه امتیاز اعتبار بر اساس تکمیل اطلاعات و فعالیت
    is_verified = bool(user.get("is_verified", False))
    credit_score = 100 if (is_verified and has_nid) else 85
    score_display = f"{credit_score} / ۱۰۰ ⭐️ (عالی)"
    user_level = "سطح طلایی 🌟" if (is_verified and has_nid) else "سطح پایه (شماره تاییدشده) 🥈"

    profile_text = (
        "👤 **پروفایل کاربری | سامانه واسطه‌گری امن میانجی**\n"
        "────────────────────────────\n"
        f"📱 **شماره تماس:** `{phone}`\n"
        f"👤 **نام و نام خانوادگی:** {utils.escape_markdown(full_name)}\n"
        f"🪪 **کد ملی:** `{national_id}`\n"
        f"⭐️ **امتیاز اعتبار:** {score_display}\n"
        f"🎖 **سطح کاربری:** {user_level}\n"
        f"🆔 **شناسه تلگرام:** `{user_id}`\n"
        "────────────────────────────\n"
        "جهت ویرایش مشخصات یا ورود به نسخه وب، از گزینه‌های زیر استفاده نمایید:"
    )

    markup = InlineKeyboardMarkup(row_width=1)
    web_app_url = getattr(config, 'WEB_APP_URL', None) or "https://miyanji.ir"
    
    markup.add(
        InlineKeyboardButton("✏️ ویرایش مشخصات (نام و کد ملی)", callback_data="profile_edit_info"),
        InlineKeyboardButton("🌐 ورود به Web App (نسخه وب)", url=web_app_url),
        InlineKeyboardButton("🔙 بازگشت به منوی اصلی", callback_data="profile_back")
    )

    bot.send_message(chat_id, profile_text, reply_markup=markup, parse_mode="Markdown")


def show_contract_invite(bot: TeleBot, chat_id: int, user_id: int, contract: dict, contract_id: str):
    """
    هدایت کاربر به مشاهده مشخصات معامله و امضای دیجیتال
    """
    creator_id = contract.get("created_by") or contract.get("creator_id")
    creator_info = db.get_user(creator_id) if creator_id else None
    creator_name = creator_info.get("full_name") if creator_info else "کاربر سیستم"

    category = contract.get("category", "GEN")
    role_titles = utils.get_role_titles(category)
    buyer_role = role_titles['client']    # کارفرما
    seller_role = role_titles['provider'] # مجری

    creator_is_buyer = contract.get("buyer_id") == creator_id
    creator_role = buyer_role if creator_is_buyer else seller_role
    recipient_role = seller_role if creator_is_buyer else buyer_role

    raw_amount = contract.get('amount', 0)
    try:
        amount_val = float(raw_amount)
        amount_text = f"{amount_val:,.0f}" if amount_val > 0 else "توافقی"
    except Exception:
        amount_text = "توافقی"

    comm_pct = utils.get_commission_percent()
    deadline_days = contract.get('deadline', 1)

    welcome_msg = (
        f"📜 **دعوت رسمی به بررسی و امضای قرارداد دیجیتال**\n"
        f"────────────────────────────\n"
        f"🔹 **شناسه معامله:** `{contract_id}`\n"
        f"📝 **عنوان موضوع:** {utils.escape_markdown(str(contract.get('title', 'بدون عنوان')))}\n"
        f"📂 **دسته‌بندی:** {category}\n"
        f"👥 **طرفین قرارداد:**\n"
        f"   • {creator_role}: **{utils.escape_markdown(str(creator_name))}**\n"
        f"   • {recipient_role}: **شما** (طرف دوم)\n"
        f"💰 **مبلغ معامله:** **{amount_text} تومان**\n"
        f"🛡 **کارمزد اسکرو میانجی:** {comm_pct:.2g}%\n"
        f"⏱ **مهلت تحویل تعهدات:** {deadline_days} روز\n\n"
        f"⚖️ **ملاحظات امنیتی:** وجه قرارداد تا زمان تحویل کامل تعهدات در صندوق امانت مسدود می‌ماند.\n\n"
        f"جهت مشاهده متن کامل تعهدات و امضای قانونی با رمز یکبارمصرف پیامکی، دکمه زیر را لمس فرمایید:"
    )

    bot.send_message(
        chat_id,
        welcome_msg,
        parse_mode="Markdown",
        reply_markup=kb.get_invite_overview_keyboard(contract_id)
    )


def register_auth_handlers(bot: TeleBot):

    # ====================================================
    # ۱. دستور /start با احراز هویت خودکار و پیام خوش‌آمدگویی دقیق
    # ====================================================
    @bot.message_handler(commands=['start'])
    def start_handler(message: Message):
        try:
            user_id = message.from_user.id
            args = message.text.split()
            pending_contract_id = None

            if len(args) > 1 and args[1].startswith(("c_", "contract_", "deal_")):
                raw_param = args[1]
                pending_contract_id = utils.normalize_deal_id(raw_param)
                logger.info(f"🔗 [START_DEEP_LINK] User {user_id} joined with deal: {pending_contract_id}")

            # بررسی وجود شماره تلفن در Supabase دیتابیس
            user = db.get_user(user_id)
            phone = (user.get("phone_number") if user else None) or db.get_current_user_phone(user_id)

            if phone:
                # کاربر قبلاً شماره خود را ثبت کرده است -> ورود مستقیم بدون درخواست مجدد
                db.clear_user_state(user_id)
                if pending_contract_id:
                    contract = db.get_contract(pending_contract_id)
                    if contract:
                        show_contract_invite(bot, message.chat.id, user_id, contract, pending_contract_id)
                        return
                    else:
                        bot.send_message(message.chat.id, "⚠️ معامله موردنظر یافت نشد یا منقضی شده است.")
                
                show_main_dashboard(bot, message.chat.id, user_id)
            else:
                # کاربر جدید یا بدون شماره تلفن -> نمایش پیام دقیق خوش‌آمدگویی و فقط یک دکمه ارسال شماره
                st_data = {"pending_contract_id": pending_contract_id} if pending_contract_id else {}
                db.set_user_state(user_id, "WAITING_CONTACT_SHARE", st_data)
                show_welcome_landing(bot, message.chat.id, pending_contract_id)

        except Exception as e:
            logger.error(f"Error in start_handler: {e}", exc_info=True)
            bot.send_message(message.chat.id, "❌ خطای سیستمی رخ داد. لطفاً دوباره تلاش کنید.")

    # ====================================================
    # ۲. دریافت شماره موبایل (احراز هویت تدریجی - Progressive Profiling)
    # ====================================================
    @bot.message_handler(content_types=['contact'])
    def contact_received_handler(message: Message):
        try:
            user_id = message.from_user.id
            contact = message.contact

            if not contact:
                return

            # اعتبارسنجی: بررسی مطابقت شماره با حساب تلگرام
            if contact.user_id and contact.user_id != user_id:
                bot.send_message(
                    message.chat.id, 
                    "⚠️ **خطای امنیتی:** شماره ارسال شده متعلق به حساب کاربری تلگرام شما نیست!\n"
                    "لطفاً فقط شماره متعلق به خودتان را تایید و ارسال نمایید.",
                    reply_markup=get_contact_share_keyboard()
                )
                return

            raw_phone = contact.phone_number
            norm_phone = normalize_phone_number(raw_phone)
            if not norm_phone:
                bot.send_message(
                    message.chat.id, 
                    "⚠️ فرمت شماره موبایل نامعتبر است. لطفاً از دکمه ارسال شماره استفاده فرمایید.",
                    reply_markup=get_contact_share_keyboard()
                )
                return

            # احراز هویت تدریجی: در این مرحله فقط شماره موبایل ذخیره می‌شود
            first_name = message.from_user.first_name or ""
            last_name = message.from_user.last_name or ""
            full_name = f"{first_name} {last_name}".strip() or f"کاربر {user_id}"
            username = message.from_user.username or ""

            # ذخیره در دیتابیس Supabase
            auth_svc.register_passwordless_user(
                telegram_id=user_id,
                phone_number=norm_phone,
                first_name=first_name,
                username=username,
                full_name=full_name
            )

            # بررسی قرارداد معلق در استیت
            _, st_data = db.get_user_state(user_id)
            pending_cid = st_data.get("pending_contract_id") if isinstance(st_data, dict) else None
            db.clear_user_state(user_id)

            bot.send_message(
                message.chat.id,
                f"✅ **شماره تماس شما ({norm_phone}) با موفقیت تایید و ثبت شد.**",
                reply_markup=ReplyKeyboardRemove(),
                parse_mode="Markdown"
            )

            if pending_cid:
                contract = db.get_contract(pending_cid)
                if contract:
                    show_contract_invite(bot, message.chat.id, user_id, contract, pending_cid)
                    return

            show_main_dashboard(bot, message.chat.id, user_id)

        except Exception as e:
            logger.error(f"Error in contact_received_handler: {e}", exc_info=True)
            bot.send_message(message.chat.id, "❌ خطایی در ثبت شماره رخ داد. لطفاً مجدداً دکمه ارسال شماره را لمس فرمایید.")

    # پشتیبانی از دستورات انصراف
    @bot.message_handler(func=lambda msg: msg.text in ["❌ انصراف", "/cancel", "🔙 انصراف و بازگشت"])
    def cancel_auth_flow(message: Message):
        user_id = message.from_user.id
        db.clear_user_state(user_id)
        user = db.get_user(user_id)
        phone = (user.get("phone_number") if user else None) or db.get_current_user_phone(user_id)
        
        bot.send_message(message.chat.id, "🔙 عملیات لغو شد.", reply_markup=ReplyKeyboardRemove())
        if phone:
            show_main_dashboard(bot, message.chat.id, user_id)
        else:
            show_welcome_landing(bot, message.chat.id)

    # ====================================================
    # ۳. هندلر دکمه پروفایل کاربری (رفع باگ ارسال مجدد شماره)
    # ====================================================
    @bot.message_handler(func=lambda msg: msg.text in ["👤 پروفایل کاربری", "پروفایل من", "پروفایل", "/profile"])
    def profile_menu_handler(message: Message):
        try:
            user_id = message.from_user.id
            db.clear_user_state(user_id)
            show_user_profile(bot, message.chat.id, user_id)
        except Exception as e:
            logger.error(f"Error in profile_menu_handler: {e}", exc_info=True)
            bot.send_message(message.chat.id, "⚠️ خطا در دریافت اطلاعات پروفایل.")

    # ====================================================
    # ۴. کال‌بک‌های ویرایش اطلاعات و بازگشت
    # ====================================================
    @bot.callback_query_handler(func=lambda call: call.data in ["profile_back", "profile_edit_info", "auth_relink_phone"])
    def profile_callbacks(call: CallbackQuery):
        try:
            user_id = call.from_user.id
            chat_id = call.message.chat.id
            bot.answer_callback_query(call.id)

            if call.data == "profile_back":
                try:
                    bot.delete_message(chat_id, call.message.message_id)
                except Exception:
                    pass
                show_main_dashboard(bot, chat_id, user_id)

            elif call.data == "profile_edit_info":
                # شروع فرآیند اختیاری تکمیل و ویرایش مشخصات (نام و کد ملی)
                db.set_user_state(user_id, "WAITING_PROFILE_FULLNAME", {})
                try:
                    bot.delete_message(chat_id, call.message.message_id)
                except Exception:
                    pass
                bot.send_message(
                    chat_id,
                    "✏️ **ویرایش مشخصات پروفایل:**\n\n"
                    "لطفاً **نام و نام خانوادگی کامل** خود را ارسال فرمایید:\n"
                    "_(مثال: علیرضا رضوانی)_",
                    parse_mode="Markdown",
                    reply_markup=kb.get_cancel_keyboard()
                )

            elif call.data == "auth_relink_phone":
                db.set_user_state(user_id, "WAITING_CONTACT_SHARE", {})
                try:
                    bot.delete_message(chat_id, call.message.message_id)
                except Exception:
                    pass
                bot.send_message(
                    chat_id,
                    "📱 لطفاً از طریق دکمه زیر شماره همراه خود را تایید کنید:",
                    reply_markup=get_contact_share_keyboard()
                )

        except Exception as e:
            logger.error(f"Error in profile_callbacks: {e}", exc_info=True)

    # دریافت نام و نام خانوادگی در ویرایش پروفایل
    @bot.message_handler(func=lambda msg: db.get_user_state(msg.from_user.id)[0] == "WAITING_PROFILE_FULLNAME")
    def process_profile_fullname_step(message: Message):
        user_id = message.from_user.id
        text = (message.text or "").strip()

        if text in ["❌ انصراف", "🔙 بازگشت به منوی اصلی", "/cancel"]:
            db.clear_user_state(user_id)
            show_user_profile(bot, message.chat.id, user_id)
            return

        if len(text) < 3 or len(text.split()) < 2:
            bot.send_message(
                message.chat.id,
                "⚠️ لطفاً نام و نام خانوادگی خود را کامل وارد فرمایید (حداقل دو کلمه):",
                reply_markup=kb.get_cancel_keyboard()
            )
            return

        # ذخیره موقت نام و درخواست کد ملی
        db.set_user_state(user_id, "WAITING_PROFILE_NATIONAL_ID", {"full_name": text})
        bot.send_message(
            message.chat.id,
            f"✅ نام ثبت شد: **{text}**\n\n"
            "🪪 اکنون لطفاً **کد ملی ۱۰ رقمی** خود را بدون خط تیره ارسال فرمایید:\n"
            "_(جهت امضای رسمی معاملات و اعتبار قانونی)_",
            parse_mode="Markdown",
            reply_markup=kb.get_cancel_keyboard()
        )

    # دریافت کد ملی در ویرایش پروفایل
    @bot.message_handler(func=lambda msg: db.get_user_state(msg.from_user.id)[0] == "WAITING_PROFILE_NATIONAL_ID")
    def process_profile_national_id_step(message: Message):
        user_id = message.from_user.id
        text = (message.text or "").strip()

        if text in ["❌ انصراف", "🔙 بازگشت به منوی اصلی", "/cancel"]:
            db.clear_user_state(user_id)
            show_user_profile(bot, message.chat.id, user_id)
            return

        clean_nid = utils.fa_to_en_digits(text).replace("-", "").strip()

        # اعتبارسنجی الگوریتم کد ملی ثبت‌احوال
        if not utils.validate_iranian_national_code(clean_nid):
            bot.send_message(
                message.chat.id,
                "⚠️ **کد ملی نامعتبر است.** لطفاً یک کد ملی معتبر ۱۰ رقمی وارد فرمایید:",
                reply_markup=kb.get_cancel_keyboard()
            )
            return

        _, data = db.get_user_state(user_id)
        saved_name = data.get("full_name") if isinstance(data, dict) else None

        # ثبت قطعی در دیتابیس Supabase
        db.register_or_update_user(
            user_id=user_id,
            full_name=saved_name,
            national_id=clean_nid,
            is_verified=True
        )
        db.clear_user_state(user_id)

        bot.send_message(
            message.chat.id,
            "🎉 **مشخصات شما با موفقیت در سامانه میانجی ثبت و تایید گردید.**\n\n"
            "حساب کاربری شما به سطح طلایی ارتقا یافت.",
            parse_mode="Markdown",
            reply_markup=ReplyKeyboardRemove()
        )

        show_user_profile(bot, message.chat.id, user_id)
