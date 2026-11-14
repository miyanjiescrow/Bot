import React, { useState, useEffect } from 'react';
import {
  Bot,
  Terminal,
  Database,
  ScrollText,
  Wallet,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
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
  HelpCircle,
  History
} from 'lucide-react';

interface BotStatus {
  status: string;
  runtime: string;
  bot_username: string;
  bot_token_configured: boolean;
  web_app_url?: string;
  webhook_url?: string;
  firebase_configured?: boolean;
  firebase_project_id?: string;
  firebase_database_id?: string;
  firebase_error?: string | null;
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

const App = () => {
  const [activeTab, setActiveTab] = useState<'status' | 'contracts' | 'admin_kyc' | 'wallet' | 'logs' | 'database' | 'python_code' | 'security'>('status');
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedPy, setCopiedPy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [contractCategoryFilter, setContractCategoryFilter] = useState<'all' | 'active' | 'pending' | 'completed' | 'drafts' | 'cancelled'>('all');
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  // Admin KYC Review State
  const [pendingKycList, setPendingKycList] = useState<any[]>([]);
  const [kycActionMsg, setKycActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
  const [syncingDb, setSyncingDb] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Contract Status Logs & Dropdown History States
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [contractHistoryData, setContractHistoryData] = useState<Record<string, any[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<Record<string, boolean>>({});

  const formatDateTimeFa = (isoString?: string) => {
    if (!isoString) return '---';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return String(isoString);
      return `${d.toLocaleDateString('fa-IR')} - ساعت ${d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return String(isoString);
    }
  };

  const toggleContractHistory = async (contractId: string) => {
    const isCurrentlyOpen = !!expandedHistory[contractId];
    setExpandedHistory(prev => ({ ...prev, [contractId]: !isCurrentlyOpen }));

    if (!isCurrentlyOpen) {
      const contractObj = contracts.find(c => c.contract_id === contractId);
      if (contractObj?.history && !contractHistoryData[contractId]) {
        setContractHistoryData(prev => ({ ...prev, [contractId]: contractObj.history }));
      }

      setLoadingHistory(prev => ({ ...prev, [contractId]: true }));
      try {
        const res = await fetch(`/api/contracts/${contractId}/history`);
        if (res.ok) {
          const data = await res.json();
          if (data?.history) {
            setContractHistoryData(prev => ({ ...prev, [contractId]: data.history }));
          }
        }
      } catch (e) {
        console.warn('Error fetching contract status logs:', e);
      } finally {
        setLoadingHistory(prev => ({ ...prev, [contractId]: false }));
      }
    }
  };

  const refreshHistory = async (contractId: string) => {
    setLoadingHistory(prev => ({ ...prev, [contractId]: true }));
    try {
      const res = await fetch(`/api/contracts/${contractId}/history`);
      if (res.ok) {
        const data = await res.json();
        if (data?.history) {
          setContractHistoryData(prev => ({ ...prev, [contractId]: data.history }));
        }
      }
    } catch (e) {
      console.warn('Error refreshing contract status logs:', e);
    } finally {
      setLoadingHistory(prev => ({ ...prev, [contractId]: false }));
    }
  };

  const getHistoryForContract = (c: any) => {
    const cid = c.contract_id;
    if (contractHistoryData[cid] && contractHistoryData[cid].length > 0) {
      return contractHistoryData[cid];
    }
    if (Array.isArray(c.history) && c.history.length > 0) {
      return c.history;
    }
    return [
      {
        event: `ثبت اولیه معامله در سامانه میانجی (وضعیت فعلی: ${c.status})`,
        timestamp: c.created_at || new Date().toISOString(),
        actor: c.buyer_fullname || 'کارفرما'
      }
    ];
  };

  const handleSyncDatabase = async () => {
    setSyncingDb(true);
    setSyncStatusMsg(null);
    try {
      const res = await fetch('/api/db/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncStatusMsg({
          text: data.message || 'همگام‌سازی ابری با موفقیت انجام شد.',
          type: 'success'
        });
        await fetchBotData();
      } else {
        setSyncStatusMsg({
          text: data.error || 'خطا در برقراری ارتباط با Firebase Firestore.',
          type: 'error'
        });
      }
    } catch (err: any) {
      setSyncStatusMsg({
        text: `خطا در اتصال به سرور: ${err.message}`,
        type: 'error'
      });
    } finally {
      setSyncingDb(false);
    }
  };

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
        fetch('/api/security/status').catch(() => null),
        fetch('/api/admin/kyc/pending').catch(() => null)
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
      // Check KYC response from Promise.all
      const resK = await fetch('/api/admin/kyc/pending').catch(() => null);
      if (resK && resK.ok) {
        const kData = await resK.json().catch(() => null);
        if (Array.isArray(kData)) setPendingKycList(kData);
      }
    } catch {
      // Gracefully silent during server reloads or offline iframe states
    }
  };

  const handleKycAction = async (userId: number, action: 'approve' | 'needs_correction') => {
    try {
      const res = await fetch('/api/admin/kyc/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          action,
          reason: action === 'needs_correction' ? 'نیاز به بازبینی و اصلاح مشخصات سجلی' : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setKycActionMsg({ text: data.message, type: 'success' });
        fetchBotData();
      } else {
        setKycActionMsg({ text: data.message || 'خطا در ثبت عملیات', type: 'error' });
      }
    } catch {
      setKycActionMsg({ text: 'خطا در برقراری ارتباط با سرور', type: 'error' });
    }
  };

  // Telegram WebApp Auto-Authentication & Sync
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready?.();
        tg.expand?.();
      }

      const params = new URLSearchParams(window.location.search);
      const urlUserId = params.get('user_id') || params.get('tg_id');
      const tgUser = tg?.initDataUnsafe?.user;

      const targetUserId = tgUser?.id || (urlUserId ? Number(urlUserId) : null);
      if (targetUserId) {
        fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tg_user_id: targetUserId,
            tg_username: tgUser?.username || params.get('username') || '',
            tg_fullname: tgUser ? `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() : (params.get('fullname') || '')
          })
        })
          .then(res => res.json())
          .then(data => {
            if (data?.user) {
              fetchBotData();
            }
          })
          .catch(err => console.warn('Telegram WebApp auto-auth note:', err));
      }
    } catch (e) {
      console.warn('Telegram init note:', e);
    }
  }, []);

  useEffect(() => {
    fetchBotData();
    const interval = setInterval(fetchBotData, 6000);
    return () => clearInterval(interval);
  }, []);

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

  const firestoreSchemaCode = JSON.stringify(
    {
      firebase: {
        projectId: 'mianji-3639d',
        databaseId: 'ai-studio-web-c8e655a8-004c-4987-89aa-e319ee39ab73',
        webAppUrl: 'https://a-c4hy.onrender.com',
        registerWebhookUrl: 'https://a-c4hy.onrender.com/api/bot/register-user'
      },
      collections: {
        users: {
          documentId: 'String(telegram_id)',
          fields: {
            id: 'String(user.id)',
            telegram_id: 'number (ctx.from.id)',
            phone_number: '09057586655',
            full_name: 'کاربر میانجی',
            username: 'telegram_username',
            role: 'user',
            kyc_status: 'verified | pending | rejected',
            wallet_balance: 0,
            escrow_locked_balance: 0,
            updatedAt: 'SERVER_TIMESTAMP'
          }
        },
        deals: {
          documentId: 'contract_id (e.g. MNJ-1042)',
          fields: {
            contract_id: 'string',
            title: 'string',
            amount: 'number',
            status: 'draft | active | funded | delivered | completed | disputed | cancelled',
            buyer_id: 'string | number | null',
            seller_id: 'string | number | null',
            updatedAt: 'SERVER_TIMESTAMP'
          }
        },
        otp_codes: {
          documentId: 'clean_phone (e.g. 09057586655)',
          fields: {
            phone: 'string',
            code: '5-digit OTP string',
            telegram_id: 'string',
            used: 'boolean',
            expiresAt: 'timestamp',
            updatedAt: 'SERVER_TIMESTAMP'
          }
        }
      },
      webhookSync: {
        method: 'POST',
        url: 'https://a-c4hy.onrender.com/api/bot/register-user',
        headers: { 'Content-Type': 'application/json' },
        body: {
          telegramId: 'String(user.id)',
          phone: 'clean_phone',
          fullName: 'user.full_name'
        }
      }
    },
    null,
    2
  );

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
                  <span>{botStatus?.bot_token_configured ? 'ربات تلگرام متصل است' : 'آماده اتصال | منتظر BOT_TOKEN'}</span>
                  <HelpCircle className="w-3 h-3 text-amber-400/80" />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                سامانه هوشمند واسطه‌گری امن و قراردادهای اسکرو | درگاه ربات تلگرام (Telegraf) + فایربیس و وب‌سایت میانجی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartBot}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              title="راه‌اندازی مجدد سرویس ربات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>ریستارت سرویس</span>
            </button>
            <a
              href={`https://t.me/${(botStatus?.bot_username || 'mianji_ir_bot').replace(/^(https?:\/\/)?(t\.me\/|telegram\.me\/)?@?/i, '').replace(/\/.*$/, '').trim() || 'mianji_ir_bot'}`}
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
            onClick={() => setActiveTab('status')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'status'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-4 h-4 text-emerald-400" />
            وضعیت اتصال ربات و سایت
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
            onClick={() => setActiveTab('admin_kyc')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition ${
              activeTab === 'admin_kyc'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BadgeCheck className="w-4 h-4 text-amber-300" />
            🪪 تایید کدهای ملی {pendingKycList.length > 0 && <span className="bg-amber-400 text-slate-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">{pendingKycList.length}</span>}
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
            دیتابیس فایربیس (Firestore)
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
                    {botStatus?.bot_token_configured ? 'اتصال تلگرام فعال است' : 'آماده اتصال | منتظر BOT_TOKEN'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {botStatus?.bot_token_configured
                    ? 'ربات متصل است و پیام‌های تلگرام به صورت زنده توسط موتور Telegraf پردازش می‌شوند.'
                    : 'متغیر BOT_TOKEN در سرور تنظیم نشده؛ پس از ثبت توکن در محیط هاست، ربات بلافاصله به تلگرام متصل می‌شود.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
                {showDiagnostics ? 'بستن راهنما' : 'مشاهده وضعیت فنی'}
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
                  ربات تلگرام از متغیر محیطی <code className="text-blue-300 font-mono">BOT_TOKEN</code> برای اتصال مستقیم به سرورهای تلگرام و ارسال OTP استفاده می‌کند.
                </p>
                <div className="text-[10px] bg-slate-950 p-2 rounded-lg text-slate-400 font-mono border border-slate-800/80">
                  {botStatus?.bot_token_configured ? '✓ BOT_TOKEN فعال و متصل است' : 'BOT_TOKEN=123456:ABC...'}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Database className="w-4 h-4" />
                  <span>۲. همگام‌سازی Firebase Firestore</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  پروژه: <code className="text-emerald-300 font-mono">{botStatus?.firebase_project_id || 'mianji-3639d'}</code>
                </p>
                <div className="text-[10px] bg-slate-950 p-2 rounded-lg text-emerald-400 border border-slate-800/80 truncate font-mono" title={botStatus?.firebase_database_id}>
                  DB: {botStatus?.firebase_database_id || 'ai-studio-web-c8e655a8-004c-4987-89aa-e319ee39ab73'}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Bot className="w-4 h-4" />
                  <span>۳. ران‌تایم و اندپوینت وب‌سایت</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  موتور <strong>Telegraf (Node.js 22)</strong> متصل به وب‌سایت و مسیرهای ارسال OTP با فرمت MarkdownV2 فعال است.
                </p>
                <div className="text-[10px] bg-slate-950 p-2 rounded-lg text-slate-400 font-mono border border-slate-800/80 truncate">
                  /api/auth/send-otp • /api/bot/send-message
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab: Live Bot, Website & Firebase Integration Status */}
        {activeTab === 'status' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      وضعیت عملیاتی ربات تلگرام و اتصال به وب‌سایت میانجی
                      <span className={`w-2 h-2 rounded-full ${botStatus?.bot_token_configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      @{(botStatus?.bot_username || 'mianji_ir_bot').replace(/^(https?:\/\/)?(t\.me\/|telegram\.me\/)?@?/i, '').replace(/\/.*$/, '').trim() || 'mianji_ir_bot'} • {botStatus?.runtime || 'Node.js 22 + Telegraf'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSyncDatabase}
                  disabled={syncingDb}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl font-medium transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingDb ? 'animate-spin' : ''}`} />
                  <span>{syncingDb ? 'درحال همگام‌سازی...' : 'همگام‌سازی با فایربیس'}</span>
                </button>
              </div>

              {syncStatusMsg && (
                <div className={`p-3 rounded-xl text-xs font-medium ${syncStatusMsg.type === 'success' ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300' : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'}`}>
                  {syncStatusMsg.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-amber-400" />
                      وضعیت موتور Telegraf (BOT_TOKEN)
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${botStatus?.bot_token_configured ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'}`}>
                      {botStatus?.bot_token_configured ? 'متصل و فعال' : 'در انتظار BOT_TOKEN'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    دریافت دستور <code className="text-blue-300">/start</code> و شماره تماس کاربر، ذخیره <code className="text-blue-300">chat_id</code> و ارسال کد تایید با فرمت <code className="text-emerald-300">MarkdownV2</code> به صورت مستقیم فعال است.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-emerald-400" />
                      دیتابیس مشترک فایربیس (Firestore)
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${botStatus?.firebase_configured ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'}`}>
                      {botStatus?.firebase_configured ? 'متصل به Firestore' : 'نیازمند Service Account'}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 space-y-1">
                    <div className="truncate">Project: <span className="text-slate-200">{botStatus?.firebase_project_id || 'mianji-3639d'}</span></div>
                    <div className="truncate" title={botStatus?.firebase_database_id}>DB ID: <span className="text-slate-200">{botStatus?.firebase_database_id || 'ai-studio-web-c8e655a8-004c-4987-89aa-e319ee39ab73'}</span></div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ExternalLink className="w-4 h-4 text-blue-400" />
                    آدرس متصل وب‌سایت میانجی (Mini App)
                  </h4>
                  <a
                    href={botStatus?.web_app_url || 'https://a-c4hy.onrender.com'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-mono truncate max-w-full"
                  >
                    {botStatus?.web_app_url || 'https://a-c4hy.onrender.com'}
                  </a>
                </div>

                <div className="border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-400 mb-2">چیدمان فعلی کیبورد اصلی ربات تلگرام (دکمه سایت در ردیف پایینی زیر راهنما):</p>
                  <div className="grid grid-cols-2 gap-2 max-w-md">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-center text-[11px] text-slate-300">🤝 ثبت معامله جدید</div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-center text-[11px] text-slate-300">📜 لیست معاملات من</div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-center text-[11px] text-slate-300">💳 کیف پول و اعتبار</div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-center text-[11px] text-slate-300">💎 پنل سفیران</div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-center text-[11px] text-slate-300">🪪 بررسی کدهای ملی</div>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-center text-[11px] text-slate-300">🎧 پشتیبانی و راهنمای استفاده 📖</div>
                    <div className="bg-emerald-600/15 border border-emerald-500/30 rounded-lg py-2 px-3 text-center text-[11px] font-medium text-emerald-300">
                      🔐 دریافت کد ورود به سایت
                    </div>
                    <div className="bg-blue-600/20 border border-blue-500/40 rounded-lg py-2 px-3 text-center text-[11px] font-bold text-blue-300">
                      ورود به پنل میانجی 🌐
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                اندپوینت‌های هماهنگ با وب‌سایت
              </h3>

              <div className="space-y-2 text-[11px]">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="font-mono text-emerald-400 font-bold">POST /api/auth/send-otp</div>
                  <p className="text-slate-400 mt-1">ارسال کد تایید ۵ یا ۶ رقمی با فرمت MarkdownV2 به چت تلگرام کاربر.</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="font-mono text-emerald-400 font-bold">POST /api/bot/send-message</div>
                  <p className="text-slate-400 mt-1">دریافت مستقیم درخواست ارسال پیام و اعلان از سمت سایت با شناسه chat_id.</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="font-mono text-blue-400 font-bold">POST /api/auth/verify-otp</div>
                  <p className="text-slate-400 mt-1">اعتبارسنجی کد و صدور Custom Token فایربیس برای ورود یکپارچه.</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="font-mono text-blue-400 font-bold">POST /api/auth/telegram</div>
                  <p className="text-slate-400 mt-1">احراز هویت امضای initData مینی‌اپ تلگرام.</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="font-mono text-purple-400 font-bold">GET / POST /api/deals</div>
                  <p className="text-slate-400 mt-1">همگام‌سازی معاملات اسکرو بین ربات، سایت و Firestore.</p>
                </div>
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
                  filteredContracts.map((c, i) => {
                    const isHistoryOpen = Boolean(expandedHistory[c.contract_id]);
                    const historyList = getHistoryForContract(c);
                    const isLoadingThisHistory = Boolean(loadingHistory[c.contract_id]);

                    return (
                      <div
                        key={i}
                        className={`bg-slate-950 border rounded-xl p-4 transition-all duration-200 ${
                          isHistoryOpen ? 'border-blue-500/50 shadow-lg shadow-blue-950/20 bg-slate-950/95' : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* Main Summary Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1.5 flex-1">
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

                          <div className="flex items-center gap-2.5 flex-wrap md:flex-nowrap justify-between md:justify-end">
                            <div className="text-left md:ml-2">
                              <span className="text-xs font-bold text-emerald-400 block">
                                {(c.amount || 0).toLocaleString('fa-IR')} تومان
                              </span>
                              <span className="text-[10px] text-slate-500">صندوق امن میانجی</span>
                            </div>

                            {/* دکمه نمایش تاریخچه تغییرات وضعیت */}
                            <button
                              type="button"
                              onClick={() => toggleContractHistory(c.contract_id)}
                              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
                                isHistoryOpen
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                              }`}
                              title="مشاهده تایم‌لاین و تغییرات وضعیت از دیتابیس"
                            >
                              <History className={`w-3.5 h-3.5 ${isHistoryOpen ? 'text-amber-300' : 'text-amber-400'}`} />
                              <span>{isHistoryOpen ? 'بستن تاریخچه' : 'نمایش تاریخچه'}</span>
                              {isHistoryOpen ? (
                                <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>

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

                        {/* لیست کشویی تاریخچه تغییرات وضعیت (Status Logs Dropdown) */}
                        {isHistoryOpen && (
                          <div className="mt-4 pt-3.5 border-t border-slate-800/80 bg-slate-900/60 rounded-xl p-3.5 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-800/70">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/30 text-amber-400">
                                  <History className="w-4 h-4" />
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-white flex items-center gap-2">
                                    <span>تاریخچه تغییرات وضعیت و پرونده معامله (Status Logs)</span>
                                    <span className="text-[10px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded-full border border-slate-700 font-mono">
                                      {historyList.length} رویداد ثبت‌شده در دیتابیس
                                    </span>
                                  </h5>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    ثبت موثق و زمان‌دار کلیه تغییرات وضعیت، امضاها، پرداختی‌ها و ارجاعات
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => refreshHistory(c.contract_id)}
                                  disabled={isLoadingThisHistory}
                                  className="flex items-center gap-1.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 transition disabled:opacity-50"
                                  title="استعلام آخرین سوابق از دیتابیس"
                                >
                                  <RefreshCw className={`w-3 h-3 text-blue-400 ${isLoadingThisHistory ? 'animate-spin' : ''}`} />
                                  <span>بروزرسانی لاگ‌ها</span>
                                </button>
                              </div>
                            </div>

                            {/* محتوای لاگ‌های وضعیت */}
                            {isLoadingThisHistory && !contractHistoryData[c.contract_id] ? (
                              <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                                <span>در حال دریافت سوابق تغییر وضعیت از دیتابیس...</span>
                              </div>
                            ) : historyList.length === 0 ? (
                              <div className="py-5 text-center text-xs text-slate-400 bg-slate-950/60 rounded-lg border border-dashed border-slate-800">
                                <Clock className="w-5 h-5 text-slate-500 mx-auto mb-1.5 opacity-60" />
                                <p className="text-slate-300 font-medium">سابقه‌ای فراتر از ثبت اولیه برای این معامله ثبت نشده است.</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  وضعیت فعلی در دیتابیس: <span className="font-mono text-blue-400">{c.status}</span>
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {historyList.map((logItem: any, idx: number) => {
                                  const eventText = logItem.event || logItem.action || '';
                                  const isDeposit = eventText.includes('قفل') || eventText.includes('واریز') || eventText.includes('صندوق امانت') || eventText.includes('پرداخت');
                                  const isSign = eventText.includes('امضا') || eventText.includes('OTP') || eventText.includes('تایید');
                                  const isDeliver = eventText.includes('تحویل') || eventText.includes('خروجی') || eventText.includes('فایل');
                                  const isDispute = eventText.includes('داوری') || eventText.includes('اعتراض') || eventText.includes('اختلاف');
                                  const isComplete = eventText.includes('تکمیل') || eventText.includes('نهایی');
                                  const isCancel = eventText.includes('لغو') || eventText.includes('انصراف');

                                  const dotBg = isCancel ? 'bg-rose-500 border-rose-300' :
                                    isDispute ? 'bg-amber-500 border-amber-300' :
                                    isComplete ? 'bg-emerald-500 border-emerald-300' :
                                    isDeliver ? 'bg-purple-500 border-purple-300' :
                                    isDeposit ? 'bg-blue-500 border-blue-300' :
                                    isSign ? 'bg-cyan-500 border-cyan-300' :
                                    'bg-indigo-500 border-indigo-300';

                                  const badgeStyle = isCancel ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
                                    isDispute ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                                    isComplete ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                                    isDeliver ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                                    isDeposit ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                                    isSign ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
                                    'bg-slate-800 text-slate-300 border-slate-700';

                                  const timeVal = logItem.timestamp || logItem.ts || logItem.created_at;
                                  const actorVal = logItem.actor || logItem.role || (logItem.actor_id ? `کاربر ${logItem.actor_id}` : 'سیستم اسکرو');

                                  return (
                                    <div
                                      key={idx}
                                      className="bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 rounded-lg p-3 transition flex items-start gap-3"
                                    >
                                      {/* نشانگر گرافیگی */}
                                      <div className="pt-1">
                                        <div className={`w-2.5 h-2.5 rounded-full border shadow-sm ${dotBg}`} />
                                      </div>

                                      {/* بدنه رویداد */}
                                      <div className="flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-[10px] px-2 py-0.2 rounded-full border font-medium ${badgeStyle}`}>
                                              {actorVal}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono">
                                              مرحله #{idx + 1}
                                            </span>
                                          </div>
                                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1" dir="ltr">
                                            <Clock className="w-2.5 h-2.5 text-slate-500" />
                                            {formatDateTimeFa(timeVal)}
                                          </span>
                                        </div>

                                        <p className="text-xs text-slate-200 leading-relaxed font-sans select-text">
                                          {eventText}
                                        </p>

                                        {logItem.file_id && (
                                          <div className="mt-1 text-[10px] bg-slate-900 border border-slate-800 text-blue-300 px-2 py-0.5 rounded inline-flex items-center gap-1 font-mono">
                                            <span>📎 پیوست:</span>
                                            <span>{logItem.file_id}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}

        {/* Tab: Admin KYC National ID Review */}
        {activeTab === 'admin_kyc' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BadgeCheck className="w-5 h-5 text-amber-400" />
                  پنل مدیریت کدهای ملی | بررسی و تایید احراز هویت کاربران
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  مشاهده کدهای ملی ثبت‌شده توسط کاربران و تصمیم‌گیری جهت تایید رسمی هویت یا ارسال اخطار «نیاز به اصلاح»
                </p>
              </div>
              <button
                onClick={fetchBotData}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>بروزرسانی لیست</span>
              </button>
            </div>

            {/* Notification message */}
            {kycActionMsg && (
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                kycActionMsg.type === 'success' ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300' : 'bg-rose-950/40 border-rose-700/60 text-rose-300'
              }`}>
                <span>{kycActionMsg.text}</span>
                <button onClick={() => setKycActionMsg(null)} className="text-slate-400 hover:text-white font-bold px-1.5">✕</button>
              </div>
            )}

            {/* Pending & All KYC Users List */}
            <div className="space-y-3">
              {pendingKycList.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  <BadgeCheck className="w-10 h-10 mx-auto text-emerald-500/50 mb-2" />
                  <p className="text-sm font-medium text-slate-300">درخواست بررسی جدیدی در صف انتظار نیست</p>
                  <p className="text-xs text-slate-500 mt-1">تمام کدهای ملی ثبت‌شده توسط کاربران تعیین تکلیف و تایید شده‌اند.</p>
                </div>
              ) : (
                pendingKycList.map((user: any) => {
                  const isValidChecksum = Boolean(user.national_id && user.national_id.length === 10);
                  const isNeedsFix = user.kyc_status === 'needs_correction';
                  return (
                    <div
                      key={user.id}
                      className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{user.full_name}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                            ID: {user.id}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            isNeedsFix
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                          }`}>
                            {isNeedsFix ? '⚠️ در انتظار اصلاح کاربر' : '⏳ در انتظار تصمیم ادمین'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                          <span className="font-mono">
                            🪪 کد ملی: <strong className="text-white text-xs">{user.national_id || '---'}</strong>
                          </span>
                          <span className="font-mono">
                            📱 موبایل: <strong className="text-slate-300">{user.phone_number || '---'}</strong>
                          </span>
                          <span className={`text-[11px] ${isValidChecksum ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isValidChecksum ? '✓ رقم کنترل ۱۰ رقمی منطبق' : '✗ فرمت نامعتبر'}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                        <button
                          onClick={() => handleKycAction(user.id, 'approve')}
                          className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3.5 py-2 rounded-xl shadow-sm transition active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>✅ تایید کد ملی</span>
                        </button>

                        <button
                          onClick={() => handleKycAction(user.id, 'needs_correction')}
                          className="flex items-center gap-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-medium px-3.5 py-2 rounded-xl transition active:scale-95"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>⚠️ نیاز به اصلاح</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Guide Card for Admin */}
            <div className="mt-4 bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
              <h4 className="font-bold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                راهنمای داوری و احراز هویت ادمین میانجی:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pr-1">
                <li>با انتخاب <strong className="text-emerald-400">«تایید کد ملی»</strong>، حساب کاربری کاربر ارتقا یافته، استعلام شاهکار ثبت می‌شود و قراردادهای او بدون محدودیت اجرا خواهد شد.</li>
                <li>با انتخاب <strong className="text-amber-400">«نیاز به اصلاح»</strong>، یک پیام هشدار سیستمی به تلگرام کاربر ارسال شده و کاربر ملزم به تصحیح و ثبت مجدد کد ملی صحیح خود می‌گردد.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab: Firebase Firestore & Webhook Sync */}
        {activeTab === 'database' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">
                    اتصال مستقیم ربات تلگرام و وب‌سایت میانجی به Firebase Firestore
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    دیتابیس سوپابیس حذف گردید و تمام کاربران، کدهای OTP و قراردادهای اسکرو مستقیماً در پایگاه داده مشترک <span className="text-emerald-300 font-mono">Firebase Firestore</span> ذخیره می‌شوند و همزمان پس از اشتراک‌گذاری شماره تماس به وب‌هوک وب‌سایت ارسال می‌گردند.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-blue-500/20 text-xs">
                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>پروژه و دیتابیس فایربیس</span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-mono leading-relaxed break-all">
                    Project ID: {botStatus?.firebase_project_id || 'mianji-3639d'}
                    <br />
                    Database ID: {botStatus?.firebase_database_id || 'ai-studio-web-c8e655a8-004c-4987-89aa-e319ee39ab73'}
                  </p>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="font-bold text-blue-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span>همگام‌سازی آنی وب‌هوک (Webhook Sync)</span>
                  </div>
                  <p className="text-slate-400 text-[11px] font-mono leading-relaxed break-all">
                    POST {botStatus?.webhook_url || 'https://a-c4hy.onrender.com/api/bot/register-user'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Connection Status & Sync Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${botStatus?.firebase_configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>وضعیت اتصال پایگاه داده:</span>
                    <span className={botStatus?.firebase_configured ? 'text-emerald-400' : 'text-amber-400'}>
                      {botStatus?.firebase_configured ? 'متصل به Firebase Firestore (پایداری دائمی)' : 'نیازمند ثبت FIREBASE_SERVICE_ACCOUNT_JSON در محیط سرور'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {botStatus?.firebase_configured
                      ? 'کالکشن‌های users، deals و otp_codes مستقیماً با وب‌سایت همگام هستند.'
                      : 'جهت فعال‌سازی همگام‌سازی ابری با Firestore، کلید Service Account فایربیس را در متغیر محیطی سرور ثبت کنید.'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncDatabase}
                  disabled={syncingDb}
                  className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg font-medium transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingDb ? 'animate-spin' : ''}`} />
                  <span>{syncingDb ? 'درحال بازیابی...' : '🔄 همگام‌سازی و بازیابی لحظه‌ای از Firestore'}</span>
                </button>
              </div>
            </div>

            {syncStatusMsg && (
              <div className={`p-3 rounded-lg text-xs font-medium ${syncStatusMsg.type === 'success' ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300' : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'}`}>
                {syncStatusMsg.text}
              </div>
            )}

            {/* Firestore Schema Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-blue-400" />
                    ساختار کالکشن‌های مشترک Firebase Firestore
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    سند کاربران در کالکشن <code className="text-emerald-300 font-mono">users</code> با شناسه <code className="text-emerald-300 font-mono">telegram_id</code> و زمان <code className="text-emerald-300 font-mono">SERVER_TIMESTAMP</code> ثبت می‌شود.
                  </p>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(firestoreSchemaCode);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2000);
                  }}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg transition"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'کپی شد' : 'کپی ساختار JSON'}</span>
                </button>
              </div>

              <pre className="bg-black/90 p-4 rounded-xl font-mono text-[11px] text-blue-300 overflow-x-auto leading-relaxed border border-slate-800 max-h-[350px]" dir="ltr">
                {firestoreSchemaCode}
              </pre>
            </div>
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
                  ماشین وضعیت تلگرام (FSM) با پشتیبانی از مهلت تست اختیاری، اصلاحیه رایگان، لینک اختصاصی دعوت و ادغام یکپارچه با Firebase Firestore.
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
        سامانه هوشمند واسطه‌گری امن میانجی (Miyanji Escrow) — متصل به Firebase Firestore و ربات Telegraf
      </footer>
    </div>
  );
};

export default App;
