-- =============================================================================
-- سامانه هوشمند واسطه‌گری امن و اسکرو میانجی (Miyanji Escrow Platform)
-- اسکریپت رسمی، جامع و ایمن پایگاه داده در Supabase / PostgreSQL
-- هماهنگ با تمام ماژول‌های پایتون (database.py, user.py, admin.py) و سرور وب (Node.js/Express)
-- ⚠️ بدون DROP مخرب: به هیچ وجه اطلاعات موجود کاربران یا موجودی‌ها را پاک نمی‌کند
-- =============================================================================

-- فعال‌سازی اکستنشن‌های استاندارد
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- تابع عمومی به‌روزرسانی updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- ۱. جدول کاربران (users) - احراز هویت بدون رمز عبور و پایدار
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id BIGINT PRIMARY KEY, -- آیدی تلگرام یا شناسه یکتای عددی
    telegram_id BIGINT NULL,
    telegram_username VARCHAR(100) NULL,
    phone_number VARCHAR(30) NULL, -- می‌تواند ابتدا خالی باشد تا پیامک ارسال شود
    full_name VARCHAR(150) NOT NULL DEFAULT 'کاربر میانجی',
    national_id VARCHAR(10) NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'user',
    wallet_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.0 CHECK (wallet_balance >= 0),
    escrow_locked_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.0 CHECK (escrow_locked_balance >= 0),
    kyc_level VARCHAR(20) NOT NULL DEFAULT 'basic',
    kyc_status VARCHAR(30) NOT NULL DEFAULT 'unverified', -- unverified, pending, approved, needs_correction, rejected
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

-- افزودن ستون‌های احتمالی در صورت وجود جدول قدیمی (بدون از دست رفتن داده)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_id BIGINT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sheba_owner_name VARCHAR(150) NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS financial_pin_hash TEXT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_reject_reason TEXT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_terms_accepted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS impersonated_by BIGINT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS payment_cards JSONB DEFAULT '[]'::jsonb;

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
    contract_id VARCHAR(32) PRIMARY KEY, -- مانند DEV-842-190
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

-- ستون‌های تکمیلی برای جدول contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS deadline INT NOT NULL DEFAULT 7;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS free_edits INT NOT NULL DEFAULT 2;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS free_edits_left INT NOT NULL DEFAULT 2;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS free_edits_total INT NOT NULL DEFAULT 2;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS cancel_requested_by BIGINT NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS buyer_alt_phone VARCHAR(30) NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS seller_alt_phone VARCHAR(30) NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_creator ON public.contracts(creator_id);
CREATE INDEX IF NOT EXISTS idx_contracts_buyer ON public.contracts(buyer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_seller ON public.contracts(seller_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_invite ON public.contracts(invite_token);

DROP TRIGGER IF EXISTS trigger_contracts_updated_at ON public.contracts;
CREATE TRIGGER trigger_contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ایجاد ویو یا سینک deals به عنوان alias کامل contracts
CREATE OR REPLACE VIEW public.deals AS SELECT * FROM public.contracts;

-- -----------------------------------------------------------------------------
-- ۳. جدول امضاهای الکترونیک غیرقابل انکار (signatures)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL REFERENCES public.contracts(contract_id) ON DELETE CASCADE,
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
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contract_id VARCHAR(32) NULL,
    type VARCHAR(40) NOT NULL, -- deposit, withdraw, escrow_lock, escrow_release, refund, fee, bonus
    amount NUMERIC(15, 2) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'تراکنش مالی میانجی',
    description TEXT NULL,
    tracking_code VARCHAR(64) NULL,
    receipt_image_id TEXT NULL,
    receipt_image_url TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'completed', -- pending, completed, rejected
    approved_by BIGINT NULL,
    approved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contract ON public.transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);

-- ایجاد ویو wallet_transactions به عنوان alias
CREATE OR REPLACE VIEW public.wallet_transactions AS SELECT * FROM public.transactions;

-- -----------------------------------------------------------------------------
-- ۵. جدول درخواست‌های تسویه و برداشت (withdrawal_requests)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    sheba VARCHAR(34) NOT NULL,
    sheba_owner_name VARCHAR(150) NULL,
    tracking_code VARCHAR(64) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, completed, rejected
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
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contract_id VARCHAR(32) NULL,
    amount NUMERIC(15, 2) NOT NULL,
    receipt_image_id TEXT NULL,
    receipt_file_url TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۷. جدول پرونده‌های داوری و اختلاف (disputes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL REFERENCES public.contracts(contract_id) ON DELETE CASCADE,
    created_by BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    proof_urls JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'open', -- open, under_review, resolved, closed
    decision VARCHAR(50) NULL, -- refund_buyer, release_seller, split_custom
    ruling_notes TEXT NULL,
    resolved_by BIGINT NULL,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- ۸. جدول سفیران و همکاران بازاریابی (ambassadors)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ambassadors (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    referral_link TEXT NULL,
    total_invited INT NOT NULL DEFAULT 0,
    active_deals_count INT NOT NULL DEFAULT 0,
    total_commission_earned NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    withdrawable_commission NUMERIC(15, 2) NOT NULL DEFAULT 0.0,
    total_clicks INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    id BIGINT PRIMARY KEY, -- آیدی تلگرام کاربر
    state TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
-- دسترسی‌ها و امنیت (Row Level Security)
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- پالیسی‌های دسترسی آزاد برای سرویس‌رول و دسترسی‌های مجاز
DROP POLICY IF EXISTS "Public read users" ON public.users;
CREATE POLICY "Public read users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read contracts" ON public.contracts;
CREATE POLICY "Public read contracts" ON public.contracts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read signatures" ON public.signatures;
CREATE POLICY "Public read signatures" ON public.signatures FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read transactions" ON public.transactions;
CREATE POLICY "Public read transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read disputes" ON public.disputes;
CREATE POLICY "Public read disputes" ON public.disputes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Public read withdrawals" ON public.withdrawal_requests FOR ALL USING (true) WITH CHECK (true);
