"""
==============================================================================
سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow)
هندلرهای اختصاصی ورود، ثبت‌نام و پروفایل کاربری با احراز هویت تدریجی (Progressive Profiling)
==============================================================================
"""

import logging
from typing import Optional, Dict, Any, List
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


def show_welcome_landing(bot: TeleBot, chat_id: int, pending_contract_id: str = None, user_id: Optional[int] = None):
    """
    نمایش پیام رسمی خوش‌آمدگویی و درخواست تایید شماره تماس به همراه میانبر وب‌اپلیکیشن
    """
    if pending_contract_id:
        clean_cid = utils.normalize_deal_id(pending_contract_id)
        text = (
            f"🤝 **دعوت‌نامه رسمی معامله امن در سامانه میانجی**\n\n"
            f"شما به قرارداد شماره `{clean_cid}` دعوت شده‌اید.\n"
            f"جهت مشاهده متن کامل، بررسی تعهدات و صدور گواهی امضای دیجیتال قانونی، لطفاً با لمس دکمه زیر شماره تماس خود را تایید فرمایید:\n\n"
            f"_(شماره تماس شما جهت احراز هویت قانونی در سامانه ثبت شده و کاملاً محرمانه است)_"
        )
    else:
        text = (
            "🛡 به پلتفرم واسطه‌گری و پرداخت امن «میانجی» خوش آمدید\n\n"
            "با میانجی می‌توانید پروژه‌ها و معاملات خود را در محیطی امن، قانونی و با ضمانت کامل بازگشت یا آزادسازی وجه انجام دهید.\n\n"
            "📱 برای شروع استفاده از امکانات ربات، لطفاً از دکمه زیر شماره تماس خود را تایید کنید:"
        )
    bot.send_message(
        chat_id, 
        text, 
        reply_markup=get_contact_share_keyboard(),
        parse_mode="Markdown"
    )
    if user_id:
        try:
            bot.send_message(
                chat_id,
                "🌐 **همچنین می‌توانید مستقیماً وارد پنل تحت وب شوید:**",
                reply_markup=kb.get_smart_panel_inline(user_id=user_id),
                parse_mode="Markdown"
            )
        except Exception:
            pass


def show_main_dashboard(bot: TeleBot, chat_id: int, user_id: int):
    """
    نمایش منوی اصلی ربات برای کاربران احراز هویت شده به همراه دکمه ورود به وب‌اپلیکیشن هوشمند
    """
    user = db.get_user(user_id) or {}
    full_name = user.get("full_name") or f"کاربر {user_id}"
    phone = user.get("phone_number") or db.get_current_user_phone(user_id) or ""
    masked_phone = f"{phone[:4]}***{phone[-4:]}" if len(phone) >= 10 else phone
    
    text = (
        f"🏠 **پنل کاربری میانجی | خوش آمدید {utils.escape_markdown(full_name)}**\n\n"
        f"📱 شماره تماس فعال: `{masked_phone}`\n"
        f"🆔 شناسه یکتای تلگرام (User ID): `{user_id}`\n\n"
        "🌐 **پنل هوشمند واسطه‌گری میانجی:**\n"
        "جهت دسترسی به داشبورد کامل، نمودارها و مدیریت پیشرفته معاملات، دکمه «ورود به پنل هوشمند» را لمس کنید:"
    )
    is_admin = (user_id == getattr(config, 'OWNER_ID', None) or user_id in getattr(config, 'ADMIN_IDS', []))
    reply_markup = kb.get_main_menu(is_admin=is_admin, is_verified=True, user_id=user_id)
    inline_markup = kb.get_smart_panel_inline(user_id=user_id)
    
    bot.send_message(chat_id, text, reply_markup=reply_markup, parse_mode="Markdown")
    try:
        bot.send_message(
            chat_id,
            "🚀 **ورود به پنل هوشمند واسطه‌گری میانجی (Web App):**",
            reply_markup=inline_markup,
            parse_mode="Markdown"
        )
    except Exception:
        pass


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
    web_app_url = getattr(config, 'WEB_APP_URL', None) or "https://ais-pre-vx4jx5tkaqeelhynnssugo-581273460261.europe-west2.run.app"
    sep = "&" if "?" in web_app_url else "?"
    target_url = f"{web_app_url}{sep}user_id={user_id}&tg_id={user_id}"
    
    try:
        markup.add(InlineKeyboardButton("ورود به پنل میانجی 🌐", web_app=kb.WebAppInfo(url=target_url)))
    except Exception:
        markup.add(InlineKeyboardButton("ورود به پنل میانجی 🌐", url=target_url))
    markup.add(
        InlineKeyboardButton("✏️ ویرایش مشخصات (نام و کد ملی)", callback_data="profile_edit_info"),
        InlineKeyboardButton("🔙 بازگشت به منوی اصلی", callback_data="profile_back")
    )

    bot.send_message(chat_id, profile_text, reply_markup=markup, parse_mode="Markdown")


def show_contract_invite(bot: TeleBot, chat_id: int, user_id: int, contract: dict, contract_id: str):
    """
    هدایت کاربر به مشاهده مشخصات معامله و امضای دیجیتال
    """
    clean_id = utils.normalize_deal_id(contract_id)
    creator_id = contract.get("created_by") or contract.get("creator_id")
    creator_info = db.get_user(creator_id) if creator_id else None
    creator_name = creator_info.get("full_name") if creator_info else "کاربر سیستم"

    # بررسی دسترسی: پس از امضای طرفین، فقط ادمین و طرفین قرارداد اجازه دسترسی دارند
    is_both_signed = bool((contract.get("buyer_signed_at") or contract.get("employer_signed_at")) and 
                          (contract.get("seller_signed_at") or contract.get("freelancer_signed_at")))
    is_admin_check = (user_id == getattr(config, 'OWNER_ID', 0) or user_id == getattr(config, 'ADMIN_ID', 0) or user_id in getattr(config, 'ADMIN_IDS', []))
    is_party = (user_id in [contract.get("buyer_id"), contract.get("seller_id"), contract.get("creator_id")])
    
    if is_both_signed and not (is_admin_check or is_party):
        bot.send_message(chat_id, "🚫 **محدودیت دسترسی**\n\nاین قرارداد توسط طرفین امضا شده است و شما اجازه دسترسی به محتوای آن را ندارید.", parse_mode="Markdown")
        return

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
        f"📜 **دعوت به بررسی و امضای قرارداد اسکرو**\n"
        f"🆔 شناسه معامله: `{clean_id}`\n"
        f"────────────────────────────\n"
        f"📝 **عنوان:** {utils.escape_markdown(str(contract.get('title', 'بدون عنوان')))}\n"
        f"💰 **مبلغ معامله:** **{amount_text} تومان** ({deadline_days} روز مهلت)\n\n"
        f"> 🛡️ **تضمین صندوق امانت اسکرو:**\n"
        f"> وجه قرارداد تا زمان تحویل و تایید نهایی در صندوق امانت مسدود می‌ماند و بدون رضایت شما آزاد نمی‌گردد.\n\n"
        f"جهت مشاهده تعهدات و امضای دیجیتال با رمز پیامکی، دکمه زیر را لمس فرمایید:"
    )


    try:
        bot.send_message(
            chat_id,
            welcome_msg,
            parse_mode="Markdown",
            reply_markup=kb.get_invite_overview_keyboard(clean_id)
        )
    except Exception:
        bot.send_message(
            chat_id,
            f"📜 دعوت رسمی به بررسی و امضای قرارداد دیجیتال\nشناسه معامله: {clean_id}\nعنوان: {contract.get('title', 'بدون عنوان')}\nمبلغ: {amount_text} تومان",
            reply_markup=kb.get_invite_overview_keyboard(clean_id)
        )


def register_auth_handlers(bot: TeleBot):

    # ====================================================
    # ۱. دستور /start با احراز هویت خودکار و پردازش جامع انواع دیپ‌لینک
    # ====================================================
    @bot.message_handler(commands=['start'])
    def start_handler(message: Message):
        try:
            user_id = message.from_user.id
            args = message.text.split()
            pending_contract_id = None
            invited_by = None

            if len(args) > 1:
                start_param = args[1].strip()
                # ۱. لینک اختصاصی سفیر / معرف
                if start_param.startswith(("ref_", "amb_")):
                    try:
                        clean_ref = start_param.replace("ref_", "").replace("amb_", "")
                        ref_candidate = int(clean_ref)
                        if ref_candidate != user_id:
                            invited_by = ref_candidate
                    except (ValueError, TypeError):
                        invited_by = None
                # ۲. لینک تحویل پروژه
                elif start_param.startswith("deliver_"):
                    pending_contract_id = utils.normalize_deal_id(start_param.replace("deliver_", "", 1))
                # ۳. لینک قرارداد و معامله اسکرو (c_, contract_, deal_, inv_ یا کد مستقیم GEN-)
                elif start_param.startswith(("c_", "contract_", "deal_", "inv_")) or "-" in start_param:
                    pending_contract_id = utils.normalize_deal_id(start_param)
                    logger.info(f"🔗 [START_DEEP_LINK] User {user_id} joined with deal: {pending_contract_id} (param: {start_param})")

            # ثبت یا به‌روزرسانی اولیه اطلاعات کاربر تلگرام
            user_info = db.register_or_update_user(
                user_id=user_id,
                username=message.from_user.username,
                first_name=message.from_user.first_name,
                invited_by=invited_by
            )

            # بررسی بلاک لیست
            if user_info and user_info.get("is_blacklisted", False):
                bot.send_message(
                    message.chat.id,
                    "⛔ **حساب شما مسدود شده است.**\n\n"
                    "شما دسترسی به سامانه میانجی را ندارید. برای اطلاعات بیشتر با تیم پشتیبانی تماس بگیرید.",
                    parse_mode="Markdown"
                )
                return

            # بررسی وجود شماره تلفن در دیتابیس
            phone = (user_info.get("phone_number") if user_info else None) or db.get_current_user_phone(user_id)

            if phone:
                # کاربر قبلاً شماره خود را ثبت کرده است -> ورود مستقیم بدون درخواست مجدد
                db.clear_user_state(user_id)
                if pending_contract_id:
                    contract = db.get_contract(pending_contract_id)
                    if contract:
                        show_contract_invite(bot, message.chat.id, user_id, contract, pending_contract_id)
                        return
                    else:
                        bot.send_message(
                            message.chat.id, 
                            f"⚠️ **معامله با شناسه `{pending_contract_id}` یافت نشد یا حذف شده است.**\n\nمی‌توانید از منوی زیر جهت ایجاد یا مدیریت قراردادها اقدام نمایید:",
                            parse_mode="Markdown"
                        )
                
                show_main_dashboard(bot, message.chat.id, user_id)
            else:
                # کاربر جدید یا بدون شماره تلفن -> نمایش پیام دقیق خوش‌آمدگویی و درخواست شماره با حفظ قرارداد معلق
                st_data = {"pending_contract_id": pending_contract_id} if pending_contract_id else {}
                db.set_user_state(user_id, "WAITING_CONTACT_SHARE", st_data)
                show_welcome_landing(bot, message.chat.id, pending_contract_id, user_id=user_id)

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
