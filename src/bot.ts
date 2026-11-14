/**
 * Miyanji Smart Escrow Platform - Telegraf Bot Engine (Node.js & TypeScript)
 * Full implementation of Miyanji Telegram Bot handlers & simulator engine
 */

import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getUser,
  getUserAsync,
  getCurrentUser,
  getCurrentUserId,
  getContracts,
  getContract,
  getTransactions,
  getAffiliateStats,
  formatCurrency,
  getSignatures,
  signContract,
  createContract,
  generateContractId,
  cleanBotUsername,
  makeTelegramLink,
  registerOrUpdateUser,
  normalizeIranianPhone,
  createAndStorePhoneOtp,
} from './db';

export const WEB_APP_URL =
  (process.env.WEB_APP_URL || process.env.WEBAPP_URL || '').trim() ||
  'https://ais-pre-vx4jx5tkaqeelhynnssugo-581273460261.europe-west2.run.app';

export const APP_URL = (process.env.APP_URL || '').trim();

export const WEBSITE_REGISTER_WEBHOOK_URL =
  (process.env.WEBSITE_REGISTER_WEBHOOK_URL || '').trim() ||
  'https://ais-dev-vx4jx5tkaqeelhynnssugo-581273460261.europe-west2.run.app/api/bot/register-user';

function parseEnvInt(value: string | undefined, fallback: number | null = null): number | null {
  if (!value) return fallback;
  const cleaned = String(value).split('#')[0].trim();
  if (!cleaned) return fallback;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

export const BOT_ENV_CONFIG = {
  ADMIN_ID: parseEnvInt(process.env.ADMIN_ID, 1802649782),
  OWNER_ID: parseEnvInt(process.env.OWNER_ID, parseEnvInt(process.env.ADMIN_ID, 1802649782)),
  MJ_ADMIN: parseEnvInt(process.env.MJ_ADMIN, null),
  MJCHNL: parseEnvInt(process.env.MJCHNL, null),
  MJNOTE: parseEnvInt(process.env.MJNOTE, parseEnvInt(process.env.ARCHIVE_CHANNEL_ID, null)),
  APP_URL,
  WEB_APP_URL,
};


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFile = path.resolve(__dirname, '../bot.log');

function appendBotLog(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (err) {
    console.error('Failed to write to bot.log:', err);
  }
}

export function isValidTelegramToken(token: string | undefined): boolean {
  if (!token) return false;
  const clean = token.trim();
  if (!clean.includes(':')) return false;
  const parts = clean.split(':');
  if (!/^\d+$/.test(parts[0]) || parts[0].length < 6) return false;
  if (!parts[1] || parts[1].length < 20) return false;
  if (parts[0] === '123456789' || parts[1].includes('ABCdefGhIJKlmNo') || clean.toLowerCase().includes('placeholder')) {
    return false;
  }
  return true;
}

export function getTelegramBotToken(): string {
  return (process.env.BOT_TOKEN || '').trim();
}

const botToken = getTelegramBotToken();
const hasValidToken = isValidTelegramToken(botToken);

export const bot = hasValidToken ? new Telegraf(botToken) : null;

// ====================================================
// ۱. کیبوردهای اصلی ربات (Keyboards)
// ====================================================

export const MAIN_KEYBOARD = [
  ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
  ['💳 کیف پول و اعتبار', '💎 پنل سفیران'],
  ['🪪 بررسی کدهای ملی', '🎧 پشتیبانی و راهنمای استفاده 📖']
];

export function buildMainReplyKeyboard() {
  return Markup.keyboard([
    ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
    ['💳 کیف پول و اعتبار', '💎 پنل سفیران'],
    ['🪪 بررسی کدهای ملی', '🎧 پشتیبانی و راهنمای استفاده 📖'],
    ['🔐 دریافت کد ورود به سایت', Markup.button.webApp('ورود به پنل میانجی 🌐', WEB_APP_URL)],
  ]).resize();
}

export function buildMiniAppInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('ورود به پنل میانجی 🌐', WEB_APP_URL)],
  ]);
}

export function buildContactRequestKeyboard() {
  return Markup.keyboard([
    [Markup.button.contactRequest('📱 ارسال و تایید شماره تماس')],
    [Markup.button.webApp('ورود به پنل میانجی 🌐', WEB_APP_URL)],
  ]).resize();
}

function resolveReplyKeyboard(keyboard?: string[][]) {
  if (!keyboard) return undefined;
  if (keyboard === MAIN_KEYBOARD) {
    return buildMainReplyKeyboard();
  }
  return Markup.keyboard(keyboard).resize();
}

// ====================================================
// ۲. منطق مشترک و موتور پاسخگویی ربات (Bot Message Handler)
// ====================================================

export interface BotResponse {
  reply: string;
  keyboard?: string[][];
}

export function handleSimulatorMessage(text: string, userId?: number): BotResponse {
  const clean = text.trim();
  const currentUid = userId || getCurrentUserId();
  const user = getUser(currentUid) || getCurrentUser();

  if (
    clean === '/start' ||
    clean === '/menu' ||
    clean === 'شروع' ||
    clean === 'منو' ||
    clean === '🔙 بازگشت به منوی اصلی' ||
    clean === '🔙 انصراف و بازگشت' ||
    clean === 'بازگشت به منوی اصلی' ||
    clean === 'بازگشت'
  ) {
    return {
      reply: `🤖 **سلام ${user.full_name}!**\n\nبه سامانه جامع واسطه‌گری امن و ثبت قراردادهای رسمی میانجی (Miyanji Escrow) خوش آمدید.\n\nاین سامانه با پوشش صندوق امانت اسکرو، صدور سند رسمی PDF و امضای الکترونیک، امنیت کامل معاملات فریلنسری و تجاری شما را تضمین می‌کند.`,
      keyboard: MAIN_KEYBOARD
    };
  }

  if (clean.includes('کیف پول') || clean.includes('اعتبار')) {
    return {
      reply: `💳 **کیف پول و وضعیت حساب کاربری**\n\n` +
        `👤 دارنده حساب: ${user.full_name}\n` +
        `💰 موجودی در دسترس: ${formatCurrency(user.wallet_balance)}\n` +
        `🔒 موجودی در امانت اسکرو: ${formatCurrency(user.escrow_locked_balance)}\n` +
        `🏦 شماره شبا: ${user.sheba || 'ثبت نشده'}\n` +
        `🪪 سطح احراز هویت: ${user.kyc_level === 'gold' ? 'طلایی 🌟 (شاهکار تایید شده)' : 'نقره‌ای 🥈'}\n\n` +
        `جهت شارژ موجودی یا ثبت درخواست تسویه پایا از گزینه‌های زیر استفاده نمایید.`,
      keyboard: [
        ['➕ شارژ کیف پول', '💸 درخواست تسویه و برداشت'],
        ['📋 گزارش تراکنش‌ها', '🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('شارژ کیف پول')) {
    return {
      reply: `➕ **شارژ کیف پول میانجی**\n\n` +
        `جهت شارژ سریع از طریق درگاه مستقیم بانکی یا ثبت فیش کارت‌به‌کارت:\n\n` +
        `• حداقل مبلغ شارژ: ۱۰,۰۰۰ تومان\n` +
        `• درگاه امن شاپرک با تایید آنی\n\n` +
        `لطفاً مبلغ مورد نظر را در کنسول وب وارد فرمایید یا روی دکمه ورود به درگاه بزنید.`,
      keyboard: [
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('تسویه') || clean.includes('برداشت')) {
    return {
      reply: `💸 **درخواست تسویه و برداشت وجه**\n\n` +
        `موجودی قابل برداشت شما: ${formatCurrency(user.wallet_balance)}\n` +
        `شماره شبا مقصد: ${user.sheba || 'ثبت نشده'}\n` +
        `نام صاحب حساب: ${user.sheba_owner_name || user.full_name}\n\n` +
        `🔒 **امنیت مالی:** طبق قانون طلایی اسکرو، تسویه حساب صرفاً با تایید پین‌کد مالی ۴ رقمی و به شماره شبای متعلق به کد ملی ثبت‌شده انجام می‌شود.`,
      keyboard: [
        ['1234'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('امنیت') || clean.includes('پین') || clean.includes('حفاظت') || clean === '/security') {
    return {
      reply: `🛡 **مرکز جامع امنیت و هویت کاربری میانجی**\n──────────────────\n` +
        `👤 دارنده حساب: ${user.full_name}\n` +
        `📱 شماره تلفن همراه: \`${user.phone_number}\` (ملاک واحد هویت در وب، تلگرام و اپ)\n` +
        `🪪 کد ملی: \`${user.national_id || '0012345678'}\`\n` +
        `🔐 پین‌کد مالی: **${user.has_financial_pin ? 'فعال و محافظت‌شده (هش SHA-256) ✅' : 'تنظیم نشده ⚠️'}**\n` +
        `🏦 شماره شبا: \`${user.sheba || 'ثبت نشده'}\` (قفل‌شده با کد ملی)\n\n` +
        `💡 **اصول سه‌گانه امنیت میانجی:**\n` +
        `۱. احراز هویت بدون رمز عبور (Passwordless) با شماره تماس پایدار\n` +
        `۲. پین مالی اختصاصی برای برداشت وجه با قفل ۳۰ دقیقه‌ای Brute-force\n` +
        `۳. قانون طلایی تطابق شبا: واریز فقط به شبای تاییدشده صاحب خط`,
      keyboard: [
        ['🔐 تنظیم/تغییر پین مالی', '💸 درخواست تسویه و برداشت'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('تراکنش') || clean.includes('گزارش')) {
    const txs = getTransactions(currentUid);
    const summary = txs.slice(0, 3).map((t, idx) => 
      `${idx + 1}. ${t.title} - ${formatCurrency(t.amount)} (${t.status === 'completed' ? '✅ موفق' : '⏳ در حال بررسی'})`
    ).join('\n');

    return {
      reply: `📋 **آخرین تراکنش‌های شما**\n\n${summary || 'تراکنشی یافت نشد.'}`,
      keyboard: [
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('ثبت معامله') || clean.includes('ایجاد معامله') || clean === '/newdeal') {
    return {
      reply: `🤝 **ثبت معامله امن در اسکرو میانجی**\n` +
        `> 🛡 وجه معامله تا تایید نهایی در صندوق امن امانت مسدود می‌ماند.\n\n` +
        `👤 **نقش خود را در این معامله مشخص فرمایید:**`,
      keyboard: [
        ['💼 کارفرما (خریدار)', '🛠 مجری (پیمانکار)'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // انتخاب نقش و ورود به دسته‌بندی
  if ((clean.includes('کارفرما') || clean.includes('مجری')) && !clean.includes('افزودن') && !clean.includes('کسر') && !clean.includes('۵۰٪')) {
    const isEmployer = clean.includes('کارفرما');
    const roleTitle = isEmployer ? 'کارفرما (خریدار)' : 'مجری (پیمانکار)';
    return {
      reply: `📂 **انتخاب دسته‌بندی خدمت**\n` +
        `> 👤 نقش شما: **${roleTitle}** ثبت شد.\n\n` +
        `حوزه فعالیت و زمینه پروژه خود را انتخاب کنید:`,
      keyboard: [
        ['🎨 طراحی و گرافیک', '💻 برنامه‌نویسی'],
        ['🎓 خدمات دانشجویی', '✍️ تولید محتوا'],
        ['📑 سایر خدمات دیجیتال'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // انتخاب دسته‌بندی و دریافت عنوان
  if (clean.includes('طراحی') || clean.includes('گرافیک') || clean.includes('برنامه‌نویسی') || clean.includes('دانشجویی') || clean.includes('محتوا') || clean.includes('سایر خدمات دیجیتال')) {
    let catTitle = 'خدمات دیجیتال';
    if (clean.includes('طراحی')) catTitle = 'طراحی و گرافیک';
    else if (clean.includes('برنامه‌نویسی')) catTitle = 'برنامه‌نویسی و IT';
    else if (clean.includes('دانشجویی')) catTitle = 'خدمات دانشجویی';
    else if (clean.includes('محتوا')) catTitle = 'تولید محتوا و سئو';

    return {
      reply: `✍️ **عنوان کوتاه پروژه**\n` +
        `> 🏷 دسته‌بندی: **${catTitle}**\n\n` +
        `لطفاً یک عنوان خلاصه و مشخص ارسال فرمایید:\n(مثلاً «طراحی لوگو» یا «ربات تلگرام»):`,
      keyboard: [
        ['طراحی لوگو و هویت بصری', 'توسعه ربات هوشمند تلگرام'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // انتخاب عنوان و دریافت مبلغ
  if (clean.includes('طراحی لوگو') || clean.includes('ربات هوشمند') || clean.includes('توسعه ربات') || clean.includes('هویت بصری')) {
    return {
      reply: `💰 **مبلغ کل معامله**\n` +
        `> 📝 پروژه: «${clean}»\n` +
        `> 🔒 وجه در امانت اسکرو میانجی محفوظ خواهد بود.\n\n` +
        `لطفاً مبلغ کل را به **تومان** وارد کرده یا از گزینه‌های زیر انتخاب کنید:`,
      keyboard: [
        ['1,000,000 تومان', '2,500,000 تومان'],
        ['5,000,000 تومان', '10,000,000 تومان'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // دریافت مبلغ و شرح تعهدات
  if (clean.includes('000 تومان') || clean.includes('۰۰۰ تومان')) {
    return {
      reply: `📋 **تعهدات فنی و اقلام تحویلی پروژه**\n` +
        `> ⚖️ **ملاک داوری حقوقی:**\n` +
        `> قضاوت هیئت داوری میانجی صرفاً بر مبنای متن همین بخش خواهد بود.\n\n` +
        `تعهدات فنی را ارسال کرده یا گزینه‌ای انتخاب فرمایید:`,
      keyboard: [
        ['تحویل سورس‌کد کامل به همراه مستندات راه‌اندازی و داکیومنت فنی'],
        ['تحویل فایل‌های لایه باز برداری وکتور (AI و SVG) با کیفیت ۳۰۰ DPI'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // شرح تعهدات و انتخاب پرداخت‌کننده کارمزد
  if (clean.includes('سورس‌کد') || clean.includes('لایه باز') || clean.includes('داکیومنت')) {
    return {
      reply: `⚖️ **پرداخت‌کننده کارمزد اسکرو**\n` +
        `> 💰 کارمزد سامانه: ۵٪ از مبلغ کل معامله\n\n` +
        `چه کسی کارمزد خدمات امنیتی اسکرو را پرداخت می‌کند؟`,
      keyboard: [
        ['💼 کارفرما (افزودن به واریزی کارفرما)'],
        ['🛠 مجری (کسر از دریافتی مجری)'],
        ['⚖️ توافقی (۵۰٪ کارفرما / ۵۰٪ مجری)'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // انتخاب کارمزد و مهلت تست
  if (clean.includes('افزودن به واریزی') || clean.includes('کسر از دریافتی') || clean.includes('۵۰٪ کارفرما')) {
    return {
      reply: `⏱ **مهلت تست و بررسی خروجی (Inspection Period)**\n` +
        `> 🔍 فرصت خریدار جهت ارزیابی کار قبل از آزادسازی قطعی وجه به مجری.\n\n` +
        `مدت زمان مورد نظر خود را انتخاب فرمایید:`,
      keyboard: [
        ['⚡ تایید آنی (بدون مهلت تست)'],
        ['⏱ ۲۴ ساعت مهلت تست', '⏱ ۴۸ ساعت مهلت تست'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // مهلت تست و سهمیه اصلاحیه
  if (clean.includes('مهلت تست') || clean.includes('تایید آنی')) {
    return {
      reply: `🔄 **سهمیه اصلاحیه و ویرایش رایگان**\n` +
        `> ✨ تعداد دفعاتی که مجری بدون هزینه مازاد، اصلاحات را اعمال می‌نماید.\n\n` +
        `سهمیه ویرایش را مشخص فرمایید:`,
      keyboard: [
        ['🚫 بدون ویرایش رایگان'],
        ['۱ بار اصلاحیه رایگان', '۲ بار اصلاحیه رایگان'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // سهمیه اصلاحیه و امضای دیجیتال با مشخصات
  if (clean.includes('اصلاحیه رایگان') || clean.includes('بدون ویرایش')) {
    const cid = generateContractId('DEV');
    return {
      reply: `📜 **پیش‌نویس قرارداد هوشمند اسکرو میانجی**\n` +
        `🆔 شناسه معامله: \`${cid}\`\n` +
        `> 📝 **موضوع:** پروژه تخصصی فریلنسری\n` +
        `> 💰 **مبلغ:** توافق شده در صندوق امانت\n` +
        `> 🛡 **پوشش:** داوری حقوقی و تضمین بازگشت وجه\n\n` +
        `✍️ **امضای دیجیتال طرف اول (${user.full_name}):**\n` +
        `> 🪪 کد ملی: \`${user.national_id || '0012345678'}\` | 📱 همراه: \`${user.phone_number}\`\n\n` +
        `جهت انعقاد رسمی و صدور لینک دعوت، دکمه زیر را لمس فرمایید:`,
      keyboard: [
        ['✍️ تایید مشخصات و امضای دیجیتال قرارداد (با OTP)'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // ارسال OTP
  if (clean.includes('تایید مشخصات و امضای دیجیتال') || clean.includes('با OTP')) {
    return {
      reply: `📩 **ارسال کد تایید پیامکی امضای دیجیتال (SMS OTP):**\n──────────────────\n` +
        `کد ۶ رقمی امنیتی امضای قرارداد به شماره همراه تاییدشده ارسال گردید.\n\n` +
        `⏱ مهلت اعتبار: **۳ دقیقه**\n` +
        `کد امنیتی آزمایشی: \`123456\``,
      keyboard: [
        ['123456'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // تایید OTP و صدور لینک و دعوت‌نامه با هشدار ضد فیشینگ
  if (clean === '123456') {
    const cid = 'DEV-842-190';
    return {
      reply: `🎉 **قرارداد به صورت رسمی با امضای دیجیتال طرف اول صادر گردید!**\n` +
        `🆔 **شناسه معامله:** \`${cid}\`\n` +
        `وضعیت: **در انتظار امضای طرف دوم ⏳**\n` +
        `────────────────────────────\n` +
        `📤 **متن دعوت‌نامه رسمی و راهنمای امنیتی (جهت ارسال به طرف دوم):**\n\n` +
        `🏛 **دعوت‌نامه رسمی قرارداد هوشمند (سامانه اسکرو میانجی)**\n` +
        `📋 **شناسه اختصاصی معامله:** \`${cid}\`\n` +
        `👤 **طرف اول:** ${user.full_name} (امضا شده با مهر الکترونیک ✅)\n\n` +
        `> 🛡️ **راهنمای امنیتی ضد فیشینگ (پیشگیری از کلاهبرداری):**\n` +
        `> جهت اطمینان ۱۰۰٪ از اصالت معامله و عدم کلیک روی لینک‌های ناشناس یا بات‌های جعلی، طرف دوم می‌تواند بدون نیاز به باز کردن لینک:\n` +
        `> ۱. وارد ربات رسمی میانجی (@mianji_ir_bot) شود.\n` +
        `> ۲. دکمه «🔍 جست‌وجوی قرارداد با شناسه» را لمس کند.\n` +
        `> ۳. کد رهگیری \`${cid}\` را ارسال کند تا قرارداد باز شده و آن را با امنیت کامل امضا نماید.`,
      keyboard: [
        [`🔍 پیگیری با شناسه قرارداد`],
        ['📜 لیست معاملات من', '💳 کیف پول و اعتبار'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('معاملات من') || clean.includes('لیست معاملات')) {
    const userDeals = getContracts({ userId: currentUid });
    const activeCount = userDeals.filter(d => ['active', 'in_progress', 'paid', 'escrow_locked', 'in_inspection', 'work_submitted', 'delivered'].includes(d.status)).length;
    const pendingCount = userDeals.filter(d => ['pending_approval', 'pending_counterparty', 'pending_party_b', 'awaiting_payment', 'awaiting_escrow_deposit', 'awaiting_receipt_approval', 'receipt_submitted', 'revisions_requested', 'disputed', 'in_dispute'].includes(d.status)).length;
    const completedCount = userDeals.filter(d => ['completed', 'resolved_employer', 'resolved_freelancer'].includes(d.status)).length;
    const draftsCount = userDeals.filter(d => d.status === 'draft').length;

    return {
      reply: `📑 **پنل مدیریت هوشمند معاملات شما**\n──────────────────\n` +
        `شما دارای **${userDeals.length}** معامله/پیش‌نویس در سامانه میانجی هستید.\n` +
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
    };
  }

  if (clean.includes('درحال انجام') || clean.includes('در انتظار اقدام') || clean.includes('تکمیل شده') || clean.includes('پیش‌نویس')) {
    const userDeals = getContracts({ userId: currentUid });
    let categoryKey = 'active';
    let categoryTitle = '🟢 درحال انجام';

    if (clean.includes('در انتظار اقدام')) {
      categoryKey = 'pending';
      categoryTitle = '⏳ در انتظار اقدام';
    } else if (clean.includes('تکمیل شده')) {
      categoryKey = 'completed';
      categoryTitle = '🏁 تکمیل شده';
    } else if (clean.includes('پیش‌نویس')) {
      categoryKey = 'drafts';
      categoryTitle = '📁 پیش‌نویس‌های من';
    }

    const filtered = userDeals.filter(d => {
      if (categoryKey === 'drafts') return d.status === 'draft';
      if (categoryKey === 'active') return ['active', 'in_progress', 'paid', 'escrow_locked', 'in_inspection', 'work_submitted', 'delivered'].includes(d.status);
      if (categoryKey === 'pending') return ['pending_approval', 'pending_counterparty', 'pending_party_b', 'awaiting_payment', 'awaiting_escrow_deposit', 'awaiting_receipt_approval', 'receipt_submitted', 'revisions_requested', 'disputed', 'in_dispute'].includes(d.status);
      if (categoryKey === 'completed') return ['completed', 'resolved_employer', 'resolved_freelancer'].includes(d.status);
      return false;
    });

    if (filtered.length === 0) {
      return {
        reply: `📂 **دسته‌بندی: ${categoryTitle}**\n──────────────────\n⚠️ هیچ معامله‌ای در این بخش یافت نشد.`,
        keyboard: [
          ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
          ['🔙 بازگشت به منوی اصلی']
        ]
      };
    }

    const listLines = filtered.map((d, i) => {
      const other = d.buyer_id === currentUid ? (d.seller_fullname || 'مجری') : (d.buyer_fullname || 'کارفرما');
      return `${i + 1}. **${d.title}**\n   🆔 شناسه: \`${d.contract_id}\` | 👤 طرف مقابل: ${other}\n   💰 مبلغ: ${formatCurrency(d.amount)} | وضعیت: ${d.status}`;
    }).join('\n\n');

    return {
      reply: `📂 **لیست معاملات شما — ${categoryTitle}**\n──────────────────\nتعداد در این دسته: **${filtered.length}** معامله\n\n${listLines}`,
      keyboard: filtered.slice(0, 4).map(d => [`📄 ${d.contract_id}: ${d.title.slice(0, 25)}`]).concat([
        ['📜 بازگشت به دسته‌بندی معاملات', '🔙 بازگشت به منوی اصلی']
      ])
    };
  }

  if (clean.includes('بررسی کدهای ملی') || clean.includes('کدهای ملی') || clean === '/admin_kyc') {
    return {
      reply: `🪪 **پنل مدیریت | بررسی و تعیین وضعیت کدهای ملی**\n` +
        `──────────────────\n` +
        `لیست کاربران در انتظار تایید هویت:\n\n` +
        `👤 **کاربر علی رضایی** (ID: 9811234)\n` +
        `• کد ملی: \`0012345678\` (رقم کنترل معتبر)\n` +
        `• شماره تماس: \`09121112233\`\n` +
        `• وضعیت: در انتظار بررسی ادمین\n\n` +
        `👤 **کاربر سارا احمدی** (ID: 9811235)\n` +
        `• کد ملی: \`0076543210\` (نیازمند بررسی مجدد)\n` +
        `• شماره تماس: \`09351234567\`\n` +
        `• وضعیت: در انتظار تعیین تکلیف\n\n` +
        `عملیات موردنظر را برای هر کاربر انتخاب کنید:`,
      keyboard: [
        ['✅ تایید کد ملی علی رضایی', '⚠️ نیاز به اصلاح علی رضایی'],
        ['✅ تایید کد ملی سارا احمدی', '⚠️ نیاز به اصلاح سارا احمدی'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('تایید کد ملی')) {
    return {
      reply: `✅ **کد ملی کاربر با موفقیت تایید شد.**\n\n` +
        `وضعیت استعلام هویت کاربر به «تایید شده رسمی» تغییر یافت و امکان انجام معاملات بدون محدودیت برای ایشان فعال شد.`,
      keyboard: [
        ['🪪 بررسی کدهای ملی', '🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('نیاز به اصلاح')) {
    return {
      reply: `⚠️ **وضعیت کد ملی به «نیاز به اصلاح» تغییر یافت.**\n\n` +
        `پیام اطلاع‌رسانی برای کاربر ارسال شد:\n` +
        `«کاربر گرامی، کد ملی ثبت‌شده شما نیازمند بررسی و اصلاح مجدد است. لطفاً جهت جلوگیری از مسدودسازی معاملات، اطلاعات صحیح هویتی خود را ارسال فرمایید.»`,
      keyboard: [
        ['🪪 بررسی کدهای ملی', '🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('سفیران') || clean.includes('همکاران')) {
    const stats = getAffiliateStats(currentUid);
    return {
      reply: `💎 **سامانه کسب درآمد و پنل سفیران میانجی**\n\n` +
        `با معرفی میانجی به دوستان و شبکه‌های اجتماعی خود، از هر معامله موفق کمیسیون نقدی دریافت کنید.\n\n` +
        `🔗 لینک اختصاصی شما:\n\`${stats.referral_link}\`\n\n` +
        `👥 تعداد کلیک: ${stats.total_clicks} | معرفی‌شدگان فعال: ${stats.total_invited}\n` +
        `💰 کل درآمد حاصله: ${formatCurrency(stats.total_commission_earned)}\n` +
        `💵 سود قابل برداشت: ${formatCurrency(stats.withdrawable_commission)}`,
      keyboard: [
        ['💸 برداشت سود سفیر به کیف پول', '🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  if (clean.includes('پشتیبانی') || clean.includes('راهنما')) {
    return {
      reply: `🎧 **مرکز پشتیبانی و قوانین سامانه میانجی**\n\n` +
        `سامانه میانجی بر اساس قانون تجارت الکترونیک جمهوری اسلامی ایران (ماده ۶ و ۱۰) واسطهگری امن و صدور قراردادهای الکترونیک معتبر را فراهم ساخته است.\n\n` +
        `📌 **مراحل انجام معامله:**\n` +
        `۱. ثبت مشخصات، شرح تعهدات و مبلغ معامله\n` +
        `۲. امضای الکترونیک دوطرفه طرفین\n` +
        `۳. واریز و قفل وجه توسط کارفرما در حساب امانت\n` +
        `۴. انجام پروژه و تحویل فایل‌ها توسط مجری\n` +
        `۵. تایید کارفرما و آزادسازی فوری وجه به حساب مجری\n\n` +
        `⚖️ در صورت بروز هرگونه اختلاف، هیئت داوری حقوقی مستندات را بررسی و رای نهایی را صادر می‌نماید.`,
      keyboard: [
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // جست‌وجوی قرارداد با شناسه (راهنمای ضد فیشینگ)
  if (clean.includes('جست‌وجوی قرارداد') || clean.includes('جستجو') || clean.includes('سرچ کد')) {
    return {
      reply: `🔍 **جست‌وجوی امن قرارداد با شناسه یکتا**\n──────────────────\n` +
        `🛡 **راهنمای امنیتی ضد فیشینگ:**\n` +
        `> جهت جلوگیری از سرقت اطلاعات یا کلیک روی لینک‌های جعلی و کلاهبرداری، طرف دوم می‌تواند بدون باز کردن هیچ لینکی، شناسه قرارداد (مانند \`DEV-842-190\` یا \`DS-802-115\`) را مستقیماً در این ربات وارد کند تا اطلاعات را مشاهده و امضا نماید.\n\n` +
        `لطفاً **شناسه قرارداد** را ارسال فرمایید:`,
      keyboard: [
        ['DEV-842-190', 'DS-802-115'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  // بررسی ورود شناسه قرارداد یا استارت با توکن/شناسه
  const contractIdMatch = clean.match(/\/start\s+(?:c_|deal_)?([A-Za-z0-9_-]+)/i) ||
                          clean.match(/^(?:c_|deal_)([A-Za-z0-9_-]+)/i) ||
                          clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/i);
  if (contractIdMatch) {
    const rawId = contractIdMatch[1].toUpperCase();
    const contract = getContract(rawId) || getContracts().find(c => c.contract_id.toUpperCase() === rawId || c.invite_token === clean || c.invite_token === `deal_${contractIdMatch[1]}`);

    if (contract) {
      const inspFa = (contract.inspection_period_hours || 0) > 0
        ? `${contract.inspection_period_hours} ساعت`
        : 'تایید آنی';
      const revFa = contract.free_edits === 0
        ? 'بدون ویرایش'
        : (contract.free_edits === -1 ? 'توافقی' : `${contract.free_edits} بار رایگان`);

      return {
        reply: `📄 **قرارداد رسمی اسکرو میانجی** | \`${contract.contract_id}\`\n` +
          `────────────────────────────\n` +
          `📝 **موضوع:** ${contract.title}\n` +
          `💰 **مبلغ کل معامله:** **${formatCurrency(contract.amount)}**\n` +
          `⏱ **مهلت تست:** ${inspFa} | 🔄 **سهمیه اصلاحیه:** ${revFa}\n\n` +
          `> 👥 **طرفین:** ${contract.buyer_fullname || 'کارفرما'} و ${contract.seller_fullname || 'مجری'}\n` +
          `> 📋 **تعهدات فنی پروژه (ملاک داوری):**\n` +
          `> ${contract.description || 'تعهدات مشخص شده در سند قرارداد'}\n\n` +
          `> 🛡️ **تضمین صندوق امانت اسکرو:**\n` +
          `> وجه تا تایید رضایت نهایی نزد میانجی مسدود می‌ماند و بدون تایید شما آزاد نمی‌گردد.\n\n` +
          `📌 وضعیت: **${contract.status === 'pending_party_b' ? 'در انتظار امضای طرف دوم ⏳' : contract.status === 'awaiting_escrow_deposit' ? 'در انتظار واریز وجه امانت ⏳' : contract.status === 'in_inspection' || contract.status === 'work_submitted' ? 'پروژه تحویل داده شده (در حال ارزیابی)' : contract.status === 'completed' ? 'تکمیل شده و تسویه قطعی ✅' : contract.status}**`,
        keyboard: contract.status === 'pending_party_b'
          ? [
              [`✍️ امضا و پذیرش رسمی قرارداد ${contract.contract_id}`],
              ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
            ]
          : contract.status === 'awaiting_escrow_deposit'
          ? [
              [`💳 واریز وجه به صندوق امانت (${contract.contract_id})`],
              [`📄 دانلود سند رسمی PDF (${contract.contract_id})`],
              ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
            ]
          : ['active', 'in_progress', 'paid', 'escrow_locked'].includes(contract.status)
          ? [
              [`📦 تحویل فایل‌ها و خروجی پروژه (${contract.contract_id})`],
              [`⚖️ ثبت اختلاف و ارجاع به داوری (${contract.contract_id})`],
              [`📄 دانلود سند رسمی PDF (${contract.contract_id})`],
              ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
            ]
          : ['work_submitted', 'delivered', 'in_inspection'].includes(contract.status)
          ? [
              [`✅ تایید نهایی و آزادسازی وجه به مجری (${contract.contract_id})`],
              [`🔄 درخواست اصلاحیه و ویرایش (${contract.contract_id})`],
              [`⚖️ ثبت اختلاف و ارجاع به داوری (${contract.contract_id})`],
              ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
            ]
          : [
              [`📄 دانلود سند رسمی PDF (${contract.contract_id})`],
              ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
            ]
      };
    }
  }


  // امضای طرف دوم
  if (clean.includes('امضا و پذیرش رسمی قرارداد')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    const contract = getContract(targetId);

    if (contract) {
      contract.status = 'awaiting_escrow_deposit';
      contract.seller_id = currentUid;
      contract.seller_fullname = user.full_name;
      contract.seller_phone = user.phone_number;
      contract.seller_signed_at = new Date().toISOString();
      contract.seller_otp_verified = true;

      return {
        reply: `🎉 **قرارداد ${targetId} با موفقیت توسط طرف دوم (${user.full_name}) امضا شد!**\n\n` +
          `🔐 **امضای دیجیتال:** ثبت و هش امنیتی صادر گردید.\n` +
          `وضعیت معامله: **در انتظار واریز وجه به صندوق امانت (Awaiting Escrow Deposit)**\n\n` +
          `کارفرما اکنون می‌تواند وجه را به صندوق امانت میانجی واریز نماید تا پروژه آغاز شود.`,
        keyboard: [
          [`💳 واریز وجه به صندوق امانت (${targetId})`],
          [`📄 دانلود سند رسمی PDF (${targetId})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  // واریز وجه به صندوق امانت
  if (clean.includes('واریز وجه') || clean.includes('صندوق امانت')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    const contract = getContract(targetId);
    if (contract) {
      contract.status = 'active';
      return {
        reply: `🎉 **وجه معامله \`${targetId}\` در صندوق امن امانت اسکرو قفل گردید!**\n──────────────────\n` +
          `> 🔒 مبلغ: **${formatCurrency(contract.amount)}** در صندوق امانت میانجی محفوظ شد.\n` +
          `> 🛠 به مجری پروژه اطلاع‌رسانی گردید تا کار را آغاز کند.`,
        keyboard: [
          [`📦 تحویل فایل‌ها و خروجی پروژه (${targetId})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${targetId})`],
          [`📄 دانلود سند رسمی PDF (${targetId})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  // تحویل خروجی پروژه
  if (clean.includes('تحویل فایل') || clean.includes('تحویل خروجی') || clean.includes('تحویل پروژه')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    const contract = getContract(targetId);
    if (contract) {
      contract.status = 'work_submitted';
      return {
        reply: `📦 **فایل‌های خروجی معامله \`${targetId}\` با موفقیت تحویل کارفرما گردید!**\n──────────────────\n` +
          `> ⏱ مهلت ارزیابی خروجی: **${contract.inspection_period_hours || 48} ساعت**\n` +
          `> 🔄 سهمیه اصلاحیه باقی‌مانده: **${contract.free_edits ?? 2} بار**\n\n` +
          `کارفرما پس از بررسی کار می‌تواند تایید نهایی را صادر یا درخواست اصلاحیه دهد.`,
        keyboard: [
          [`✅ تایید نهایی و آزادسازی وجه به مجری (${targetId})`],
          [`🔄 درخواست اصلاحیه و ویرایش (${targetId})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${targetId})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  // تایید نهایی و آزادسازی وجه
  if (clean.includes('تایید نهایی') || clean.includes('آزادسازی وجه')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    const contract = getContract(targetId);
    if (contract) {
      contract.status = 'completed';
      return {
        reply: `🎉 **معامله \`${targetId}\` با موفقیت تایید و تسویه قطعی شد!**\n──────────────────\n` +
          `> 💰 وجه به کیف پول مجری واریز گردید.\n` +
          `> 📄 سند رسمی اختتام کار با گواهی دیجیتال صادر شد.`,
        keyboard: [
          [`📄 دانلود سند رسمی PDF (${targetId})`],
          ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
          ['💳 کیف پول و اعتبار', '🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  // درخواست ویرایش و اصلاحیه
  if (clean.includes('درخواست اصلاحیه') || clean.includes('ویرایش')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    const contract = getContract(targetId);
    if (contract) {
      contract.status = 'revisions_requested';
      return {
        reply: `🔄 **درخواست اصلاحیه برای معامله \`${targetId}\` ثبت و به مجری ابلاغ شد.**\n──────────────────\n` +
          `مجری پس از اعمال ویرایش‌های درخواستی، نسخه جدید را تحویل خواهد داد.`,
        keyboard: [
          [`📦 تحویل فایل‌ها و خروجی پروژه (${targetId})`],
          [`⚖️ ثبت اختلاف و ارجاع به داوری (${targetId})`],
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  // ثبت اختلاف
  if (clean.includes('ثبت اختلاف') || clean.includes('داوری')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    const contract = getContract(targetId);
    if (contract) {
      contract.status = 'in_dispute';
      return {
        reply: `⚖️ **پرونده معامله \`${targetId}\` به هیئت داوری حقوقی میانجی ارجاع شد.**\n──────────────────\n` +
          `وجوه در صندوق مسدود بوده و کارشناسان حقوقی بر مبنای مستندات مکتوب رای را صادر خواهند نمود.`,
        keyboard: [
          ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  // دانلود PDF
  if (clean.includes('دانلود سند رسمی PDF') || clean.includes('دانلود PDF')) {
    const match = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/);
    const targetId = match ? match[1] : 'DEV-842-190';
    return {
      reply: `📄 **سند رسمی الکترونیک قرارداد میانجی (PDF)**\n──────────────────\n` +
        `🆔 شناسه معامله: \`${targetId}\`\n\n` +
        `📥 جهت دانلود مستقیم فایل PDF پیوند زیر را باز فرمایید:\n` +
        `/api/contracts/${targetId}/pdf`,
      keyboard: [
        ['📜 لیست معاملات من', '🤝 ثبت معامله جدید'],
        ['🔙 بازگشت به منوی اصلی']
      ]
    };
  }

  return {
    reply: `پیام دریافت شد: "${clean}"\nلطفاً یکی از گزینه‌های منوی زیر را جهت ادامه انتخاب کنید:`,
    keyboard: MAIN_KEYBOARD
  };
}

export function escapeMarkdownV2(text: string): string {
  return String(text || '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export async function sendTelegramMessage(params: {
  chatId: number | string;
  text: string;
  parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown' | null;
  escapeIfMarkdownV2?: boolean;
}): Promise<{ sent: boolean; message_id?: number; parse_mode?: string; reason?: string }> {
  const { chatId, text, parseMode = 'MarkdownV2', escapeIfMarkdownV2 = false } = params;
  appendBotLog(`Outbound message queued for chat_id=${chatId} parse_mode=${parseMode || 'plain'}`);

  if (!bot) {
    return {
      sent: false,
      reason: 'BOT_TOKEN not configured in this environment',
    };
  }

  const finalText =
    parseMode === 'MarkdownV2' && escapeIfMarkdownV2 ? escapeMarkdownV2(text) : text;

  try {
    const extra = parseMode ? { parse_mode: parseMode as any } : undefined;
    const result = await bot.telegram.sendMessage(chatId, finalText, extra);
    appendBotLog(`✅ Telegram message delivered to chat_id=${chatId} msg_id=${result.message_id}`);
    return { sent: true, message_id: result.message_id, parse_mode: parseMode || 'plain' };
  } catch (err: any) {
    const firstErr = err?.message || String(err);
    // If MarkdownV2 entity parsing fails due to unescaped special characters from caller, retry escaped
    if (parseMode === 'MarkdownV2' && !escapeIfMarkdownV2 && firstErr.includes("can't parse entities")) {
      try {
        const escaped = escapeMarkdownV2(text);
        const retryResult = await bot.telegram.sendMessage(chatId, escaped, {
          parse_mode: 'MarkdownV2',
        });
        appendBotLog(`✅ Telegram MarkdownV2 (auto-escaped) delivered to chat_id=${chatId}`);
        return { sent: true, message_id: retryResult.message_id, parse_mode: 'MarkdownV2' };
      } catch (retryErr: any) {
        const reason = retryErr?.message || String(retryErr);
        appendBotLog(`⚠️ Telegram message failed for chat_id=${chatId}: ${reason}`);
        return { sent: false, reason };
      }
    }
    console.warn(`⚠️ Failed to send Telegram message to ${chatId}:`, firstErr);
    appendBotLog(`⚠️ Telegram message failed for chat_id=${chatId}: ${firstErr}`);
    return { sent: false, reason: firstErr };
  }
}

export async function sendTelegramOtpToUser(
  chatId: number,
  otpCode: string,
  phoneNumber: string = ''
): Promise<{ sent: boolean; reason?: string; message_id?: number; parse_mode?: string }> {
  const cleanCode = String(otpCode).trim();
  const digitLabel =
    cleanCode.length === 5 ? '۵ رقمی' : cleanCode.length === 6 ? '۶ رقمی' : `${cleanCode.length} رقمی`;

  const phoneLine = phoneNumber
    ? `📱 شماره موبایل: \`${escapeMarkdownV2(phoneNumber)}\`\n`
    : '';

  const message =
    `🔐 *کد تایید ورود به وب‌سایت میانجی*\n\n` +
    `کد ${escapeMarkdownV2(digitLabel)} ورود شما:\n` +
    `\`${escapeMarkdownV2(cleanCode)}\`\n\n` +
    phoneLine +
    `⏱ اعتبار کد: ۵ دقیقه\n\n` +
    `⚠️ *هشدار امنیتی:* _این کد محرمانه است؛ به هیچ عنوان آن را در اختیار دیگران قرار ندهید\\._`;

  return sendTelegramMessage({
    chatId,
    text: message,
    parseMode: 'MarkdownV2',
  });
}

export async function notifyWebsiteUserRegistered(params: {
  telegramId: string | number;
  phone: string;
  fullName: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = WEBSITE_REGISTER_WEBHOOK_URL;
  if (!url) return { ok: false, error: 'WEBSITE_REGISTER_WEBHOOK_URL not set' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegramId: String(params.telegramId),
        phone: params.phone,
        fullName: params.fullName,
      }),
      signal: AbortSignal.timeout(8000),
    });
    appendBotLog(`🔗 Direct webhook sync (${url}) -> HTTP ${res.status} for tg_id=${params.telegramId}`);
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    appendBotLog(`⚠️ Direct webhook sync warning (${url}): ${errMsg}`);
    return { ok: false, error: errMsg };
  }
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInlineHtml(escapedText: string): string {
  return escapedText
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
}

export function formatTelegramHtml(rawText: string): string {
  const lines = String(rawText || '').split('\n');
  const result: string[] = [];
  let quoteBuffer: string[] = [];

  const flushQuotes = () => {
    if (quoteBuffer.length > 0) {
      result.push(`<blockquote>${quoteBuffer.join('\n')}</blockquote>`);
      quoteBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      const quoteContent = trimmed.replace(/^>\s*/, '');
      quoteBuffer.push(formatInlineHtml(escapeHtml(quoteContent)));
    } else {
      flushQuotes();
      result.push(formatInlineHtml(escapeHtml(line)));
    }
  }
  flushQuotes();
  return result.join('\n');
}

async function replyTelegramFormatted(ctx: any, rawText: string, extra?: any) {
  const htmlText = formatTelegramHtml(rawText);
  try {
    return await ctx.reply(htmlText, { ...(extra || {}), parse_mode: 'HTML' });
  } catch (err: any) {
    appendBotLog(`⚠️ HTML reply fallback (${err?.message || err}); sending plain text.`);
    const plainText = String(rawText || '').replace(/\*\*/g, '');
    return await ctx.reply(plainText, extra);
  }
}

function isRealPhone(phone?: string): boolean {
  if (!phone) return false;
  const norm = normalizeIranianPhone(phone);
  return norm.length >= 10 && norm !== '09120000000';
}

export function startBot() {
  appendBotLog('🚀 Initializing Miyanji Escrow Telegraf runtime in Node.js 22...');

  if (process.env.USE_PYTHON_BOT === 'true') {
    const msg = 'ℹ️ Python Bot engine is designated (USE_PYTHON_BOT=true). Node.js Telegraf polling remains idle to prevent 409 conflict.';
    console.log(`[Miyanji Bot] ${msg}`);
    appendBotLog(msg);
    return;
  }

  if (!hasValidToken || !bot) {
    const msg = 'ℹ️ Telegram Bot Token (BOT_TOKEN) is not configured or is a placeholder. Standing by for real token in environment variables.';
    console.log(`[Miyanji Bot] ${msg}`);
    appendBotLog(msg);
    return;
  }

  try {
    bot.start(async (ctx) => {
      try {
        const payload = ctx.payload?.trim() || '';
        const telegramId = ctx.from.id;
        const chatId = Number(ctx.chat?.id || telegramId);
        const fullName =
          [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim() ||
          ctx.from.username ||
          `کاربر ${telegramId}`;
        const username = ctx.from.username || '';

        const existing = await getUserAsync(telegramId);

        // ثبت یا همگام‌سازی اولیه کاربر در Firestore (کالکشن users با Doc ID = telegram_id)
        const user = await registerOrUpdateUser({
          id: telegramId,
          telegram_id: telegramId,
          chat_id: chatId,
          username,
          full_name: fullName,
          phone_number: existing?.phone_number || '',
          kyc_status: existing?.kyc_status === 'verified' ? 'verified' : existing?.kyc_status || 'pending',
          wallet_balance: existing?.wallet_balance ?? 0,
          escrow_locked_balance: existing?.escrow_locked_balance ?? 0,
        });

        if (payload) {
          const res = handleSimulatorMessage(`/start ${payload}`, telegramId);
          await replyTelegramFormatted(ctx, res.reply, resolveReplyKeyboard(res.keyboard) || buildMainReplyKeyboard());
          if (isRealPhone(user.phone_number)) {
            return;
          }
        }

        if (!isRealPhone(user.phone_number)) {
          await replyTelegramFormatted(
            ctx,
            `سلام ${fullName} عزیز! 👋\n\n` +
              `به ربات رسمی **میانجی (Miyanji Escrow)** خوش آمدید.\n\n` +
              `برای تکمیل ثبت‌نام، همگام‌سازی کیف پول و دریافت کد ورود سایت، لطفاً دکمه **«📱 ارسال و تایید شماره تماس»** را لمس کنید؛ یا از دکمه پایین کیبورد مستقیماً وارد وب‌سایت شوید:`,
            buildContactRequestKeyboard()
          );
          return;
        }

        await replyTelegramFormatted(
          ctx,
          `🤖 سلام **${user.full_name}**!\n\n` +
            `حساب شما با شماره \`${user.phone_number}\` به سامانه میانجی متصل است.\n` +
            `💰 موجودی کیف پول: ${formatCurrency(user.wallet_balance)}\n` +
            `🔒 در امانت اسکرو: ${formatCurrency(user.escrow_locked_balance)}\n\n` +
            `از منوی زیر گزینه مورد نظر را انتخاب کنید یا از دکمه پایین مستقیماً وارد وب‌سایت میانجی شوید:`,
          buildMainReplyKeyboard()
        );
      } catch (err: any) {
        appendBotLog(`⚠️ Error in bot.start: ${err?.message || err}`);
      }
    });

    bot.on('contact', async (ctx) => {
      try {
        const contact = ctx.message.contact;
        const telegramId = ctx.from.id;
        const chatId = Number(ctx.chat?.id || telegramId);

        if (contact.user_id && contact.user_id !== telegramId) {
          await replyTelegramFormatted(
            ctx,
            '⚠️ لطفاً فقط شماره تماس متعلق به اکانت تلگرام خودتان را از طریق دکمه «📱 ارسال و تایید شماره تماس» ارسال فرمایید.',
            buildContactRequestKeyboard()
          );
          return;
        }

        const normalizedPhone = normalizeIranianPhone(contact.phone_number);
        const fullName =
          [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim() ||
          [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
          ctx.from.username ||
          `کاربر ${telegramId}`;

        const existing = await getUserAsync(telegramId);

        const savedUser = await registerOrUpdateUser({
          id: telegramId,
          telegram_id: telegramId,
          chat_id: chatId,
          username: ctx.from.username || existing?.username || '',
          full_name: fullName,
          phone_number: normalizedPhone,
          kyc_status: existing?.kyc_status === 'verified' ? 'verified' : 'pending',
          wallet_balance: existing?.wallet_balance ?? 0,
          escrow_locked_balance: existing?.escrow_locked_balance ?? 0,
        });

        appendBotLog(
          `✅ Contact registered in Firestore users/${telegramId} chat_id=${chatId} phone=${savedUser.phone_number}`
        );

        await notifyWebsiteUserRegistered({
          telegramId: String(telegramId),
          phone: savedUser.phone_number,
          fullName: savedUser.full_name,
        });

        await replyTelegramFormatted(
          ctx,
          `✅ **ثبت‌نام و اتصال حساب شما با موفقیت انجام شد!**\n\n` +
            `👤 نام: ${savedUser.full_name}\n` +
            `📱 شماره موبایل: \`${savedUser.phone_number}\`\n` +
            `🆔 شناسه تلگرام: \`${savedUser.id}\`\n` +
            `🪪 وضعیت احراز هویت: ${savedUser.kyc_status === 'verified' ? 'تایید شده ✅' : 'در انتظار احراز هویت (pending)'}`,
          buildMainReplyKeyboard()
        );

        await replyTelegramFormatted(
          ctx,
          `🎉 به پنل هوشمند **میانجی** خوش آمدید!\n\nبرای ورود مستقیم و امن به وب‌اپ و مدیریت معاملات خود، دکمه زیر را لمس کنید:`,
          buildMiniAppInlineKeyboard()
        );
      } catch (err: any) {
        appendBotLog(`⚠️ Error in bot.on('contact'): ${err?.message || err}`);
      }
    });

    const handleOtpRequestInBot = async (ctx: any) => {
      const telegramId = ctx.from.id;
      const chatId = Number(ctx.chat?.id || telegramId);
      const user = await getUserAsync(telegramId);

      if (!user || !isRealPhone(user.phone_number)) {
        await replyTelegramFormatted(
          ctx,
          '📱 برای دریافت کد ورود به سایت، ابتدا لازم است شماره تماس خود را از طریق دکمه زیر تایید کنید:',
          buildContactRequestKeyboard()
        );
        return;
      }

      const otpRecord = await createAndStorePhoneOtp(user.phone_number, 'web_login', chatId, {
        digits: 6,
      });

      await sendTelegramOtpToUser(chatId, otpRecord.debugCode, user.phone_number);
    };

    bot.command('otp', async (ctx) => {
      try {
        await handleOtpRequestInBot(ctx);
      } catch (err: any) {
        appendBotLog(`⚠️ Error in bot.command('otp'): ${err?.message || err}`);
      }
    });

    bot.command('webapp', async (ctx) => {
      try {
        await replyTelegramFormatted(
          ctx,
          '🌐 برای ورود امن و خودکار به پنل وب‌سایت میانجی روی دکمه زیر کلیک کنید:',
          buildMiniAppInlineKeyboard()
        );
      } catch (err: any) {
        appendBotLog(`⚠️ Error in bot.command('webapp'): ${err?.message || err}`);
      }
    });

    bot.help(async (ctx) => {
      try {
        const res = handleSimulatorMessage('راهنما', ctx.from?.id);
        await replyTelegramFormatted(ctx, res.reply, buildMainReplyKeyboard());
      } catch (err: any) {
        appendBotLog(`⚠️ Error in bot.help: ${err?.message || err}`);
      }
    });

    bot.on('text', async (ctx) => {
      try {
        const text = ctx.message.text.trim();
        if (
          text.includes('دریافت کد ورود') ||
          text.includes('کد ورود') ||
          text === 'دریافت کد' ||
          text === 'کد تایید'
        ) {
          await handleOtpRequestInBot(ctx);
          return;
        }
        if (text.includes('ورود به سایت') || text.includes('ورود به پنل') || text.includes('مینی‌اپ') || text.includes('وب‌سایت')) {
          await replyTelegramFormatted(
            ctx,
            '🌐 برای ورود مستقیم و امن به پنل میانجی روی دکمه زیر بزنید:',
            buildMiniAppInlineKeyboard()
          );
          return;
        }
        const res = handleSimulatorMessage(text, ctx.from?.id);
        await replyTelegramFormatted(ctx, res.reply, resolveReplyKeyboard(res.keyboard));
      } catch (err: any) {
        appendBotLog(`⚠️ Error in bot.on('text'): ${err?.message || err}`);
      }
    });

    bot.catch((err: any) => {
      const errMsg = `⚠️ Telegram Bot error: ${err?.message || err}`;
      console.error(errMsg);
      appendBotLog(errMsg);
    });

    bot.telegram
      .getMe()
      .then((me) => {
        const msg = `✅ Telegram Bot verified via API: @${me.username} (id=${me.id})`;
        console.log(`[Miyanji Bot] ${msg}`);
        appendBotLog(msg);
      })
      .catch((err: any) => {
        const errMsg = `⚠️ Telegram getMe check failed: ${err?.message || err}`;
        console.warn(`[Miyanji Bot] ${errMsg}`);
        appendBotLog(errMsg);
      });

    bot.launch({ dropPendingUpdates: true })
      .then(async () => {
        const cleanBot = cleanBotUsername(process.env.BOT_USERNAME);
        const msg = `✅ Miyanji Telegram Bot connected and polling active for @${cleanBot}`;
        console.log(`[Miyanji Bot] ${msg}`);
        appendBotLog(msg);

        try {
          await bot?.telegram.setChatMenuButton({
            menuButton: {
              type: 'web_app',
              text: 'ورود به پنل میانجی 🌐',
              web_app: { url: WEB_APP_URL },
            },
          });
          appendBotLog(`🌐 Chat menu button synced to ${WEB_APP_URL}`);
        } catch (menuErr: any) {
          appendBotLog(`⚠️ Could not sync chat menu button: ${menuErr?.message || menuErr}`);
        }
      })
      .catch((err: any) => {
        const errMsg = `⚠️ Failed to launch Telegram Bot polling: ${err?.message || err}`;
        console.warn(`[Miyanji Bot] ${errMsg}`);
        appendBotLog(errMsg);
      });

    // Graceful stop
    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));
  } catch (err: any) {
    const errMsg = `⚠️ Error configuring bot: ${err?.message || err}`;
    console.error(errMsg);
    appendBotLog(errMsg);
  }
}

