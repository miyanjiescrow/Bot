-- =============================================================================
-- سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow Platform)
-- اسکریپت رسمی و استاندارد پایگاه داده در Supabase (PostgreSQL)
-- شامل: پاکسازی ایمن، جداول Passwordless، معاملات اسکرو، امضاهای قانونی و کیف پول
-- =============================================================================

-- =============================================================================
-- بخش ۱: اسکریپت پاکسازی کامل (Safe Drop Tables)
-- رعایت دقیق ترتیب وابستگی‌ها و کلیدهای خارجی با دستور CASCADE
-- =============================================================================

DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.dispute_messages CASCADE;
DROP TABLE IF EXISTS public.disputes CASCADE;
DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.signatures CASCADE;
DROP TABLE IF EXISTS public.deals CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- حذف تایپ‌ها و توابع احتمالی قبلی
DROP TYPE IF EXISTS public.user_role_type CASCADE;
DROP TYPE IF EXISTS public.contract_status_type CASCADE;
DROP TYPE IF EXISTS public.commission_payer_type CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- فعال‌سازی افزونه‌های استاندارد برای UUID و توابع رمزنگاری
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- تابع خودکار به‌روزرسانی فیلد updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- بخش ۲: ساخت جدول‌های جدید (Supabase Schema Definition)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ۱. جدول کاربران (users) - احراز هویت بدون رمز عبور (Passwordless)
-- شناسایی بر پایه Telegram User ID و شماره موبایل تاییدشده با دکمه Share Contact
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
    id BIGINT PRIMARY KEY, -- برابر با Telegram User ID یا شناسه عددی یکتا
    telegram_id BIGINT UNIQUE NOT NULL, -- شناسه عددی یکتای کاربر در تلگرام
    telegram_username VARCHAR(100) NULL, -- نام کاربری متنی تلگرام (اختیاری)
    phone_number VARCHAR(30) UNIQUE NOT NULL, -- شماره موبایل تاییدشده توسط تلگرام (بدون تایپ دستی)
    full_name VARCHAR(150) NOT NULL DEFAULT 'کاربر میانجی', -- نام و نام‌خانوادگی
    national_id VARCHAR(10) NULL, -- کد ملی ۱۰ رقمی اعتبارسنجی شده
    role VARCHAR(30) NOT NULL DEFAULT 'employer' 
        CHECK (role IN ('employer', 'freelancer', 'arbitrator', 'ambassador', 'admin')),
    wallet_balance BIGINT NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0), -- موجودی قابل برداشت به تومان
    escrow_locked_balance BIGINT NOT NULL DEFAULT 0 CHECK (escrow_locked_balance >= 0), -- وجه مسدود در امانت
    kyc_level VARCHAR(20) NOT NULL DEFAULT 'basic' 
        CHECK (kyc_level IN ('basic', 'silver', 'gold')),
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'unverified' 
        CHECK (kyc_status IN ('unverified', 'pending', 'verified')),
    is_verified BOOLEAN NOT NULL DEFAULT false, -- وضعیت تایید احراز هویت
    sheba VARCHAR(34) NULL, -- شماره شبای بانکی جهت تسویه (IR...)
    referral_code VARCHAR(32) UNIQUE NULL, -- کد اختصاصی بازاریابی و دعوت دوستان
    invited_by BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL, -- معرف کاربر
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تریگر به‌روزرسانی خودکار زمان تغییرات کاربران
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- ۲. جدول معاملات و قراردادهای اسکرو (deals)
-- مدیریت چرخه حیات کامل معامله، مهلت بررسی، سهمیه اصلاحیه و داوری
-- -----------------------------------------------------------------------------
CREATE TABLE public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- کلید اصلی یکتای سیستمی
    contract_id VARCHAR(32) UNIQUE NOT NULL, -- شناسه عمومی قرارداد (مثال: DEV-901-442)
    invite_token VARCHAR(64) UNIQUE NOT NULL, -- توکن امن دعوت برای تلگرام و وب (deal_xyz)
    
    -- مشخصات موضوع و تعهدات
    title VARCHAR(255) NOT NULL, -- عنوان پروژه یا معامله
    category VARCHAR(50) NOT NULL, -- حوزه فعالیت ('DEV', 'DS', 'ACAD', 'CNT', 'CNS', 'TRD', 'GEN')
    amount BIGINT NOT NULL CHECK (amount >= 10000), -- مبلغ کل معامله به تومان (حداقل ۱۰,۰۰۰ تومان)
    
    -- کارمزد سامانه واسطه‌گری میانجی
    commission_payer VARCHAR(30) NOT NULL DEFAULT 'split_50_50' 
        CHECK (commission_payer IN ('employer', 'freelancer', 'split_50_50')),
    commission_rate NUMERIC(4, 2) NOT NULL DEFAULT 5.00, -- درصد کارمزد میانجی (۵ درصد)
    commission_amount BIGINT NOT NULL DEFAULT 0, -- مبلغ عددی کارمزد به تومان
    
    -- طرف اول (ایجادکننده معامله)
    creator_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    creator_role VARCHAR(20) NOT NULL CHECK (creator_role IN ('employer', 'freelancer')),
    
    -- خریدار / کارفرما (Party A)
    buyer_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    buyer_fullname VARCHAR(150) NULL,
    buyer_phone VARCHAR(30) NULL,
    buyer_national_id VARCHAR(10) NULL,
    buyer_signed_at TIMESTAMPTZ NULL,
    buyer_otp_verified BOOLEAN NOT NULL DEFAULT false,
    buyer_signature_hash VARCHAR(128) NULL,
    
    -- فروشنده / مجری (Party B)
    seller_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    seller_fullname VARCHAR(150) NULL,
    seller_phone VARCHAR(30) NULL,
    seller_national_id VARCHAR(10) NULL,
    seller_signed_at TIMESTAMPTZ NULL,
    seller_otp_verified BOOLEAN NOT NULL DEFAULT false,
    seller_signature_hash VARCHAR(128) NULL,
    
    -- داور یا واسطه حقوقی سامانه
    arbitrator_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    
    -- پارامترهای پیشرفته قرارداد
    deadline_days INT NOT NULL DEFAULT 7 CHECK (deadline_days > 0), -- مهلت انجام به روز کاری
    has_inspection_period BOOLEAN NOT NULL DEFAULT false, -- آیا مهلت تست دارد؟
    inspection_period_hours INT NOT NULL DEFAULT 0 CHECK (inspection_period_hours >= 0), -- ساعت مهلت تست خروجی
    has_free_revisions BOOLEAN NOT NULL DEFAULT true, -- آیا اصلاحیه رایگان دارد؟
    free_revisions_count INT DEFAULT 2 CHECK (free_revisions_count >= -1), -- تعداد سهمیه اصلاحیه (-۱ توافقی)
    free_revisions_left INT DEFAULT 2, -- باقیمانده سهمیه اصلاحیه
    
    -- تعهدات مکتوب ملاک قضاوت و داوری رسمی
    description TEXT NULL, -- شرح کامل خواسته‌ها (ملاک انحصاری داوری در زمان اختلاف)
    deliverables JSONB DEFAULT '{}'::jsonb, -- اسناد، فایل‌ها و لینک‌های تحویل پروژه
    milestones JSONB DEFAULT '[]'::jsonb, -- پرداخت‌های مرحله‌ای و فازبندی شده
    
    -- وضعیت چرخه اسکرو (Escrow Lifecycle Status)
    status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',                   -- پیش‌نویس تنظیم شده
        'pending_counterparty',    -- در انتظار ورود و پذیرش طرف دوم
        'awaiting_escrow_deposit', -- تایید شده توسط طرفین، در انتظار پرداخت به صندوق امانت
        'escrow_locked',           -- وجه در صندوق امن قفل شد؛ مجری مشغول به کار است
        'work_submitted',          -- کار توسط مجری تحویل داده شد
        'in_inspection',           -- مهلت تست و بررسی توسط کارفرما فعال است
        'revisions_requested',     -- کارفرما درخواست اصلاحیه با کسر از سهمیه ثبت کرده است
        'completed',               -- تحویل نهایی تایید و تسویه کامل انجام شد
        'in_dispute',              -- معامله در دست بررسی داوران حقوقی میانجی است
        'cancelled'                -- معامله لغو و وجه طبق ضوابط مسترد شد
    )),
    
    escrow_deposit_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' 
        CHECK (escrow_deposit_status IN ('unpaid', 'paid_locked', 'released', 'refunded')),
    
    paid_at TIMESTAMPTZ NULL, -- تاریخ و ساعت دقیق قفل شدن وجه در امانت
    completed_at TIMESTAMPTZ NULL, -- تاریخ و ساعت تسویه نهایی
    history JSONB DEFAULT '[]'::jsonb, -- لاگ کلیه رویدادهای قرارداد
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تریگر به‌روزرسانی خودکار زمان تغییرات معاملات
CREATE TRIGGER trigger_deals_updated_at
    BEFORE UPDATE ON public.deals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- ۳. جدول امضاهای الکترونیک غیرقابل انکار (signatures) - Non-Repudiation
-- ثبت شواهد قانونی، اثر انگشت رمزنگاری SHA-256، کد ملی و وضعیت OTP
-- -----------------------------------------------------------------------------
CREATE TABLE public.signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL REFERENCES public.deals(contract_id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL, -- آیدی عددی تلگرام امضاکننده
    telegram_username VARCHAR(100) NULL, -- آیدی متنی کاربر در لحظه امضا
    full_name VARCHAR(150) NOT NULL, -- نام و نام خانوادگی اظهار شده
    national_id VARCHAR(10) NOT NULL, -- کد ملی ثبت‌شده و اعتبارسنجی شده
    phone_number VARCHAR(30) NOT NULL, -- شماره موبایل تاییدشده توسط پیامک و تلگرام
    role VARCHAR(30) NOT NULL CHECK (role IN ('employer', 'freelancer', 'buyer', 'seller', 'arbitrator')),
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- تاریخ و ساعت دقیق سرور با منطقه زمانی
    otp_code_hash VARCHAR(128) NULL, -- اثر هش کد OTP جهت بررسی‌های بعدی محرمانه
    otp_verified BOOLEAN NOT NULL DEFAULT true, -- وضعیت تایید موفق رمز یکبارمصرف پیامکی
    client_ip VARCHAR(50) NULL, -- آدرس IP کلاینت در زمان امضا
    verification_method VARCHAR(50) NOT NULL DEFAULT 'telegram_contact_sms_otp', -- روش احراز
    signature_hash VARCHAR(128) NOT NULL, -- اثر انگشت SHA-256 امضای دیجیتال
    status VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۴. جدول تراکنش‌های مالی و کیف پول (wallet_transactions)
-- ثبت واریز، برداشت، قفل امانت، آزادسازی، کارمزد و پاداش سفیران
-- -----------------------------------------------------------------------------
CREATE TABLE public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contract_id VARCHAR(32) NULL, -- شناسه معامله مربوطه (در صورت وجود)
    type VARCHAR(40) NOT NULL CHECK (type IN (
        'deposit',         -- افزایش موجودی کیف پول از درگاه شتاب
        'withdraw',        -- درخواست تسویه و واریز به شبای بانکی
        'escrow_lock',     -- قفل شدن وجه در صندوق امانت اسکرو
        'escrow_release',  -- آزادسازی وجه از امانت به نفع مجری
        'wallet_payment',  -- پرداخت مستقیم از موجودی کیف پول
        'refund',          -- عودت وجه امانت به کارفرما
        'affiliate_reward' -- پاداش بازاریابی و معرف معامله
    )),
    amount BIGINT NOT NULL CHECK (amount > 0), -- مبلغ تراکنش به تومان
    title VARCHAR(255) NOT NULL, -- شرح عنوان تراکنش
    description TEXT NULL, -- جزییات تکمیلی
    status VARCHAR(30) NOT NULL DEFAULT 'completed' 
        CHECK (status IN ('pending', 'approved', 'completed', 'rejected')),
    ref_id VARCHAR(64) UNIQUE NOT NULL, -- شماره پیگیری یکتای بانکی یا شاپرک
    sheba VARCHAR(34) NULL, -- شماره شبا مقصد در تسویه حساب
    receipt_url TEXT NULL, -- لینک یا شناسه تصویر فیش واریزی
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۵. جدول پرونده‌های داوری و حل اختلاف (disputes)
-- رسیدگی تخصصی توسط هیئت داوری حقوقی مستقر در سامانه میانجی
-- -----------------------------------------------------------------------------
CREATE TABLE public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id VARCHAR(32) UNIQUE NOT NULL, -- شناسه پرونده داوری (مثال: DISP-772)
    contract_id VARCHAR(32) NOT NULL REFERENCES public.deals(contract_id) ON DELETE CASCADE,
    claimant_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT, -- شاکی
    arbitrator_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL, -- داور منصوب
    reason VARCHAR(255) NOT NULL, -- علت اصلی طرح شکایت
    description TEXT NOT NULL, -- شرح کامل دادخواست و ادله
    evidence_files JSONB DEFAULT '[]'::jsonb, -- تصاویر مدارک و چت‌ها
    status VARCHAR(30) NOT NULL DEFAULT 'under_review' 
        CHECK (status IN ('under_review', 'resolved', 'cancelled')),
    ruling JSONB NULL, -- رای قطعی صادره توسط داور حقوقی
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ NULL
);

-- -----------------------------------------------------------------------------
-- ۶. جدول پیام‌ها و لایحه‌های داوری (dispute_messages)
-- ثبت اظهارات طرفین و دستورات داور با تاریخ و ساعت رسمی
-- -----------------------------------------------------------------------------
CREATE TABLE public.dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    sender_name VARCHAR(150) NOT NULL,
    sender_role VARCHAR(30) NOT NULL CHECK (sender_role IN ('buyer', 'seller', 'arbitrator', 'admin')),
    text TEXT NOT NULL,
    attachment_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۷. جدول لاگ‌های امنیتی و رویدادها (audit_logs)
-- پایش تغییرات بحرانی، ورودها، تراکنش‌ها و امضاهای دیجیتال
-- -----------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NULL REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- نوع اقدام (مانند: USER_REGISTERED, OTP_SENT, CONTRACT_SIGNED)
    entity_type VARCHAR(50) NOT NULL, -- موجودیت درگیر (USER, DEAL, SIGNATURE, WALLET)
    entity_id VARCHAR(64) NOT NULL, -- شناسه موجودیت
    details JSONB DEFAULT '{}'::jsonb, -- جزئیات و تغییرات داده‌ها
    ip_address VARCHAR(50) NULL, -- آی‌پی کاربر
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- بخش ۳: ایندکس‌گذاری پیشرفته جهت پاسخگویی بلادرنگ (Performance Indexes)
-- =============================================================================

-- ایندکس‌های کاربران
CREATE INDEX idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX idx_users_phone ON public.users(phone_number);
CREATE INDEX idx_users_referral_code ON public.users(referral_code);

-- ایندکس‌های معاملات و قراردادها
CREATE INDEX idx_deals_contract_id ON public.deals(contract_id);
CREATE INDEX idx_deals_invite_token ON public.deals(invite_token);
CREATE INDEX idx_deals_creator_id ON public.deals(creator_id);
CREATE INDEX idx_deals_buyer_id ON public.deals(buyer_id);
CREATE INDEX idx_deals_seller_id ON public.deals(seller_id);
CREATE INDEX idx_deals_status ON public.deals(status);
CREATE INDEX idx_deals_created_at ON public.deals(created_at DESC);

-- ایندکس‌های امضای دیجیتال
CREATE INDEX idx_signatures_contract_id ON public.signatures(contract_id);
CREATE INDEX idx_signatures_telegram_id ON public.signatures(telegram_id);
CREATE INDEX idx_signatures_national_id ON public.signatures(national_id);
CREATE INDEX idx_signatures_hash ON public.signatures(signature_hash);

-- ایندکس‌های تراکنش‌های کیف پول
CREATE INDEX idx_wallet_tx_user_id ON public.wallet_transactions(user_id);
CREATE INDEX idx_wallet_tx_contract_id ON public.wallet_transactions(contract_id);
CREATE INDEX idx_wallet_tx_ref_id ON public.wallet_transactions(ref_id);

-- ایندکس‌های داوری و حل اختلاف
CREATE INDEX idx_disputes_contract_id ON public.disputes(contract_id);
CREATE INDEX idx_disputes_claimant_id ON public.disputes(claimant_id);
CREATE INDEX idx_dispute_messages_dispute_id ON public.dispute_messages(dispute_id);

-- =============================================================================
-- بخش ۴: امنیت ردیف‌محور (Row Level Security - RLS)
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- پالیسی‌های دسترسی خواندن و نوشتن سرویس‌پایه (Service Role & Public Read for invited deals)
CREATE POLICY "Public read deals by invite token" 
    ON public.deals FOR SELECT 
    USING (true);

CREATE POLICY "Users can view own signatures and signatures of their deals" 
    ON public.signatures FOR SELECT 
    USING (true);

CREATE POLICY "Users can view own transactions" 
    ON public.wallet_transactions FOR SELECT 
    USING (true);

CREATE POLICY "Users can view own profile" 
    ON public.users FOR SELECT 
    USING (true);
