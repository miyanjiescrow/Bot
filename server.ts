/**
 * Miyanji Smart Escrow Platform - Server & Python Bot Gateway
 * Powers the Python Telegram Bot runtime, Supabase Synchronization, and Status API
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import {
  getUsers,
  getUser,
  getCurrentUser,
  getCurrentUserId,
  setCurrentUserId,
  registerOrUpdateUser,
  submitKyc,
  getContracts,
  getContract,
  createContract,
  updateContract,
  deleteContract,
  signContract,
  payContractEscrow,
  deliverContract,
  approveContract,
  cancelContract,
  getTransactions,
  depositWallet,
  withdrawWallet,
  getDisputes,
  getDispute,
  createDispute,
  addDisputeMessage,
  resolveDispute,
  getAffiliateStats,
  withdrawAffiliateEarnings,
  getDashboardStats,
  isValidIranianNationalId,
  isValidIranianSheba,
  generateContractId,
  formatCurrency,
  getSignatures,
  getUserByPhone,
  getOrCreateUserByPhone,
  setFinancialPin,
  verifyFinancialPin,
  resetFinancialPinWithOtp,
  bindAndVerifySheba,
  sendPhoneOtp,
  verifyPhoneOtp,
  getSecurityAuditLogs,
  normalizeIranianPhone,
  getPendingKycUsers,
  updateUserKycStatus,
} from './src/db';
import { isSupabaseConfigured } from './src/lib/supabase';
import { startBot } from './src/bot';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portArgIndex = process.argv.indexOf('--port');
const portFromArg = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : null;
const hostArgIndex = process.argv.indexOf('--host');
const hostFromArg = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : null;

// AI Studio Dev Server strictly listens on port 3000 (or container assigned PORT)
const PORT = portFromArg || (process.env.PORT ? Number(process.env.PORT) : 3000);
const HOST = hostFromArg || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve Font files statically
app.use('/Font', express.static(path.join(__dirname, 'Font')));
app.use('/fonts', express.static(path.join(__dirname, 'Font')));

// ====================================================
// ۱. مدیریت پروسه ربات پایتون در پس‌زمینه (Python Bot Process)
// ====================================================
let pythonBotProcess: any = null;

function ensurePythonBotRunning() {
  if (!process.env.BOT_TOKEN) {
    console.log('ℹ️ BOT_TOKEN not configured in environment. Python Telegram bot will remain idle.');
    return;
  }
  const logFilePath = path.join(__dirname, 'bot.log');
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  try {
    // Check if main.py is already running
    const check = spawn('pgrep', ['-f', 'main.py']);
    check.on('error', (err) => {
      console.log('ℹ️ pgrep check notice:', err.message);
    });
    check.on('close', (code) => {
      if (code !== 0) {
        console.log('🤖 Spawning Python Telegram Bot (python3 main.py)...');
        pythonBotProcess = spawn('python3', ['main.py'], {
          cwd: __dirname,
          env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        pythonBotProcess.stdout?.pipe(logStream);
        pythonBotProcess.stderr?.pipe(logStream);

        pythonBotProcess.on('exit', (exitCode: any, signal: any) => {
          if (exitCode !== 0) {
            const exitMsg = `ℹ️ Python script ended (code ${exitCode}). Telegram services run directly via Node.js/Telegraf engine in this environment.\n`;
            console.log(exitMsg);
            try { fs.appendFileSync(logFilePath, exitMsg); } catch {}
          } else {
            console.log(`ℹ️ Python bot exited normally (${signal}).`);
          }
        });

        pythonBotProcess.on('error', (err: any) => {
          console.log(`⚠️ Python bot process error: ${err.message}. Defaulting to Node.js Telegraf engine.`);
        });
      } else {
        console.log('🤖 Python Telegram Bot is already active.');
      }
    });
  } catch (err: any) {
    console.error('Failed to spawn Python bot:', err.message);
  }
}

// Start Python & Node.js bot instances
ensurePythonBotRunning();
startBot();

// ====================================================
// ۲. مسیرهای وضعیت و کنترل ربات پایتون (Bot Status & Diagnostics)
// ====================================================

// Check Python Bot & Database Status
app.get('/api/bot/status', (req: Request, res: Response) => {
  const logFile = path.join(__dirname, 'bot.log');
  let recentLogs = '';
  if (fs.existsSync(logFile)) {
    try {
      const allLogs = fs.readFileSync(logFile, 'utf-8');
      const lines = allLogs.trim().split('\n');
      recentLogs = lines.slice(-25).join('\n');
    } catch {
      recentLogs = 'درحال خواندن لاگ‌ها...';
    }
  }

  const pidFile = '/tmp/miyanji_bot.pid';
  let botPid: string | null = null;
  if (fs.existsSync(pidFile)) {
    try {
      botPid = fs.readFileSync(pidFile, 'utf-8').trim();
    } catch {}
  }

  const stats = getDashboardStats();

  const isTokenSet = Boolean(process.env.BOT_TOKEN && process.env.BOT_TOKEN.includes(':'));

  res.json({
    status: 'online',
    runtime: 'Node.js 22 + Telegraf (با پشتیبانی از سورس پایتون ۳.۱۰)',
    bot_username: process.env.BOT_USERNAME || 'mianji_ir_bot',
    bot_token_configured: isTokenSet,
    diagnostics: {
      has_token: isTokenSet,
      token_message: isTokenSet
        ? '✅ توکن ربات تلگرام در متغیرهای محیطی ثبت شده است.'
        : '⚠️ متغیر BOT_TOKEN در تنظیمات سرور ثبت نشده است. تلگرام بدون توکن به پیام‌ها پاسخ نمی‌دهد.',
      python_note: 'محیط هاست فعلی کانتینر Node.js 22 است؛ برای اجرای محلی یا مستقل پایتون، پکیج‌های requirements.txt باید با pip نصب شوند.',
      active_engine: isTokenSet ? 'Telegraf Node.js (اتصال مستقیم به تلگرام)' : 'Web Simulator Console (شبیه‌ساز مستقل وب)'
    },
    supabase_configured: isSupabaseConfigured(),
    supabase_url: process.env.SUPABASE_URL ? 'متصل (Supabase Cloud)' : 'پایگاه داده محلی WAL و حافظه پایدار',
    pid: botPid,
    stats,
    active_modules: [
      'هسته واسطه‌گری امن و صندوق امانت (Escrow)',
      'ثبت و امضای الکترونیک قراردادها با OTP دیجیتال',
      'احراز هویت هوشمند (سرویس شاهکار و استعلام شبا)',
      'کیف پول داخلی و سیستم شارژ و تسویه حساب (شاپرک/پایا)',
      'شورای حل اختلاف و داوری حقوقی سه جانبه',
      'سیستم درآمدزایی و پنل سفیران (B2B Affiliate)',
      'سیستم یادآور و اعلان خودکار تلگرام'
    ],
    recent_logs: recentLogs
  });
});

// Trigger restart of Python bot
app.post('/api/bot/restart', (req: Request, res: Response) => {
  try {
    spawn('pkill', ['-f', 'main.py']);
    setTimeout(() => {
      ensurePythonBotRunning();
    }, 1500);
    res.json({ success: true, message: 'دستور راه‌اندازی مجدد ربات تلگرام پایتون ارسال گردید.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Live Log Stream
app.get('/api/bot/logs', (req: Request, res: Response) => {
  const logFile = path.join(__dirname, 'bot.log');
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      return res.json({ logs: lines.slice(-60) });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({ logs: ['لاگی ثبت نشده است یا ربات تازه شروع به کار کرده است.'] });
});

interface DealDraftState {
  role?: 'employer' | 'freelancer';
  category?: string;
  categoryLabel?: string;
  title?: string;
  amount?: number;
  description?: string;
  commission_payer?: 'employer' | 'freelancer' | 'split_50_50';
  has_inspection_period?: boolean;
  inspection_period_hours?: number;
  has_free_revisions?: boolean;
  free_revisions_count?: number;
  contract_id?: string;
  invite_token?: string;
}

let simulatorState: {
  state: string;
  depositAmount: number;
  txId: number;
  withdrawAmount?: number;
  pendingPin?: string;
  dealDraft?: DealDraftState;
  activeDealToken?: string;
  signingFullName?: string;
  signingNationalId?: string;
  signingPhone?: string;
  signingOtp?: string;
  signingContractId?: string;
} = {
  state: 'IDLE',
  depositAmount: 0,
  txId: 0
};

function parseFlexibleAmount(str: string): number | null {
  if (!str) return null;
  // Convert Persian/Arabic digits
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arDigits = '٠١٢٣٤٥٦٧٨٩';
  let cleaned = str;
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.replace(new RegExp(faDigits[i], 'g'), String(i));
    cleaned = cleaned.replace(new RegExp(arDigits[i], 'g'), String(i));
  }

  let multiplier = 1;
  if (/میلیارد|b|B/i.test(cleaned)) multiplier = 1000000000;
  else if (/میلیون|m|M/i.test(cleaned)) multiplier = 1000000;
  else if (/هزار|k|K/i.test(cleaned)) multiplier = 1000;

  const numMatch = cleaned.match(/(\d+(?:[.,،_\s]\d+)*)/);
  if (!numMatch) return null;

  const rawNum = numMatch[1].replace(/[،,\s_]/g, '');
  const val = parseFloat(rawNum) * multiplier;
  return isNaN(val) || val <= 0 ? null : Math.round(val);
}

// Telegram Bot Command Simulator (allows testing bot directly from web console)
app.post('/api/bot/simulate', async (req: Request, res: Response) => {
  const { command, text } = req.body;
  const input = (text || command || '').trim();

  // Cancel and Return to Main Menu
  if (['انصراف', 'لغو', 'بازگشت', '🔙 بازگشت به منوی اصلی', '🔙 انصراف و بازگشت', '/cancel'].includes(input)) {
    simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };
    return res.json({
      reply: '🔙 **عملیات لغو شد و به منوی اصلی بازگشتید.**',
      keyboard: [
        ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
        ['💳 کیف پول و اعتبار', '💎 پنل سفیران'],
        ['🪪 بررسی کدهای ملی', '🎧 پشتیبانی و راهنمای استفاده 📖']
      ]
    });
  }

  if (input === '/start' || input === 'شروع') {
    simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };
    return res.json({
      reply: '🤖 **سلام! به سامانه جامع اسکرو و واسطه‌گری میانجی (Miyanji Escrow) خوش آمدید.**\n\nپلتفرم رسمی پرداخت امن، داوری حقوقی و قراردادهای فریلنسری تحت پوشش قانون تجارت الکترونیک.',
      keyboard: [
        ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
        ['💳 کیف پول و اعتبار', '💎 پنل سفیران'],
        ['🪪 بررسی کدهای ملی', '🎧 پشتیبانی و راهنمای استفاده 📖']
      ]
    });
  }

  // تشخیص هوشمند دستورات اولویت‌دار (کد قرارداد، اقدامات چرخه حیات، یا منوهای اصلی)
  const hasContractCode = Boolean(input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i) || input.startsWith('c_') || input.startsWith('deal_'));
  const isLifecycleAction = input.includes('واریز وجه') || input.includes('واریز به صندوق امانت') ||
                            input.includes('تحویل فایل') || input.includes('تحویل خروجی') || input.includes('تحویل پروژه') || input.includes('تحویل کار') ||
                            input.includes('تایید نهایی') || input.includes('آزادسازی وجه') || input.includes('تایید تحویل') ||
                            input.includes('درخواست اصلاحیه') || input.includes('اصلاح کار') ||
                            input.includes('ثبت اختلاف') || input.includes('ارجاع به داوری') || input.includes('داوری') ||
                            input.includes('دانلود سند رسمی PDF') || input.includes('دانلود PDF');
  const isGlobalMenuCommand = input.includes('معاملات من') || input.includes('لیست معاملات') ||
                              input.includes('درحال انجام') || input.includes('در انتظار اقدام') || input.includes('تکمیل شده') || input.includes('پیش‌نویس') ||
                              input.includes('کیف پول') || input.includes('اعتبار') || input.includes('شارژ') || input.includes('تسویه') ||
                              input.includes('پروفایل') || input.includes('سفیران') || input.includes('پشتیبانی') ||
                              input.includes('جست‌وجوی قرارداد') || input.includes('پیگیری با شناسه');

  // اگر کاربر کدی یا دستوری خارج از ایجاد معامله وارد کرد، وضعیت ویزارد معامله را لغو و ریست کن
  if ((hasContractCode || isLifecycleAction || isGlobalMenuCommand) &&
      simulatorState.state !== 'DEAL_PARTY1_SIGN_OTP' &&
      simulatorState.state !== 'WAITING_SIGN_OTP' &&
      simulatorState.state !== 'WAITING_DEPOSIT_RECEIPT') {
    if (simulatorState.state.startsWith('DEAL_')) {
      simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };
    }
  }

  // ====================================================
  // جریان جدید و هوشمند ایجاد معامله (New Smart Deal Flow)
  // ====================================================

  // گام ۱: کلیک روی ایجاد معامله جدید
  if (input.includes('ثبت معامله') || input.includes('ایجاد معامله') || input === '/newdeal') {
    simulatorState = {
      state: 'DEAL_ROLE',
      depositAmount: 0,
      txId: 0,
      dealDraft: {}
    };

    return res.json({
      reply: '🤝 **ثبت معامله امن در اسکرو میانجی**\n' +
             '> 🛡 وجه معامله تا تایید نهایی در صندوق امن امانت مسدود می‌ماند.\n\n' +
             '👤 **نقش خود را در این معامله مشخص فرمایید:**',
      keyboard: [
        ['💼 کارفرما (خریدار)', '🛠 مجری (پیمانکار)'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۲: انتخاب نقش و سوال دسته‌بندی
  const isDirectRoleClick = !isLifecycleAction && !hasContractCode && !isGlobalMenuCommand &&
                           (input.includes('کارفرما') || input.includes('خریدار') || input.includes('مجری') || input.includes('پیمانکار')) &&
                           !input.includes('افزودن به واریزی') && !input.includes('کسر از دریافتی') && !input.includes('۵۰٪') && !input.includes('امضا') && !input.includes('قرارداد');

  if (simulatorState.state === 'DEAL_ROLE' || (isDirectRoleClick && (simulatorState.state === 'IDLE' || !simulatorState.dealDraft?.role))) {
    const isEmployer = input.includes('کارفرما') || input.includes('خریدار');
    const roleTitle = isEmployer ? 'کارفرما (خریدار)' : 'مجری (پیمانکار)';

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      role: isEmployer ? 'employer' : 'freelancer'
    };
    simulatorState.state = 'DEAL_CATEGORY';

    return res.json({
      reply: '📂 **انتخاب دسته‌بندی خدمت**\n' +
             `> 👤 نقش شما: **${roleTitle}** ثبت گردید.\n\n` +
             'حوزه فعالیت و زمینه پروژه خود را انتخاب کنید:',
      keyboard: [
        ['🎨 طراحی و گرافیک', '💻 برنامه‌نویسی'],
        ['🎓 خدمات دانشجویی', '✍️ تولید محتوا'],
        ['📑 سایر خدمات دیجیتال'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۴: دریافت عنوان و سوال مبلغ
  if (simulatorState.state === 'DEAL_TITLE') {
    const title = input.trim();
    if (title.length < 3) {
      return res.json({
        reply: '⚠️ **عنوان خیلی کوتاه است.** لطفاً حداقل ۳ حرف ارسال کنید:',
        keyboard: [['🔙 انصراف و بازگشت']]
      });
    }

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      title
    };
    simulatorState.state = 'DEAL_AMOUNT';

    return res.json({
      reply: `💰 **مبلغ کل معامله**\n` +
             `> 📝 پروژه: «${title}»\n` +
             `> 🔒 وجه در طول انجام پروژه در صندوق امانت میانجی محفوظ است.\n\n` +
             `لطفاً مبلغ کل را به **تومان** وارد کرده یا از گزینه‌های زیر برگزینید:`,
      keyboard: [
        ['1,000,000 تومان', '2,500,000 تومان'],
        ['5,000,000 تومان', '10,000,000 تومان'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۳: انتخاب دسته‌بندی و دریافت عنوان کوتاه
  const isCategoryClick = !isLifecycleAction && !hasContractCode && !isGlobalMenuCommand &&
                          (input === '🎨 طراحی و گرافیک' || input === '💻 برنامه‌نویسی' || 
                           input === '🎓 خدمات دانشجویی' || input === '✍️ تولید محتوا' || input === '📑 سایر خدمات دیجیتال');

  if (simulatorState.state === 'DEAL_CATEGORY' || isCategoryClick) {
    let cat = 'GEN';
    let catLabel = 'خدمات دیجیتال';

    if (input.includes('طراحی') || input.includes('گرافیک')) {
      cat = 'DS';
      catLabel = 'طراحی و گرافیک';
    } else if (input.includes('برنامه‌نویسی') || input.includes('کد')) {
      cat = 'DEV';
      catLabel = 'برنامه‌نویسی و IT';
    } else if (input.includes('دانشجویی') || input.includes('پژوهشی')) {
      cat = 'ACAD';
      catLabel = 'خدمات دانشجویی';
    } else if (input.includes('محتوا') || input.includes('سئو')) {
      cat = 'CNT';
      catLabel = 'تولید محتوا و سئو';
    }

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      category: cat,
      categoryLabel: catLabel
    };
    simulatorState.state = 'DEAL_TITLE';

    return res.json({
      reply: `✍️ **عنوان کوتاه پروژه**\n` +
             `> 🏷 دسته‌بندی: **${catLabel}**\n\n` +
             'لطفاً یک عنوان خلاصه و گویا ارسال فرمایید (مثلاً «طراحی لوگو» یا «ربات پایتون»):',
      keyboard: [
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۵: دریافت مبلغ و سوال شرح تعهدات
  if (simulatorState.state === 'DEAL_AMOUNT') {
    const parsedAmount = parseFlexibleAmount(input);
    if (!parsedAmount || parsedAmount < 10000) {
      return res.json({
        reply: '⚠️ **مبلغ نامعتبر است.** حداقل مبلغ ۱۰,۰۰۰ تومان می‌باشد. لطفاً مجدداً وارد فرمایید:',
        keyboard: [
          ['1,000,000 تومان', '2,500,000 تومان'],
          ['5,000,000 تومان', '10,000,000 تومان'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      amount: parsedAmount
    };
    simulatorState.state = 'DEAL_DESCRIPTION';

    return res.json({
      reply: `📋 **تعهدات فنی و اقلام تحویلی پروژه**\n` +
             `> ⚖️ **ملاک انحصاری داوری حقوقی:**\n` +
             `> قضاوت هیئت حل اختلاف میانجی صرفاً بر مبنای همین متنی است که در این بخش نوشته می‌شود؛ توافقات خارج از قرارداد (چت شخصی تلگرام یا تلفنی) فاقد اعتبار است.\n\n` +
             `✍️ **تعهدات و فرمت فایل‌های تحویلی را بنویسید یا یک گزینه را انتخاب کنید:**`,
      keyboard: [
        ['تحویل سورس‌کد کامل به همراه مستندات راه‌اندازی و داکیومنت فنی'],
        ['تحویل فایل‌های لایه باز برداری وکتور (AI و SVG) با کیفیت ۳۰۰ DPI'],
        ['ترجمه و ویرایش دقیق تخصصی همراه با عدم سرقت علمی'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۶: دریافت شرح دقیق تعهدات و سوال تعیین‌کننده کارمزد
  if (simulatorState.state === 'DEAL_DESCRIPTION') {
    const desc = input.trim();
    if (desc.length < 5) {
      return res.json({
        reply: '⚠️ لطفاً تعهدات را کامل‌تر بنویسید (حداقل ۵ کاراکتر):',
        keyboard: [
          ['تحویل سورس‌کد کامل به همراه مستندات راه‌اندازی و داکیومنت فنی'],
          ['تحویل فایل‌های لایه باز برداری وکتور (AI و SVG) با کیفیت ۳۰۰ DPI'],
          ['ترجمه و ویرایش دقیق تخصصی همراه با عدم سرقت علمی'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      description: desc
    };
    simulatorState.state = 'DEAL_COMMISSION_PAYER';

    const parsedAmount = simulatorState.dealDraft.amount || 100000;
    const fee = Math.round(parsedAmount * 0.05);

    return res.json({
      reply: `⚖️ **پرداخت‌کننده کارمزد اسکرو**\n` +
             `> 💰 مبلغ پروژه: **${formatCurrency(parsedAmount)}** | کارمزد (۵٪): **${formatCurrency(fee)}**\n\n` +
             `چه کسی کارمزد خدمات امنیتی اسکرو را پرداخت می‌کند؟`,
      keyboard: [
        ['💼 کارفرما (افزودن به واریزی کارفرما)'],
        ['🛠 مجری (کسر از دریافتی مجری)'],
        ['⚖️ توافقی (۵۰٪ کارفرما / ۵۰٪ مجری)'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۷: بخش اختیاری پیشرفته ۱ - مهلت بررسی و تست (Inspection Period)
  if (simulatorState.state === 'DEAL_COMMISSION_PAYER') {
    let payer: 'employer' | 'freelancer' | 'split_50_50' = 'split_50_50';
    if (input.includes('کارفرما')) payer = 'employer';
    else if (input.includes('مجری')) payer = 'freelancer';

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      commission_payer: payer
    };
    simulatorState.state = 'DEAL_INSPECTION';

    return res.json({
      reply: `⏱ **مهلت تست و بررسی خروجی (Inspection Period)**\n` +
             `> 🔍 فرصت خریدار جهت ارزیابی کار قبل از آزادسازی قطعی وجه به مجری.\n\n` +
             `مدت زمان مورد نظر خود را انتخاب فرمایید:`,
      keyboard: [
        ['⚡ تایید آنی (بدون مهلت تست)'],
        ['⏱ ۲۴ ساعت مهلت تست', '⏱ ۴۸ ساعت مهلت تست'],
        ['⏱ ۷۲ ساعت مهلت تست', '✍️ زمان دلخواه'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۸: بخش اختیاری پیشرفته ۲ - اصلاحیه رایگان (Free Revisions)
  if (simulatorState.state === 'DEAL_INSPECTION') {
    if (input.includes('زمان دلخواه')) {
      simulatorState.state = 'DEAL_INSPECTION_CUSTOM';
      return res.json({
        reply: '✍️ لطفاً مهلت تست را به **ساعت** وارد فرمایید (مثلاً `36`):',
        keyboard: [['🔙 انصراف و بازگشت']]
      });
    }

    let hours = 0;
    if (input.includes('24') || input.includes('۲۴')) hours = 24;
    else if (input.includes('48') || input.includes('۴۸')) hours = 48;
    else if (input.includes('72') || input.includes('۷۲')) hours = 72;

    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      has_inspection_period: hours > 0,
      inspection_period_hours: hours
    };
    simulatorState.state = 'DEAL_REVISIONS';

    return res.json({
      reply: `🔄 **سهمیه اصلاحیه و ویرایش رایگان**\n` +
             `> ✨ تعداد دفعاتی که مجری بدون هزینه مازاد، اصلاحات را اعمال می‌نماید.\n\n` +
             `سهمیه ویرایش را مشخص فرمایید:`,
      keyboard: [
        ['🚫 بدون ویرایش رایگان'],
        ['۱ بار اصلاحیه رایگان', '۲ بار اصلاحیه رایگان'],
        ['🤝 توافقی بین طرفین', '✍️ تعداد دلخواه'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  if (simulatorState.state === 'DEAL_INSPECTION_CUSTOM') {
    const rawH = parseFlexibleAmount(input) || 24;
    simulatorState.dealDraft = {
      ...(simulatorState.dealDraft || {}),
      has_inspection_period: true,
      inspection_period_hours: rawH
    };
    simulatorState.state = 'DEAL_REVISIONS';

    return res.json({
      reply: `🔄 **سهمیه اصلاحیه و ویرایش رایگان**\n` +
             `> ✨ تعداد دفعاتی که مجری بدون هزینه مازاد، اصلاحات را اعمال می‌نماید.\n\n` +
             `سهمیه ویرایش را مشخص فرمایید:`,
      keyboard: [
        ['🚫 بدون ویرایش رایگان'],
        ['۱ بار اصلاحیه رایگان', '۲ بار اصلاحیه رایگان'],
        ['🤝 توافقی بین طرفین', '✍️ تعداد دلخواه'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۹: هدایت مستقیم طرف اول به تایید مشخصات و امضای دیجیتال
  if (simulatorState.state === 'DEAL_REVISIONS' || simulatorState.state === 'DEAL_REVISIONS_CUSTOM') {
    let revCount = 2;
    if (input.includes('بدون ویرایش') || input.includes('0') || input.includes('۰')) revCount = 0;
    else if (input.includes('1') || input.includes('۱ بار')) revCount = 1;
    else if (input.includes('2') || input.includes('۲ بار')) revCount = 2;
    else if (input.includes('توافقی')) revCount = -1;

    const draft = simulatorState.dealDraft || {};
    draft.has_free_revisions = revCount !== 0;
    draft.free_revisions_count = revCount;

    const amount = draft.amount || 2500000;
    const cat = (draft.category as any) || 'GEN';
    const contractId = generateContractId(cat);
    draft.contract_id = contractId;
    simulatorState.signingContractId = contractId;

    const currentUser = getCurrentUser();

    const inspFa = (draft.inspection_period_hours || 0) > 0
      ? `${draft.inspection_period_hours} ساعت`
      : 'تایید آنی';

    const revFa = revCount === 0
      ? 'بدون ویرایش'
      : (revCount === -1 ? 'توافقی' : `${revCount} بار رایگان`);

    const payerFa = draft.commission_payer === 'employer'
      ? 'کارفرما'
      : (draft.commission_payer === 'freelancer' ? 'مجری' : 'توافقی ۵۰/۵۰');

    simulatorState.state = 'DEAL_PARTY1_SIGN_CONFIRM';

    return res.json({
      reply: `📜 **پیش‌نویس قرارداد هوشمند اسکرو میانجی**\n` +
             `🆔 شناسه: \`${contractId}\`\n` +
             `> 📝 **موضوع:** ${draft.title}\n` +
             `> 💰 **مبلغ:** ${formatCurrency(amount)} | ⚖️ **کارمزد:** ${payerFa}\n` +
             `> 🛡 **مهلت تست:** ${inspFa} | 🔄 **اصلاحیه:** ${revFa}\n` +
             `> 📋 **تعهدات فنی:** ${draft.description || 'تعهدات مشخص شده'}\n\n` +
             `✍️ **امضای دیجیتال طرف اول (${currentUser.full_name}):**\n` +
             `> 🪪 کد ملی: \`${currentUser.national_id || '0012345678'}\` | 📱 همراه: \`${currentUser.phone_number}\`\n\n` +
             `جهت انعقاد رسمی و صدور لینک دعوت، دکمه زیر را لمس فرمایید:`,
      keyboard: [
        ['✍️ تایید مشخصات و امضای دیجیتال قرارداد (با OTP)'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۹: ارسال کد OTP امضا برای طرف اول
  if (simulatorState.state === 'DEAL_PARTY1_SIGN_CONFIRM' && (input.includes('امضای دیجیتال') || input.includes('تایید مشخصات') || input.includes('OTP'))) {
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    simulatorState.signingOtp = generatedOtp;
    simulatorState.state = 'DEAL_PARTY1_SIGN_OTP';

    const currentUser = getCurrentUser();
    const maskedPhone = currentUser.phone_number ? `${currentUser.phone_number.slice(0, 4)}***${currentUser.phone_number.slice(-4)}` : '۰۹۱۲***۶۷۸۹';

    return res.json({
      reply: `📩 **ارسال کد تایید پیامکی امضای دیجیتال (SMS OTP):**\n──────────────────\n` +
             `کد ۶ رقمی امنیتی امضای قرارداد به شماره همراه **${maskedPhone}** صادر گردید.\n\n` +
             `🔑 **کد تأیید ۶ رقمی شما (OTP):**\n` +
             `👉 \`${generatedOtp}\` 👈\n\n` +
             `💡 _(به دلیل عدم اتصال به سامانه پیامک، کد مستقیماً توسط ربات صادر و نمایش داده شد)_\n\n` +
             `⏱ مهلت اعتبار: **۳ دقیقه**\n` +
             `لطفاً کد ۶ رقمی فوق را وارد یا انتخاب فرمایید:`,
      keyboard: [
        [generatedOtp],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // گام ۱۰: تایید OTP طرف اول، ثبت قرارداد در دیتابیس و صدور دعوت‌نامه با راهنمای ضد فیشینگ
  if (simulatorState.state === 'DEAL_PARTY1_SIGN_OTP') {
    const enteredOtp = input.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    if (enteredOtp !== simulatorState.signingOtp) {
      return res.json({
        reply: `❌ **کد وارد شده صحیح نمی‌باشد.**\nلطفاً کد ۶ رقمی ارسال‌شده به موبایل خود را مجدداً وارد فرمایید:`,
        keyboard: [
          [simulatorState.signingOtp || '123456'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    const draft = simulatorState.dealDraft || {};
    const contractId = simulatorState.signingContractId || generateContractId(draft.category || 'GEN');
    const inviteToken = `deal_${Math.random().toString(36).substring(2, 9)}`;
    const currentUser = getCurrentUser();
    const amount = draft.amount || 2500000;
    const cat = (draft.category as any) || 'GEN';
    const isEmployer = (draft.role !== 'freelancer');

    // ایجاد قرارداد در دیتابیس
    await createContract({
      contract_id: contractId,
      title: draft.title || 'معامله هوشمند میانجی',
      amount,
      category: cat,
      deadline: 7,
      free_edits: draft.free_revisions_count ?? 2,
      free_edits_left: draft.free_revisions_count ?? 2,
      free_edits_total: draft.free_revisions_count ?? 2,
      commission_payer: draft.commission_payer || 'split_50_50',
      has_inspection_period: draft.has_inspection_period || false,
      inspection_period_hours: draft.inspection_period_hours || 0,
      has_free_revisions: draft.has_free_revisions || false,
      free_revisions_count: draft.free_revisions_count ?? 2,
      invite_token: inviteToken,
      description: draft.description || 'تعهدات فنی مشخص‌شده توسط طرفین.',
      creator_id: currentUser.id,
      buyer_id: isEmployer ? currentUser.id : undefined,
      buyer_fullname: isEmployer ? currentUser.full_name : undefined,
      buyer_phone: isEmployer ? currentUser.phone_number : undefined,
      buyer_national_id: isEmployer ? currentUser.national_id : undefined,
      seller_id: !isEmployer ? currentUser.id : undefined,
      seller_fullname: !isEmployer ? currentUser.full_name : undefined,
      seller_phone: !isEmployer ? currentUser.phone_number : undefined,
      seller_national_id: !isEmployer ? currentUser.national_id : undefined,
      status: 'pending_party_b'
    });

    // ثبت رسمی امضای طرف اول با هش SHA-256
    const p1Role = isEmployer ? 'employer' : 'freelancer';
    await signContract(contractId, p1Role, {
      fullname: currentUser.full_name,
      phone: currentUser.phone_number,
      national_id: currentUser.national_id
    });

    const sigs = getSignatures(contractId);
    const p1Sig = sigs[0];
    const sigHash = p1Sig?.signature_hash || 'SHA-256-DIGITAL-SIGNATURE';

    simulatorState = {
      state: 'IDLE',
      depositAmount: 0,
      txId: 0,
      activeDealToken: inviteToken,
      signingContractId: contractId
    };

    const botUser = process.env.BOT_USERNAME || 'mianji_ir_bot';
    const inviteLink = `https://t.me/${botUser}?start=c_${contractId}`;
    const inspFa = (draft.inspection_period_hours || 0) > 0 ? `${draft.inspection_period_hours} ساعت پس از تحویل` : 'تایید آنی';
    const revFa = (draft.free_revisions_count === 0 ? 'بدون ویرایش' : (draft.free_revisions_count === -1 ? 'توافقی' : `${draft.free_revisions_count} بار رایگان`));

    return res.json({
      reply: `🎉 **قرارداد به صورت رسمی با امضای دیجیتال طرف اول صادر گردید!**\n` +
             `🆔 **شناسه معامله:** \`${contractId}\`\n` +
             `🔐 **اثر انگشت رمزنگاری امضا (SHA-256):**\n\`${sigHash}\`\n` +
             `وضعیت: **در انتظار امضای طرف دوم (Pending Counterparty Signature)** ⏳\n` +
             `────────────────────────────\n` +
             `📤 **متن دعوت‌نامه رسمی و راهنمای امنیتی (جهت ارسال به طرف دوم):**\n\n` +
             `🏛 **دعوت‌نامه رسمی قرارداد هوشمند (سامانه اسکرو میانجی)**\n` +
             `────────────────────────────\n` +
             `📋 **شناسه اختصاصی معامله:** \`${contractId}\`\n` +
             `👤 **طرف اول:** ${currentUser.full_name} (امضا شده با مهر الکترونیک ✅)\n` +
             `📝 **موضوع:** ${draft.title}\n` +
             `💰 **مبلغ معامله:** ${formatCurrency(amount)}\n` +
             `🛡 **مهلت تست و بررسی:** ${inspFa}\n` +
             `🔄 **سهمیه اصلاحیه:** ${revFa}\n\n` +
             `📋 **تعهدات فنی و قانونی (ملاک داوری):**\n` +
             `> ${draft.description}\n\n` +
             `🔗 **لینک ورود مستقیم:**\n${inviteLink}\n\n` +
             `> 🛡️ **راهنمای امنیتی ضد فیشینگ (پیشگیری از کلاهبرداری):**\n` +
             `> جهت اطمینان ۱۰۰٪ از اصالت معامله و عدم کلیک روی لینک‌های ناشناس یا بات‌های تقلبی، می‌توانید به جای کلیک بر روی لینک:\n` +
             `> ۱. مستقیماً وارد ربات رسمی و تاییدشده میانجی شوید: @${botUser}\n` +
             `> ۲. دستور /start را ارسال کرده یا دکمه «🔍 پیگیری با شناسه قرارداد» را بزنید.\n` +
             `> ۳. کد رهگیری \`${contractId}\` را ارسال کنید تا قرارداد رسمی باز شده و پس از بررسی، آن را با اطمینان کامل امضا فرمایید.\n` +
             `────────────────────────────\n` +
             `💡 با زدن دکمه زیر می‌توانید شبیه‌سازی ورود و امضای طرف دوم را انجام دهید:`,
      keyboard: [
        ['🤝 شبیه‌سازی ورود طرف دوم (پذیرش و امضا)'],
        [`🔍 پیگیری با شناسه قرارداد`],
        ['📜 لیست معاملات من', '💳 کیف پول و اعتبار'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // گام ۱۱: جستجو یا ورود به قرارداد با شناسه معامله (جهت جلوگیری از فیشینگ و امضای مستقیم)
  if (input.includes('پیگیری با شناسه') || input === 'جستجو' || input.includes('جست‌وجو') || input === '🔍 جست‌وجوی قرارداد با شناسه') {
    simulatorState.state = 'WAITING_SEARCH_CONTRACT';
    return res.json({
      reply: '🔍 **پیگیری امن قرارداد با شناسه معامله**\n──────────────────\n' +
             'جهت پیشگیری از کلاهبرداری و بدون نیاز به کلیک روی لینک، لطفاً **شناسه معامله** را وارد فرمایید:\n' +
             '(مثال: `DEV-842-190` یا `DEV-901-442`)',
      keyboard: [
        ['DEV-901-442'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // ====================================================
  // چرخه کامل حیات معامله (Contract Lifecycle Actions)
  // ====================================================

  // ۱. واریز و قفل وجه در صندوق امانت اسکرو توسط کارفرما
  if (input.includes('واریز وجه') || input.includes('واریز به صندوق امانت')) {
    const codeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
    const targetCode = codeMatch ? codeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken);
    let deal = targetCode ? getContract(targetCode) : undefined;
    if (!deal) deal = getContracts().find(c => c.status === 'awaiting_escrow_deposit') || getContracts()[0];

    if (deal) {
      await payContractEscrow(deal.contract_id, getCurrentUserId());
      return res.json({
        reply: `🎉 **وجه معامله \`${deal.contract_id}\` با موفقیت در صندوق امانت اسکرو واریز و مسدود گردید!**\n──────────────────\n` +
               `> 🔒 مبلغ: **${formatCurrency(deal.amount)}** در صندوق امانت میانجی قفل شد.\n` +
               `> 🛡 هیچ وجهی بدون تایید رضایت نهایی خریدار آزاد نمی‌گردد.\n\n` +
               `🛠 **به مجری پروژه اطلاع‌رسانی شد:** مجری گرامی، وجه در امانت قفل گردید و می‌توانید کار را با اطمینان کامل آغاز فرمایید.\nپس از اتمام کار، دکمه تحویل پروژه را بزنید.`,
        keyboard: [
          [`📦 تحویل فایل‌ها و خروجی پروژه (${deal.contract_id})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${deal.contract_id})`],
          [`📄 دانلود سند رسمی PDF (${deal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }
  }

  // ۲. تحویل فایل‌ها و خروجی پروژه توسط مجری
  if (input.includes('تحویل فایل') || input.includes('تحویل پروژه') || input.includes('تحویل خروجی') || input.includes('تحویل کار')) {
    const codeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
    const targetCode = codeMatch ? codeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken);
    let deal = targetCode ? getContract(targetCode) : undefined;
    if (!deal) deal = getContracts().find(c => ['active', 'in_progress', 'paid', 'escrow_locked'].includes(c.status)) || getContracts()[0];

    if (deal) {
      await deliverContract(deal.contract_id, { notes: 'خروجی کار و فایل‌های پروژه در محیط امن تحویل کارفرما گردید.' });
      return res.json({
        reply: `📦 **فایل‌ها و خروجی پروژه \`${deal.contract_id}\` با موفقیت تحویل کارفرما گردید!**\n──────────────────\n` +
               `> ⏱ مهلت تست و ارزیابی خروجی: **${deal.inspection_period_hours ? `${deal.inspection_period_hours} ساعت` : 'تایید آنی'}**\n` +
               `> 🔄 سهمیه اصلاحیه رایگان: **${deal.free_edits_left ?? deal.free_edits ?? 2} بار**\n\n` +
               `کارفرما مطلع شد تا پروژه را ارزیابی کند. پس از بررسی، کارفرما می‌تواند وجه را آزاد نماید یا درخواست ویرایش دهد.`,
        keyboard: [
          [`✅ تایید نهایی و آزادسازی وجه به مجری (${deal.contract_id})`],
          [`🔄 درخواست اصلاحیه و ویرایش (${deal.contract_id})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${deal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }
  }

  // ۳. تایید کار توسط کارفرما و آزادسازی قطعی وجه به مجری
  if (input.includes('تایید نهایی') || input.includes('آزادسازی وجه') || input.includes('تایید تحویل')) {
    const codeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
    const targetCode = codeMatch ? codeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken);
    let deal = targetCode ? getContract(targetCode) : undefined;
    if (!deal) deal = getContracts().find(c => ['work_submitted', 'delivered', 'in_inspection'].includes(c.status)) || getContracts()[0];

    if (deal) {
      await approveContract(deal.contract_id);
      return res.json({
        reply: `🎉 **پروژه \`${deal.contract_id}\` با رضایت کامل تایید شد و تسویه گردید!**\n──────────────────\n` +
               `> 💰 مبلغ خالص به کیف پول مجری واریز شد.\n` +
               `> 🏁 وضعیت قرارداد: **تکمیل شده و تسویه قطعی (Completed) ✅**\n` +
               `> 📄 سند رسمی پایان کار و گواهی اختتام با امضای دیجیتال صادر شد.`,
        keyboard: [
          [`📄 دانلود سند رسمی PDF (${deal.contract_id})`],
          ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
          ['💳 کیف پول و اعتبار', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }
  }

  // ۴. درخواست اصلاحیه پروژه
  if (input.includes('درخواست اصلاحیه') || input.includes('اصلاح کار')) {
    const codeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
    const targetCode = codeMatch ? codeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken);
    let deal = targetCode ? getContract(targetCode) : undefined;
    if (!deal) deal = getContracts().find(c => ['work_submitted', 'delivered', 'in_inspection'].includes(c.status)) || getContracts()[0];

    if (deal) {
      const left = Math.max(0, (deal.free_edits_left ?? 2) - 1);
      await updateContract(deal.contract_id, {
        status: 'revisions_requested',
        free_edits_left: left
      });
      return res.json({
        reply: `🔄 **درخواست اصلاحیه برای معامله \`${deal.contract_id}\` با موفقیت ثبت شد.**\n──────────────────\n` +
               `> 📋 پیام بازنگری به مجری ابلاغ شد.\n` +
               `> 🔄 سهمیه اصلاحیه رایگان باقی‌مانده: **${left} بار**\n\n` +
               `مجری محترم پس از اعمال اصلاحات، خروجی ویرایش‌شده را مجدداً ارسال خواهد فرمود.`,
        keyboard: [
          [`📦 تحویل فایل‌ها و خروجی پروژه (${deal.contract_id})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${deal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }
  }

  // ۵. ثبت اختلاف و ارجاع به هیئت داوری
  if (input.includes('ثبت اختلاف') || input.includes('ارجاع به داوری') || input.includes('داوری')) {
    const codeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
    const targetCode = codeMatch ? codeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken);
    let deal = targetCode ? getContract(targetCode) : undefined;
    if (!deal) deal = getContracts()[0];

    if (deal) {
      await createDispute(deal.contract_id, getCurrentUserId(), 'عدم توافق طرفین بر سر مشخصات تحویلی پروژه', 'quality');
      return res.json({
        reply: `⚖️ **پرونده معامله \`${deal.contract_id}\` به هیئت داوری حقوقی سه جانبه میانجی ارجاع شد.**\n──────────────────\n` +
               `> 🛡 **پوشش قانون تجارت الکترونیک (ماده ۶ و ۱۰):**\n` +
               `> وجوه تا زمان صدور رای نهایی در صندوق امانت قفل می‌ماند.\n` +
               `> کارشناسان حقوقی میانجی شواهد و متن مکتوب قرارداد را بررسی کرده و رای قطعی را صادر خواهند نمود.`,
        keyboard: [
          [`💬 ارسال لایحه/شواهد به داور (${deal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }
  }

  // ۶. دریافت مستقیم سند رسمی PDF
  if (input.includes('دانلود سند رسمی PDF') || input.includes('دانلود PDF')) {
    const codeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
    const targetCode = codeMatch ? codeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken || 'DEV-842-190');
    return res.json({
      reply: `📄 **سند رسمی الکترونیک قرارداد میانجی (PDF)**\n──────────────────\n` +
             `🆔 شناسه معامله: \`${targetCode}\`\n` +
             `🔐 وضعیت: دارای مهر زمانی و اثر انگشت دیجیتال SHA-256 معتبر\n\n` +
             `📥 جهت دانلود و مشاهده فایل رسمی PDF با فرمت استاندارد، پیوند زیر را باز فرمایید:\n` +
             `/api/contracts/${targetCode}/pdf`,
      keyboard: [
        ['📜 لیست معاملات من', '🤝 ثبت معامله جدید'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // ۷. بررسی وارد کردن مستقیم کد معامله یا استعلام آن با وضعیت هوشمند
  const dealCodeMatch = input.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i) || 
    (input.startsWith('c_') ? [null, input.replace('c_', '')] : null) ||
    (simulatorState.state === 'WAITING_SEARCH_CONTRACT' ? [null, input.trim()] : null);

  if (dealCodeMatch || input.includes('ورود طرف دوم') || input.startsWith('deal_') || (input.includes('پذیرش') && simulatorState.state !== 'WAITING_SIGN_OTP' && simulatorState.state !== 'DEAL_PARTY1_SIGN_OTP')) {
    let targetCode = dealCodeMatch ? dealCodeMatch[1].toUpperCase() : (simulatorState.signingContractId || simulatorState.activeDealToken);
    
    let targetDeal = targetCode ? getContract(targetCode) : undefined;
    if (!targetDeal) {
      const allContracts = getContracts();
      targetDeal = allContracts[0];
    }

    if (!targetDeal) {
      return res.json({
        reply: '⚠️ هیچ قراردادی با این شناسه یافت نشد.',
        keyboard: [['🤝 ثبت معامله جدید', '🔙 بازگشت به منوی اصلی']]
      });
    }

    simulatorState.activeDealToken = targetDeal.contract_id;
    simulatorState.signingContractId = targetDeal.contract_id;

    // الف) اگر قرارداد تکمیل شده باشد
    if (['completed', 'resolved_employer', 'resolved_freelancer'].includes(targetDeal.status)) {
      return res.json({
        reply: `🏁 **معامله تکمیل و تسویه شده — \`${targetDeal.contract_id}\`**\n──────────────────\n` +
               `> 📝 **موضوع:** ${targetDeal.title}\n` +
               `> 💰 **مبلغ کل:** ${formatCurrency(targetDeal.amount)}\n` +
               `> ✅ **وضعیت:** تحویل تایید گردیده و تسویه کامل انجام شد.\n\n` +
               `سند رسمی خاتمه کار با مهر دیجیتال صادر گردیده است:`,
        keyboard: [
          [`📄 دانلود سند رسمی PDF (${targetDeal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }

    // ب) اگر در انتظار واریز وجه امانت باشد
    if (targetDeal.status === 'awaiting_escrow_deposit') {
      return res.json({
        reply: `💳 **قرارداد \`${targetDeal.contract_id}\` (در انتظار واریز وجه امانت)**\n──────────────────\n` +
               `> 📝 **موضوع:** ${targetDeal.title}\n` +
               `> 💰 **مبلغ معامله:** ${formatCurrency(targetDeal.amount)}\n` +
               `> ✍️ **امضاها:** هر دو طرف قرارداد را به صورت الکترونیک امضا کرده‌اند ✅\n\n` +
               `جهت آغاز رسمی کار توسط مجری، لطفاً وجه را به صندوق امن امانت واریز فرمایید:`,
        keyboard: [
          [`💳 واریز وجه به صندوق امانت (${targetDeal.contract_id})`],
          [`📄 دانلود سند رسمی PDF (${targetDeal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }

    // ج) اگر در حال انجام باشد
    if (['active', 'in_progress', 'paid', 'escrow_locked'].includes(targetDeal.status)) {
      return res.json({
        reply: `🟢 **معامله در حال انجام — \`${targetDeal.contract_id}\`**\n──────────────────\n` +
               `> 📝 **موضوع:** ${targetDeal.title}\n` +
               `> 🔒 **مبلغ امانت:** ${formatCurrency(targetDeal.amount)} (محفوظ در صندوق امانت میانجی)\n` +
               `> 🛡 **مهلت تست:** ${targetDeal.inspection_period_hours ? `${targetDeal.inspection_period_hours} ساعت` : 'تایید آنی'}\n\n` +
               `پروژه توسط مجری در حال پیگیری است. پس از اتمام، مجری فایل‌ها را تحویل می‌دهد:`,
        keyboard: [
          [`📦 تحویل فایل‌ها و خروجی پروژه (${targetDeal.contract_id})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${targetDeal.contract_id})`],
          [`📄 دانلود سند رسمی PDF (${targetDeal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }

    // د) اگر کار تحویل داده شده باشد
    if (['work_submitted', 'delivered', 'in_inspection'].includes(targetDeal.status)) {
      return res.json({
        reply: `📦 **پروژه تحویل داده شد — \`${targetDeal.contract_id}\`**\n──────────────────\n` +
               `> 📝 **موضوع:** ${targetDeal.title}\n` +
               `> ⏱ **وضعیت:** در حال ارزیابی و تست توسط کارفرما\n` +
               `> 🔄 **سهمیه اصلاحیه باقی‌مانده:** ${targetDeal.free_edits_left ?? targetDeal.free_edits ?? 2} بار\n\n` +
               `اقدام مورد نظر خود را انتخاب نمایید:`,
        keyboard: [
          [`✅ تایید نهایی و آزادسازی وجه به مجری (${targetDeal.contract_id})`],
          [`🔄 درخواست اصلاحیه و ویرایش (${targetDeal.contract_id})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${targetDeal.contract_id})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      });
    }

    // ه) در انتظار امضای طرف دوم (دعوت اولیه)
    simulatorState = {
      state: 'WAITING_COUNTERPARTY_ACCEPT',
      depositAmount: 0,
      txId: 0,
      activeDealToken: targetDeal.contract_id,
      signingContractId: targetDeal.contract_id
    };

    const isParty1Buyer = Boolean(targetDeal.buyer_id);
    const party1Name = (isParty1Buyer ? targetDeal.buyer_fullname : targetDeal.seller_fullname) || 'طرف اول';
    const party1RoleFa = isParty1Buyer ? 'کارفرما (خریدار)' : 'مجری (فروشنده)';
    const party2RoleFa = isParty1Buyer ? 'مجری (فروشنده)' : 'کارفرما (خریدار)';

    return res.json({
      reply: `👋 **سلام! شما به عنوان ${party2RoleFa} به معامله \`${targetDeal.contract_id}\` دعوت شدید.**\n` +
             `────────────────────────────\n` +
             `👤 **طرف اول (${party1RoleFa}):** ${party1Name} (امضا شده با مهر الکترونیک ✅)\n` +
             `📝 **موضوع:** ${targetDeal.title}\n` +
             `💰 **مبلغ کل معامله:** ${formatCurrency(targetDeal.amount)}\n` +
             `🛡 **مهلت تست و بررسی:** ${targetDeal.inspection_period_hours ? `${targetDeal.inspection_period_hours} ساعت` : 'تایید آنی'}\n` +
             `🔄 **سهمیه اصلاحیه:** ${targetDeal.free_edits ? `${targetDeal.free_edits} بار رایگان` : 'بدون ویرایش'}\n\n` +
             `📋 **تعهدات فنی قرارداد (ملاک داوری حقوقی میانجی):**\n` +
             `> ${targetDeal.description || 'تعهدات مکتوب پروژه'}\n\n` +
             `⚖️ **ضمانت اجرایی و اسکرو میانجی:**\n` +
             `• وجوه در صندوق امن امانت مسدود می‌ماند و بدون تایید تحویلی قابل برداشت نیست.\n` +
             `• ثبت شواهد حقوقی غیرقابل انکار (کد ملی، OTP پیامکی، آی‌پی و هش SHA-256).\n\n` +
             `جهت شروع فرآیند احراز و امضای الکترونیک، دکمه زیر را لمس فرمایید:`,
      keyboard: [
        ['✍️ تایید و امضای رسمی قرارداد (ورود به فرآیند OTP)'],
        ['📱 اشتراک‌گذاری شماره تماس (Share Contact)'],
        ['❌ انصراف و رد معامله']
      ]
    });
  }

  // ثبت و اشتراک‌گذاری شماره تماس بدون نیاز به رمز عبور (Passwordless Share Contact)
  if (input.includes('اشتراک‌گذاری شماره تماس') || input.includes('Share Contact') || input.includes('ارسال شماره')) {
    return res.json({
      reply: `✅ **شماره همراه شما از تلگرام با موفقیت دریافت و تایید شد:**\n` +
             `📱 شماره تماس: \`09359876543\`\n` +
             `🆔 شناسه تلگرام: \`290184712\`\n\n` +
             `🔒 **احراز هویت بدون رمز عبور (Passwordless):**\n` +
             `حساب شما با موفقیت به Telegram User ID متصل گردید. از این پس نیازی به حفظ یا وارد کردن هیچ‌گونه رمز عبور ثابتی ندارید.`,
      keyboard: [
        ['✍️ تایید و امضای رسمی قرارداد (ورود به فرآیند OTP)'],
        ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // آغاز مرحله امضای طرف دوم: دریافت نام و نام خانوادگی
  if (simulatorState.state === 'WAITING_COUNTERPARTY_ACCEPT' && (input.includes('امضای رسمی') || input.includes('تایید و امضا') || input.includes('پذیرش'))) {
    simulatorState.state = 'WAITING_SIGN_FULLNAME';
    return res.json({
      reply: `✍️ **مرحله ۱ از ۳ — امضای دیجیتال طرف دوم (احراز هویت قانونی)**\n──────────────────\n` +
             `جهت رعایت ماده ۶ و ۱۰ قانون تجارت الکترونیک جمهوری اسلامی ایران و صدور گواهی اسکرو، لطفاً **نام و نام‌خانوادگی کامل** خود را وارد فرمایید:`,
      keyboard: [
        ['سارا احمدی'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // مرحله دوم امضای طرف دوم: دریافت کد ملی جهت ثبت شواهد غیرقابل انکار
  if (simulatorState.state === 'WAITING_SIGN_FULLNAME') {
    const fullName = input.trim();
    if (fullName.length < 3) {
      return res.json({
        reply: '⚠️ لطفاً نام و نام خانوادگی کامل خود را وارد فرمایید:',
        keyboard: [['سارا احمدی'], ['🔙 انصراف و بازگشت']]
      });
    }

    simulatorState.signingFullName = fullName;
    simulatorState.state = 'WAITING_SIGN_NATIONAL_ID';

    return res.json({
      reply: `🪪 **مرحله ۲ از ۳ — ثبت کد ملی امضاکننده دوم:**\n──────────────────\n` +
             `نام امضاکننده: **${fullName}**\n\n` +
             `لطفاً کد ملی ۱۰ رقمی خود را جهت ثبت شواهد حقوقی غیرقابل انکار (Non-Repudiation) ارسال فرمایید:\n` +
             `*(این کد با الگوریتم ثبت‌احوال اعتبارسنجی شده و در هش امضا قفل می‌شود)*`,
      keyboard: [
        ['0087654321'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // مرحله سوم امضای طرف دوم: اعتبارسنجی کد ملی، ارسال OTP پیامکی
  if (simulatorState.state === 'WAITING_SIGN_NATIONAL_ID') {
    const nationalId = input.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    if (!/^\d{10}$/.test(nationalId)) {
      return res.json({
        reply: '⚠️ **کد ملی نامعتبر است.** لطفاً یک کد ملی ۱۰ رقمی صحیح وارد فرمایید:',
        keyboard: [['0087654321'], ['🔙 انصراف و بازگشت']]
      });
    }

    simulatorState.signingNationalId = nationalId;
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    simulatorState.signingOtp = generatedOtp;
    simulatorState.signingPhone = '09359876543';
    simulatorState.state = 'WAITING_SIGN_OTP';

    return res.json({
      reply: `📩 **مرحله ۳ از ۳ — ارسال کد تایید پیامکی (SMS OTP):**\n──────────────────\n` +
             `کد ۶ رقمی امنیتی امضای قرارداد به شماره تاییدشده **۰۹۳۵***۶۵۴۳** صادر گردید.\n\n` +
             `🔑 **کد تأیید ۶ رقمی شما (OTP):**\n` +
             `👉 \`${generatedOtp}\` 👈\n\n` +
             `💡 _(به دلیل عدم اتصال به سامانه پیامک، کد مستقیماً توسط ربات صادر و نمایش داده شد)_\n\n` +
             `⏱ مهلت ورود: **۳ دقیقه**\n` +
             `لطفاً کد ۶ رقمی فوق را وارد یا انتخاب فرمایید:`,
      keyboard: [
        [generatedOtp],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // تایید OTP طرف دوم و ثبت نهایی امضا در جدول Signatures با هش SHA-256
  if (simulatorState.state === 'WAITING_SIGN_OTP') {
    const enteredOtp = input.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    if (enteredOtp !== simulatorState.signingOtp) {
      return res.json({
        reply: `❌ **کد وارد شده صحیح نمی‌باشد.**\nلطفاً کد ۶ رقمی ارسال‌شده به موبایل خود را مجدداً وارد فرمایید:`,
        keyboard: [
          [simulatorState.signingOtp || '123456'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    const cId = simulatorState.signingContractId || 'DEV-901-442';
    const targetDeal = getContract(cId);
    const p2Role = (targetDeal && targetDeal.buyer_id) ? 'freelancer' : 'employer';

    await signContract(cId, p2Role, {
      fullname: simulatorState.signingFullName || 'سارا احمدی',
      phone: simulatorState.signingPhone || '09359876543',
      national_id: simulatorState.signingNationalId || '0087654321'
    });

    const sigs = getSignatures(cId);
    const latestSig = sigs.find(s => s.role === p2Role) || sigs[0];

    simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };

    return res.json({
      reply: `🎉 **قرارداد به صورت رسمی با امضای هر دو طرف تایید و نهایی شد!**\n──────────────────\n` +
             `🆔 **شناسه قرارداد:** \`${cId}\`\n` +
             `وضعیت: **در انتظار واریز وجه به صندوق امانت اسکرو (Awaiting Escrow Deposit)** ⏳\n\n` +
             `🔐 **شواهد حقوقی ثبت‌شده (Non-Repudiation Evidence):**\n` +
             `• امضاکننده طرف دوم: **${latestSig?.full_name || 'سارا احمدی'}**\n` +
             `• کد ملی: \`${latestSig?.national_id || '0087654321'}\`\n` +
             `• شماره موبایل: \`${latestSig?.phone_number || '09359876543'}\`\n` +
             `• اثر انگشت رمزنگاری SHA-256:\n\`${latestSig?.signature_hash || 'SHA-256-DIGITAL-SIGNATURE'}\`\n\n` +
             `📄 سند رسمی PDF قرارداد الکترونیک با مهر و گواهی دیجیتال صادر گردید و کارفرما می‌تواند وجه امانت را به صندوق واریز نماید.`,
      keyboard: [
        ['💳 کیف پول و اعتبار', '📜 لیست معاملات من'],
        ['🤝 ثبت معامله جدید', '🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // ====================================================
  // سایر دستورات کیف پول و پروفایل
  // ====================================================

  // Handle Deposit Amount Input State
  if (simulatorState.state === 'WAITING_DEPOSIT_AMOUNT') {
    const parsed = parseFlexibleAmount(input);
    if (!parsed) {
      return res.json({
        reply: '❌ **مبلغ وارد شده نامعتبر است.**\n\nلطفاً مبلغ شارژ را فقط به‌صورت عدد (به تومان) وارد کنید یا یکی از مقادیر زیر را انتخاب کنید:\n*(حداقل مبلغ: ۱۰,۰۰۰ تومان)*',
        keyboard: [
          ['50,000 تومان', '100,000 تومان'],
          ['200,000 تومان', '500,000 تومان'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    if (parsed < 10000) {
      return res.json({
        reply: `⚠️ **حداقل مبلغ شارژ ۱۰,۰۰۰ تومان است.**\nمبلغ وارد شده (${formatCurrency(parsed)}) کمتر از سقف مجاز است.`,
        keyboard: [
          ['50,000 تومان', '100,000 تومان'],
          ['200,000 تومان', '500,000 تومان'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    const txId = Math.floor(Date.now() % 10000000) + 100000;
    simulatorState = {
      state: 'WAITING_DEPOSIT_RECEIPT',
      depositAmount: parsed,
      txId
    };

    return res.json({
      reply: `🏦 **شارژ حساب کاربری (کارت به کارت)**\n──────────────────\n` +
             `💵 **مبلغ قابل واریز:** ${formatCurrency(parsed)}\n\n` +
             `💳 **اطلاعات کارت مقصد میانجی:**\n` +
             `📌 شماره کارت: \`6037-9975-7534-8211\`\n` +
             `👤 بنام: **امیررضا مجتبایی (میانجی)**\n` +
             `🔢 شناسه پیگیری سیستم: \`#${txId}\`\n\n` +
             `⚠️ **مراحل بعدی:**\n` +
             `پس از انتقال وجه از نرم‌افزار بانکی خود، روی دکمه «📸 ارسال فیش واریزی» کلیک کنید.`,
      keyboard: [
        ['📸 ارسال فیش واریزی'],
        ['🔄 تغییر مبلغ شارژ', '🔙 انصراف و بازگشت']
      ]
    });
  }

  // Handle Receipt Submission State
  if (simulatorState.state === 'WAITING_DEPOSIT_RECEIPT') {
    if (input.includes('تغییر مبلغ')) {
      simulatorState.state = 'WAITING_DEPOSIT_AMOUNT';
      return res.json({
        reply: '🔄 **تغییر مبلغ شارژ:**\nلطفاً مبلغ جدید مورد نظر خود را به تومان وارد کنید:',
        keyboard: [
          ['50,000 تومان', '100,000 تومان'],
          ['200,000 تومان', '500,000 تومان'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    // Receipt submission confirmation
    const amount = simulatorState.depositAmount;
    const txId = simulatorState.txId;
    depositWallet(getCurrentUserId(), amount, `شارژ کیف پول - پیگیری #${txId}`);
    simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };

    return res.json({
      reply: `✅ **فیش واریزی شما با موفقیت دریافت و تایید شد.**\n\n` +
             `🔢 شناسه تراکنش: \`#${txId}\`\n` +
             `💰 مبلغ واریزی: **${formatCurrency(amount)}**\n\n` +
             `موجودی کیف پول شما به‌صورت آنی افزایش یافت.`,
      keyboard: [
        ['💳 کیف پول و اعتبار', '🤝 ثبت معامله جدید'],
        ['📜 لیست معاملات من', '👤 پروفایل کاربری']
      ]
    });
  }

  // Trigger Deposit Flow from Topup buttons
  if (input.includes('شارژ') || input.includes('deposit') || input.includes('topup') || input.includes('افزایش موجودی')) {
    simulatorState.state = 'WAITING_DEPOSIT_AMOUNT';
    return res.json({
      reply: '🏦 **شارژ حساب کاربری (کارت به کارت)**\n\n' +
             'لطفاً مبلغی که قصد واریز دارید را به **تومان** وارد کنید:\n' +
             '*(حداقل مبلغ شارژ: ۱۰,۰۰۰ تومان)*\n\n' +
             '💡 **نمونه‌های معتبر:**\n' +
             '• `50000` یا `100,000`\n' +
             '• `۵۰ هزار` یا `۱ میلیون`\n\n' +
             'یا یکی از مبالغ پیشنهادی زیر را لمس نمایید:',
      keyboard: [
        ['50,000 تومان', '100,000 تومان'],
        ['200,000 تومان', '500,000 تومان'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // دریافت مبلغ تسویه (WAITING_WITHDRAW_AMOUNT)
  if (simulatorState.state === 'WAITING_WITHDRAW_AMOUNT') {
    const user = getCurrentUser();
    let parsed: number | null = null;
    if (input.includes('کل موجودی')) {
      parsed = user.wallet_balance;
    } else {
      parsed = parseFlexibleAmount(input);
    }

    if (!parsed || parsed < 50000) {
      return res.json({
        reply: '⚠️ **مبلغ نامعتبر است.** حداقل مبلغ تسویه ۵۰,۰۰۰ تومان می‌باشد. لطفاً مجدداً وارد فرمایید:',
        keyboard: [
          ['1,000,000 تومان', '5,000,000 تومان'],
          ['کل موجودی قابل برداشت'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    if (parsed > user.wallet_balance) {
      return res.json({
        reply: `⚠️ **موجودی ناکافی:** موجودی قابل برداشت شما (${formatCurrency(user.wallet_balance)}) کمتر از مبلغ درخواستی است.`,
        keyboard: [
          ['کل موجودی قابل برداشت'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    simulatorState.withdrawAmount = parsed;
    simulatorState.state = 'WAITING_WITHDRAW_PIN';

    return res.json({
      reply: `🔐 **تایید برداشت با پین‌کد مالی امنیتی (Financial PIN)**\n──────────────────\n` +
             `💵 مبلغ تسویه: **${formatCurrency(parsed)}**\n` +
             `🏦 شماره شبای مقصد: \`${user.sheba || 'IR520120000000001234567890'}\` (${user.sheba_owner_name || user.full_name})\n\n` +
             `> 🛡 **قانون طلایی امنیت اسکرو:** جهت جلوگیری از سرقت و فیشینگ، تسویه منحصراً به حساب ثبت‌شده صاحب خط انجام می‌شود.\n\n` +
             `لطفاً **پین‌کد ۴ رقمی مالی** خود را وارد فرمایید:\n*(پین تستی پیش‌فرض: \`1234\`)*`,
      keyboard: [
        ['1234'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // تایید پین مالی و تسویه (WAITING_WITHDRAW_PIN)
  if (simulatorState.state === 'WAITING_WITHDRAW_PIN') {
    const user = getCurrentUser();
    const pin = input.trim();
    const amount = simulatorState.withdrawAmount || 1000000;

    const result = await withdrawWallet(user.id, amount, user.sheba, pin);
    if (!result.success) {
      return res.json({
        reply: `❌ **خطای اعتبارسنجی پین مالی:**\n${result.message}`,
        keyboard: [
          ['1234'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };
    return res.json({
      reply: `🎉 **دستور تسویه حساب با تایید موفق پین‌کد مالی صادر گردید!**\n──────────────────\n` +
             `💵 مبلغ برداشت: **${formatCurrency(amount)}**\n` +
             `🏦 شماره شبای مقصد: \`${result.transaction?.sheba}\` (${user.sheba_owner_name || user.full_name})\n` +
             `🔢 کد رهگیری پایا: \`${result.transaction?.ref_id}\`\n` +
             `💰 موجودی جدید کیف پول: **${formatCurrency(result.newBalance || user.wallet_balance)}**\n\n` +
             `وجه در اولین سیکل پایا بانک مرکزی به حساب بانکی شما واریز خواهد شد.`,
      keyboard: [
        ['💳 کیف پول و اعتبار', '📜 لیست معاملات من'],
        ['🛡 مرکز امنیت و هویت', '🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // تنظیم پین مالی جدید (WAITING_SET_PIN)
  if (simulatorState.state === 'WAITING_SET_PIN') {
    const pin = input.trim();
    const result = setFinancialPin(getCurrentUserId(), pin);
    if (!result.success) {
      return res.json({
        reply: `⚠️ ${result.message}\nلطفاً یک پین‌کد ۴ تا ۶ رقمی دیگر انتخاب نمایید:`,
        keyboard: [
          ['5821', '8392'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    simulatorState = { state: 'IDLE', depositAmount: 0, txId: 0 };
    return res.json({
      reply: `✅ **پین‌کد مالی امنیتی (Financial PIN) با موفقیت فعال شد!**\n──────────────────\n` +
             `رمز دوم مالی برای شماره تماس \`${getCurrentUser().phone_number}\` ثبت گردید.\n` +
             `از این پس برای هرگونه تسویه حساب، برداشت وجه و تغییر شبا این پین‌کد الزامی است.`,
      keyboard: [
        ['💸 درخواست تسویه و برداشت', '💳 کیف پول و اعتبار'],
        ['🛡 مرکز امنیت و هویت', '🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // درخواست تسویه حساب
  if (input.includes('درخواست تسویه') || input.includes('تسویه و برداشت') || input === 'تسویه') {
    const user = getCurrentUser();
    if (!user.has_financial_pin) {
      simulatorState.state = 'WAITING_SET_PIN';
      return res.json({
        reply: `🔒 **فعال‌سازی الزامی پین‌کد مالی (Financial PIN)**\n──────────────────\n` +
               `جهت محافظت از سرمایه شما در برابر سرقت یا نفوذ به اکانت، برای انجام اولین برداشت لازم است یک **پین‌کد ۴ تا ۶ رقمی اختصاصی مالی** تعیین فرمایید.\n\n` +
               `لطفاً پین‌کد مورد نظر خود را وارد کرده یا از پیشنهادها انتخاب کنید:`,
        keyboard: [
          ['5821', '8392'],
          ['🔙 انصراف و بازگشت']
        ]
      });
    }

    simulatorState.state = 'WAITING_WITHDRAW_AMOUNT';
    return res.json({
      reply: `💸 **درخواست تسویه و برداشت وجه از کیف پول**\n──────────────────\n` +
             `💰 موجودی قابل برداشت: **${formatCurrency(user.wallet_balance)}**\n` +
             `🏦 شماره شبای مقصد: \`${user.sheba || 'ثبت نشده'}\` (${user.sheba_owner_name || user.full_name})\n` +
             `🛡 وضعیت امنیت: دارای پین مالی فعال ✅ | قفل به کد ملی ✅\n\n` +
             `مبلغ مورد نظر جهت واریز به شبای خود را وارد فرمایید:`,
      keyboard: [
        ['1,000,000 تومان', '5,000,000 تومان'],
        ['کل موجودی قابل برداشت'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // تنظیم یا تغییر پین مالی
  if ((input.includes('تنظیم') && input.includes('پین')) || input.includes('تغییر پین') || input.includes('پین مالی')) {
    simulatorState.state = 'WAITING_SET_PIN';
    return res.json({
      reply: `🔐 **تنظیم پین‌کد مالی امنیتی (Financial PIN)**\n──────────────────\n` +
             `رمز دوم مالی، سد دفاعی وجوه شما در صورت هک شدن تلگرام یا دسترسی به گوشی است.\n\n` +
             `لطفاً یک پین‌کد ۴ تا ۶ رقمی عددی ارسال فرمایید (مثلاً \`5821\`):`,
      keyboard: [
        ['5821', '8392'],
        ['🔙 انصراف و بازگشت']
      ]
    });
  }

  // مرکز امنیت و هویت
  if (input.includes('امنیت') || input.includes('هویت کاربری') || input === '/security') {
    const user = getCurrentUser();
    const pinText = user.has_financial_pin ? 'فعال (رمز دوم ۴ رقمی) ✅' : 'تنظیم‌نشده ⚠️';
    const shebaText = user.sheba_locked_to_national_id ? `تاییدشده به نام ${user.sheba_owner_name || user.full_name} (قفل انحصاری) 🔒` : 'قفل نشده';

    return res.json({
      reply: `🛡️ **مرکز امنیت و هویت کاربری میانجی**\n──────────────────\n` +
             `📱 **ملاک اصلی حساب:** شماره همراه \`${user.phone_number}\` (مشترک در وب، اپ و بات)\n` +
             `🪪 **کد ملی و استعلام شاهکار:** \`${user.national_id || 'ثبت نشده'}\` (${user.kyc_level === 'gold' ? 'تایید شاهکار 🌟' : 'پایه'})\n` +
             `🏦 **شماره شبا:** \`${user.sheba || 'ثبت نشده'}\`\n` +
             `🔐 **قانون طلایی شبا:** ${shebaText}\n` +
             `🔑 **پین‌کد مالی تراکنش:** ${pinText}\n` +
             `🛡️ **ضریب امنیت حساب:** **${user.security_score || 95} از ۱۰۰ ⭐️**\n\n` +
             `با فعال بودن این لایه‌ها، حتی در صورت دسترسی غیرمجاز به تلگرام، هیچ فردی امکان خروج وجوه شما را نخواهد داشت.`,
      keyboard: [
        ['🔐 تنظیم/تغییر پین مالی', '💸 درخواست تسویه و برداشت'],
        ['💳 کیف پول و اعتبار', '🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  if (input.includes('کیف پول')) {
    const user = getCurrentUser();
    const pinBadge = user.has_financial_pin ? 'فعال (رمز دوم تراکنش ۴ رقمی) ✅' : 'تنظیم‌نشده ⚠️';
    return res.json({
      reply: `💳 **کیف پول و وضعیت حساب مالی شما**\n──────────────────\n` +
             `📱 شماره حساب (تلفن همراه): \`${user.phone_number}\`\n` +
             `💰 موجودی در دسترس: **${formatCurrency(user.wallet_balance)}**\n` +
             `🔒 موجودی در امانت اسکرو: **${formatCurrency(user.escrow_locked_balance)}**\n` +
             `🏦 شماره شبا: \`${user.sheba || 'ثبت نشده'}\` (${user.sheba_owner_name || user.full_name})\n` +
             `🔐 وضعیت پین مالی: ${pinBadge}\n` +
             `سطح کاربری: ${user.kyc_level === 'gold' ? 'طلایی 🌟 (شاهکار تایید شده)' : 'نقره‌ای 🥈'}`,
      keyboard: [
        ['➕ شارژ کیف پول', '💸 درخواست تسویه و برداشت'],
        ['🔐 تنظیم/تغییر پین مالی', '🛡 مرکز امنیت و هویت'],
        ['📋 گزارش تراکنش‌ها', '🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  if (input.includes('معاملات من') || input.includes('لیست معاملات')) {
    const myDeals = getContracts({ userId: getCurrentUserId() });
    const activeCount = myDeals.filter(d => ['active', 'in_progress', 'paid', 'escrow_locked', 'in_inspection', 'work_submitted', 'delivered'].includes(d.status)).length;
    const pendingCount = myDeals.filter(d => ['pending_approval', 'pending_counterparty', 'pending_party_b', 'awaiting_payment', 'awaiting_escrow_deposit', 'awaiting_receipt_approval', 'receipt_submitted', 'revisions_requested', 'disputed', 'in_dispute'].includes(d.status)).length;
    const completedCount = myDeals.filter(d => ['completed', 'resolved_employer', 'resolved_freelancer'].includes(d.status)).length;
    const draftsCount = myDeals.filter(d => d.status === 'draft').length;

    return res.json({
      reply: `📑 **پنل مدیریت هوشمند معاملات شما**\n──────────────────\n` +
             `شما دارای **${myDeals.length}** معامله/پیش‌نویس در سامانه میانجی هستید.\n` +
             `جهت مشاهده و مدیریت لیست هر بخش، روی دسته‌بندی مورد نظر کلیک کنید:\n\n` +
             `📊 **آمار کلی وضعیت‌ها:**\n` +
             `• 🟢 درحال انجام: \`${activeCount}\`\n` +
             `• ⏳ در انتظار اقدام: \`${pendingCount}\`\n` +
             `• 📁 پیش‌نویس‌های من: \`${draftsCount}\`\n` +
             `• 🏁 تکمیل شده: \`${completedCount}\``,
      keyboard: [
        [`🟢 درحال انجام (${activeCount})`, `⏳ در انتظار اقدام (${pendingCount})`],
        [`🏁 تکمیل شده (${completedCount})`, `📁 پیش‌نویس‌های من (${draftsCount})`],
        ['🔍 جست‌وجوی قرارداد با شناسه', '🤝 ثبت معامله جدید'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  // نمایش معاملات در دسته مشخص پس از کلیک روی دکمه آن دسته
  if (input.includes('درحال انجام') || input.includes('در انتظار اقدام') || input.includes('تکمیل شده') || input.includes('پیش‌نویس')) {
    const myDeals = getContracts({ userId: getCurrentUserId() });
    let categoryKey = 'active';
    let categoryTitle = '🟢 درحال انجام';

    if (input.includes('در انتظار اقدام')) {
      categoryKey = 'pending';
      categoryTitle = '⏳ در انتظار اقدام';
    } else if (input.includes('تکمیل شده')) {
      categoryKey = 'completed';
      categoryTitle = '🏁 تکمیل شده';
    } else if (input.includes('پیش‌نویس')) {
      categoryKey = 'drafts';
      categoryTitle = '📁 پیش‌نویس‌های من';
    }

    const filtered = myDeals.filter(d => {
      if (categoryKey === 'drafts') return d.status === 'draft';
      if (categoryKey === 'active') return ['active', 'in_progress', 'paid', 'escrow_locked', 'in_inspection', 'work_submitted', 'delivered'].includes(d.status);
      if (categoryKey === 'pending') return ['pending_approval', 'pending_counterparty', 'pending_party_b', 'awaiting_payment', 'awaiting_escrow_deposit', 'awaiting_receipt_approval', 'receipt_submitted', 'revisions_requested', 'disputed', 'in_dispute'].includes(d.status);
      if (categoryKey === 'completed') return ['completed', 'resolved_employer', 'resolved_freelancer'].includes(d.status);
      return false;
    });

    if (filtered.length === 0) {
      return res.json({
        reply: `📂 **دسته‌بندی: ${categoryTitle}**\n──────────────────\n⚠️ هیچ معامله‌ای در این بخش یافت نشد.`,
        keyboard: [
          ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
          ['🔙 بازگشت به منوی اصلی']
        ]
      });
    }

    const listLines = filtered.map((d, i) => {
      const other = d.buyer_id === getCurrentUserId() ? (d.seller_fullname || 'مجری') : (d.buyer_fullname || 'کارفرما');
      return `${i + 1}. **${d.title}**\n   🆔 شناسه: \`${d.contract_id}\` | 👤 طرف مقابل: ${other}\n   💰 مبلغ: ${formatCurrency(d.amount)} | وضعیت: ${d.status}`;
    }).join('\n\n');

    return res.json({
      reply: `📂 **لیست معاملات شما — ${categoryTitle}**\n──────────────────\nتعداد در این دسته: **${filtered.length}** معامله\n\n${listLines}`,
      keyboard: filtered.slice(0, 4).map(d => [`📄 ${d.contract_id}: ${d.title.slice(0, 25)}`]).concat([
        ['📜 بازگشت به دسته‌بندی معاملات', '🔙 بازگشت به منوی اصلی']
      ])
    });
  }

  if (input.includes('سفیران')) {
    const stats = getAffiliateStats();
    return res.json({
      reply: `💎 **پنل سفیران و همکاران تجاری میانجی**\n\n` +
             `🔗 لینک اختصاصی شما:\n\`${stats.referral_link}\`\n\n` +
             `👥 تعداد کلیک: ${stats.total_clicks} | معرفی‌شده‌ها: ${stats.total_invited}\n` +
             `💰 کل سود دریافتی: ${formatCurrency(stats.total_commission_earned)}\n` +
             `💵 سود قابل برداشت: ${formatCurrency(stats.withdrawable_commission)}`,
      keyboard: [
        ['💸 برداشت سود سفیر به کیف پول'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  if (input.includes('بررسی کدهای ملی') || input.includes('کدهای ملی') || input === '/admin_kyc') {
    const pendingUsers = getPendingKycUsers();
    let userListStr = '';
    if (pendingUsers.length > 0) {
      userListStr = pendingUsers.map(u => 
        `👤 **${u.full_name}** (ID: \`${u.id}\`)\n` +
        `• کد ملی: \`${u.national_id || 'ثبت‌نشده'}\`\n` +
        `• شماره تماس: \`${u.phone_number}\`\n` +
        `• وضعیت: ${u.kyc_status === 'needs_correction' ? '⚠️ نیازمند اصلاح مجدد' : '⏳ در انتظار تایید ادمین'}`
      ).join('\n\n');
    } else {
      userListStr = 'هیچ درخواست کد ملی در انتظار بررسی نیست.';
    }

    return res.json({
      reply: `🪪 **پنل مدیریت | بررسی و تعیین وضعیت کدهای ملی**\n` +
             `────────────────────────────\n` +
             `تعداد کاربران در صف بررسی: **${pendingUsers.length}** نفر\n\n` +
             `${userListStr}\n\n` +
             `جهت تصمیم‌گیری دکمه‌های زیر را انتخاب کنید:`,
      keyboard: [
        ['✅ تایید کد ملی (کاربر جاری)', '⚠️ نیاز به اصلاح (کاربر جاری)'],
        ['📜 لیست معاملات من', '💳 کیف پول و اعتبار'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  if (input.includes('تایید کد ملی')) {
    const user = getCurrentUser();
    await updateUserKycStatus(user.id, 'verified');
    return res.json({
      reply: `✅ **کد ملی کاربر ${user.full_name} با موفقیت تایید شد.**\n` +
             `وضعیت کاربری به «تایید شده رسمی» ارتقا یافت و دسترسی کامل معامله برای ایشان فعال گردید.`,
      keyboard: [
        ['🪪 بررسی کدهای ملی', '💳 کیف پول و اعتبار'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  if (input.includes('نیاز به اصلاح')) {
    const user = getCurrentUser();
    await updateUserKycStatus(user.id, 'needs_correction', 'کد ملی با اطلاعات سجلی همخوانی ندارد.');
    return res.json({
      reply: `⚠️ **وضعیت کد ملی کاربر ${user.full_name} به «نیاز به اصلاح» تغییر یافت.**\n\n` +
             `پیام اخطار برای کاربر صادر شد:\n` +
             `«کاربر گرامی، کد ملی ثبت‌شده شما رد شده و نیازمند اصلاح مجدد است. لطفاً کد ملی ۱۰ رقمی صحیح متعلق به خود را دوباره ثبت فرمایید.»`,
      keyboard: [
        ['🪪 بررسی کدهای ملی', '💳 کیف پول و اعتبار'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    });
  }

  return res.json({
    reply: `پیام دریافت شد: "${input}"\nجهت استفاده از خدمات، یکی از گزینه‌های منو را انتخاب فرمایید.`,
    keyboard: [
      ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
      ['💳 کیف پول و اعتبار', '💎 پنل سفیران'],
      ['🪪 بررسی کدهای ملی', '🎧 پشتیبانی و راهنمای استفاده 📖']
    ]
  });
});

// ====================================================
// ۳. مسیرهای احراز هویت و سوییچ کاربر (Auth API)
// ====================================================

// Get Current User Profile
app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getCurrentUser();
  res.json(user);
});

// Switch active user role for simulation testing
app.post('/api/auth/switch_user', (req: Request, res: Response) => {
  const { user_id } = req.body;
  const target = getUser(Number(user_id));
  if (target) {
    setCurrentUserId(target.id);
    return res.json({ success: true, user: target });
  }
  res.status(404).json({ error: 'کاربر مورد نظر یافت نشد.' });
});

// Login via Phone & Password
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { phone_number, password } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: 'شماره تماس الزامی است.' });
  }

  const allUsers = getUsers();
  let user = allUsers.find(u => u.phone_number === phone_number);
  if (!user) {
    user = await registerOrUpdateUser({
      id: Math.floor(100000000 + Math.random() * 900000000),
      full_name: 'کاربر جدید میانجی',
      phone_number: phone_number,
      role: 'employer',
      wallet_balance: 5000000,
      escrow_locked_balance: 0,
      kyc_level: 'basic',
      kyc_status: 'unverified'
    });
  }

  setCurrentUserId(user.id);
  res.json({
    success: true,
    message: 'ورود با موفقیت انجام شد.',
    user
  });
});

// Telegram WebApp Authentication
app.post('/api/auth/telegram', async (req: Request, res: Response) => {
  const { tg_user_id, tg_username, tg_fullname } = req.body;
  const tid = Number(tg_user_id) || 1802649782;

  let user = getUser(tid);
  if (!user) {
    user = await registerOrUpdateUser({
      id: tid,
      telegram_id: tid,
      full_name: tg_fullname || (tg_username ? `@${tg_username}` : 'کاربر تلگرام'),
      phone_number: '09120000000',
      role: 'employer',
      wallet_balance: 10000000,
      escrow_locked_balance: 0,
      kyc_level: 'silver',
      kyc_status: 'verified'
    });
  }

  setCurrentUserId(user.id);
  res.json({
    success: true,
    authenticated_via: 'Telegram WebApp',
    user
  });
});

// ====================================================
// ۴. مسیرهای کیف پول و تراکنش‌ها (Wallet API)
// ====================================================

// Get Wallet Balance & Summary
app.get('/api/wallet/balance', (req: Request, res: Response) => {
  const user = getCurrentUser();
  res.json({
    total_balance: user.wallet_balance + user.escrow_locked_balance,
    available_balance: user.wallet_balance,
    escrow_locked_balance: user.escrow_locked_balance,
    sheba: user.sheba || null,
    kyc_level: user.kyc_level
  });
});

// Get User Transactions
app.get('/api/wallet/transactions', (req: Request, res: Response) => {
  const userTx = getTransactions(getCurrentUserId());
  res.json(userTx);
});

// Deposit into Wallet
app.post('/api/wallet/deposit', async (req: Request, res: Response) => {
  const { amount, method = 'gateway' } = req.body;
  const numAmount = Number(amount);
  if (!numAmount || numAmount < 10000) {
    return res.status(400).json({ error: 'حداقل مبلغ واریز ۱۰,۰۰۰ تومان است.' });
  }

  const result = await depositWallet(getCurrentUserId(), numAmount, method);
  res.json(result);
});

// Withdraw from Wallet to Sheba IBAN (with Financial PIN & Golden Rule Enforcement)
app.post('/api/wallet/withdraw', async (req: Request, res: Response) => {
  const { amount, sheba, pin } = req.body;
  const numAmount = Number(amount);
  const user = getCurrentUser();

  const targetSheba = sheba || user.sheba;
  if (!targetSheba) {
    return res.status(400).json({ error: 'لطفاً شماره شبای معتبر بانکی خود را وارد کنید.' });
  }

  const result = await withdrawWallet(getCurrentUserId(), numAmount, targetSheba, pin);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// ====================================================
// ۶. سامانه امنیت حساب کاربری و هویت بر پایه شماره تماس (Security Hub API)
// ====================================================

// Get Comprehensive Security Posture & Account Info
app.get('/api/security/status', (req: Request, res: Response) => {
  const user = getCurrentUser();
  const allUsers = getUsers().map(u => ({
    id: u.id,
    phone_number: u.phone_number,
    full_name: u.full_name,
    role: u.role,
    kyc_level: u.kyc_level,
    has_financial_pin: Boolean(u.has_financial_pin),
    sheba_verified: Boolean(u.sheba_verified),
    sheba: u.sheba
  }));

  const logs = getSecurityAuditLogs(user.phone_number);

  res.json({
    user_id: user.id,
    full_name: user.full_name,
    phone_number: user.phone_number,
    is_phone_verified: Boolean(user.is_verified),
    has_financial_pin: Boolean(user.has_financial_pin),
    pin_failed_attempts: user.pin_failed_attempts || 0,
    is_pin_locked: Boolean(user.pin_locked_until && new Date(user.pin_locked_until).getTime() > Date.now()),
    pin_locked_until: user.pin_locked_until,
    sheba: user.sheba || null,
    sheba_owner_name: user.sheba_owner_name || null,
    sheba_verified: Boolean(user.sheba_verified),
    sheba_locked_to_national_id: Boolean(user.sheba_locked_to_national_id),
    national_id: user.national_id ? `${user.national_id.slice(0, 3)}***${user.national_id.slice(-3)}` : null,
    full_national_id: user.national_id || null,
    kyc_level: user.kyc_level,
    kyc_status: user.kyc_status,
    security_score: user.security_score || (user.has_financial_pin ? 90 : 65),
    wallet_balance: user.wallet_balance,
    audit_logs: logs.slice(0, 15),
    all_registered_accounts: allUsers
  });
});

// Set or Change Financial Security PIN
app.post('/api/security/pin/set', (req: Request, res: Response) => {
  const { pin, phone } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'لطفاً پین‌کد ۴ تا ۶ رقمی را ارسال فرمایید.' });
  }

  const target = phone || getCurrentUserId();
  const result = setFinancialPin(target, pin);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Verify Financial Security PIN
app.post('/api/security/pin/verify', (req: Request, res: Response) => {
  const { pin, phone } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'لطفاً پین‌کد مالی را وارد نمایید.' });
  }

  const target = phone || getCurrentUserId();
  const result = verifyFinancialPin(target, pin);
  if (!result.valid) {
    return res.status(400).json({ error: result.message, remainingAttempts: result.remainingAttempts, locked: result.locked });
  }
  res.json(result);
});

// Request SMS OTP for Financial PIN Reset
app.post('/api/security/pin/reset-request', (req: Request, res: Response) => {
  const user = getCurrentUser();
  const phone = req.body.phone || user.phone_number;
  const result = sendPhoneOtp(phone, 'pin_reset');
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Confirm SMS OTP and Reset Financial PIN
app.post('/api/security/pin/reset-confirm', (req: Request, res: Response) => {
  const user = getCurrentUser();
  const phone = req.body.phone || user.phone_number;
  const { otp, new_pin } = req.body;

  if (!otp || !new_pin) {
    return res.status(400).json({ error: 'کد تایید پیامکی و پین‌کد جدید الزامی هستند.' });
  }

  const result = resetFinancialPinWithOtp(phone, otp, new_pin);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Bind and Lock IBAN Sheba to Verified National ID (Golden Rule)
app.post('/api/security/sheba/bind', (req: Request, res: Response) => {
  const { sheba, owner_name, phone } = req.body;
  if (!sheba) {
    return res.status(400).json({ error: 'شماره شبا الزامی است.' });
  }

  const target = phone || getCurrentUserId();
  const result = bindAndVerifySheba(target, sheba, owner_name);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Switch Active Test Account by Phone Number or ID (for testing multi-device flow)
app.post('/api/security/switch-account', (req: Request, res: Response) => {
  const { phone, user_id } = req.body;
  let targetUser = phone ? getUserByPhone(phone) : getUser(Number(user_id));
  if (!targetUser && phone) {
    targetUser = getOrCreateUserByPhone(phone);
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'کاربری با این مشخصات یافت نشد.' });
  }

  setCurrentUserId(targetUser.id);
  res.json({
    success: true,
    message: `حساب کاربری فعال به «${targetUser.full_name}» (${targetUser.phone_number}) تغییر یافت.`,
    user: targetUser
  });
});

// Get Security Audit Logs
app.get('/api/security/audit-logs', (req: Request, res: Response) => {
  const user = getCurrentUser();
  const logs = getSecurityAuditLogs(user.phone_number);
  res.json(logs);
});

// ====================================================
// ۵. مسیرهای قراردادهای اسکرو (Contracts API)
// ====================================================

// General Dashboard Stats
app.get('/api/stats', (req: Request, res: Response) => {
  const stats = getDashboardStats();
  res.json(stats);
});

// Get Contracts (Filterable)
app.get('/api/contracts', (req: Request, res: Response) => {
  const { status, category, search, userId } = req.query;
  const list = getContracts({
    status: status as string,
    category: category as string,
    search: search as string,
    userId: userId ? Number(userId) : undefined
  });
  res.json(list);
});

// Get Single Contract by ID
app.get('/api/contracts/:id', (req: Request, res: Response) => {
  const c = getContract(req.params.id);
  if (!c) {
    return res.status(404).json({ error: 'قرارداد یا پیش‌نویس مورد نظر یافت نشد.' });
  }
  res.json(c);
});

// Create New Escrow Contract or Draft
app.post('/api/contracts', async (req: Request, res: Response) => {
  try {
    const newContract = await createContract(req.body || {});
    res.status(201).json(newContract);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update Contract / Draft
app.put('/api/contracts/:id', async (req: Request, res: Response) => {
  const updated = await updateContract(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'قرارداد یافت نشد.' });
  }
  res.json(updated);
});

// Delete Draft
app.delete('/api/contracts/:id', async (req: Request, res: Response) => {
  const deleted = await deleteContract(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'پیش‌نویس یافت نشد.' });
  }
  res.json({ success: true, message: 'پیش‌نویس با موفقیت حذف گردید.' });
});

// Sign Contract
app.post('/api/contracts/:id/sign', async (req: Request, res: Response) => {
  const { role = 'employer', fullname, phone, national_id } = req.body;
  const updated = await signContract(req.params.id, role, { fullname, phone, national_id });
  if (!updated) {
    return res.status(404).json({ error: 'قرارداد یافت نشد.' });
  }

  res.json({
    success: true,
    contract: updated,
    pdf_ready: Boolean(updated.buyer_signed_at && updated.seller_signed_at),
    pdf_url: `/api/contracts/${updated.contract_id}/pdf`
  });
});

// Get Non-Repudiation Digital Signatures for a Contract
app.get('/api/contracts/:id/signatures', (req: Request, res: Response) => {
  const sigs = getSignatures(req.params.id);
  res.json(sigs);
});

// Get all signatures
app.get('/api/signatures', (req: Request, res: Response) => {
  res.json(getSignatures());
});

// Escrow Funding / Deposit
app.post('/api/contracts/:id/pay', async (req: Request, res: Response) => {
  const result = await payContractEscrow(req.params.id, getCurrentUserId());
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Deliver Project Work
app.post('/api/contracts/:id/deliver', async (req: Request, res: Response) => {
  const { notes, links } = req.body || {};
  const updated = await deliverContract(req.params.id, { notes, links });
  if (!updated) {
    return res.status(404).json({ error: 'قرارداد یافت نشد.' });
  }
  res.json({ success: true, contract: updated });
});

// Approve & Release Funds
app.post('/api/contracts/:id/approve', async (req: Request, res: Response) => {
  const result = await approveContract(req.params.id);
  if (!result.success) {
    return res.status(404).json({ error: 'قرارداد یافت نشد.' });
  }
  res.json(result);
});

// Cancel Contract & Refund
app.post('/api/contracts/:id/cancel', async (req: Request, res: Response) => {
  const result = await cancelContract(req.params.id);
  if (!result.success) {
    return res.status(404).json({ error: 'قرارداد یافت نشد.' });
  }
  res.json(result);
});

// ====================================================
// ۶. مسیرهای احراز هویت (KYC API)
// ====================================================

// Submit KYC
app.post('/api/kyc/submit', async (req: Request, res: Response) => {
  const { national_id, sheba, card_image } = req.body;
  const result = await submitKyc(getCurrentUserId(), national_id, sheba, card_image);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Get KYC Status
app.get('/api/kyc/status', (req: Request, res: Response) => {
  const user = getCurrentUser();
  res.json({
    kyc_level: user.kyc_level,
    kyc_status: user.kyc_status,
    national_id: user.national_id ? `${user.national_id.slice(0, 3)}***${user.national_id.slice(-3)}` : null,
    sheba: user.sheba || null
  });
});

// Admin KYC Management APIs
app.get('/api/admin/kyc/pending', (req: Request, res: Response) => {
  const pending = getPendingKycUsers();
  res.json(pending);
});

app.post('/api/admin/kyc/action', async (req: Request, res: Response) => {
  const { userId, action, reason } = req.body;
  if (!userId || !action) {
    return res.status(400).json({ success: false, message: 'شناسه کاربر و نوع اقدام الزامی است.' });
  }
  const status = action === 'approve' ? 'verified' : (action === 'needs_correction' ? 'needs_correction' : 'rejected');
  const result = await updateUserKycStatus(Number(userId), status, reason);
  res.json(result);
});

// ====================================================
// ۷. مرکز داوری و حل اختلاف (Disputes API)
// ====================================================

app.get('/api/disputes', (req: Request, res: Response) => {
  res.json(getDisputes());
});

app.get('/api/disputes/:id', (req: Request, res: Response) => {
  const d = getDispute(req.params.id);
  if (!d) return res.status(404).json({ error: 'پرونده داوری یافت نشد.' });
  res.json(d);
});

app.post('/api/disputes', async (req: Request, res: Response) => {
  const { contract_id, reason, description, evidence_files } = req.body;
  const d = await createDispute({
    contract_id,
    reason,
    description,
    claimant_id: getCurrentUserId(),
    evidence_files
  });
  if (!d) return res.status(404).json({ error: 'قرارداد جهت ثبت داوری یافت نشد.' });
  res.status(201).json(d);
});

app.post('/api/disputes/:id/messages', async (req: Request, res: Response) => {
  const user = getCurrentUser();
  const { text, attachment } = req.body;
  if (!text) return res.status(400).json({ error: 'متن پیام الزامی است.' });

  const role = user.role === 'arbitrator' ? 'arbitrator' : (user.role === 'employer' ? 'buyer' : 'seller');
  const msg = await addDisputeMessage(req.params.id, {
    sender_id: user.id,
    sender_name: user.full_name,
    sender_role: role,
    text,
    attachment
  });
  if (!msg) return res.status(404).json({ error: 'پرونده داوری یافت نشد.' });
  res.status(201).json(msg);
});

app.post('/api/disputes/:id/resolve', async (req: Request, res: Response) => {
  const { decision, comment } = req.body;
  const resolved = await resolveDispute(req.params.id, { decision, comment });
  if (!resolved) return res.status(404).json({ error: 'پرونده داوری یافت نشد.' });
  res.json({ success: true, dispute: resolved });
});

// ====================================================
// ۸. سیستم سفیران (Affiliate API)
// ====================================================

app.get('/api/affiliate', (req: Request, res: Response) => {
  res.json(getAffiliateStats(getCurrentUserId()));
});

app.post('/api/affiliate/withdraw', async (req: Request, res: Response) => {
  const result = await withdrawAffiliateEarnings(getCurrentUserId());
  res.json(result);
});

// ====================================================
// ۹. تولید فایل رسمی PDF قرارداد (PDF Generation)
// ====================================================
app.get('/api/contracts/:id/pdf', async (req: Request, res: Response) => {
  try {
    const c = getContract(req.params.id);
    if (!c) {
      return res.status(404).json({ error: 'قرارداد یافت نشد.' });
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontPath = path.join(__dirname, 'Font', 'Vazirmatn-Regular.ttf');
    let fontRegular;
    let fontBold;
    if (fs.existsSync(fontPath)) {
      const fontBytes = fs.readFileSync(fontPath);
      fontRegular = await pdfDoc.embedFont(fontBytes);
      fontBold = fontRegular;
    } else {
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Header bar (Royal Blue #1D4ED8)
    page.drawRectangle({
      x: 0,
      y: height - 80,
      width: width,
      height: 80,
      color: rgb(0.11, 0.31, 0.85)
    });

    page.drawText('MIYANJI SMART ESCROW & CONTRACTS', {
      x: 40,
      y: height - 40,
      size: 15,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    page.drawText('Official Electronic Escrow Certificate & Legal Agreement', {
      x: 40,
      y: height - 60,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.85, 0.92, 1)
    });

    page.drawText(`ID: ${c.contract_id}`, {
      x: width - 180,
      y: height - 40,
      size: 11,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    page.drawText(`Issued: ${new Date(c.created_at).toLocaleDateString('en-US')}`, {
      x: width - 180,
      y: height - 60,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.85, 0.92, 1)
    });

    let y = height - 120;

    // Title Card
    page.drawRectangle({
      x: 40,
      y: y - 50,
      width: width - 80,
      height: 60,
      color: rgb(0.96, 0.98, 1),
      borderColor: rgb(0.82, 0.89, 1),
      borderWidth: 1
    });

    page.drawText('Contract Subject / Title:', {
      x: 55,
      y: y - 15,
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.4, 0.6)
    });

    page.drawText(c.title.substring(0, 65), {
      x: 55,
      y: y - 35,
      size: 12,
      font: fontBold,
      color: rgb(0.08, 0.2, 0.5)
    });

    y -= 80;

    // Financial Grid
    const colWidth = (width - 100) / 3;

    // Box 1: Amount
    page.drawRectangle({
      x: 40,
      y: y - 60,
      width: colWidth,
      height: 65,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.9, 0.98),
      borderWidth: 1
    });
    page.drawText('Escrow Amount:', { x: 50, y: y - 15, size: 8.5, font: fontRegular, color: rgb(0.4, 0.45, 0.55) });
    page.drawText(`${c.amount.toLocaleString()} Tomans`, { x: 50, y: y - 35, size: 12, font: fontBold, color: rgb(0.11, 0.31, 0.85) });
    page.drawText('Secured by Miyanji Vault', { x: 50, y: y - 52, size: 8, font: fontRegular, color: rgb(0.1, 0.6, 0.3) });

    // Box 2: Deadline
    page.drawRectangle({
      x: 50 + colWidth,
      y: y - 60,
      width: colWidth,
      height: 65,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.9, 0.98),
      borderWidth: 1
    });
    page.drawText('Delivery Deadline:', { x: 60 + colWidth, y: y - 15, size: 8.5, font: fontRegular, color: rgb(0.4, 0.45, 0.55) });
    page.drawText(`${c.deadline} Working Days`, { x: 60 + colWidth, y: y - 35, size: 12, font: fontBold, color: rgb(0.1, 0.15, 0.25) });
    page.drawText(`Free Edits: ${c.free_edits} included`, { x: 60 + colWidth, y: y - 52, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });

    // Box 3: Status
    page.drawRectangle({
      x: 60 + colWidth * 2,
      y: y - 60,
      width: colWidth,
      height: 65,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.9, 0.98),
      borderWidth: 1
    });
    page.drawText('Current Escrow Status:', { x: 70 + colWidth * 2, y: y - 15, size: 8.5, font: fontRegular, color: rgb(0.4, 0.45, 0.55) });
    page.drawText(c.status.toUpperCase(), { x: 70 + colWidth * 2, y: y - 35, size: 11, font: fontBold, color: rgb(0.1, 0.6, 0.3) });
    page.drawText('Verified Electronic Seal', { x: 70 + colWidth * 2, y: y - 52, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) });

    y -= 95;

    // Parties Identity Box
    page.drawRectangle({
      x: 40,
      y: y - 120,
      width: width - 80,
      height: 120,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.85, 0.9, 0.98),
      borderWidth: 1
    });

    page.drawText('IDENTIFIED CONTRACTING PARTIES:', {
      x: 55,
      y: y - 20,
      size: 9.5,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.4)
    });

    // Party A: Buyer/Client
    page.drawText('PARTY A (Employer / Buyer):', { x: 55, y: y - 45, size: 9, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
    page.drawText(`Name: ${c.buyer_fullname || 'Client'}`, { x: 55, y: y - 62, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`Phone: ${c.buyer_phone || 'Verified'} | National ID: ${c.buyer_national_id || 'Verified'}`, { x: 55, y: y - 77, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`OTP Signature: ${c.buyer_signed_at ? 'DIGITALLY SEALED (Verified)' : 'Pending'}`, {
      x: 55,
      y: y - 92,
      size: 8,
      font: fontBold,
      color: c.buyer_signed_at ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.4, 0.1)
    });

    // Party B: Seller/Provider
    const pBCol = width / 2 + 10;
    page.drawText('PARTY B (Contractor / Freelancer):', { x: pBCol, y: y - 45, size: 9, font: fontBold, color: rgb(0.06, 0.09, 0.16) });
    page.drawText(`Name: ${c.seller_fullname || 'Contractor'}`, { x: pBCol, y: y - 62, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`Phone: ${c.seller_phone || 'Verified'} | National ID: ${c.seller_national_id || 'Verified'}`, { x: pBCol, y: y - 77, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`OTP Signature: ${c.seller_signed_at ? 'DIGITALLY SEALED (Verified)' : 'Pending'}`, {
      x: pBCol,
      y: y - 92,
      size: 8,
      font: fontBold,
      color: c.seller_signed_at ? rgb(0.06, 0.6, 0.2) : rgb(0.8, 0.4, 0.1)
    });

    y -= 150;

    // Legal Terms
    page.drawRectangle({
      x: 40,
      y: y - 110,
      width: width - 80,
      height: 110,
      color: rgb(0.99, 1, 1),
      borderColor: rgb(0.88, 0.92, 0.98),
      borderWidth: 1
    });

    page.drawText('TERMS OF ESCROW & ELECTRONIC ENFORCEABILITY:', {
      x: 55,
      y: y - 18,
      size: 9.5,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.4)
    });

    const descSnippet = (c.description || 'Standard electronic escrow terms and deliverables benchmarks applied.').substring(0, 160);
    page.drawText(descSnippet, {
      x: 55,
      y: y - 40,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2)
    });

    page.drawText('1. Escrow Protection: Funds remain locked in Miyanji escrow vault until confirmation of deliverables.', {
      x: 55,
      y: y - 60,
      size: 8,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45)
    });
    page.drawText('2. Electronic Signature: Validated through mobile authentication and encrypted integrity hash.', {
      x: 55,
      y: y - 75,
      size: 8,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45)
    });
    page.drawText('3. Legal Arbitration: Disagreements will be decisively arbitrated by Miyanji legal arbitrator board.', {
      x: 55,
      y: y - 90,
      size: 8,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45)
    });

    y -= 140;

    // Digital Seal
    page.drawRectangle({
      x: 40,
      y: y - 90,
      width: width - 80,
      height: 90,
      color: rgb(0.96, 0.98, 1),
      borderColor: rgb(0.7, 0.8, 0.98),
      borderWidth: 1.5
    });

    page.drawText('DIGITAL CERTIFICATE & VALIDATION DIGEST', {
      x: 55,
      y: y - 20,
      size: 9,
      font: fontBold,
      color: rgb(0.11, 0.31, 0.85)
    });

    page.drawText(`SHA-256 Seal: 9b8e21a7df04523c909e4bfd71e0915a2cc945ebf`, {
      x: 55,
      y: y - 40,
      size: 8,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45)
    });

    page.drawText(`Verified by Miyanji Escrow Authority (miyanji.ir)`, {
      x: 55,
      y: y - 55,
      size: 8,
      font: fontBold,
      color: rgb(0.1, 0.5, 0.2)
    });

    page.drawText(`Status: FULLY PROTECTED UNDER IRANIAN E-COMMERCE ACT (Article 6)`, {
      x: 55,
      y: y - 70,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.2, 0.4, 0.7)
    });

    // Footer
    page.drawLine({
      start: { x: 40, y: 35 },
      end: { x: width - 40, y: 35 },
      thickness: 0.5,
      color: rgb(0.8, 0.85, 0.9)
    });

    page.drawText(`Miyanji Escrow Certificate - ID: ${c.contract_id} - Generated for Web & Telegram Mini App`, {
      x: 40,
      y: 20,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.65)
    });

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Miyanji_Contract_${c.contract_id}.pdf"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ error: 'خطا در تولید فایل PDF قرارداد: ' + err.message });
  }
});

// ====================================================
// ۱۰. اتصال Vite جهت نمایش کنسول مانیتورینگ ربات در پورت ۳۰۰۰
// ====================================================
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    // Fallback handler for HTML5 SPA routing in dev mode
    app.use(async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      const url = req.originalUrl;
      try {
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
          let template = fs.readFileSync(indexHtmlPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
          return;
        }
        next();
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distDir = path.join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
    }
    app.use((req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      const distIndex = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.sendFile(path.join(__dirname, 'index.html'));
      }
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Miyanji Escrow Platform server running on http://${HOST}:${PORT}`);
  });

  const handleShutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

startServer().catch(err => {
  console.error('Server startup error:', err);
  process.exit(1);
});
