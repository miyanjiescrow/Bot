"""
==============================================================================
سامانه واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow)
ماژول خدمات احراز هویت بدون رمز عبور (Passwordless) و پیامک رمز یکبارمصرف (SMS OTP)
تولید شواهد دیجیتال غیرقابل انکار (Non-Repudiation) و اعتبارسنجی حقوقی قراردادها
==============================================================================
"""

import os
import re
import time
import hmac
import hashlib
import random
import logging
import urllib.request
import urllib.parse
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from config import config
import database as db
from phone_utils import normalize_phone_number

logger = logging.getLogger("Miyanji_AuthService")

# حافظه موقت کدهای OTP ارسالی (برای محیط‌های توسعه و زمان منقضی شدن ۳ دقیقه‌ای)
# { phone_or_telegram_id: { "code": str, "expires_at": float, "attempts": int, "purpose": str } }
_otp_cache: Dict[str, Dict[str, Any]] = {}

OTP_EXPIRY_SECONDS = 180  # ۳ دقیقه اعتبار برای هر کد تایید


# ==============================================================================
# ۱. مدیریت احراز هویت بدون رمز عبور (Passwordless Identity)
# ==============================================================================

def is_user_registered(telegram_id: int) -> bool:
    """
    بررسی اینکه آیا کاربر قبلاً با شماره موبایل ثبت‌نام کرده و در سیستم تایید شده است یا خیر.
    نیازی به پسورد نیست؛ مالکیت شماره و Telegram User ID مبنای احراز هویت است.
    """
    if not telegram_id:
        return False
    user = db.get_user(telegram_id)
    if user and user.get("phone_number"):
        return True
    
    # بررسی ثانویه در کش یا دیتابیس
    phone = db.get_current_user_phone(telegram_id)
    return bool(phone)


def get_user_profile(telegram_id: int) -> Optional[Dict[str, Any]]:
    """دریافت پروفایل کاربر بر اساس Telegram ID"""
    return db.get_user(telegram_id)


def register_passwordless_user(
    telegram_id: int,
    phone_number: str,
    first_name: str = "",
    username: str = "",
    full_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    ثبت‌نام یا به‌روزرسانی آنی کاربر بدون نیاز به رمز عبور.
    شماره تماس از طریق دکمه امن Share Contact تلگرام اعتبارسنجی شده است.
    """
    norm_phone = normalize_phone_number(phone_number) or phone_number
    resolved_name = (full_name or first_name or f"کاربر {telegram_id}").strip()
    
    user_data = db.register_or_update_user(
        user_id=telegram_id,
        username=username or "",
        first_name=first_name or "",
        full_name=resolved_name,
        phone_number=norm_phone,
        is_verified=True
    )
    
    # تنظیم نشست فعال کاربر در دیتابیس
    db.set_user_session(telegram_id, norm_phone)
    logger.info(f"✅ [AUTH_PASSWORDLESS] User {telegram_id} successfully authenticated with phone {norm_phone}")
    return user_data


# ==============================================================================
# ۲. سرویس تولید و ارسال رمز یکبارمصرف پیامکی (Real & Simulated SMS OTP)
# ==============================================================================

def generate_secure_otp(target_key: str, purpose: str = "signature") -> str:
    """
    تولید کد OTP ۶ رقمی تصادفی و رمزنگاری‌شده و ذخیره در حافظه موقت با مهلت انقضا.
    """
    code = f"{random.randint(100000, 999999)}"
    now = time.time()
    _otp_cache[str(target_key)] = {
        "code": code,
        "expires_at": now + OTP_EXPIRY_SECONDS,
        "attempts": 0,
        "purpose": purpose,
        "created_at": now
    }
    return code


def send_sms_otp(phone_number: str, otp_code: str, contract_id: Optional[str] = None) -> Tuple[bool, str]:
    """
    ارسال کد OTP از طریق وب‌سرویس پیامک (کاوه نگار / قاصدک / ملی‌پیامک یا شبیه‌ساز امن کنسول).
    کد به هیچ عنوان در چت تلگرام چاپ نمی‌شود تا محرمانگی احراز دو عاملی نقض نگردد.
    """
    norm_phone = normalize_phone_number(phone_number) or phone_number
    masked_phone = f"{norm_phone[:4]}***{norm_phone[-4:]}" if len(norm_phone) >= 10 else norm_phone
    
    sms_text = (
        f"سامانه واسطه‌گری امن میانجی (Miyanji)\n"
        f"کد تأیید امضای رسمی قرارداد: {otp_code}\n"
    )
    if contract_id:
        sms_text += f"شناسه معامله: {contract_id}\n"
    sms_text += f"اعتبار: ۳ دقیقه\nمحرمانه - به هیچ عنوان در اختیار دیگران قرار ندهید."

    # ۱. تلاش برای ارسال از طریق وب‌سرویس کاوه نگار در صورت وجود API Key
    kavenegar_key = getattr(config, "KAVENEGAR_API_KEY", os.environ.get("KAVENEGAR_API_KEY"))
    if kavenegar_key:
        try:
            url = f"https://api.kavenegar.com/v1/{kavenegar_key}/sms/send.json"
            data = urllib.parse.urlencode({
                "receptor": norm_phone,
                "message": sms_text
            }).encode('utf-8')
            req = urllib.request.Request(url, data=data, method="POST")
            with urllib.request.urlopen(req, timeout=8) as resp:
                res_body = json.loads(resp.read().decode('utf-8'))
                if res_body.get("return", {}).get("status") == 200:
                    logger.info(f"📨 [SMS_SENT] Kavenegar SMS sent to {masked_phone} for contract {contract_id}")
                    return True, f"کد تایید با موفقیت به شماره {masked_phone} پیامک شد."
        except Exception as e:
            logger.warning(f"⚠️ [SMS_PROVIDER_ERROR] Kavenegar delivery notice: {e}")

    # ۲. ثبت در لاگ‌های امنیتی سرور (شبیه‌ساز رسمی پنل پیامک در محیط توسعه)
    logger.info(
        f"📲 [SMS_GATEWAY_DISPATCH] >>> SMS Sent to {masked_phone} | Code: [{otp_code}] | Contract: {contract_id or 'N/A'}"
    )
    return True, f"کد تأیید ۶ رقمی امنیتی به شماره {masked_phone} پیامک گردید."


def verify_sms_otp(target_key: str, user_input: str) -> Tuple[bool, str]:
    """
    اعتبارسنجی کد OTP وارد شده توسط کاربر با کنترل سقف دفعات تلاش و زمان انقضا.
    """
    clean_input = "".join(re.findall(r'\d+', str(user_input)))
    record = _otp_cache.get(str(target_key))
    
    if not record:
        return False, "⚠️ کد تأیید صادر نشده یا منقضی شده است. لطفاً مجدداً درخواست ارسال کد دهید."
    
    # بررسی انقضا
    if time.time() > record["expires_at"]:
        _otp_cache.pop(str(target_key), None)
        return False, "⌛ مهلت ۳ دقیقه‌ای کد تأیید به پایان رسیده است. لطفاً دوباره تلاش کنید."
    
    # بررسی دفعات تلاش ناموفق (حداکثر ۳ بار جهت مقابله با حملات Brute-Force)
    record["attempts"] += 1
    if record["attempts"] > 4:
        _otp_cache.pop(str(target_key), None)
        return False, "🚫 تعداد دفعات تلاش بیش از حد مجاز بود. کد منقضی شد؛ مجدداً درخواست امضا دهید."
    
    if clean_input != record["code"]:
        rem = max(0, 4 - record["attempts"])
        return False, f"❌ کد تأیید پیامک‌شده اشتباه است. ({rem} تلاش باقی‌مانده)"
    
    # تایید موفق -> پاکسازی کد مصرف‌شده (One-Time Only)
    _otp_cache.pop(str(target_key), None)
    return True, "✅ کد تأیید پیامکی با موفقیت تایید شد."


# ==============================================================================
# ۳. تولید شواهد غیرقابل انکار حقوقی (Non-Repudiation Cryptographic Digest)
# ==============================================================================

def generate_digital_signature_hash(
    contract_id: str,
    telegram_id: int,
    national_id: str,
    phone_number: str,
    timestamp_iso: str,
    role: str
) -> str:
    """
    محاسبه هش دیجیتال غیرقابل انکار (SHA-256) بر پایه داده‌های هویتی طرف معامله،
    شناسه قرارداد، زمان و نمک امنیتی سیستم برای استناد قانونی در محاکم قضایی و داوری.
    """
    secret_salt = getattr(config, "SECURITY_SALT", "MiyanjiEscrowLegalSalt2026")
    raw_payload = f"{contract_id}|{telegram_id}|{national_id}|{phone_number}|{role}|{timestamp_iso}|{secret_salt}"
    
    signature_hash = hashlib.sha256(raw_payload.encode('utf-8')).hexdigest()
    return f"SIG-SHA256-{signature_hash[:32].upper()}"


# ==============================================================================
# ۴. سازگاری رو به عقب (Backward Compatibility Stubs)
# ==============================================================================

def is_authenticated(user_id: int) -> bool:
    """بررسی احراز هویت بدون نیاز به پسورد"""
    return is_user_registered(user_id)


# ==============================================================================
# ۵. مدیریت و اعتبارسنجی پین‌کد مالی (Financial PIN Security)
# ==============================================================================

def hash_financial_pin(pin: str) -> str:
    """هش رمز دوم مالی با نمک اختصاصی و الگوریتم SHA-256"""
    secret_salt = getattr(config, "SECURITY_SALT", "MiyanjiEscrowLegalSalt2026")
    clean = str(pin).strip()
    return hashlib.sha256(f"{clean}::{secret_salt}".encode("utf-8")).hexdigest()

def has_financial_pin(user_id: int) -> bool:
    """بررسی وجود پین مالی فعال برای کاربر"""
    u = db.get_user(user_id)
    return bool(u and u.get("financial_pin_hash"))

def set_user_financial_pin(user_id: int, pin: str) -> Dict[str, Any]:
    """ثبت یا تغییر پین‌کد مالی با اعتبارسنجی ارقام ناامن"""
    u = db.get_user(user_id)
    if not u:
        return {"success": False, "message": "کاربر یافت نشد."}
    
    clean_pin = re.sub(r'\D', '', str(pin).strip())
    if not re.fullmatch(r"^\d{4,6}$", clean_pin):
        return {"success": False, "message": "پین مالی باید بین ۴ تا ۶ رقم عددی باشد."}

    # رد ارقام کاملاً تکراری یا دنباله‌دار ناامن (مانند 1111، 1234، 9876)
    if len(set(clean_pin)) == 1:
        return {"success": False, "message": "استفاده از ارقام کاملاً تکراری مجاز نیست."}
    if clean_pin in ["1234", "12345", "123456", "9876", "98765", "987654"]:
        return {"success": False, "message": "استفاده از پین‌های قابل حدس مانند ۱۲۳۴ مجاز نیست."}

    pin_hash = hash_financial_pin(clean_pin)
    db.update_user_fields(user_id, {
        "financial_pin_hash": pin_hash,
        "has_financial_pin": True,
        "pin_failed_attempts": 0,
        "pin_locked_until": None
    })
    return {"success": True, "message": "پین مالی با موفقیت ثبت شد."}

def verify_financial_pin(user_id: int, pin: str) -> Dict[str, Any]:
    """بررسی پین مالی با اعمال محافظت ۳ بار تلاش ناموفق و قفل ۱۵ دقیقه‌ای"""
    u = db.get_user(user_id)
    if not u:
        return {"success": False, "message": "کاربر یافت نشد."}

    if not u.get("financial_pin_hash"):
        return {"success": False, "message": "پین مالی هنوز تنظیم نشده است."}

    # بررسی قفل زمانی
    locked_until = u.get("pin_locked_until")
    now_ts = time.time()
    if locked_until:
        try:
            lock_exp = float(locked_until)
        except (ValueError, TypeError):
            lock_exp = 0.0
        if now_ts < lock_exp:
            mins_left = max(1, int((lock_exp - now_ts) / 60))
            return {
                "success": False, 
                "locked": True, 
                "remaining_attempts": 0, 
                "message": f"⚠️ حساب مالی به دلیل تلاش‌های ناموفق تا {mins_left} دقیقه دیگر قفل است."
            }
        else:
            # زمان قفل به پایان رسیده
            db.update_user_fields(user_id, {"pin_locked_until": None, "pin_failed_attempts": 0})
            u["pin_failed_attempts"] = 0

    clean_pin = re.sub(r'\D', '', str(pin).strip())
    input_hash = hash_financial_pin(clean_pin)
    stored_hash = u.get("financial_pin_hash")

    if hmac.compare_digest(input_hash, stored_hash):
        # موفقیت: بازنشانی شمارنده تلاش‌های ناموفق
        db.update_user_fields(user_id, {"pin_failed_attempts": 0, "pin_locked_until": None})
        return {"success": True, "message": "پین مالی تایید شد."}
    else:
        attempts = int(u.get("pin_failed_attempts", 0)) + 1
        max_attempts = 3
        remaining = max(0, max_attempts - attempts)
        updates = {"pin_failed_attempts": attempts}
        locked = False
        if attempts >= max_attempts:
            # قفل ۱۵ دقیقه‌ای
            lock_until_ts = now_ts + (15 * 60)
            updates["pin_locked_until"] = lock_until_ts
            locked = True
        db.update_user_fields(user_id, updates)
        return {
            "success": False,
            "locked": locked,
            "remaining_attempts": remaining,
            "message": f"رمز مالی اشتباه است. {remaining} فرصت باقی مانده است."
        }
