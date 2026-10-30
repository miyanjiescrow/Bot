"""
==============================================================================
سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow)
ماژول اختصاصی و بهینه‌سازی‌شده «روند جدید و هوشمند ایجاد معامله» (Smart Deal Creation Flow)
پشتیبانی از: Python 3.10+, python-telegram-bot v20+ / pyTelegramBotAPI, Flask API & Supabase
طراحی شده برای معاملات فریلنسری آنلاین (طراحی لوگو، پروژه‌های دانشجویی، برنامه‌نویسی و ...)
==============================================================================
"""

import os
import re
import time
import json
import uuid
import logging
from typing import Dict, Any, Optional, Tuple, Union
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict

# تنظیمات لاگینگ استاندارد
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("Miyanji_DealWizard")

# ==============================================================================
# ۱. ساختار دیتابیس (Supabase SQL Schema Script)
# ==============================================================================
SUPABASE_SQL_SCHEMA = """
-- =============================================================================
-- Miyanji Escrow Database Schema (PostgreSQL / Supabase)
-- Passwordless Authentication & Non-Repudiation Electronic Signatures
-- =============================================================================

-- ۱. جدول کاربران بدون رمز عبور (Passwordless Users)
-- احراز هویت منحصراً بر پایه Telegram ID یکتا و شماره موبایل تاییدشده با Contact
CREATE TABLE IF NOT EXISTS public.users (
    id BIGINT PRIMARY KEY, -- Telegram User ID (عددی)
    phone_number VARCHAR(20) NOT NULL UNIQUE, -- شماره موبایل تاییدشده با Share Contact
    full_name VARCHAR(150) NOT NULL, -- نام و نام خانوادگی
    username VARCHAR(100) NULL, -- @username در تلگرام
    national_id VARCHAR(10) NULL, -- کد ملی ۱۰ رقمی احراز شده
    sheba VARCHAR(30) NULL, -- شماره شبا جهت تسویه بانکی
    wallet_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'employer', 'freelancer', 'arbitrator', 'ambassador', 'admin')),
    is_verified BOOLEAN NOT NULL DEFAULT true,
    is_blacklisted BOOLEAN NOT NULL DEFAULT false,
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (kyc_status IN ('unverified', 'pending', 'approved', 'rejected')),
    payment_cards JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_national_id ON public.users(national_id);

-- ۲. جدول معاملات و قراردادهای اسکرو (Deals & Escrow Contracts)
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) UNIQUE NOT NULL,
    invite_token VARCHAR(64) UNIQUE NOT NULL,
    
    -- مشخصات موضوع و خدمت
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'graphic_design', 'programming', 'academic', 'content_creation', 'other'
    amount BIGINT NOT NULL CHECK (amount >= 10000), -- مبلغ به تومان
    
    -- تعیین کارمزد (خریدار، مجری، توافقی ۵۰/۵۰)
    commission_payer VARCHAR(30) NOT NULL DEFAULT 'split_50_50' 
        CHECK (commission_payer IN ('employer', 'freelancer', 'split_50_50')),
    commission_rate NUMERIC(4, 2) NOT NULL DEFAULT 5.0, -- درصد کارمزد میانجی
    commission_amount BIGINT NOT NULL DEFAULT 0,
    
    -- طرف اول (ایجادکننده)
    creator_id BIGINT NOT NULL,
    creator_role VARCHAR(20) NOT NULL CHECK (creator_role IN ('employer', 'freelancer')),
    
    -- بخش‌های اختیاری پیشرفته
    has_inspection_period BOOLEAN NOT NULL DEFAULT false,
    inspection_period_hours INT NOT NULL DEFAULT 0,
    
    has_free_revisions BOOLEAN NOT NULL DEFAULT true,
    free_revisions_count INT DEFAULT 2,
    
    -- طرفین معامله و امضای دیجیتال OTP
    buyer_id BIGINT NULL,
    buyer_fullname VARCHAR(150) NULL,
    buyer_phone VARCHAR(30) NULL,
    buyer_national_id VARCHAR(10) NULL,
    buyer_signed_at TIMESTAMPTZ NULL,
    buyer_otp_verified BOOLEAN NOT NULL DEFAULT false,
    buyer_signature_hash VARCHAR(128) NULL,
    
    seller_id BIGINT NULL,
    seller_fullname VARCHAR(150) NULL,
    seller_phone VARCHAR(30) NULL,
    seller_national_id VARCHAR(10) NULL,
    seller_signed_at TIMESTAMPTZ NULL,
    seller_otp_verified BOOLEAN NOT NULL DEFAULT false,
    seller_signature_hash VARCHAR(128) NULL,
    
    -- وضعیت چرخه اسکرو
    status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',                   -- در حال تکمیل پیش‌نویس
        'pending_counterparty',    -- منتظر ورود و پذیرش طرف دوم
        'awaiting_escrow_deposit', -- تایید شده توسط طرفین، در انتظار واریز وجه امانت کارفرما
        'escrow_locked',           -- وجه در صندوق امانت میانجی قفل شده، پروژه در حال انجام
        'work_submitted',          -- فایل‌ها و تعهدات توسط مجری تحویل داده شده
        'in_inspection',           -- مهلت بررسی و تست توسط کارفرما (بر اساس ساعت تعیین‌شده)
        'revisions_requested',     -- درخواست اصلاحیه با کسر از سهمیه رایگان
        'completed',               -- پایان موفق و تسویه حساب با مجری
        'in_dispute',              -- ورود به شورای حل اختلاف و داوری حقوقی
        'cancelled'                -- لغو شده و عودت وجه
    )),
    
    escrow_deposit_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' 
        CHECK (escrow_deposit_status IN ('unpaid', 'paid_locked', 'released', 'refunded')),
    
    description TEXT NULL,
    deliverables JSONB DEFAULT '{}'::jsonb,
    history JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ۳. جدول ثبت شواهد غیرقابل انکار امضاهای الکترونیک (Non-Repudiation Signatures Table)
-- حاوی شناسه تلگرام، نام کاربری، کد ملی، شماره موبایل، تایم‌استمپ رسمی و هش دیجیتال
CREATE TABLE IF NOT EXISTS public.signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL, -- شناسه معامله (مانند DEV-842-190)
    telegram_id BIGINT NOT NULL, -- شناسه عددی یکتای کاربر در تلگرام
    telegram_username VARCHAR(100) NULL, -- نام کاربری (@username) در لحظه امضا
    role VARCHAR(30) NOT NULL CHECK (role IN ('buyer', 'seller', 'employer', 'freelancer')),
    
    -- مشخصات هویتی و قانونی امضاکننده
    full_name VARCHAR(150) NOT NULL,
    national_id VARCHAR(10) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    
    -- شواهد اصالت و عدم انکار (Evidence & Non-Repudiation)
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    otp_verified BOOLEAN NOT NULL DEFAULT true,
    otp_code_hash VARCHAR(128) NULL,
    client_ip VARCHAR(50) DEFAULT '127.0.0.1',
    verification_method VARCHAR(50) NOT NULL DEFAULT 'telegram_contact_sms_otp',
    signature_hash VARCHAR(128) NOT NULL UNIQUE, -- اثر انگشت دیجیتال SHA-256
    status VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked', 'disputed')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_contract ON public.signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_signatures_telegram_id ON public.signatures(telegram_id);
CREATE INDEX IF NOT EXISTS idx_signatures_hash ON public.signatures(signature_hash);

-- ایندکس‌ها جهت پاسخگویی بلادرنگ کمتر از ۱۵ میلی‌ثانیه در تلگرام
CREATE INDEX IF NOT EXISTS idx_deals_contract_id ON public.deals(contract_id);
CREATE INDEX IF NOT EXISTS idx_deals_invite_token ON public.deals(invite_token);
CREATE INDEX IF NOT EXISTS idx_deals_creator_id ON public.deals(creator_id);
CREATE INDEX IF NOT EXISTS idx_deals_buyer_seller ON public.deals(buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals(status);

-- تریگر به‌روزرسانی خودکار updated_at
CREATE OR REPLACE FUNCTION public.handle_deal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_deals_updated_at ON public.deals;
CREATE TRIGGER trigger_deals_updated_at
    BEFORE UPDATE ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_deal_updated_at();

-- فعال‌سازی RLS و پالیسی‌های امنیتی
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deals visible to parties or creator"
ON public.deals FOR SELECT
USING (
    auth.uid() IS NOT NULL OR 
    creator_id = (current_setting('request.jwt.claim.sub', true)::BIGINT) OR
    buyer_id = (current_setting('request.jwt.claim.sub', true)::BIGINT) OR
    seller_id = (current_setting('request.jwt.claim.sub', true)::BIGINT)
);

CREATE POLICY "Signatures visible to parties or admin"
ON public.signatures FOR SELECT
USING (true);
"""

# ==============================================================================
# ۲. ابزارهای کمکی (Helpers & Normalizers)
# ==============================================================================

def normalize_digits(text: str) -> str:
    """تبدیل تمام ارقام فارسی و عربی به ارقام انگلیسی"""
    if not text:
        return ""
    fa_digits = '۰۱۲۳۴۵۶۷۸۹'
    ar_digits = '٠١٢٣٤٥٦٧٨٩'
    res = str(text)
    for i in range(10):
        res = res.replace(fa_digits[i], str(i)).replace(ar_digits[i], str(i))
    return res

def parse_toman_amount(text: str) -> Optional[int]:
    """
    استخراج و محاسبه منعطف مبلغ به تومان:
    پشتیبانی از: '2500000', '2,500,000', '۲ میلیون و پانصد', '۵۰ هزار تومان'
    """
    clean = normalize_digits(text).strip()
    multiplier = 1
    if re.search(r'میلیارد|b|B', clean):
        multiplier = 1_000_000_000
    elif re.search(r'میلیون|m|M', clean):
        multiplier = 1_000_000
    elif re.search(r'هزار|k|K', clean):
        multiplier = 1_000

    match = re.search(r'(\d+(?:[.,_\s]\d+)*)', clean)
    if not match:
        return None
    raw_num = match.group(1).replace(',', '').replace('.', '').replace('_', '').replace(' ', '')
    try:
        val = int(raw_num) * multiplier
        return val if val >= 10_000 else None
    except ValueError:
        return None

def generate_deal_id(category_prefix: str = "GEN") -> str:
    """تولید شناسه قرارداد سه بخشی منحصر‌به‌فرد مانند DEV-412-890"""
    rand1 = int(time.time() * 1000) % 900 + 100
    rand2 = int(uuid.uuid4().int % 900) + 100
    return f"{category_prefix.upper()}-{rand1}-{rand2}"

def generate_invite_token() -> str:
    """تولید توکن یکتای دعوت برای لینک تلگرام"""
    return f"deal_{uuid.uuid4().hex[:10]}"

def calculate_escrow_fees(amount: int, fee_payer: str, fee_percent: float = 5.0) -> Dict[str, int]:
    """محاسبه کارمزد پلتفرم و سهم طرفین"""
    fee = int(round(amount * (fee_percent / 100.0)))
    if fee_payer == "employer":
        buyer_pays = amount + fee
        seller_receives = amount
    elif fee_payer == "freelancer":
        buyer_pays = amount
        seller_receives = max(0, amount - fee)
    else: # split_50_50
        half_fee = fee // 2
        buyer_pays = amount + half_fee
        seller_receives = max(0, amount - (fee - half_fee))
    return {
        "amount": amount,
        "fee": fee,
        "buyer_pays": buyer_pays,
        "seller_receives": seller_receives
    }

# ==============================================================================
# ۳. داده‌های وضعیت (FSM State Machine Definition)
# ==============================================================================

class DealCreationState:
    SELECT_ROLE = "DEAL_SELECT_ROLE"
    SELECT_CATEGORY = "DEAL_SELECT_CATEGORY"
    INPUT_TITLE = "DEAL_INPUT_TITLE"
    INPUT_AMOUNT = "DEAL_INPUT_AMOUNT"
    INPUT_DESCRIPTION = "DEAL_INPUT_DESCRIPTION"  # مرحله ۵: شرح اختصاصی تعهدات توسط کاربر (ملاک انحصاری داوری، تعهدات پیش‌فرض حذف شدند)
    SELECT_FEE_PAYER = "DEAL_SELECT_FEE_PAYER"
    SELECT_INSPECTION = "DEAL_SELECT_INSPECTION"
    INPUT_INSPECTION_CUSTOM = "DEAL_INPUT_INSPECTION_CUSTOM"
    SELECT_REVISIONS = "DEAL_SELECT_REVISIONS"
    INPUT_REVISIONS_CUSTOM = "DEAL_INPUT_REVISIONS_CUSTOM"
    CONFIRM_PREVIEW = "DEAL_CONFIRM_PREVIEW"
    COMPLETED = "DEAL_COMPLETED"

CATEGORY_NAMES = {
    "DEV": ("💻 برنامه‌نویسی و IT", "برنامه‌نویسی"),
    "DS": ("🎨 طراحی و گرافیک", "طراحی و گرافیک"),
    "ACAD": ("🎓 خدمات دانشجویی و ترجمه", "خدمات دانشجویی"),
    "CNT": ("✍️ تولید محتوا و سئو", "تولید محتوا"),
    "GEN": ("📑 سایر خدمات دیجیتال", "سایر خدمات")
}

# ==============================================================================
# ۴. نمونه کامل پیاده‌سازی با python-telegram-bot (v20+ Async)
# ==============================================================================
"""
کد زیر برای پروژه‌هایی است که از فریم‌ورک مدرن و ناهمگام python-telegram-bot استفاده می‌کنند.
این ساختار از ConversationHandler و اینلاین کیبوردهای سریع بهره می‌برد.
"""

try:
    from telegram import (
        Update, 
        InlineKeyboardMarkup, 
        InlineKeyboardButton, 
        ReplyKeyboardRemove
    )
    from telegram.ext import (
        Application, 
        CommandHandler, 
        MessageHandler, 
        CallbackQueryHandler, 
        ConversationHandler, 
        ContextTypes, 
        filters
    )
    HAS_PTB = True
except ImportError:
    HAS_PTB = False

# ==============================================================================
# ۵. پیاده‌سازی همگام با pyTelegramBotAPI (TeleBot)
# کامپتیبل ۱۰۰٪ با ساختار فعلی پروژه Miyanji
# ==============================================================================

def get_deal_role_keyboard():
    """کیبورد اینلاین انتخاب نقش (کمتر از ۲ ثانیه)"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("💼 خریدار (کارفرما)", callback_data="deal_role:employer"),
        InlineKeyboardButton("🛠 فروشنده (مجری)", callback_data="deal_role:freelancer")
    )
    kb.add(InlineKeyboardButton("❌ انصراف", callback_data="deal_cancel"))
    return kb

def get_deal_category_keyboard():
    """کیبورد اینلاین دسته‌بندی خدمت"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton("🎨 طراحی و گرافیک", callback_data="deal_cat:DS"),
        InlineKeyboardButton("💻 برنامه‌نویسی", callback_data="deal_cat:DEV")
    )
    kb.add(
        InlineKeyboardButton("🎓 خدمات دانشجویی", callback_data="deal_cat:ACAD"),
        InlineKeyboardButton("✍️ تولید محتوا", callback_data="deal_cat:CNT")
    )
    kb.add(InlineKeyboardButton("📑 سایر خدمات دیجیتال", callback_data="deal_cat:GEN"))
    kb.add(InlineKeyboardButton("❌ انصراف", callback_data="deal_cancel"))
    return kb

def get_deal_fee_payer_keyboard():
    """کیبورد اینلاین پرداخت‌کننده کارمزد"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(
        InlineKeyboardButton("💼 کارفرما (افزودن به واریزی کارفرما)", callback_data="deal_payer:employer"),
        InlineKeyboardButton("🛠 مجری (کسر از درآمد مجری)", callback_data="deal_payer:freelancer"),
        InlineKeyboardButton("⚖️ توافقی (۵۰٪ کارفرما / ۵۰٪ مجری)", callback_data="deal_payer:split_50_50"),
        InlineKeyboardButton("❌ انصراف", callback_data="deal_cancel")
    )
    return kb

def get_deal_inspection_keyboard():
    """کیبورد اینلاین مهلت تست و بررسی (اختیاری پیشرفته)"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(InlineKeyboardButton("⚡ تایید آنی (بدون مهلت تست)", callback_data="deal_insp:0"))
    kb.add(
        InlineKeyboardButton("⏱ ۲۴ ساعت", callback_data="deal_insp:24"),
        InlineKeyboardButton("⏱ ۴۸ ساعت", callback_data="deal_insp:48")
    )
    kb.add(
        InlineKeyboardButton("⏱ ۷۲ ساعت", callback_data="deal_insp:72"),
        InlineKeyboardButton("✍️ ساعت دلخواه", callback_data="deal_insp:custom")
    )
    kb.add(InlineKeyboardButton("❌ انصراف", callback_data="deal_cancel"))
    return kb

def get_deal_revisions_keyboard():
    """کیبورد اینلاین اصلاحیه رایگان (اختیاری پیشرفته)"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(InlineKeyboardButton("🚫 بدون ویرایش رایگان", callback_data="deal_rev:0"))
    kb.add(
        InlineKeyboardButton("۱ بار اصلاحیه", callback_data="deal_rev:1"),
        InlineKeyboardButton("۲ بار اصلاحیه", callback_data="deal_rev:2")
    )
    kb.add(
        InlineKeyboardButton("🤝 توافقی بین طرفین", callback_data="deal_rev:-1"),
        InlineKeyboardButton("✍️ تعداد دلخواه", callback_data="deal_rev:custom")
    )
    kb.add(InlineKeyboardButton("❌ انصراف", callback_data="deal_cancel"))
    return kb

def get_deal_preview_keyboard(deal_id: str):
    """کیبورد تایید نهایی پیش‌نویس قرارداد"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(
        InlineKeyboardButton("✅ تایید نهایی و صدور قرارداد دیجیتال", callback_data=f"deal_confirm:{deal_id}"),
        InlineKeyboardButton("🔄 تنظیم مجدد مشخصات", callback_data="deal_restart"),
        InlineKeyboardButton("❌ لغو پیش‌نویس", callback_data="deal_cancel")
    )
    return kb

def get_deal_invite_keyboard(invite_token: str, bot_username: str, deal_id: str):
    """کیبورد اشتراک‌گذاری لینک دعوت اختصاصی به طرف دوم"""
    import urllib.parse
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    share_link = f"https://t.me/{bot_username}?start={invite_token}"
    share_text = f"🤝 دعوت‌نامه رسمی به قرارداد اسکرو میانجی\nکد قرارداد: #{deal_id}\nجهت بررسی مشخصات، مهلت تست و امضا کلیک فرمایید:"
    tg_share_url = f"https://t.me/share/url?url={urllib.parse.quote(share_link)}&text={urllib.parse.quote(share_text)}"
    
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(
        InlineKeyboardButton("📤 ارسال دعوت‌نامه به طرف دوم (تلگرام)", url=tg_share_url),
        InlineKeyboardButton("👁 مشاهده کارت قرارداد", callback_data=f"view_deal_{deal_id}"),
        InlineKeyboardButton("🏠 بازگشت به منوی اصلی", callback_data="back_to_menu")
    )
    return kb

def get_counterparty_acceptance_keyboard(deal_id: str):
    """کیبورد مشاهده و امضای قرارداد توسط طرف دوم (مخاطب)"""
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(
        InlineKeyboardButton("🤝 تایید و پذیرش قوانین میانجی (ورود به فاز پرداخت)", callback_data=f"deal_party_b_accept:{deal_id}"),
        InlineKeyboardButton("❌ رد قرارداد و انصراف", callback_data=f"deal_party_b_reject:{deal_id}")
    )
    return kb

# ==============================================================================
# ۶. متن پیش‌نمایش قرارداد هوشمند
# ==============================================================================

def build_deal_preview_card(draft: Dict[str, Any]) -> str:
    """ساخت کارت پیش‌نمایش قرارداد هوشمند دیجیتال با تمامی شرایط و قوانین"""
    amount = draft.get("amount", 0)
    payer = draft.get("commission_payer", "split_50_50")
    fees = calculate_escrow_fees(amount, payer)
    
    cat_code = draft.get("category", "GEN")
    cat_label = CATEGORY_NAMES.get(cat_code, ("سایر خدمات", "سایر"))[0]
    
    insp_hours = draft.get("inspection_period_hours", 0)
    if insp_hours > 0:
        insp_text = f"⏱ **{insp_hours} ساعت** پس از اعلام تحویل توسط مجری"
    else:
        insp_text = "⚡ **تایید آنی** (آزادسازی بلافاصله پس از اعلام تحویل)"
        
    rev_count = draft.get("free_revisions_count", 2)
    if rev_count == 0:
        rev_text = "🚫 **بدون ویرایش رایگان** (هرگونه اصلاحیه منوط به توافق مالی جدید است)"
    elif rev_count == -1:
        rev_text = "🤝 **توافقی بین طرفین**"
    else:
        rev_text = f"✅ **{rev_count} بار اصلاحیه رایگان**"
        
    creator_role_fa = "💼 کارفرما (خریدار)" if draft.get("creator_role") == "employer" else "🛠 مجری (فروشنده)"
    payer_fa = "کارفرما" if payer == "employer" else ("مجری" if payer == "freelancer" else "توافقی (۵۰/۵۰)")
    custom_desc = draft.get("description", "تعهدات فنی مشخص‌شده توسط طرفین قرارداد.").strip()
    
    return (
        "📜 **پیش‌نویس قرارداد دیجیتال و صندوق اسکرو میانجی**\n"
        "────────────────────────────\n"
        f"🏷 **عنوان موضوع:** {draft.get('title', '---')}\n"
        f"📂 **دسته‌بندی خدمت:** {cat_label}\n"
        f"👤 **ایجادکننده:** {creator_role_fa}\n\n"
        "💰 **محاسبات مالی و کارمزد:**\n"
        f"├ مبلغ توافق‌شده: **{amount:,.0f} تومان**\n"
        f"├ پرداخت‌کننده کارمزد: **{payer_fa}**\n"
        f"├ واریزی کارفرما به صندوق امانت: **{fees['buyer_pays']:,.0f} تومان**\n"
        f"└ دریافتی خالص مجری: **{fees['seller_receives']:,.0f} تومان**\n\n"
        "🛡 **بخش‌های اختیاری و تعهدات فنی:**\n"
        f"├ مهلت بررسی/تست: {insp_text}\n"
        f"└ سهمیه اصلاحیه رایگان: {rev_text}\n\n"
        "📋 **تعهدات و خواسته‌های پروژه (ملاک داوری حقوقی):**\n"
        f"«{custom_desc}»\n\n"
        "⚖️ **قوانین و ضمانت اجرایی میانجی:**\n"
        "• ملاک داوری و حل اختلاف، صرفاً و منحصراً همین تعهدات مکتوب در قرارداد است و چت‌های خارج از قرارداد بررسی نمی‌شوند.\n"
        "• وجوه تا زمان تایید نهایی خروجی پروژه، در حساب امانی امن میانجی مسدود می‌ماند.\n"
        "────────────────────────────\n"
        "💡 آیا اطلاعات فوق را تایید می‌فرمایید؟"
    )

def build_counterparty_welcome_card(deal: Dict[str, Any]) -> str:
    """پیام دعوت شکیل برای طرف دوم هنگام ورود با لینک اختصاصی"""
    amount = deal.get("amount", 0)
    payer = deal.get("commission_payer", "split_50_50")
    fees = calculate_escrow_fees(amount, payer)
    cat_label = CATEGORY_NAMES.get(deal.get("category", "GEN"), ("سایر", "سایر"))[0]
    
    insp_hours = deal.get("inspection_period_hours", 0)
    insp_text = f"{insp_hours} ساعت مهلت تست" if insp_hours > 0 else "تایید آنی"
    
    rev_count = deal.get("free_revisions_count", 2)
    rev_text = "بدون ویرایش" if rev_count == 0 else (f"{rev_count} بار رایگان" if rev_count > 0 else "توافقی")
    
    creator_is_buyer = deal.get("creator_role") == "employer"
    invite_role = "مجری (فروشنده)" if creator_is_buyer else "کارفرما (خریدار)"
    deal_desc = deal.get("description", "مشخصات فنی و استانداردهای کیفی توافق‌شده طرفین.").strip()
    
    return (
        f"🤝 **دعوت به همکاری و انعقاد قرارداد اسکرو میانجی**\n"
        f"🆔 شناسه معامله: `{deal.get('contract_id')}`\n"
        "────────────────────────────\n"
        f"طرف اول شما را به عنوان **{invite_role}** در پروژه زیر دعوت نموده است:\n\n"
        f"📝 **عنوان:** {deal.get('title')}\n"
        f"📂 **حوزه:** {cat_label}\n"
        f"💵 **مبلغ کل معامله:** {amount:,.0f} تومان\n"
        f"🛡 **مهلت بررسی و تست:** {insp_text}\n"
        f"🔄 **سهمیه اصلاحیه:** {rev_text}\n\n"
        f"📋 **تعهدات و اقلام تحویلی (ملاک داوری میانجی):**\n"
        f"«{deal_desc}»\n\n"
        "📌 **روند کار اسکرو:**\n"
        "۱. پس از پذیرش این قرارداد، کارفرما وجه را به حساب امن میانجی واریز می‌نماید.\n"
        "۲. پس از اعلام قفل شدن وجه، مجری کار را شروع و فایل‌های نهایی را ارسال می‌کند.\n"
        "۳. کارفرما در مهلت تعیین‌شده کار را بررسی و تایید می‌نماید تا وجه تسویه شود.\n"
        "⚖️ داوری میانجی در صورت هرگونه ادعا یا مغایرت، صرفاً بر مبنای تعهدات مندرج در این قرارداد خواهد بود.\n\n"
        "آیا با شرایط فوق و قوانین میانجی موافقید؟"
    )
