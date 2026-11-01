-- =============================================================================
-- سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow Platform)
-- اسکریپت رسمی، جامع، ضد خطا و کاملاً idempotent پایگاه داده در Supabase / PostgreSQL
-- هماهنگ با ماژول‌های پایتون (database.py, user.py, admin.py) و سرور وب (Node.js/Express)
-- ⚠️ بدون ایجاد خطای تداخل کلید خارجی، نوع رابطه یا حذف داده‌های موجود
-- =============================================================================

-- فعال‌سازی اکستنشن‌های مورد نیاز
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- تابع عمومی به‌روزرسانی خودکار ستون updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- ۱. جدول کاربران (users) - پایدار و هماهنگ با احراز هویت تلگرام و وب
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id BIGINT PRIMARY KEY, -- شناسه کاربری یکتای عددی تلگرام
    telegram_id BIGINT NULL,
    telegram_username VARCHAR(100) NULL,
    username VARCHAR(100) NULL,
    phone_number VARCHAR(30) NULL,
    full_name VARCHAR(150) NOT NULL DEFAULT 'کاربر میانجی',
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    national_id VARCHAR(10) NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'user',
    wallet_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    escrow_locked_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    kyc_level VARCHAR(20) NOT NULL DEFAULT 'basic',
    kyc_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
    kyc_reject_reason TEXT NULL,
    kyc_submitted_at TIMESTAMPTZ NULL,
    kyc_verified_at TIMESTAMPTZ NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    sheba VARCHAR(34) NULL,
    sheba_owner_name VARCHAR(150) NULL,
    financial_pin_hash TEXT NULL,
    referral_code VARCHAR(32) NULL,
    invited_by BIGINT NULL,
    payment_cards JSONB DEFAULT '[]'::jsonb,
    is_blacklisted BOOLEAN NOT NULL DEFAULT false,
    is_terms_accepted BOOLEAN NOT NULL DEFAULT true,
    terms_accepted_at TIMESTAMPTZ NULL,
    impersonated_by BIGINT NULL,
    password_hash TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ستون‌های تکمیلی برای همگام‌سازی بی‌دردسر جداول قبلی در دیتابیس
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_id BIGINT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name VARCHAR(150) DEFAULT 'کاربر میانجی';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS national_id VARCHAR(10) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(15, 2) DEFAULT 0.0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS escrow_locked_balance NUMERIC(15, 2) DEFAULT 0.0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_level VARCHAR(20) DEFAULT 'basic';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(30) DEFAULT 'unverified';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_reject_reason TEXT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sheba VARCHAR(34) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sheba_owner_name VARCHAR(150) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS financial_pin_hash TEXT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invited_by BIGINT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_cards JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_terms_accepted BOOLEAN DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS impersonated_by BIGINT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_national_id ON public.users(national_id);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON public.users(kyc_status);

DROP TRIGGER IF EXISTS trigger_users_updated_at ON public.users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- ۲. جدول قراردادها و معاملات اسکرو (contracts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) PRIMARY KEY,
    invite_token VARCHAR(64) NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'معامله هوشمند میانجی',
    category VARCHAR(50) NOT NULL DEFAULT 'GEN',
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    commission_payer VARCHAR(30) NOT NULL DEFAULT 'split_50_50',
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.0,
    commission_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    
    creator_id BIGINT NULL,
    creator_role VARCHAR(20) NOT NULL DEFAULT 'employer',
    
    buyer_id BIGINT NULL,
    buyer_fullname VARCHAR(150) NULL,
    buyer_phone VARCHAR(30) NULL,
    buyer_alt_phone VARCHAR(30) NULL,
    buyer_national_id VARCHAR(10) NULL,
    buyer_signed_at TIMESTAMPTZ NULL,
    buyer_otp_verified BOOLEAN NOT NULL DEFAULT false,
    buyer_otp_code VARCHAR(20) NULL,
    buyer_ip VARCHAR(50) NULL,
    buyer_role VARCHAR(30) DEFAULT 'employer',
    buyer_signature_hash VARCHAR(128) NULL,
    
    seller_id BIGINT NULL,
    seller_fullname VARCHAR(150) NULL,
    seller_phone VARCHAR(30) NULL,
    seller_alt_phone VARCHAR(30) NULL,
    seller_national_id VARCHAR(10) NULL,
    seller_signed_at TIMESTAMPTZ NULL,
    seller_otp_verified BOOLEAN NOT NULL DEFAULT false,
    seller_otp_code VARCHAR(20) NULL,
    seller_ip VARCHAR(50) NULL,
    seller_role VARCHAR(30) DEFAULT 'freelancer',
    seller_signature_hash VARCHAR(128) NULL,
    
    arbitrator_id BIGINT NULL,
    deadline INT NOT NULL DEFAULT 7,
    deadline_days INT NOT NULL DEFAULT 7,
    has_inspection_period BOOLEAN NOT NULL DEFAULT false,
    inspection_period_hours INT NOT NULL DEFAULT 0,
    has_free_revisions BOOLEAN NOT NULL DEFAULT true,
    free_revisions_count INT NOT NULL DEFAULT 2,
    free_edits INT NOT NULL DEFAULT 2,
    free_edits_left INT NOT NULL DEFAULT 2,
    free_edits_total INT NOT NULL DEFAULT 2,
    staged_payment BOOLEAN NOT NULL DEFAULT false,
    recurring BOOLEAN NOT NULL DEFAULT false,
    
    description TEXT NULL,
    deliverables JSONB DEFAULT '{}'::jsonb,
    milestones JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    escrow_deposit_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
    cancel_requested_by BIGINT NULL,
    
    paid_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    history JSONB DEFAULT '[]'::jsonb,
    created_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ستون‌های تکمیلی جدول contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS contract_id VARCHAR(32);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS deadline INT DEFAULT 7;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS deadline_days INT DEFAULT 7;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS free_edits INT DEFAULT 2;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS free_edits_left INT DEFAULT 2;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS free_edits_total INT DEFAULT 2;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS cancel_requested_by BIGINT NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_alt_phone VARCHAR(30) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS seller_alt_phone VARCHAR(30) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_otp_verified BOOLEAN DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS seller_otp_verified BOOLEAN DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_otp_code VARCHAR(20) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS seller_otp_code VARCHAR(20) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_role VARCHAR(30) DEFAULT 'employer';
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS seller_role VARCHAR(30) DEFAULT 'freelancer';
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS staged_payment BOOLEAN DEFAULT false;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contracts_creator ON public.contracts(creator_id);
CREATE INDEX IF NOT EXISTS idx_contracts_buyer ON public.contracts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_seller ON public.contracts(seller_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_invite ON public.contracts(invite_token);
CREATE INDEX IF NOT EXISTS idx_contracts_contract_id ON public.contracts(contract_id);

DROP TRIGGER IF EXISTS trigger_contracts_updated_at ON public.contracts;
CREATE TRIGGER trigger_contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();



-- -----------------------------------------------------------------------------
-- ۳. جدول امضاهای الکترونیک غیرقابل انکار (signatures)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL,
    telegram_id BIGINT NOT NULL,
    telegram_username VARCHAR(100) NULL,
    full_name VARCHAR(150) NOT NULL,
    national_id VARCHAR(10) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    role VARCHAR(30) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    otp_code_hash VARCHAR(128) NULL,
    otp_verified BOOLEAN NOT NULL DEFAULT true,
    client_ip VARCHAR(50) NULL,
    verification_method VARCHAR(50) NOT NULL DEFAULT 'telegram_contact_sms_otp',
    signature_hash VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'valid',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_contract ON public.signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_signatures_telegram ON public.signatures(telegram_id);
CREATE INDEX IF NOT EXISTS idx_signatures_hash ON public.signatures(signature_hash);

-- -----------------------------------------------------------------------------
-- ۴. جدول تراکنش‌های کیف پول و مالی (transactions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    contract_id VARCHAR(32) NULL,
    type VARCHAR(40) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'تراکنش مالی میانجی',
    description TEXT NULL,
    tracking_code VARCHAR(64) NULL,
    receipt_image_id TEXT NULL,
    receipt_image_url TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    approved_by BIGINT NULL,
    approved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_image_id TEXT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_image_url TEXT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(64) NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS contract_id VARCHAR(32) NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contract ON public.transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);

-- -----------------------------------------------------------------------------
-- همگام‌سازی رابطه‌ها و ویوهای سازگار با کدهای قدیمی (deals و wallet_transactions)
-- حل قطعی خطای relation kind / 42809 در Supabase بدون ایجاد خطا یا حذف داده‌ها
-- -----------------------------------------------------------------------------
DO $$ 
DECLARE 
    r_kind CHAR;
BEGIN
    SELECT relkind INTO r_kind 
    FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE n.nspname = 'public' AND c.relname = 'deals';
    
    IF r_kind = 'r' OR r_kind = 'p' THEN
        BEGIN
            EXECUTE 'INSERT INTO public.contracts SELECT * FROM public.deals ON CONFLICT (contract_id) DO NOTHING';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        EXECUTE 'DROP TABLE public.deals CASCADE';
    ELSIF r_kind = 'v' OR r_kind = 'm' THEN
        EXECUTE 'DROP VIEW public.deals CASCADE';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE VIEW public.deals AS SELECT * FROM public.contracts;

DO $$ 
DECLARE 
    r_kind CHAR;
BEGIN
    SELECT relkind INTO r_kind 
    FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE n.nspname = 'public' AND c.relname = 'wallet_transactions';
    
    IF r_kind = 'r' OR r_kind = 'p' THEN
        BEGIN
            EXECUTE 'INSERT INTO public.transactions SELECT * FROM public.wallet_transactions ON CONFLICT DO NOTHING';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        EXECUTE 'DROP TABLE public.wallet_transactions CASCADE';
    ELSIF r_kind = 'v' OR r_kind = 'm' THEN
        EXECUTE 'DROP VIEW public.wallet_transactions CASCADE';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE VIEW public.wallet_transactions AS SELECT * FROM public.transactions;

-- -----------------------------------------------------------------------------
-- ۵. جدول درخواست‌های تسویه و برداشت (withdrawal_requests)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    sheba VARCHAR(34) NOT NULL,
    sheba_owner_name VARCHAR(150) NULL,
    tracking_code VARCHAR(64) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    admin_notes TEXT NULL,
    processed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawal_requests(status);

-- -----------------------------------------------------------------------------
-- ۶. جدول فیش‌های بانکی معلق (pending_receipts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_receipts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    contract_id VARCHAR(32) NULL,
    amount NUMERIC(15, 2) NOT NULL,
    receipt_image_id TEXT NULL,
    receipt_file_url TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۷. جدول پرونده‌های داوری و اختلاف (disputes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL,
    created_by BIGINT NOT NULL,
    reason TEXT NOT NULL,
    proof_urls JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    decision VARCHAR(50) NULL,
    ruling_notes TEXT NULL,
    resolved_by BIGINT NULL,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL,
    sender_id BIGINT NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۸. جدول سفیران و بازاریابی (ambassadors)
-- هماهنگ با upsert و on_conflict="telegram_id" ماژول database.py
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ambassadors (
    id BIGSERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    user_id BIGINT NULL,
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.0,
    tier_level VARCHAR(30) NOT NULL DEFAULT 'Bronze',
    is_active BOOLEAN NOT NULL DEFAULT true,
    total_referrals INT NOT NULL DEFAULT 0,
    total_earnings NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    withdrawable_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    referral_link TEXT NULL,
    total_invited INT NOT NULL DEFAULT 0,
    active_deals_count INT NOT NULL DEFAULT 0,
    total_commission_earned NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    withdrawable_commission NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    total_clicks INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) DEFAULT 10.0;
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS tier_level VARCHAR(30) DEFAULT 'Bronze';
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS total_referrals INT DEFAULT 0;
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS total_earnings NUMERIC(15, 2) DEFAULT 0.0;
ALTER TABLE public.ambassadors ADD COLUMN IF NOT EXISTS withdrawable_balance NUMERIC(15, 2) DEFAULT 0.0;

-- -----------------------------------------------------------------------------
-- ۹. جدول تنظیمات سیستمی ربات (bot_settings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۱۰. جدول وضعیت ماشین حالت تلگرام (user_states)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_states (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NULL,
    state TEXT NOT NULL DEFAULT 'START',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_states ADD COLUMN IF NOT EXISTS id BIGINT;
ALTER TABLE public.user_states ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE public.user_states ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'START';
ALTER TABLE public.user_states ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- ۱۱. جدول لاگ عملیات ادمین و حسابرسی (admin_audit_log)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT NULL,
    target_id BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۱۲. جدول پشتیبانی و تیکت‌ها (support_tickets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۱۳. جدول لاگ کارمزدها (commission_logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_logs (
    id BIGSERIAL PRIMARY KEY,
    contract_id VARCHAR(32) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    commission_amount NUMERIC(15, 2) NOT NULL,
    payer VARCHAR(30) NOT NULL DEFAULT 'split_50_50',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- دسترسی‌ها و امنیت (Row Level Security & Permissions)
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access users" ON public.users;
CREATE POLICY "Public full access users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access contracts" ON public.contracts;
CREATE POLICY "Public full access contracts" ON public.contracts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access signatures" ON public.signatures;
CREATE POLICY "Public full access signatures" ON public.signatures FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access transactions" ON public.transactions;
CREATE POLICY "Public full access transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access disputes" ON public.disputes;
CREATE POLICY "Public full access disputes" ON public.disputes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Public full access withdrawals" ON public.withdrawal_requests FOR ALL USING (true) WITH CHECK (true);

-- اعطای دسترسی‌های لازم برای ارتباط بدون محدودیت کلاینت‌ها (Supabase Service Role & Anon)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
