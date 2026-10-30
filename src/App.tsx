import React, { useState, useEffect } from 'react';
import {
  Bot,
  Terminal,
  Database,
  ScrollText,
  Wallet,
  ShieldCheck,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Send,
  Download,
  Users,
  Scale,
  Gem,
  ExternalLink,
  Layers,
  FileCode2,
  Clock,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Share2,
  Eye,
  FileText,
  BadgeCheck,
  Lock,
  Smartphone,
  ShieldAlert,
  Search,
  Fingerprint,
  CheckCheck,
  Key
} from 'lucide-react';

interface BotStatus {
  status: string;
  runtime: string;
  bot_username: string;
  bot_token_configured: boolean;
  supabase_configured: boolean;
  supabase_url: string;
  pid: string | null;
  active_modules: string[];
  recent_logs: string;
  stats: {
    activeContracts: number;
    pendingContracts: number;
    draftsCount: number;
    completedContracts: number;
    disputesCount: number;
    totalEscrowVolume: number;
    commissionRate: number;
  };
}

const App = () => {
  const [activeTab, setActiveTab] = useState<'wizard' | 'simulator' | 'contracts' | 'database' | 'python_code' | 'wallet' | 'logs'>('wizard');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedPy, setCopiedPy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [contractCategoryFilter, setContractCategoryFilter] = useState<'all' | 'active' | 'pending' | 'completed' | 'drafts' | 'cancelled'>('all');
  
  // Interactive Wizard State
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardDraft, setWizardDraft] = useState({
    role: 'employer' as 'employer' | 'freelancer',
    category: 'DEV',
    categoryLabel: '💻 برنامه‌نویسی و IT',
    title: 'توسعه ربات هوشمند صرافی در تلگرام با پایتون',
    amount: 3500000,
    description: 'تحویل کامل سورس‌کد و مستندات راه‌اندازی، رعایت استانداردهای امنیتی، عدم وجود باگ بحرانی و تحویل داکیومنت کامل API.',
    commission_payer: 'split_50_50' as 'employer' | 'freelancer' | 'split_50_50',
    has_inspection_period: true,
    inspection_period_hours: 48,
    has_free_revisions: true,
    free_revisions_count: 2,
    contract_id: 'DEV-842-190',
    invite_token: 'deal_842dev',
    counterpartyAccepted: false,
    escrowDeposited: false
  });

  // Party 1 Identity & Digital Signature State
  const [party1Data, setParty1Data] = useState({
    fullName: 'علیرضا رضوانی',
    nationalId: '0012345678',
    phone: '09123456789',
    otp: '',
    generatedOtp: '849201',
    otpSent: true,
    isSigned: false,
    signatureHash: '9b8e21a7df04523c909e4bfd71e0915a2cc945ebfa40a7cf282bb2c1f9645802',
    error: ''
  });
  const [copiedInviteText, setCopiedInviteText] = useState(false);
  const [copiedContractId, setCopiedContractId] = useState(false);

  // Terminal Simulator State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; keyboard?: string[][] }>>([
    {
      sender: 'bot',
      text: '🤖 سلام! به ربات تلگرام واسطه‌گری امن و ثبت قراردادهای میانجی (Miyanji Escrow) خوش آمدید.\nپلتفرم بر پایه پایتون ۳.۱۰ و دیتابیس یکپارچه سوپابیس اجرا می‌شود.',
      keyboard: [
        ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
        ['👤 پروفایل کاربری', '💳 کیف پول و اعتبار'],
        ['🎧 پشتیبانی و راهنمای استفاده 📖'],
        ['💎 پنل سفیران']
      ]
    }
  ]);
  const [customInput, setCustomInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const fetchBotData = async () => {
    try {
      const res = await fetch('/api/bot/status').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data) setBotStatus(data);
      }

      const [resC, resT, resL] = await Promise.all([
        fetch('/api/contracts').catch(() => null),
        fetch('/api/wallet/transactions').catch(() => null),
        fetch('/api/bot/logs').catch(() => null)
      ]);

      if (resC && resC.ok) {
        const cData = await resC.json().catch(() => null);
        if (cData) setContracts(cData);
      }
      if (resT && resT.ok) {
        const tData = await resT.json().catch(() => null);
        if (tData) setTransactions(tData);
      }
      if (resL && resL.ok) {
        const logData = await resL.json().catch(() => null);
        if (logData?.logs) setLogs(logData.logs);
      }
    } catch {
      // Gracefully silent during server reloads or offline iframe states
    }
  };

  useEffect(() => {
    fetchBotData();
    const interval = setInterval(fetchBotData, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || customInput).trim();
    if (!text || isSending) return;

    setChatMessages(prev => [...prev, { sender: 'user', text }]);
    setCustomInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [
          ...prev,
          { sender: 'bot', text: data.reply, keyboard: data.keyboard }
        ]);
        // Refresh contracts in background
        fetch('/api/contracts').then(r => r.json()).then(setContracts).catch(() => {});
      }
    } catch {
      setChatMessages(prev => [
        ...prev,
        { sender: 'bot', text: '⚠️ ارتباط با هندلر ربات برقرار نشد.' }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleRestartBot = async () => {
    setLoading(true);
    try {
      await fetch('/api/bot/restart', { method: 'POST' });
      await fetchBotData();
    } finally {
      setLoading(false);
    }
  };

  const calculateFees = (amt: number, payer: string) => {
    const fee = Math.round(amt * 0.05);
    if (payer === 'employer') {
      return { buyerPays: amt + fee, sellerReceives: amt, fee };
    } else if (payer === 'freelancer') {
      return { buyerPays: amt, sellerReceives: Math.max(0, amt - fee), fee };
    }
    const half = Math.round(fee / 2);
    return { buyerPays: amt + half, sellerReceives: Math.max(0, amt - half), fee };
  };

  const fees = calculateFees(wizardDraft.amount, wizardDraft.commission_payer);

  const handleParty1SignAndCreate = async () => {
    if (!party1Data.otp || party1Data.otp.trim() !== party1Data.generatedOtp) {
      setParty1Data(prev => ({ ...prev, error: 'کد تایید ۶ رقمی وارد شده صحیح نمی‌باشد.' }));
      return;
    }

    setLoading(true);
    setParty1Data(prev => ({ ...prev, error: '' }));

    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wizardDraft.title,
          category: wizardDraft.category,
          amount: wizardDraft.amount,
          commission_payer: wizardDraft.commission_payer,
          has_inspection_period: wizardDraft.has_inspection_period,
          inspection_period_hours: wizardDraft.inspection_period_hours,
          has_free_revisions: wizardDraft.has_free_revisions,
          free_revisions_count: wizardDraft.free_revisions_count,
          description: wizardDraft.description,
          deadline: 7
        })
      });

      let cId = wizardDraft.contract_id;
      let invTok = wizardDraft.invite_token;

      if (res.ok) {
        const data = await res.json();
        cId = data.contract_id;
        invTok = data.invite_token || `deal_${Math.random().toString(36).substring(2, 9)}`;
        setWizardDraft(prev => ({
          ...prev,
          contract_id: cId,
          invite_token: invTok
        }));
      }

      // ثبت امضای دیجیتال طرف اول
      const role = wizardDraft.role === 'employer' ? 'employer' : 'freelancer';
      const signRes = await fetch(`/api/contracts/${cId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          fullname: party1Data.fullName,
          phone: party1Data.phone,
          national_id: party1Data.nationalId,
          otp: party1Data.otp
        })
      });

      let sigHash = party1Data.signatureHash;
      if (signRes.ok) {
        const signData = await signRes.json();
        if (signData.signature?.signature_hash) {
          sigHash = signData.signature.signature_hash;
        }
      }

      setParty1Data(prev => ({
        ...prev,
        isSigned: true,
        signatureHash: sigHash
      }));

      await fetchBotData();
      setWizardStep(8);
    } catch {
      setWizardStep(8);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeInteractiveDeal = handleParty1SignAndCreate;

  const sqlSchemaCode = `-- =============================================================================
-- Miyanji Escrow System: Complete Supabase PostgreSQL Schema
-- Includes Passwordless Users, Deals, and Non-Repudiation Digital Signatures
-- =============================================================================

-- ۱. جدول کاربران سیستم (احراز هویت بدون رمز عبور بر پایه تلگرام و شماره تماس)
CREATE TABLE IF NOT EXISTS public.users (
    id BIGINT PRIMARY KEY, -- یکتای عددی (Telegram User ID)
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(100) NULL,
    phone_number VARCHAR(30) UNIQUE NOT NULL, -- دریافت شده از طریق دکمه Share Contact تلگرام
    full_name VARCHAR(150) NOT NULL DEFAULT 'کاربر میانجی',
    national_id VARCHAR(10) NULL, -- کد ملی ۱۰ رقمی ثبت‌احوال
    role VARCHAR(30) NOT NULL DEFAULT 'employer' CHECK (role IN ('employer', 'freelancer', 'arbitrator', 'ambassador', 'admin')),
    wallet_balance BIGINT NOT NULL DEFAULT 0,
    escrow_locked_balance BIGINT NOT NULL DEFAULT 0,
    kyc_level VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (kyc_level IN ('basic', 'silver', 'gold')),
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (kyc_status IN ('unverified', 'pending', 'verified')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    sheba VARCHAR(34) NULL,
    referral_code VARCHAR(32) UNIQUE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ۲. جدول معاملات و قراردادهای اسکرو
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) UNIQUE NOT NULL,
    invite_token VARCHAR(64) UNIQUE NOT NULL,
    
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount >= 10000), -- مبلغ به تومان
    
    commission_payer VARCHAR(30) NOT NULL DEFAULT 'split_50_50' 
        CHECK (commission_payer IN ('employer', 'freelancer', 'split_50_50')),
    commission_rate NUMERIC(4, 2) NOT NULL DEFAULT 5.0,
    commission_amount BIGINT NOT NULL DEFAULT 0,
    
    creator_id BIGINT NOT NULL,
    creator_role VARCHAR(20) NOT NULL CHECK (creator_role IN ('employer', 'freelancer')),
    
    has_inspection_period BOOLEAN NOT NULL DEFAULT false,
    inspection_period_hours INT NOT NULL DEFAULT 0,
    
    has_free_revisions BOOLEAN NOT NULL DEFAULT true,
    free_revisions_count INT DEFAULT 2,
    
    buyer_id BIGINT NULL REFERENCES public.users(id),
    buyer_fullname VARCHAR(150) NULL,
    buyer_phone VARCHAR(30) NULL,
    buyer_signed_at TIMESTAMPTZ NULL,
    
    seller_id BIGINT NULL REFERENCES public.users(id),
    seller_fullname VARCHAR(150) NULL,
    seller_phone VARCHAR(30) NULL,
    seller_signed_at TIMESTAMPTZ NULL,
    
    status VARCHAR(40) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'pending_counterparty', 'awaiting_escrow_deposit',
        'escrow_locked', 'work_submitted', 'in_inspection',
        'revisions_requested', 'completed', 'in_dispute', 'cancelled'
    )),
    
    escrow_deposit_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' 
        CHECK (escrow_deposit_status IN ('unpaid', 'paid_locked', 'released', 'refunded')),
    
    description TEXT NULL,
    history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ۳. جدول شواهد حقوقی غیرقابل انکار (Non-Repudiation Signatures Audit Trail)
CREATE TABLE IF NOT EXISTS public.signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id VARCHAR(32) NOT NULL,
    telegram_id BIGINT NOT NULL,
    telegram_username VARCHAR(100) NULL,
    full_name VARCHAR(150) NOT NULL,
    national_id VARCHAR(10) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('employer', 'freelancer', 'buyer', 'seller')),
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    otp_verified BOOLEAN NOT NULL DEFAULT true,
    client_ip VARCHAR(50) NULL,
    verification_method VARCHAR(50) NOT NULL DEFAULT 'telegram_contact_sms_otp',
    signature_hash VARCHAR(128) NOT NULL, -- اثر انگشت رمزنگاری SHA-256
    status VARCHAR(20) NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ایندکس‌ها جهت پاسخگویی بلادرنگ تلگرام و اعتبارسنجی سریع
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone_number);
CREATE INDEX IF NOT EXISTS idx_deals_contract_id ON public.deals(contract_id);
CREATE INDEX IF NOT EXISTS idx_deals_invite_token ON public.deals(invite_token);
CREATE INDEX IF NOT EXISTS idx_deals_creator_id ON public.deals(creator_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals(status);
CREATE INDEX IF NOT EXISTS idx_signatures_contract_id ON public.signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_signatures_hash ON public.signatures(signature_hash);`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" dir="rtl">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">سامانه هوشمند واسطه‌گری امن و اسکرو میانجی</h1>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  سیستم جدید ایجاد معامله
                </span>
              </div>
              <p className="text-xs text-slate-400">
                طراحی گام‌به‌گام زیر ۴۵ ثانیه | پایتون ۳.۱۰ + TeleBot / python-telegram-bot + Supabase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartBot}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              title="راه‌اندازی مجدد سرویس پایتون"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>ریستارت سرویس</span>
            </button>
            <a
              href={`https://t.me/${botStatus?.bot_username || 'mianji_ir_bot'}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-medium px-3.5 py-1.5 rounded-lg shadow-sm transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>ربات تلگرام</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full p-4 flex-1 flex flex-col gap-4">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'wizard'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            روند جدید و هوشمند ایجاد معامله (ویزارد ۴۵ ثانیه)
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'simulator'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            شبیه‌ساز زنده ربات تلگرام
          </button>

          <button
            onClick={() => setActiveTab('contracts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'contracts'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ScrollText className="w-4 h-4" />
            معاملات ثبت‌شده ({contracts.length})
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'database'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4" />
            اسکیمای Supabase SQL
          </button>

          <button
            onClick={() => setActiveTab('python_code')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'python_code'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            معماری و کدهای پایتون (FSM / Bot)
          </button>

          <button
            onClick={() => setActiveTab('wallet')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'wallet'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Wallet className="w-4 h-4" />
            تراکنش‌های مالی ({transactions.length})
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-4 h-4" />
            لاگ‌های زنده
          </button>
        </div>

        {/* Tab: Smart Deal Wizard (<45s interactive flow) */}
        {activeTab === 'wizard' && (
          <div className="space-y-4">
            {/* Banner */}
            <div className="bg-gradient-to-l from-blue-900/40 via-indigo-900/30 to-slate-900 border border-blue-500/30 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                      طراحی و بازنویسی اختصاصی
                    </span>
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      زیر ۴۵ ثانیه
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1.5">
                    روند جدید، گام‌به‌گام و هوشمند ایجاد معامله فریلنسری
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                    ویژه پروژه‌های فریلنسری آنلاین (طراحی لوگو، پروژه‌های دانشجویی، کدنویسی، خدمات دیجیتال). دارای گزینه‌های اختیاری پیشرفته <b>مهلت بررسی/تست خروجی</b> و <b>اصلاحیه رایگان</b>، تولید خودکار قرارداد دیجیتال و لینک اختصاصی دعوت برای طرف دوم.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setWizardStep(1);
                      setWizardDraft(prev => ({ ...prev, counterpartyAccepted: false, escrowDeposited: false }));
                    }}
                    className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl border border-slate-700 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>شروع مجدد ویزارد</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('simulator')}
                    className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-blue-600/30 transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>تست در شبیه‌ساز تلگرام</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Step-by-Step Stepper */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              {/* Stepper Progress Header */}
              <div className="mb-6 pb-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    {wizardStep}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {wizardStep === 1 && 'گام ۱: انتخاب نقش در معامله'}
                      {wizardStep === 2 && 'گام ۲: انتخاب دسته‌بندی خدمت'}
                      {wizardStep === 3 && 'گام ۳: عنوان کوتاه و مبلغ معامله'}
                      {wizardStep === 4 && 'گام ۴: پرداخت‌کننده کارمزد اسکرو'}
                      {wizardStep === 5 && 'گام ۵: تعهدات و خواسته‌های پروژه (نقل‌قول و ملاک داوری)'}
                      {wizardStep === 6 && 'گام ۶: بخش‌های اختیاری (مهلت تست و اصلاحیه)'}
                      {wizardStep === 7 && 'گام ۷: تایید مشخصات هویتی و امضای دیجیتال طرف اول (با OTP)'}
                      {wizardStep === 8 && 'گام ۸: صدور قرارداد رسمی، لینک دعوت و راهنمای ضد فیشینگ'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      مرحله {wizardStep} از ۸ — زمان تقریبی تکمیل: ۴۵ ثانیه
                    </p>
                  </div>
                </div>

                {/* Progress Pills */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(step => (
                    <div
                      key={step}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        step < wizardStep ? 'w-5 bg-emerald-500' :
                        step === wizardStep ? 'w-7 bg-blue-500 animate-pulse' :
                        'w-2.5 bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Step 1: Role Selection */}
              {wizardStep === 1 && (
                <div className="space-y-4 max-w-2xl mx-auto py-4">
                  <div className="text-center space-y-1 mb-6">
                    <h4 className="text-base font-bold text-white">نقش خود را در این معامله مشخص کنید:</h4>
                    <p className="text-xs text-slate-400">طرف اول قرارداد می‌تواند کارفرما (خریدار) یا مجری (فروشنده) باشد.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => {
                        setWizardDraft(prev => ({ ...prev, role: 'employer' }));
                        setWizardStep(2);
                      }}
                      className={`p-5 rounded-2xl border text-right transition flex flex-col gap-2.5 active:scale-98 ${
                        wizardDraft.role === 'employer'
                          ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                        💼
                      </div>
                      <div>
                        <h5 className="font-bold text-sm text-white">کارفرما (خریدار خدمت)</h5>
                        <p className="text-xs text-slate-400 mt-1">
                          من قصد سفارش کار، پرداخت امن وجه به صندوق امانت و دریافت پروژه را دارم.
                        </p>
                      </div>
                      <span className="text-[11px] text-blue-400 font-medium mt-auto flex items-center gap-1">
                        انتخاب و ادامه <ArrowLeft className="w-3 h-3" />
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setWizardDraft(prev => ({ ...prev, role: 'freelancer' }));
                        setWizardStep(2);
                      }}
                      className={`p-5 rounded-2xl border text-right transition flex flex-col gap-2.5 active:scale-98 ${
                        wizardDraft.role === 'freelancer'
                          ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
                        🛠
                      </div>
                      <div>
                        <h5 className="font-bold text-sm text-white">مجری (فروشنده / پیمانکار)</h5>
                        <p className="text-xs text-slate-400 mt-1">
                          من فایل‌ها و خدمات را آماده و پس از تایید تحویل، دستمزد را دریافت می‌کنم.
                        </p>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-medium mt-auto flex items-center gap-1">
                        انتخاب و ادامه <ArrowLeft className="w-3 h-3" />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Category Selection */}
              {wizardStep === 2 && (
                <div className="space-y-4 max-w-2xl mx-auto py-4">
                  <div className="text-center space-y-1 mb-6">
                    <h4 className="text-base font-bold text-white">دسته‌بندی خدمت فریلنسری را مشخص کنید:</h4>
                    <p className="text-xs text-slate-400">قوانین و تعهدات حقوقی پیش‌فرض بر مبنای نوع دسته‌بندی الصاق می‌شود.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { code: 'DS', label: '🎨 طراحی و گرافیک', desc: 'طراحی لوگو، بنر، هویت بصری، UI/UX' },
                      { code: 'DEV', label: '💻 برنامه‌نویسی و IT', desc: 'کدنویسی وبسایت، اپلیکیشن، ربات تلگرام، اسکریپت' },
                      { code: 'ACAD', label: '🎓 خدمات دانشجویی', desc: 'ترجمه، ویراستاری، مقاله‌نویسی، پروژه‌های آکادمیک' },
                      { code: 'CNT', label: '✍️ تولید محتوا و سئو', desc: 'نگارش مقالات وبلاگ، سناریونویسی، استراتژی سئو' },
                      { code: 'GEN', label: '📑 سایر خدمات دیجیتال', desc: 'مشاوره، ادمینی شبکه‌های اجتماعی، ورود اطلاعات' }
                    ].map(cat => (
                      <button
                        key={cat.code}
                        onClick={() => {
                          setWizardDraft(prev => ({ ...prev, category: cat.code, categoryLabel: cat.label }));
                          setWizardStep(3);
                        }}
                        className={`p-4 rounded-xl border text-right transition flex flex-col justify-between active:scale-98 ${
                          wizardDraft.category === cat.code
                            ? 'bg-blue-950/40 border-blue-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="font-bold text-sm text-white">{cat.label}</span>
                        <span className="text-[11px] text-slate-400 mt-1">{cat.desc}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> مرحله قبل
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Title & Amount */}
              {wizardStep === 3 && (
                <div className="space-y-5 max-w-xl mx-auto py-4">
                  <div className="text-center space-y-1 mb-4">
                    <h4 className="text-base font-bold text-white">مشخصات اصلی معامله (عنوان و مبلغ)</h4>
                    <p className="text-xs text-slate-400">یک عنوان کوتاه و مبلغ توافق‌شده را مشخص کنید.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 block">عنوان کوتاه پروژه:</label>
                    <input
                      type="text"
                      value={wizardDraft.title}
                      onChange={e => setWizardDraft(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="مثال: طراحی هویت بصری و لوگوی استارتاپ"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500">پیشنهادات آماده:</span>
                      {[
                        'طراحی لوگو و هویت بصری',
                        'کدنویسی بک‌اند ربات تلگرام',
                        'ترجمه و ویراستاری مقاله آکادمیک',
                        'تولید محتوا و سئو ۱۰ مقاله'
                      ].map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setWizardDraft(prev => ({ ...prev, title: s }))}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300 block">مبلغ کل معامله (تومان):</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={wizardDraft.amount}
                        onChange={e => setWizardDraft(prev => ({ ...prev, amount: Number(e.target.value) }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-emerald-400 focus:outline-none focus:border-blue-500"
                      />
                      <span className="absolute left-3 top-3 text-xs text-slate-500">تومان</span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {[1000000, 2500000, 5000000, 10000000].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setWizardDraft(prev => ({ ...prev, amount: amt }))}
                          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 rounded-lg border border-slate-700"
                        >
                          {(amt / 1000000)} میلیون
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> مرحله قبل
                    </button>
                    <button
                      onClick={() => setWizardStep(4)}
                      disabled={!wizardDraft.title || wizardDraft.amount < 10000}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                    >
                      <span>ادامه به کارمزد</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Fee Payer */}
              {wizardStep === 4 && (
                <div className="space-y-4 max-w-xl mx-auto py-4">
                  <div className="text-center space-y-1 mb-4">
                    <h4 className="text-base font-bold text-white">تعیین‌کننده کارمزد خدمات اسکرو</h4>
                    <p className="text-xs text-slate-400">
                      کارمزد پلتفرم امنیتی میانجی ۵٪ معامله ({fees.fee.toLocaleString('fa-IR')} تومان) است.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      {
                        key: 'employer' as const,
                        label: '💼 خریدار / کارفرما',
                        desc: `کل کارمزد به مبلغ پرداختی کارفرما اضافه می‌شود (${fees.fee.toLocaleString('fa-IR')} ت)`
                      },
                      {
                        key: 'freelancer' as const,
                        label: '🛠 مجری / پیمانکار',
                        desc: `کل کارمزد از درآمد مجری کسر می‌شود (${fees.fee.toLocaleString('fa-IR')} ت)`
                      },
                      {
                        key: 'split_50_50' as const,
                        label: '⚖️ توافقی و مشترک (۵۰/۵۰)',
                        desc: `هر طرف نصف کارمزد را پرداخت می‌کند (${Math.round(fees.fee / 2).toLocaleString('fa-IR')} تومان برای هر طرف)`
                      }
                    ].map(p => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setWizardDraft(prev => ({ ...prev, commission_payer: p.key }))}
                        className={`w-full p-4 rounded-xl border text-right transition flex items-center justify-between active:scale-98 ${
                          wizardDraft.commission_payer === p.key
                            ? 'bg-blue-950/40 border-blue-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-xs text-white">{p.label}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{p.desc}</p>
                        </div>
                        {wizardDraft.commission_payer === p.key && (
                          <CheckCircle2 className="w-5 h-5 text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 text-xs space-y-1">
                    <div className="flex justify-between text-slate-300">
                      <span>پرداختی کارفرما به صندوق امن:</span>
                      <span className="font-bold text-white">{fees.buyerPays.toLocaleString('fa-IR')} تومان</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>دریافتی خالص مجری پس از تایید:</span>
                      <span className="font-bold text-emerald-400">{fees.sellerReceives.toLocaleString('fa-IR')} تومان</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <button
                      onClick={() => setWizardStep(3)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> مرحله قبل
                    </button>
                    <button
                      onClick={() => setWizardStep(5)}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                    >
                      <span>ادامه به تعهدات و شرح پروژه</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Project Specifications & Custom Commitments (Sole Basis for Arbitration) */}
              {wizardStep === 5 && (
                <div className="space-y-4 max-w-2xl mx-auto py-2">
                  <div className="text-center space-y-1 mb-2">
                    <h4 className="text-base font-bold text-white">شرح دقیق تعهدات و خواسته‌های پروژه</h4>
                    <p className="text-xs text-slate-400">
                      تعهدات پیش‌فرض حذف شده‌اند تا دقیقاً آنچه از پروژه می‌خواهید ثبت و امضا شود.
                    </p>
                  </div>

                  {/* Clean Blockquote Guidance - Solves eye fatigue */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2 border-r-4 border-r-amber-500 shadow-md">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs sm:text-sm">
                      <Scale className="w-4 h-4 flex-shrink-0" />
                      <span>قانون داوری حقوقی سامانه میانجی (ملاک انحصاری رسیدگی)</span>
                    </div>
                    <blockquote className="text-xs text-slate-300 leading-relaxed italic pr-2 border-r-2 border-slate-700">
                      «ملاک داوری و قضاوت هیئت حل اختلاف میانجی، منحصراً تعهداتی است که در این بخش می‌نویسید. هرگونه چت شخصی در تلگرام، واتساپ یا توافق تلفنی خارج از این متن، فاقد اعتبار قانونی است.»
                    </blockquote>
                  </div>

                  {/* Guidance Box with Quick Category Tips */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-400" />
                        راهنمای نگارش تعهدات فنی و اقلام تحویلی:
                      </span>
                      <span className="text-[10px] text-slate-400">کلیک روی گزینه‌ها برای درج سریع</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[
                        { label: '+ فایل لایه باز وکتور (AI/SVG) با ۳۰۰ DPI', text: 'تحویل کامل فایل‌های لایه باز برداری وکتور (AI و SVG) با کیفیت ۳۰۰ DPI و پالت کدهای رنگی استاندارد.' },
                        { label: '+ سورس‌کد با مستندات راه‌اندازی و داکیومنت', text: 'ارائه کامل سورس‌کد بدون نقص در ریپازیتوری گیت به همراه فایل README جامع و راهنمای نصب.' },
                        { label: '+ تضمین اصالت اثر و عدم کپی‌برداری', text: 'تعهد به عدم کپی‌برداری و رعایت کامل حقوق مالکیت مادی و معنوی و عدم نقض کپی‌رایت.' },
                        { label: '+ ترجمه و ویرایش تخصصی با ارجاعات علمی', text: 'ترجمه دقیق و روان با ویراستاری تخصصی، حفظ علائم نگارشی و ارجاعات علمی معتبر.' }
                      ].map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setWizardDraft(prev => ({
                              ...prev,
                              description: prev.description ? `${prev.description}\n• ${chip.text}` : chip.text
                            }));
                          }}
                          className="text-[11px] bg-slate-900 hover:bg-slate-800 text-blue-300 hover:text-white border border-slate-800 hover:border-blue-500/50 px-2.5 py-1.5 rounded-lg transition"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Description Textarea */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-slate-300">
                        توضیحات و مشخصات دقیق پروژه (متن اصلی قرارداد):
                      </label>
                      <span className={`text-[10px] font-mono ${wizardDraft.description.trim().length >= 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {wizardDraft.description.trim().length} کاراکتر (حداقل ۱۰)
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={wizardDraft.description}
                      onChange={e => setWizardDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="دقیقاً بنویسید چه فایل‌هایی، با چه ابعاد، کیفیت یا استانداردی باید تحویل داده شوند..."
                      className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none transition leading-relaxed resize-y"
                    />
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => setWizardStep(4)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> مرحله قبل
                    </button>
                    <button
                      onClick={() => setWizardStep(6)}
                      disabled={wizardDraft.description.trim().length < 10}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                    >
                      <span>ادامه به بخش‌های اختیاری</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 6: Advanced Optional Fields (Inspection Period & Free Revisions) */}
              {wizardStep === 6 && (
                <div className="space-y-6 max-w-xl mx-auto py-4">
                  <div className="text-center space-y-1 mb-2">
                    <h4 className="text-base font-bold text-white">بخش‌های اختیاری پیشرفته (تعهدات فریلنسری)</h4>
                    <p className="text-xs text-slate-400">
                      مشخص کنید پروژه مهلت تست و سهمیه اصلاحیه رایگان داشته باشد یا خیر.
                    </p>
                  </div>

                  {/* Section A: Inspection Period */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>۱. مهلت بررسی و تست خروجی (Inspection Period):</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      در طی این مهلت، کارفرما پروژه تحویلی را بررسی می‌کند و در صورت عدم اعتراض، وجه به‌صورت خودکار یا با تایید کارفرما آزاد می‌شود.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {[
                        { hours: 0, label: '⚡ تایید آنی' },
                        { hours: 24, label: '⏱ ۲۴ ساعت' },
                        { hours: 48, label: '⏱ ۴۸ ساعت' },
                        { hours: 72, label: '⏱ ۷۲ ساعت' }
                      ].map(item => (
                        <button
                          key={item.hours}
                          type="button"
                          onClick={() => setWizardDraft(prev => ({
                            ...prev,
                            has_inspection_period: item.hours > 0,
                            inspection_period_hours: item.hours
                          }))}
                          className={`py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition ${
                            wizardDraft.inspection_period_hours === item.hours
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Section B: Free Revisions */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>۲. تعداد ویرایش و اصلاحیه رایگان (Free Revisions):</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      مشخص کنید مجری تا چند بار اصلاحیه را بدون دریافت هزینه اضافی انجام دهد. پس از پایان سهمیه، ویرایش‌ها منوط به توافق مالی جدید است.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {[
                        { count: 0, label: '🚫 بدون ویرایش' },
                        { count: 1, label: '۱ بار اصلاحیه' },
                        { count: 2, label: '۲ بار اصلاحیه' },
                        { count: -1, label: '🤝 توافقی' }
                      ].map(item => (
                        <button
                          key={item.count}
                          type="button"
                          onClick={() => setWizardDraft(prev => ({
                            ...prev,
                            has_free_revisions: item.count !== 0,
                            free_revisions_count: item.count
                          }))}
                          className={`py-2 px-2.5 rounded-lg text-xs font-medium border text-center transition ${
                            wizardDraft.free_revisions_count === item.count
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => setWizardStep(5)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> مرحله قبل
                    </button>
                    <button
                      onClick={() => setWizardStep(7)}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-blue-600/20 flex items-center gap-1.5"
                    >
                      <span>ادامه به تایید هویت و امضای دیجیتال طرف اول</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 7: Party 1 Identity Verification & Digital Signing */}
              {wizardStep === 7 && (
                <div className="space-y-5 max-w-xl mx-auto py-2">
                  <div className="text-center space-y-1 mb-2">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 mx-auto flex items-center justify-center font-bold">
                      <Fingerprint className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-bold text-white">تایید مشخصات هویتی و امضای دیجیتال طرف اول</h4>
                    <p className="text-xs text-slate-400">
                      بر اساس قانون تجارت الکترونیک، طرف اول پیش از صدور لینک دعوت، قرارداد را رسماً با OTP امضا می‌نماید.
                    </p>
                  </div>

                  {/* Summary preview */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                      <span className="text-slate-400">موضوع قرارداد:</span>
                      <span className="font-bold text-white truncate max-w-[280px]">{wizardDraft.title}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                      <span className="text-slate-400">مبلغ کل معامله:</span>
                      <span className="font-bold text-emerald-400">{wizardDraft.amount.toLocaleString('fa-IR')} تومان</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                      <span className="text-slate-400">مهلت بررسی و تست:</span>
                      <span className="font-bold text-amber-400">
                        {wizardDraft.inspection_period_hours ? `${wizardDraft.inspection_period_hours} ساعت` : 'تایید آنی'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">سهمیه اصلاحیه رایگان:</span>
                      <span className="font-bold text-purple-400">
                        {wizardDraft.free_revisions_count === 0 ? 'بدون ویرایش' : `${wizardDraft.free_revisions_count} بار رایگان`}
                      </span>
                    </div>
                  </div>

                  {/* Party 1 Identification Form */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                    <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <BadgeCheck className="w-4 h-4 text-emerald-400" />
                      مشخصات هویتی طرف اول (ثبت‌شده در سامانه):
                    </h5>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">نام و نام خانوادگی:</label>
                        <input
                          type="text"
                          value={party1Data.fullName}
                          onChange={e => setParty1Data(p => ({ ...p, fullName: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">کد ملی ثبت‌احوال:</label>
                        <input
                          type="text"
                          value={party1Data.nationalId}
                          onChange={e => setParty1Data(p => ({ ...p, nationalId: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">شماره همراه متصل به تلگرام:</label>
                      <input
                        type="text"
                        value={party1Data.phone}
                        readOnly
                        className="w-full bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-slate-300 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* SMS OTP Digital Signature Section */}
                  <div className="bg-blue-950/30 border border-blue-500/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-300 flex items-center gap-1.5">
                        <Key className="w-4 h-4 text-blue-400" />
                        رمز یکبار مصرف امضای دیجیتال (SMS OTP):
                      </span>
                      <span className="text-[10px] text-slate-400">مهلت: ۲ دقیقه</span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      کد تایید ۶ رقمی به شماره <span className="font-mono font-bold text-white">{party1Data.phone}</span> ارسال شد.
                    </p>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="کد ۶ رقمی"
                        value={party1Data.otp}
                        onChange={e => setParty1Data(p => ({ ...p, otp: e.target.value, error: '' }))}
                        className="bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-center text-sm font-mono font-bold tracking-widest text-emerald-400 focus:outline-none focus:border-blue-500 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setParty1Data(p => ({ ...p, otp: p.generatedOtp, error: '' }))}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-blue-300 px-3 py-2.5 rounded-lg border border-slate-700 transition"
                      >
                        درج خودکار ({party1Data.generatedOtp})
                      </button>
                    </div>

                    {party1Data.error && (
                      <p className="text-[11px] text-red-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        {party1Data.error}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      onClick={() => setWizardStep(6)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> مرحله قبل
                    </button>
                    <button
                      onClick={handleParty1SignAndCreate}
                      disabled={loading || !party1Data.otp}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                      <span>تایید و امضای رسمی قرارداد (صدور لینک)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 8: Generated Contract, Anti-Phishing Security Notice & Counterparty Acceptance */}
              {wizardStep === 8 && (
                <div className="space-y-6 max-w-2xl mx-auto py-2">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">قرارداد با امضای دیجیتال طرف اول ثبت و صادر گردید</h4>
                        <p className="text-xs text-emerald-400/90 font-mono">شناسه یکتا: {wizardDraft.contract_id}</p>
                      </div>
                    </div>
                    <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-slate-700">
                      وضعیت: در انتظار امضای طرف دوم
                    </span>
                  </div>

                  {/* Anti-Phishing Security Guidance Banner */}
                  <div className="bg-red-950/30 border-2 border-red-500/40 rounded-2xl p-4 space-y-3 shadow-lg shadow-red-500/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-400 font-bold text-xs sm:text-sm">
                        <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                        <span>راهنمای امنیتی ضد فیشینگ (ویژه طرف دوم قرارداد)</span>
                      </div>
                      <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full font-bold">
                        پیشگیری از کلاهبرداری
                      </span>
                    </div>

                    <blockquote className="text-xs text-slate-200 leading-relaxed pr-3 border-r-2 border-red-400 italic bg-slate-900/70 p-3.5 rounded-xl">
                      «به منظور جلوگیری از کلیک روی لینک‌های جعلی و کلاهبرداری، طرف دوم نیازی به باز کردن هیچ لینکی ندارد؛ کافیست ربات رسمی میانجی (<code className="text-blue-300 font-mono font-bold">@mianji_ir_bot</code>) را استارت کرده و کد قرارداد (<code className="text-emerald-400 font-mono font-bold">{wizardDraft.contract_id}</code>) را در ربات جست‌وجو کند تا مستقیماً به صفحه بررسی و امضای قرارداد هدایت شود.»
                    </blockquote>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(wizardDraft.contract_id);
                          setCopiedContractId(true);
                          setTimeout(() => setCopiedContractId(false), 2000);
                        }}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
                      >
                        {copiedContractId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>کپی کد قرارداد جهت جست‌وجو: {wizardDraft.contract_id}</span>
                      </button>

                      <button
                        onClick={() => {
                          const inviteMsg = `🏛 **دعوت‌نامه رسمی قرارداد هوشمند (سامانه اسکرو میانجی)**\n` +
                            `────────────────────────────\n` +
                            `📋 **شناسه اختصاصی معامله:** \`${wizardDraft.contract_id}\`\n` +
                            `📝 **موضوع:** ${wizardDraft.title}\n` +
                            `💰 **مبلغ معامله:** ${wizardDraft.amount.toLocaleString('fa-IR')} تومان\n` +
                            `✍️ **امضا شده توسط طرف اول:** ${party1Data.fullName} با گواهی دیجیتال OTP\n` +
                            `────────────────────────────\n` +
                            `🛡 **راهنمای امنیتی ضد فیشینگ (ویژه طرف دوم):**\n` +
                            `> جهت جلوگیری از سرقت اطلاعات یا کلیک بر روی لینک‌های ناشناس، می‌توانید بدون باز کردن لینک، ربات رسمی میانجی (@mianji_ir_bot) را استارت کرده و کد معامله «${wizardDraft.contract_id}» را ارسال فرمایید تا مستقیماً قرارداد را در محیط امن تلگرام مشاهده و امضا کنید.\n\n` +
                            `🔗 لینک مستقیم قرارداد در تلگرام:\nhttps://t.me/mianji_ir_bot?start=c_${wizardDraft.contract_id}`;
                          navigator.clipboard.writeText(inviteMsg);
                          setCopiedInviteText(true);
                          setTimeout(() => setCopiedInviteText(false), 2000);
                        }}
                        className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow"
                      >
                        {copiedInviteText ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Share2 className="w-3.5 h-3.5" />}
                        <span>{copiedInviteText ? 'متن کامل دعوت کپی شد' : 'کپی متن دعوت رسمی (همراه با هشدار ضد فیشینگ)'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Digital Contract Preview Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div>
                        <h5 className="font-bold text-sm text-white">{wizardDraft.title}</h5>
                        <p className="text-xs text-slate-400">دسته‌بندی: {wizardDraft.categoryLabel}</p>
                      </div>
                      <div className="text-left">
                        <span className="text-base font-bold text-emerald-400 block">
                          {wizardDraft.amount.toLocaleString('fa-IR')} تومان
                        </span>
                        <span className="text-[10px] text-slate-500">پوشش اسکرو میانجی</span>
                      </div>
                    </div>

                    {/* Specifications Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">نقش شما:</span>
                        <span className="font-bold text-white">
                          {wizardDraft.role === 'employer' ? 'کارفرما (خریدار)' : 'مجری (فروشنده)'}
                        </span>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">کارمزد:</span>
                        <span className="font-bold text-white">
                          {wizardDraft.commission_payer === 'split_50_50' ? 'توافقی ۵۰/۵۰' :
                           wizardDraft.commission_payer === 'employer' ? 'کارفرما' : 'مجری'}
                        </span>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">مهلت تست و بررسی:</span>
                        <span className="font-bold text-amber-400">
                          {wizardDraft.inspection_period_hours ? `${wizardDraft.inspection_period_hours} ساعت` : 'تایید آنی'}
                        </span>
                      </div>

                      <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block text-[10px]">اصلاحیه رایگان:</span>
                        <span className="font-bold text-purple-400">
                          {wizardDraft.free_revisions_count === 0 ? 'بدون ویرایش' :
                           wizardDraft.free_revisions_count === -1 ? 'توافقی' :
                           `${wizardDraft.free_revisions_count} بار رایگان`}
                        </span>
                      </div>
                    </div>

                    {/* Party 1 Digital Signature Badge */}
                    <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                          <BadgeCheck className="w-4 h-4 text-emerald-400" />
                          امضای دیجیتال طرف اول ({party1Data.fullName}):
                        </span>
                        <span className="text-[10px] text-emerald-300 font-mono">تایید شده با رمز پیامکی OTP</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate" dir="ltr">
                        SHA-256: {party1Data.signatureHash}
                      </p>
                    </div>

                    {/* Binding Arbitration Deliverables & Commitments Box */}
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <Scale className="w-4 h-4 text-amber-400" />
                          تعهدات و مشخصات فنی ثبت‌شده (ملاک قطعی داوری حقوقی میانجی):
                        </span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-semibold">
                          فصل‌الخطاب داوری
                        </span>
                      </div>
                      <div className="text-xs text-slate-200 whitespace-pre-line leading-relaxed bg-slate-900/90 p-3 rounded-lg border border-slate-800 font-normal">
                        {wizardDraft.description}
                      </div>
                      <p className="text-[10px] text-amber-300/80 leading-relaxed">
                        ⚖️ هیئت حل اختلاف میانجی در زمان بروز هرگونه اختلاف، منحصراً بر اساس تعهدات مندرج در این بخش قضاوت خواهد کرد.
                      </p>
                    </div>

                    {/* Dedicated Invite Link Box */}
                    <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                          <Share2 className="w-3.5 h-3.5" />
                          لینک مستقیم دعوت طرف دوم (تلگرام):
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`https://t.me/mianji_ir_bot?start=c_${wizardDraft.contract_id}`);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                        >
                          {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedLink ? 'کپی شد' : 'کپی لینک'}</span>
                        </button>
                      </div>
                      <code className="text-xs text-blue-400 font-mono block bg-slate-900/80 p-2 rounded-lg truncate text-left" dir="ltr">
                        https://t.me/mianji_ir_bot?start=c_{wizardDraft.contract_id}
                      </code>
                    </div>

                    {/* Counterparty Join Simulator */}
                    <div className="border-t border-slate-800 pt-4 space-y-3">
                      <h6 className="text-xs font-bold text-slate-300">
                        شبیه‌سازی تعاملی پیوستن و امضای طرف دوم (طرف مقابل):
                      </h6>

                      {!wizardDraft.counterpartyAccepted ? (
                        <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 space-y-3">
                          <p className="text-xs text-slate-300 leading-relaxed">
                            طرف دوم می‌تواند با هر یک از روش‌های زیر قرارداد را باز، بررسی و امضا نماید:
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                setWizardDraft(prev => ({ ...prev, counterpartyAccepted: true }));
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                            >
                              <Search className="w-4 h-4" />
                              <span>روش ضد فیشینگ: سرچ کد در ربات و امضا</span>
                            </button>
                            <button
                              onClick={() => {
                                setWizardDraft(prev => ({ ...prev, counterpartyAccepted: true }));
                              }}
                              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                            >
                              <BadgeCheck className="w-4 h-4" />
                              <span>ورود با لینک مستقیم و امضا با OTP</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>طرف دوم به قرارداد پیوست و امضای الکترونیک دوطرفه تکمیل شد!</span>
                          </div>
                          <p className="text-xs text-slate-300">
                            معامله اکنون در وضعیت <b>در انتظار واریز وجه امانت (Awaiting Escrow Deposit)</b> است. کارفرما وجه ({fees.buyerPays.toLocaleString('fa-IR')} تومان) را در صندوق امانت قفل می‌کند.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setWizardDraft(prev => ({ ...prev, escrowDeposited: true }))}
                              disabled={wizardDraft.escrowDeposited}
                              className={`text-xs px-4 py-2 rounded-lg font-bold transition flex items-center gap-1.5 ${
                                wizardDraft.escrowDeposited
                                  ? 'bg-emerald-700 text-white cursor-default'
                                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                              }`}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>{wizardDraft.escrowDeposited ? 'وجه در صندوق قفل شد (معامله فعال)' : 'واریز و قفل وجه در صندوق امانت'}</span>
                            </button>
                            <a
                              href={`/api/contracts/${wizardDraft.contract_id}/pdf`}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg border border-slate-700 flex items-center gap-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>دانلود سند رسمی PDF</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Telegram Simulator */}
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col h-[600px] overflow-hidden shadow-xl">
              <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    MJ
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      میانجی | ربات تلگرام اسکرو و قرارداد
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">bot @{botStatus?.bot_username || 'mianji_ir_bot'}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                  پایتون ۳.۱۰ (pyTelegramBotAPI)
                </span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950/60">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-100 border border-slate-700/70 rounded-bl-none'
                      }`}
                    >
                      {msg.text}
                    </div>

                    {msg.keyboard && msg.keyboard.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-1.5 w-[85%]">
                        {msg.keyboard.flat().map((btnText, bIdx) => (
                          <button
                            key={bIdx}
                            onClick={() => handleSendMessage(btnText)}
                            className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/80 rounded-xl px-3 py-2 text-[11px] font-medium text-center transition truncate shadow-sm"
                          >
                            {btnText}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="دستور یا پیام خود را تایپ کنید (مثلاً ثبت معامله جدید یا /start)..."
                  className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isSending || !customInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-400" />
                تست سریع سناریوهای فریلنسری
              </h3>

              <div className="space-y-1.5">
                {[
                  { label: '⚡ اجرای روند هوشمند معامله (<45s)', cmd: '🤝 ثبت معامله جدید' },
                  { label: '🛡 جست‌وجوی امن با کد قرارداد (ضد فیشینگ)', cmd: '🔍 جست‌وجوی قرارداد با شناسه' },
                  { label: '📄 بررسی و امضای قرارداد DEV-842-190', cmd: 'DEV-842-190' },
                  { label: '🤝 شبیه‌سازی ورود و پذیرش طرف دوم', cmd: 'شبیه‌سازی ورود طرف دوم' },
                  { label: '📜 لیست معاملات من', cmd: '📜 لیست معاملات من' },
                  { label: '💳 کیف پول و اعتبار', cmd: '💳 کیف پول و اعتبار' },
                  { label: '👤 پروفایل کاربری', cmd: '👤 پروفایل کاربری' },
                  { label: '💎 پنل سفیران', cmd: '💎 پنل سفیران' }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.cmd)}
                    className="w-full text-right bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-medium border border-slate-700/60 transition flex items-center justify-between"
                  >
                    <span>{item.label}</span>
                    <Play className="w-3 h-3 text-slate-500" />
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-3 border-t border-slate-800">
                <h4 className="text-[11px] font-bold text-slate-400 mb-2">فیلدهای اختیاری فعال در هسته ربات:</h4>
                <ul className="text-[11px] text-slate-300 space-y-1.5">
                  <li className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    مهلت بررسی و تست (Inspection Period)
                  </li>
                  <li className="flex items-center gap-1.5 text-purple-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    اصلاحیه/ویرایش رایگان (Free Revisions)
                  </li>
                  <li className="flex items-center gap-1.5 text-blue-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    تولید لینک یکتای دعوت (deal_token)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Contracts Explorer */}
        {activeTab === 'contracts' && (() => {
          const activeDeals = contracts.filter(c => ['active', 'in_progress', 'paid', 'escrow_locked', 'in_inspection', 'work_submitted', 'delivered'].includes(c.status));
          const pendingDeals = contracts.filter(c => ['pending_approval', 'pending_counterparty', 'pending_party_b', 'awaiting_payment', 'awaiting_escrow_deposit', 'awaiting_receipt_approval', 'receipt_submitted', 'revisions_requested', 'disputed', 'in_dispute'].includes(c.status));
          const completedDeals = contracts.filter(c => ['completed', 'resolved_employer', 'resolved_freelancer'].includes(c.status));
          const draftsDeals = contracts.filter(c => c.status === 'draft');
          const cancelledDeals = contracts.filter(c => ['cancelled', 'refunded'].includes(c.status));

          const filteredContracts = contractCategoryFilter === 'all' ? contracts :
            contractCategoryFilter === 'active' ? activeDeals :
            contractCategoryFilter === 'pending' ? pendingDeals :
            contractCategoryFilter === 'completed' ? completedDeals :
            contractCategoryFilter === 'drafts' ? draftsDeals : cancelledDeals;

          const categoryTabs = [
            { id: 'all' as const, label: 'همه معاملات', count: contracts.length, icon: '📜' },
            { id: 'active' as const, label: 'درحال انجام', count: activeDeals.length, icon: '🟢' },
            { id: 'pending' as const, label: 'در انتظار اقدام', count: pendingDeals.length, icon: '⏳' },
            { id: 'completed' as const, label: 'تکمیل شده', count: completedDeals.length, icon: '🏁' },
            { id: 'drafts' as const, label: 'پیش‌نویس‌ها', count: draftsDeals.length, icon: '📁' },
            { id: 'cancelled' as const, label: 'لغوشده', count: cancelledDeals.length, icon: '❌' }
          ];

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-blue-400" />
                    <span>پنل ماژولار و دسته‌بندی قراردادهای اسکرو</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    معاملات در دسته‌های اختصاصی تفکیک شده‌اند تا به صورت مجزا و منظم قابل مدیریت باشند.
                  </p>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-lg border border-slate-700 self-start sm:self-auto font-mono">
                  {filteredContracts.length} معامله در این بخش
                </span>
              </div>

              {/* Modular Category Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categoryTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setContractCategoryFilter(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                      contractCategoryFilter === tab.id
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      contractCategoryFilter === tab.id ? 'bg-blue-800/80 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Contracts List */}
              <div className="space-y-3">
                {filteredContracts.length === 0 ? (
                  <div className="text-center py-10 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto opacity-70" />
                    <p className="text-xs text-slate-300 font-bold">هیچ معامله‌ای در این دسته‌بندی یافت نشد.</p>
                    <p className="text-[11px] text-slate-500">جهت ایجاد قرارداد جدید می‌توانید از تب «ایجاد معامله» استفاده کنید.</p>
                  </div>
                ) : (
                  filteredContracts.map((c, i) => (
                    <div
                      key={i}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-700 transition"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-blue-400">{c.contract_id}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            c.status === 'active' || c.status === 'escrow_locked' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                            c.status === 'completed' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                            c.status === 'in_dispute' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                            c.status === 'draft' ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {c.status}
                          </span>
                          {c.has_inspection_period && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              مهلت تست: {c.inspection_period_hours || 0}h
                            </span>
                          )}
                          {c.free_edits !== undefined && (
                            <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">
                              ویرایش رایگان: {c.free_edits} بار
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-white">{c.title}</h4>
                        <p className="text-[11px] text-slate-400">
                          کارفرما: {c.buyer_fullname || '---'} | مجری: {c.seller_fullname || '---'} | مهلت: {c.deadline || 7} روز
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <span className="text-xs font-bold text-emerald-400 block">
                            {(c.amount || 0).toLocaleString('fa-IR')} تومان
                          </span>
                          <span className="text-[10px] text-slate-500">صندوق امن میانجی</span>
                        </div>

                        <a
                          href={`/api/contracts/${c.contract_id}/pdf`}
                          download
                          className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>دانلود PDF</span>
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}

        {/* Tab: Supabase SQL Schema */}
        {activeTab === 'database' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  ساختار پیشنهادی جدول دیتابیس (Supabase SQL Schema)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  پوشش کامل فیلدهای اختیاری مهلت تست (inspection_period)، اصلاحیه رایگان (free_revisions)، ایندکس‌ها و پالیسی‌های RLS
                </p>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(sqlSchemaCode);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'کپی شد' : 'کپی اسکریپت SQL'}</span>
              </button>
            </div>

            <pre className="bg-black/90 p-4 rounded-xl font-mono text-[11px] text-blue-300 overflow-x-auto leading-relaxed border border-slate-800" dir="ltr">
              {sqlSchemaCode}
            </pre>
          </div>
        )}

        {/* Tab: Python Code & Architecture */}
        {activeTab === 'python_code' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  پیاده‌سازی ماژول حالت‌ها در پایتون (deal_wizard.py)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  کد تمیز، بهینه‌سازی شده با Error Handling و کامپتیبل با python-telegram-bot v20+ و pyTelegramBotAPI
                </p>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(`// Refer to /deal_wizard.py in codebase`);
                  setCopiedPy(true);
                  setTimeout(() => setCopiedPy(false), 2000);
                }}
                className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition"
              >
                {copiedPy ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>فایل deal_wizard.py ایجاد شد</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h5 className="font-bold text-xs text-blue-400 mb-1">۱. احراز هویت بدون پسورد (Passwordless)</h5>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  حذف کامل رمز عبور ثابت؛ شناسایی آنی با Telegram User ID و دریافت شماره تاییدشده کاربر با دکمه <code className="text-blue-300">request_contact=True</code> تلگرام بدون تایپ دستی.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h5 className="font-bold text-xs text-amber-400 mb-1">۲. امضای قانونی و OTP پیامکی واقعی</h5>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  دریافت نام و کد ملی، ارسال کد ۶ رقمی از طریق پنل پیامکی به خط کاربر، عدم افشای کد در چت تلگرام، انقضای ۳ دقیقه‌ای و مسدودسازی بعد از ۴ تلاش ناموفق.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h5 className="font-bold text-xs text-purple-400 mb-1">۳. شواهد غیرقابل انکار (Non-Repudiation)</h5>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ذخیره در جدول <code className="text-purple-300">signatures</code> شامل: telegram_id، کد ملی، شماره موبایل، آدرس آی‌پی، تایم‌استمپ دقیق و اثر انگشت رمزنگاری <code className="text-purple-300">SHA-256</code>.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h5 className="font-bold text-xs text-emerald-400 mb-1">۴. مدیریت حالت‌ها و اسکرو (deal_wizard.py)</h5>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ماشین وضعیت تلگرام (FSM) با پشتیبانی از مهلت تست اختیاری، اصلاحیه رایگان، لینک اختصاصی دعوت و ادغام یکپارچه با Supabase PostgreSQL.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Wallet Transactions */}
        {activeTab === 'wallet' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">تراکنش‌های کیف پول و گزارش‌های مالی</h3>
            <div className="space-y-2">
              {transactions.map((tx, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-white">{tx.title}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      کد پیگیری: {tx.ref_id} | تاریخ: {new Date(tx.created_at).toLocaleDateString('fa-IR')}
                    </p>
                  </div>
                  <div className="text-left">
                    <span className={`text-xs font-bold ${tx.type === 'deposit' || tx.type === 'escrow_release' || tx.type === 'affiliate_reward' ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {(tx.amount || 0).toLocaleString('fa-IR')} تومان
                    </span>
                    <span className="block text-[10px] text-emerald-400">تایید شده</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Live Python Logs */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[550px]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                مشاهده زنده لاگ‌های سرویس پایتون (bot.log)
              </h3>
              <span className="text-[11px] text-slate-400">به‌روزرسانی خودکار هر ۶ ثانیه</span>
            </div>

            <div className="flex-1 bg-black rounded-xl p-3 font-mono text-[11px] text-slate-300 overflow-y-auto space-y-1">
              {logs.map((logLine, idx) => (
                <div
                  key={idx}
                  className={`leading-relaxed ${
                    logLine.includes('ERROR') ? 'text-rose-400' :
                    logLine.includes('WARNING') ? 'text-amber-300' :
                    logLine.includes('INFO') ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {logLine}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 py-3 text-center text-xs text-slate-500">
        سامانه هوشمند واسطه‌گری امن میانجی (Miyanji Escrow) — توسعه‌یافته با Python 3.10، Supabase و Telegraf/TeleBot
      </footer>
    </div>
  );
};

export default App;
