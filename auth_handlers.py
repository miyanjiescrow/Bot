"""
==============================================================================
سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow)
هندلرهای اختصاصی ثبت‌نام و ورود بدون رمز عبور (Passwordless Auth Handlers)
ورود و احراز هویت ۱۰۰٪ خودکار با استفاده از Telegram ID و دکمه Share Contact تلگرام
==============================================================================
"""

import logging
import re
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


def get_contact_share_keyboard(is_cancelable: bool = False) -> ReplyKeyboardMarkup:
    """
    کیبورد اختصاصی دریافت مستقیم شماره تماس کاربر با یک لمس (بدون تایپ دستی)
    از طریق قابلیت امن request_contact تلگرام جهت تایید اصالت شماره سیم‌کارت
    """
    markup = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    markup.add(KeyboardButton("📱 اشتراک‌گذاری شماره موبایل من", request_contact=True))
    if is_cancelable:
        markup.add(KeyboardButton("❌ انصراف"))
    return markup


def show_passwordless_landing(bot: TeleBot, chat_id: int, pending_contract_id: str = None):
    """
    نمایش پیام خوش‌آمدگویی و درخواست اشتراک‌گذاری شماره تماس برای کاربران جدید یا بدون شماره
    """
    if pending_contract_id:
        text = (
            "🤝 **به سامانه هوشمند واسطه‌گری میانجی خوش آمدید**\n\n"
            f"شما برای بررسی و امضای معامله شماره `{pending_contract_id}` دعوت شده‌اید.\n\n"
            "جهت ورود آسان و ثبت رسمی هویت شما در سند الکترونیک، لطفاً با لمس دکمه زیر شماره تماس تلگرام خود را به اشتراک بگذارید (نیازی به پسورد نیست):"
        )
    else:
        text = (
            "🛡 **به پلتفرم واسطه‌گری امن و اسکرو میانجی (Miyanji) خوش آمدید**\n\n"
            "سامانه رسمی ثبت قراردادهای الکترونیک و پرداخت امن فریلنسری.\n\n"
            "✨ **ورود سریع و بدون رمز عبور (Passwordless):**\n"
            "جهت ایجاد حساب یا ورود به سیستم، کافیست دکمه زیر را لمس فرمایید تا حساب شما به‌صورت خودکار بر پایه شناسه تلگرام و شماره شما فعال شود:"
        )
    
    bot.send_message(
        chat_id, 
        text, 
        reply_markup=get_contact_share_keyboard(is_cancelable=bool(pending_contract_id)), 
        parse_mode="Markdown"
    )


def show_main_dashboard(bot: TeleBot, chat_id: int, user_id: int):
    """
    نمایش مستقیم داشبورد و منوی اصلی ربات برای کاربران احراز هویت شده
    """
    user = db.get_user(user_id) or {}
    full_name = user.get("full_name") or f"کاربر {user_id}"
    phone = user.get("phone_number") or ""
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


def show_contract_invite(bot: TeleBot, chat_id: int, user_id: int, contract: dict, contract_id: str):
    """
    هدایت کاربر (به‌خصوص طرف دوم معامله) به مشاهده مشخصات معامله و امضای دیجیتال
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
    # ۱. دستور /start و هدایت هوشمند بدون نیاز به رمز عبور
    # ====================================================
    @bot.message_handler(commands=['start'])
    def start_handler(message: Message):
        try:
            user_id = message.from_user.id
            args = message.text.split()
            pending_contract_id = None

            # بررسی پارامتر پیوستن به معامله با لینک عمیق (Deep Linking)
            if len(args) > 1 and args[1].startswith(("c_", "contract_", "deal_")):
                raw_param = args[1]
                pending_contract_id = utils.normalize_deal_id(raw_param)
                logger.info(f"🔗 [START_DEEP_LINK] User {user_id} joined with deal: {pending_contract_id}")

            # بررسی وضعیت ثبت‌نام کاربر در جدول Supabase با شناسه یکتای تلگرام
            user = db.get_user(user_id)
            has_verified_phone = bool(user and user.get("phone_number"))

            if has_verified_phone:
                # کاربر قبلاً شماره تماس خود را به اشتراک گذاشته است -> ورود آنی و خودکار
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
                # کاربر جدید یا بدون شماره تلفن -> درخواست ارسال شماره با یک لمس
                st_data = {"pending_contract_id": pending_contract_id} if pending_contract_id else {}
                db.set_user_state(user_id, "WAITING_CONTACT_SHARE", st_data)
                show_passwordless_landing(bot, message.chat.id, pending_contract_id)

        except Exception as e:
            logger.error(f"Error in start_handler: {e}", exc_info=True)
            bot.send_message(message.chat.id, "❌ خطای سیستمی رخ داد. لطفاً دوباره تلاش کنید.")

    # ====================================================
    # ۲. دریافت امن شماره موبایل از طریق Contact تلگرام (بدون تایپ دستی)
    # ====================================================
    @bot.message_handler(content_types=['contact'])
    def contact_received_handler(message: Message):
        try:
            user_id = message.from_user.id
            contact = message.contact

            if not contact:
                return

            # اعتبارسنجی امنیتی حیاتی: آیا شماره متعلق به صاحب اکانت تلگرام است؟
            if contact.user_id and contact.user_id != user_id:
                bot.send_message(
                    message.chat.id, 
                    "⚠️ **خطای امنیتی:** شماره ارسال شده متعلق به حساب کاربری تلگرام شما نیست!\n"
                    "لطفاً فقط شماره متعلق به خودتان را به اشتراک بگذارید.",
                    reply_markup=get_contact_share_keyboard(is_cancelable=True)
                )
                return

            raw_phone = contact.phone_number
            norm_phone = normalize_phone_number(raw_phone)
            if not norm_phone:
                bot.send_message(
                    message.chat.id, 
                    "⚠️ فرمت شماره موبایل نامعتبر است. لطفاً از شماره استاندارد همراه استفاده نمایید.",
                    reply_markup=get_contact_share_keyboard(is_cancelable=True)
                )
                return

            # دریافت نام و نام کاربری تلگرام جهت ثبت در دیتابیس
            first_name = message.from_user.first_name or ""
            last_name = message.from_user.last_name or ""
            full_name = f"{first_name} {last_name}".strip() or f"کاربر {user_id}"
            username = message.from_user.username or ""

            # ثبت بدون رمز در دیتابیس Supabase
            auth_svc.register_passwordless_user(
                telegram_id=user_id,
                phone_number=norm_phone,
                first_name=first_name,
                username=username,
                full_name=full_name
            )

            # بررسی قرارداد معلق در استیت کاربر
            _, st_data = db.get_user_state(user_id)
            pending_cid = st_data.get("pending_contract_id") if isinstance(st_data, dict) else None
            db.clear_user_state(user_id)

            bot.send_message(
                message.chat.id,
                "✅ **احراز هویت و ورود شما با موفقیت انجام شد.**\n"
                f"شماره موبایل `{norm_phone}` به شناسه تلگرام شما متصل گردید.",
                reply_markup=ReplyKeyboardRemove(),
                parse_mode="Markdown"
            )

            # در صورتی که کاربر به دعوت یک قرارداد آمده بود، بلافاصله آن را نمایش می‌دهیم
            if pending_cid:
                contract = db.get_contract(pending_cid)
                if contract:
                    show_contract_invite(bot, message.chat.id, user_id, contract, pending_cid)
                    return

            show_main_dashboard(bot, message.chat.id, user_id)

        except Exception as e:
            logger.error(f"Error in contact_received_handler: {e}", exc_info=True)
            bot.send_message(message.chat.id, "❌ خطایی در ثبت شماره رخ داد. لطفاً مجدداً دکمه ارسال شماره را لمس فرمایید.")

    # پشتیبانی از انصراف حین ارسال شماره
    @bot.message_handler(func=lambda msg: msg.text in ["❌ انصراف", "/cancel", "🔙 انصراف و بازگشت"])
    def cancel_auth_flow(message: Message):
        user_id = message.from_user.id
        db.clear_user_state(user_id)
        bot.send_message(
            message.chat.id, 
            "🔙 فرآیند لغو شد.", 
            reply_markup=ReplyKeyboardRemove()
        )
        user = db.get_user(user_id)
        if user and user.get("phone_number"):
            show_main_dashboard(bot, message.chat.id, user_id)
        else:
            show_passwordless_landing(bot, message.chat.id)

    # ====================================================
    # ۳. پروفایل کاربری بدون نیاز به رمز عبور
    # ====================================================
    @bot.message_handler(func=lambda msg: msg.text in ["👤 پروفایل کاربری", "پروفایل من", "/profile"])
    def profile_menu_handler(message: Message):
        try:
            user_id = message.from_user.id
            user = db.get_user(user_id) or {}
            phone = user.get("phone_number") or db.get_current_user_phone(user_id)

            if not phone:
                show_passwordless_landing(bot, message.chat.id)
                return

            full_name = user.get("full_name") or f"کاربر {user_id}"
            national_id = user.get("national_id") or "ثبت نشده"
            sheba = user.get("sheba") or "ثبت نشده"
            is_verified = user.get("is_verified", False)
            kyc_level = "طلایی 🌟" if (is_verified and national_id != "ثبت نشده") else "پایه (شماره تایید شده) 🥈"

            profile_text = (
                "👤 **پروفایل کاربری سامانه میانجی**\n"
                "────────────────────────────\n"
                f"▫️ **نام و نام خانوادگی:** {utils.escape_markdown(full_name)}\n"
                f"▫️ **شماره موبایل تاییدشده:** `{phone}`\n"
                f"▫️ **کد ملی:** `{national_id}`\n"
                f"▫️ **شماره شبا:** `{sheba}`\n"
                f"▫️ **شناسه یکتای تلگرام:** `{user_id}`\n"
                f"▫️ **سطح کاربری:** {kyc_level}\n"
                f"▫️ **امنیت ورود:** بدون رمز عبور (احراز هویت شده با تلگرام)\n"
                "────────────────────────────\n"
                "جهت ویرایش یا تکمیل اطلاعات، از دکمه‌های زیر استفاده فرمایید:"
            )

            markup = InlineKeyboardMarkup(row_width=1)
            markup.add(
                InlineKeyboardButton("🪪 احراز هویت با کد ملی (سطح طلایی)", callback_data="start_kyc_direct"),
                InlineKeyboardButton("🔄 به‌روزرسانی شماره موبایل", callback_data="auth_relink_phone"),
                InlineKeyboardButton("🔙 بازگشت به منوی اصلی", callback_data="profile_back")
            )

            bot.send_message(message.chat.id, profile_text, reply_markup=markup, parse_mode="Markdown")

        except Exception as e:
            logger.error(f"Error in profile_menu_handler: {e}", exc_info=True)

    # ====================================================
    # ۴. کال‌بک‌های پروفایل و به‌روزرسانی شماره تماس
    # ====================================================
    @bot.callback_query_handler(func=lambda call: call.data in ["auth_relink_phone", "profile_back", "start_kyc_direct"])
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

            elif call.data == "auth_relink_phone":
                db.set_user_state(user_id, "WAITING_CONTACT_SHARE", {})
                try:
                    bot.delete_message(chat_id, call.message.message_id)
                except Exception:
                    pass
                bot.send_message(
                    chat_id,
                    "📱 **به‌روزرسانی شماره موبایل**\n\n"
                    "لطفاً شماره موبایل جدید خود را از طریق دکمه زیر ارسال کنید:",
                    reply_markup=get_contact_share_keyboard(is_cancelable=True)
                )

            elif call.data == "start_kyc_direct":
                # هدایت به جریان احراز هویت کد ملی
                db.set_user_state(user_id, "WAITING_KYC_NATIONAL_ID", {})
                try:
                    bot.delete_message(chat_id, call.message.message_id)
                except Exception:
                    pass
                bot.send_message(
                    chat_id,
                    "🪪 **احراز هویت و ارتقا به سطح طلایی**\n\n"
                    "لطفاً **کد ملی ۱۰ رقمی** خود را بدون خط تیره ارسال فرمایید:\n"
                    "_(مثال: 0012345678)_",
                    parse_mode="Markdown",
                    reply_markup=kb.get_cancel_keyboard()
                )

        except Exception as e:
            logger.error(f"Error in profile_callbacks: {e}", exc_info=True)
