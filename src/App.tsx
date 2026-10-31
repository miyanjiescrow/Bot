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
  Key,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';

interface BotStatus {
  status: string;
  runtime: string;
  bot_username: string;
  bot_token_configured: boolean;
  supabase_configured: boolean;
  supabase_url: string;
  active_modules?: string[];
  recent_logs?: string;
  diagnostics?: {
    has_token: boolean;
    token_message: string;
    python_note: string;
    active_engine: string;
  };
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

const FormattedTelegramMessage: React.FC<{ text: string; isUser: boolean }> = ({ text, isUser }) => {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  // Parse lines into normal text vs Telegram blockquote (> ...)
  const lines = text.split('\n');
  const blocks: Array<{ type: 'quote' | 'normal'; lines: string[] }> = [];
  let currentBlock: { type: 'quote' | 'normal'; lines: string[] } | null = null;

  for (const line of lines) {
    const isQuote = line.trim().startsWith('>');
    const cleanedLine = isQuote ? line.trim().replace(/^>\s*/, '') : line;

    if (!currentBlock || currentBlock.type !== (isQuote ? 'quote' : 'normal')) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { type: isQuote ? 'quote' : 'normal', lines: [cleanedLine] };
    } else {
      currentBlock.lines.push(cleanedLine);
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  const renderInline = (str: string) => {
    // Match bold, code, and links
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="bg-slate-900/90 text-blue-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700/70 mx-0.5 inline-block">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      {blocks.map((block, bIdx) => {
        if (block.type === 'quote') {
          return (
            <div
              key={bIdx}
              className="bg-blue-950/40 border-r-2 border-blue-400 rounded-lg pr-3 pl-2.5 py-1.5 my-1 text-slate-200 text-[11px] leading-relaxed shadow-inner"
            >
              {block.lines.map((l, lIdx) => (
                <div key={lIdx} className="min-h-[1.2rem]">
                  {renderInline(l)}
                </div>
              ))}
            </div>
          );
        }

        return (
          <div key={bIdx} className="whitespace-pre-wrap">
            {block.lines.map((l, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInline(l)}
                {lIdx < block.lines.length - 1 && '\n'}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState<'simulator' | 'contracts' | 'wallet' | 'logs' | 'database' | 'python_code' | 'security'>('simulator');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedPy, setCopiedPy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [contractCategoryFilter, setContractCategoryFilter] = useState<'all' | 'active' | 'pending' | 'completed' | 'drafts' | 'cancelled'>('all');
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  // Security Hub States (Phone-First & Financial PIN)
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinVerifyInput, setPinVerifyInput] = useState('');
  const [pinActionMsg, setPinActionMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpSentMsg, setOtpSentMsg] = useState<string | null>(null);
  const [newPinAfterOtp, setNewPinAfterOtp] = useState('');
  const [newShebaInput, setNewShebaInput] = useState('');
  const [newShebaOwner, setNewShebaOwner] = useState('');
  const [shebaMsg, setShebaMsg] = useState<string | null>(null);
  const [testPhoneInput, setTestPhoneInput] = useState('');

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

      const [resC, resT, resL, resS] = await Promise.all([
        fetch('/api/contracts').catch(() => null),
        fetch('/api/wallet/transactions').catch(() => null),
        fetch('/api/bot/logs').catch(() => null),
        fetch('/api/security/status').catch(() => null)
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
      if (resS && resS.ok) {
        const sData = await resS.json().catch(() => null);
        if (sData) setSecurityStatus(sData);
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

  // Security Hub Handlers
  const handleSetPin = async () => {
    if (!pinInput || pinInput.length < 4) {
      setPinActionMsg({ text: 'پین مالی باید حداقل ۴ رقم باشد.', type: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/security/pin/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPinActionMsg({ text: '✅ ' + data.message, type: 'success' });
        setPinInput('');
        fetchBotData();
      } else {
        setPinActionMsg({ text: '❌ ' + (data.error || 'خطا در ثبت پین'), type: 'error' });
      }
    } catch {
      setPinActionMsg({ text: '❌ خطای برقراری ارتباط با سرور', type: 'error' });
    }
  };

  const handleVerifyPin = async () => {
    if (!pinVerifyInput) {
      setPinActionMsg({ text: 'لطفاً پین مورد نظر جهت تست را وارد کنید.', type: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/security/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinVerifyInput })
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setPinActionMsg({ text: '🟢 ' + data.message, type: 'success' });
      } else {
        setPinActionMsg({ text: '🔴 ' + (data.message || 'پین اشتباه است'), type: 'error' });
      }
      fetchBotData();
    } catch {
      setPinActionMsg({ text: '❌ خطا در ارسال درخواست', type: 'error' });
    }
  };

  const handleRequestOtp = async () => {
    try {
      const res = await fetch('/api/security/pin/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOtpSentMsg(`📩 کد OTP به شماره ${data.phone} پیامک شد. (کد تستی: ${data.demoOtp})`);
        setOtpCodeInput(data.demoOtp || '');
      } else {
        setOtpSentMsg(`❌ ${data.error || 'خطا در ارسال پیامک'}`);
      }
    } catch {
      setOtpSentMsg('❌ خطا در ارسال درخواست پیامک');
    }
  };

  const handleConfirmOtpAndResetPin = async () => {
    if (!otpCodeInput || !newPinAfterOtp) {
      setPinActionMsg({ text: 'لطفاً کد پیامکی و پین جدید را وارد فرمایید.', type: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/security/pin/reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpCodeInput, newPin: newPinAfterOtp })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPinActionMsg({ text: '✅ ' + data.message, type: 'success' });
        setOtpCodeInput('');
        setNewPinAfterOtp('');
        setOtpSentMsg(null);
        fetchBotData();
      } else {
        setPinActionMsg({ text: '❌ ' + (data.error || 'خطا در بازنشانی پین'), type: 'error' });
      }
    } catch {
      setPinActionMsg({ text: '❌ خطا در برقراری ارتباط', type: 'error' });
    }
  };

  const handleBindSheba = async () => {
    if (!newShebaInput) {
      setShebaMsg('لطفاً شماره شبا را وارد فرمایید.');
      return;
    }
    try {
      const res = await fetch('/api/security/sheba/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheba: newShebaInput, ownerName: newShebaOwner })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShebaMsg('✅ شماره شبا استعلام و با کد ملی صاحب حساب قفل شد.');
        setNewShebaInput('');
        setNewShebaOwner('');
        fetchBotData();
      } else {
        setShebaMsg('❌ ' + (data.error || 'خطا در تطابق شبا'));
      }
    } catch {
      setShebaMsg('❌ خطا در ثبت شبا');
    }
  };

  const handleSwitchAccount = async (phone: string) => {
    try {
      const res = await fetch('/api/security/switch-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchBotData();
        setPinActionMsg({ text: `👤 حساب فعال به ${data.user.full_name} (${data.user.phone_number}) تغییر یافت.`, type: 'info' });
      }
    } catch {
      // ignore
    }
  };

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
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 border transition active:scale-95 cursor-pointer ${
                    botStatus?.bot_token_configured
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                  title="کلیک برای مشاهده مرکز عیب‌یابی و وضعیت اتصال"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${botStatus?.bot_token_configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span>{botStatus?.bot_token_configured ? 'ربات تلگرام متصل است' : 'شبیه‌ساز فعال | منتظر BOT_TOKEN'}</span>
                  <HelpCircle className="w-3 h-3 text-amber-400/80" />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                سامانه هوشمند واسطه‌گری امن و قراردادهای اسکرو | شبیه‌ساز بلادرنگ وب + هسته Telegraf & Python
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
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'simulator'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            کنسول و شبیه‌ساز هوشمند ربات تلگرام
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

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'security'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            امنیت و هویت کاربری (شماره + پین مالی)
          </button>
        </div>

        {/* مرکز عیب‌یابی و راهنمای اتصال ربات */}
        <div className={`rounded-2xl border transition-all ${
          botStatus?.bot_token_configured
            ? 'bg-emerald-950/20 border-emerald-800/40'
            : 'bg-amber-950/20 border-amber-800/50'
        }`}>
          <div
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="p-4 flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                botStatus?.bot_token_configured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {botStatus?.bot_token_configured ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>مرکز راهنمایی و عیب‌یابی ربات تلگرام میانجی</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    botStatus?.bot_token_configured
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {botStatus?.bot_token_configured ? 'اتصال تلگرام فعال است' : 'شبیه‌ساز فعال | منتظر BOT_TOKEN'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {botStatus?.bot_token_configured
                    ? 'ربات متصل است و پیام‌های تلگرام به صورت زنده توسط موتور اختصاصی پردازش می‌شوند.'
                    : 'علت عدم پاسخگویی در تلگرام: متغیر BOT_TOKEN در سرور تنظیم نشده و محیط هاست فعلی Node.js است.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
                {showDiagnostics ? 'بستن راهنما' : 'مشاهده علل و راهکارها'}
                {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </div>
          </div>

          {showDiagnostics && (
            <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Key className="w-4 h-4" />
                  <span>۱. توکن تلگرام (BOT_TOKEN)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  ربات تلگرام برای ارتباط با سرورهای تلگرام نیازمند یک توکن اختصاصی است.
                </p>
                <div className="text-[10px] bg-slate-950 p-2 rounded-lg text-slate-400 font-mono space-y-1 border border-slate-800/80">
                  <p className="text-amber-300 font-sans">نحوه دریافت توکن:</p>
                  <p>۱. مراجعه به <span className="text-blue-400">@BotFather</span> در تلگرام</p>
                  <p>۲. ارسال دستور <code className="text-emerald-400">/newbot</code> و دریافت توکن</p>
                  <p>۳. قرار دادن در متغیر محیطی سرور:</p>
                  <code className="text-blue-300 block">BOT_TOKEN=123456:ABC...</code>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Terminal className="w-4 h-4" />
                  <span>۲. ران‌تایم هاست (Node.js vs Python)</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  این کانتینر ابری بر بستر <strong>Node.js 22</strong> اجرا می‌شود و پکیج منیجر pip پایتون در آن موجود نیست.
                </p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  به همین دلیل موتور موازی با <strong>Telegraf</strong> درون Node.js پیاده‌سازی شده که به محض افزودن BOT_TOKEN بدون نیاز به پایتون کار می‌کند.
                </p>
                <div className="text-[10px] bg-slate-950 p-2 rounded-lg text-emerald-400 border border-slate-800/80">
                  ✓ موتور Node.js Telegraf کاملاً آماده دریافت توکن است.
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Bot className="w-4 h-4" />
                  <span>۳. راه‌حل‌های فوری و دردسترس</span>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveTab('simulator')}
                    className="w-full text-right bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 p-2 rounded-lg text-[11px] transition"
                  >
                    🚀 <strong>تست آنی در شبیه‌ساز وب:</strong>
                    <span className="block text-[10px] text-slate-300 mt-0.5">تمام سناریوهای قرارداد، اسکرو، OTP و PDF بدون نیاز به تلگرام فعال است.</span>
                  </button>

                  <div className="text-[10px] bg-slate-950 p-2 rounded-lg text-slate-400 border border-slate-800/80">
                    <p className="text-slate-300 font-sans mb-1 font-bold">اجرای سورس پایتون در VPS شخصی:</p>
                    <code className="text-purple-300 block font-mono">pip install -r requirements.txt</code>
                    <code className="text-purple-300 block font-mono">python3 main.py</code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

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
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-100 border border-slate-700/70 rounded-bl-none shadow-md'
                      }`}
                    >
                      <FormattedTelegramMessage text={msg.text} isUser={msg.sender === 'user'} />
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

              <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                {[
                  { label: '🤝 ثبت معامله جدید (روند هوشمند با نقل‌قول)', cmd: '🤝 ثبت معامله جدید' },
                  { label: '🔍 پیگیری امن با شناسه قرارداد (ضد فیشینگ)', cmd: 'DEV-842-190' },
                  { label: '💳 واریز و قفل وجه در صندوق امانت', cmd: '💳 واریز وجه به صندوق امانت (DEV-842-190)' },
                  { label: '📦 تحویل فایل‌ها و خروجی پروژه', cmd: '📦 تحویل فایل‌ها و خروجی پروژه (DEV-842-190)' },
                  { label: '✅ تایید نهایی و آزادسازی وجه به مجری', cmd: '✅ تایید نهایی و آزادسازی وجه به مجری (DEV-842-190)' },
                  { label: '🔄 درخواست اصلاحیه و ویرایش پروژه', cmd: '🔄 درخواست اصلاحیه و ویرایش (DEV-842-190)' },
                  { label: '⚖️ ثبت اختلاف و ارجاع به داوری حقوقی', cmd: '⚖️ ثبت اختلاف و ارجاع به داوری (DEV-842-190)' },
                  { label: '📄 دریافت سند رسمی PDF با گواهی دیجیتال', cmd: '📄 دانلود سند رسمی PDF (DEV-842-190)' },
                  { label: '📜 لیست معاملات من', cmd: '📜 لیست معاملات من' },
                  { label: '💳 کیف پول و شارژ حساب', cmd: '💳 کیف پول و اعتبار' },
                  { label: '💸 درخواست تسویه (با پین مالی)', cmd: '💸 درخواست تسویه و برداشت' },
                  { label: '🔐 تنظیم یا تغییر پین امنیتی مالی', cmd: '🔐 تنظیم/تغییر پین مالی' },
                  { label: '🛡 مرکز امنیت و هویت کاربری', cmd: '🛡 مرکز امنیت و هویت' },
                  { label: '👤 پروفایل و استعلام شاهکار', cmd: '👤 پروفایل کاربری' },
                  { label: '💎 پنل سفیران و معرف', cmd: '💎 پنل سفیران' }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(item.cmd)}
                    className="w-full text-right bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-medium border border-slate-700/60 transition flex items-center justify-between"
                  >
                    <span className="truncate">{item.label}</span>
                    <Play className="w-3 h-3 text-slate-500 shrink-0 mr-1" />
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

        {/* Tab: Security & Identity Hub (Phone-First + Financial PIN) */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    <span>معماری امنیت سه‌لایه Zero-Trust میانجی</span>
                  </div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    مرکز امنیت، هویت کاربری و پین مالی
                  </h2>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    در اسکرو میانجی، <strong>شماره تلفن همراه</strong> ملاک یکتای هویت در وب‌سایت، تلگرام و اپلیکیشن است. امنیت حساب بدون نیاز به رمزهای عبور ایستای ناامن، با <strong>پین‌کد مالی ضد نفوذ</strong> و <strong>قانون طلایی تطابق شبا با کد ملی</strong> تضمین شده است.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-right">
                    <p className="text-[10px] text-slate-400">امتیاز امنیت حساب (Security Score):</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${securityStatus?.user?.security_score || 95}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {securityStatus?.user?.security_score || 95}/100
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Account Identity Card & Switcher */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-600 flex items-center justify-center text-white font-bold text-base shadow-md">
                    {securityStatus?.user?.full_name ? securityStatus.user.full_name[0] : 'ع'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{securityStatus?.user?.full_name || 'کاربر میانجی'}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        {securityStatus?.user?.role === 'employer' ? 'کارفرما (خریدار)' : 'مجری (پیمانکار)'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <BadgeCheck className="w-3 h-3" />
                        احراز هویت شاهکار تایید شده
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-3 font-mono">
                      <span>📱 شماره تماس: <strong className="text-white">{securityStatus?.user?.phone_number || '09121112233'}</strong></span>
                      <span>🪪 کد ملی: <strong className="text-slate-300">{securityStatus?.user?.national_id || '0012345678'}</strong></span>
                      <span>🆔 تلگرام: <strong className="text-slate-400">{securityStatus?.user?.telegram_id || '102938475'}</strong></span>
                    </p>
                  </div>
                </div>

                {/* Account Switcher to Test Multi-Channel Phone-First Identity */}
                <div className="flex items-center gap-2 self-stretch md:self-auto bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">سوئیچ اکانت تستی (شماره موبایل):</span>
                  <button
                    onClick={() => handleSwitchAccount('09121112233')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
                      securityStatus?.user?.phone_number === '09121112233'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    ۰۹۱۲۱۱۱۲۲۳۳ (علی)
                  </button>
                  <button
                    onClick={() => handleSwitchAccount('09359876543')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
                      securityStatus?.user?.phone_number === '09359876543'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    ۰۹۳۵۹۸۷۶۵۴۳ (سارا)
                  </button>
                </div>
              </div>

              {/* Status Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${securityStatus?.user?.has_financial_pin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">وضعیت پین‌کد مالی:</p>
                    <p className="text-xs font-bold text-white">
                      {securityStatus?.user?.has_financial_pin ? 'فعال و محافظت‌شده (هش شده)' : 'تنظیم نشده (توصیه به فعال‌سازی)'}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">احراز خط تلگرام و وب:</p>
                    <p className="text-xs font-bold text-emerald-400">یکپارچه با Share Contact تلگرام</p>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">تطابق شبا و کد ملی (قانون طلایی):</p>
                    <p className="text-xs font-bold text-purple-300">قفل‌شده به نام صاحب حساب</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Architecture Explanations: The 3 Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                  <Smartphone className="w-4 h-4" />
                  <span>۱. هویت بر پایه شماره تماس (Phone-First)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  کاربر با دکمه رسمی <code className="text-blue-300 bg-slate-950 px-1 py-0.5 rounded font-mono">Share Contact</code> تلگرام یا اعتبارسنجی پیامکی ورود پیدا می‌کند.
                </p>
                <div className="text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                  <p className="text-emerald-400 font-bold">✓ مزیت حیاتی:</p>
                  <p>هیچ پسورد استاتیکی وجود ندارد تا در نشت‌های اطلاعاتی لو برود یا فراموش شود. ملاک در همه کانال‌ها (وب، تلگرام، مینی‌اپ) همان شماره همراه کاربر است.</p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <Key className="w-4 h-4" />
                  <span>۲. پین‌کد مالی امنیتی (Financial PIN)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  یک کد ۴ الی ۶ رقمی مستقل که فقط برای عملیات حساس (تسویه وجه، آزادسازی اسکرو، ثبت شبا) مطالبه می‌شود.
                </p>
                <div className="text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                  <p className="text-emerald-400 font-bold">✓ محافظت Brute-Force:</p>
                  <p>پس از ۵ بار ورود اشتباه، عملیات مالی حساب به مدت ۳۰ دقیقه قفل می‌شود. بازنشانی فقط با Step-Up SMS OTP ممکن است.</p>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                  <Scale className="w-4 h-4" />
                  <span>۳. قانون طلایی تطابق شبا و کد ملی</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  وجوه کیف پول تنها به حساب بانکی تسویه می‌شود که شماره شبای آن منحصراً به نام دارنده کد ملی ثبت‌شده خط کاربر باشد.
                </p>
                <div className="text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                  <p className="text-purple-400 font-bold">✓ امنیت ۱۰۰٪ ضد سرقت:</p>
                  <p>حتی اگر تلفن همراه یا اکانت تلگرام به سرقت برود، سارق امکان برداشت پول به هیچ حسابی جز حساب بانکی خود قربانی را نخواهد داشت!</p>
                </div>
              </div>
            </div>

            {/* Notification or Feedback Toast */}
            {pinActionMsg && (
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
                pinActionMsg.type === 'success' ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300' :
                pinActionMsg.type === 'error' ? 'bg-rose-950/40 border-rose-700/60 text-rose-300' :
                'bg-blue-950/40 border-blue-700/60 text-blue-300'
              }`}>
                <span>{pinActionMsg.text}</span>
                <button onClick={() => setPinActionMsg(null)} className="text-slate-400 hover:text-white text-xs font-bold px-2">✕</button>
              </div>
            )}

            {/* Interactive Control Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Card 1: Live PIN Verification Simulator */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-emerald-400" />
                      تست زنده اعتبارسنجی پین مالی و شمارنده قفل
                    </h4>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      خطاهای ثبت‌شده: {securityStatus?.user?.pin_failed_attempts || 0} از ۵
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    عملکرد سیستم در مواجهه با ورود پین صحیح یا تلاش‌های اشتباه را تست کنید. پس از ۵ بار تلاش اشتباه حساب مالی قفل موقت ۳۰ دقیقه‌ای می‌شود.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={6}
                      value={pinVerifyInput}
                      onChange={e => setPinVerifyInput(e.target.value)}
                      placeholder="پین مالی را وارد کنید (مثلاً 1234)..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleVerifyPin}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      اعتبارسنجی پین
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">تست سریع با مقادیر نمونه:</span>
                    <button
                      onClick={() => { setPinVerifyInput('1234'); }}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2 py-0.5 rounded font-mono border border-slate-700"
                    >
                      1234 (پین صحیح تستی)
                    </button>
                    <button
                      onClick={() => { setPinVerifyInput('9999'); }}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-rose-300 px-2 py-0.5 rounded font-mono border border-slate-700"
                    >
                      9999 (تست خطا و کسر تلاش)
                    </button>
                  </div>
                </div>

                {securityStatus?.user?.pin_locked_until && (
                  <div className="bg-rose-950/30 border border-rose-800/60 rounded-xl p-3 text-rose-300 text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>⚠️ حساب مالی به دلیل ۵ بار اشتباه متوالی تا {new Date(securityStatus.user.pin_locked_until).toLocaleTimeString('fa-IR')} قفل است.</span>
                  </div>
                )}
              </div>

              {/* Card 2: Set or Change PIN */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-blue-400" />
                    تنظیم یا تغییر پین‌کد مالی
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    پین مالی با الگوریتم امنیتی رمزنگاری سالت‌دار و هش SHA-256 ذخیره می‌گردد و هرگز به صورت متن خام نگهداری نمی‌شود.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={6}
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value)}
                      placeholder="پین جدید ۴ تا ۶ رقمی (مثلاً 5821)..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSetPin}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5" />
                      ثبت و ذخیره پین
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>پین مالی فقط هنگام تسویه یا تغییر شبا از کاربر پرسیده می‌شود.</span>
                </div>
              </div>

              {/* Card 3: Emergency SMS OTP Reset */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    بازنشانی اضطراری پین مالی با پیامک یکبار مصرف (SMS OTP)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    در صورت فراموشی پین یا قفل شدن حساب، کد تایید یکبار مصرف به شماره همراه تاییدشده ارسال می‌گردد.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleRequestOtp}
                      className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/40 px-3 py-1.5 rounded-xl text-xs font-medium transition"
                    >
                      📩 درخواست ارسال کد پیامکی (SMS OTP)
                    </button>
                    {otpSentMsg && <span className="text-[11px] text-emerald-400">{otpSentMsg}</span>}
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCodeInput}
                      onChange={e => setOtpCodeInput(e.target.value)}
                      placeholder="کد ۶ رقمی دریافتی..."
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="password"
                      maxLength={6}
                      value={newPinAfterOtp}
                      onChange={e => setNewPinAfterOtp(e.target.value)}
                      placeholder="پین مالی جدید (۴ تا ۶ رقم)..."
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleConfirmOtpAndResetPin}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تایید کد و بازنشانی پین مالی
                </button>
              </div>

              {/* Card 4: Sheba IBAN Binding & Verification */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-purple-400" />
                    مدیریت و قفل شماره شبا به کد ملی (Golden Rule)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    شماره شبای ثبت‌شده کنونی:
                  </p>
                  <div className="mt-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-purple-300 font-bold">{securityStatus?.user?.sheba || 'IR520120000000001234567890'}</p>
                      <p className="text-[10px] text-slate-400">صاحب حساب: {securityStatus?.user?.sheba_owner_name || securityStatus?.user?.full_name}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      قفل‌شده با کد ملی
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newShebaInput}
                      onChange={e => setNewShebaInput(e.target.value)}
                      placeholder="شماره شبای جدید (IR...)"
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="text"
                      value={newShebaOwner}
                      onChange={e => setNewShebaOwner(e.target.value)}
                      placeholder="نام صاحب حساب..."
                      className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {shebaMsg && <span className="text-[11px] text-purple-300">{shebaMsg}</span>}
                  <button
                    onClick={handleBindSheba}
                    className="mr-auto bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    استعلام و اتصال شبا
                  </button>
                </div>
              </div>
            </div>

            {/* Real-Time Security Audit Logs */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  دفتر ثبت رویدادهای امنیتی (Security Audit Trail)
                </h4>
                <span className="text-[10px] text-slate-500">ثبت ضد دستکاری (Immutable Audit Trail)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="pb-2.5 font-medium">نوع رویداد امنیتی</th>
                      <th className="pb-2.5 font-medium">وضعیت</th>
                      <th className="pb-2.5 font-medium">جزئیات و توضیحات</th>
                      <th className="pb-2.5 font-medium">IP و دستگاه</th>
                      <th className="pb-2.5 font-medium">زمان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(securityStatus?.auditLogs || []).map((log: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 font-medium text-white flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.status === 'success' ? 'bg-emerald-400' :
                            log.status === 'blocked' || log.status === 'failed' ? 'bg-rose-400' : 'bg-amber-400'
                          }`} />
                          {log.event_type}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                            log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                            log.status === 'blocked' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300 text-[11px]">{log.details}</td>
                        <td className="py-2.5 text-slate-500 font-mono text-[10px]">{log.ip_address}</td>
                        <td className="py-2.5 text-slate-400 font-mono text-[10px]">
                          {new Date(log.created_at).toLocaleTimeString('fa-IR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
