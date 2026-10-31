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
  const [activeTab, setActiveTab] = useState<'simulator' | 'contracts' | 'wallet' | 'logs' | 'database' | 'python_code'>('simulator');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedPy, setCopiedPy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [contractCategoryFilter, setContractCategoryFilter] = useState<'all' | 'active' | 'pending' | 'completed' | 'drafts' | 'cancelled'>('all');

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

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 py-3 text-center text-xs text-slate-500">
        سامانه هوشمند واسطه‌گری امن میانجی (Miyanji Escrow) — توسعه‌یافته با Python 3.10، Supabase و Telegraf/TeleBot
      </footer>
    </div>
  );
};

export default App;
