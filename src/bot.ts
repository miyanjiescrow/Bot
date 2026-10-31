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
} from './db';

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

const botToken = process.env.BOT_TOKEN?.trim() || '';
const hasValidToken = Boolean(botToken && botToken.includes(':'));

export const bot = hasValidToken ? new Telegraf(botToken) : null;

// ====================================================
// ۱. کیبوردهای اصلی ربات (Keyboards)
// ====================================================

export const MAIN_KEYBOARD = [
  ['🤝 ثبت معامله جدید', '📜 لیست معاملات من'],
  ['👤 پروفایل کاربری', '💳 کیف پول و اعتبار'],
  ['🎧 پشتیبانی و راهنمای استفاده 📖'],
  ['💎 پنل سفیران']
];

// ====================================================
// ۲. منطق مشترک شبیه‌ساز و ربات (Simulator & Bot Message Handler)
// ====================================================

export interface BotResponse {
  reply: string;
  keyboard?: string[][];
}

export function handleSimulatorMessage(text: string, userId?: number): BotResponse {
  const clean = text.trim();
  const currentUid = userId || getCurrentUserId();
  const user = getUser(currentUid) || getCurrentUser();

  if (clean === '/start' || clean === 'شروع' || clean === 'منو') {
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
        `شماره شبا مقصد: ${user.sheba || 'ثبت نشده'}\n\n` +
        `تسویه‌حساب‌ها در اولین سیکل پایا بانک مرکزی پردازش و واریز می‌شوند.`,
      keyboard: [
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

  if (clean.includes('پروفایل')) {
    return {
      reply: `👤 **پروفایل و مشخصات هویتی**\n\n` +
        `• نام و نام‌خانوادگی: ${user.full_name}\n` +
        `• شماره تماس: ${user.phone_number}\n` +
        `• کد ملی: ${user.national_id ? `${user.national_id.slice(0, 3)}***${user.national_id.slice(-3)}` : 'ثبت نشده'}\n` +
        `• وضعیت استعلام شاهکار: ${user.is_verified ? '✅ تایید شده رسمی' : '⚠️ در انتظار احراز هویت'}\n` +
        `• شماره شبا: ${user.sheba || 'ثبت نشده'}\n` +
        `• سطح کاربری: ${user.kyc_level === 'gold' ? 'طلایی 🌟' : 'نقره‌ای 🥈'}`,
      keyboard: [
        ['🪪 احراز هویت هوشمند', '🔙 بازگشت به منوی اصلی']
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
  const contractIdMatch = clean.match(/([A-Za-z]{2,5}-\d{3,4}-\d{3,4})/) || clean.match(/\/start\s+c_([A-Za-z0-9_-]+)/);
  if (contractIdMatch) {
    const rawId = contractIdMatch[1].toUpperCase();
    const contract = getContract(rawId) || getContracts().find(c => c.contract_id.toUpperCase() === rawId || c.invite_token === clean);

    if (contract) {
      const inspFa = (contract.inspection_period_hours || 0) > 0
        ? `⏱ ${contract.inspection_period_hours} ساعت پس از تحویل`
        : '⚡ تایید آنی (بدون مهلت تست)';
      const revFa = contract.free_edits === 0
        ? '🚫 بدون ویرایش رایگان'
        : (contract.free_edits === -1 ? '🤝 توافقی بین طرفین' : `✅ ${contract.free_edits} بار اصلاحیه رایگان`);

      return {
        reply: `📄 **قرارداد رسمی و معتبر اسکرو میانجی**\n` +
          `🆔 **شناسه یکتا:** \`${contract.contract_id}\`\n` +
          `────────────────────────────\n` +
          `📝 **عنوان:** ${contract.title}\n` +
          `💰 **مبلغ معامله:** ${formatCurrency(contract.amount)}\n` +
          `⚖️ **کارمزد:** توافقی ۵۰/۵۰\n` +
          `🛡 **مهلت تست و بررسی:** ${inspFa}\n` +
          `🔄 **سهمیه اصلاحیه:** ${revFa}\n` +
          `👤 **طرف اول (سازنده):** ${contract.buyer_fullname || contract.seller_fullname || 'کاربر میانجی'}\n\n` +
          `📋 **شرح تعهدات و مشخصات فنی (ملاک داوری):**\n` +
          `> ${contract.description || 'تعهدات مشخص شده در سند قرارداد'}\n\n` +
          `🛡 **راهنمای ضد فیشینگ:**\n` +
          `> این استعلام مستقیماً از سرور امن میانجی انجام گرفته است. هیچ لینکی خارج از تلگرام نیاز نیست.\n\n` +
          `وضعیت فعلی: **${contract.status === 'pending_party_b' ? 'در انتظار امضای طرف دوم ⏳' : contract.status}**`,
        keyboard: contract.status === 'pending_party_b'
          ? [
              [`✍️ امضا و پذیرش رسمی قرارداد ${contract.contract_id}`],
              ['📜 لیست معاملات من', '🔙 بازگشت به منوی اصلی']
            ]
          : [
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
          ['📜 لیست معاملات من', '💳 کیف پول و اعتبار'],
          ['🔙 بازگشت به منوی اصلی']
        ]
      };
    }
  }

  return {
    reply: `پیام دریافت شد: "${clean}"\nلطفاً یکی از گزینه‌های منوی زیر را جهت ادامه انتخاب کنید:`,
    keyboard: MAIN_KEYBOARD
  };
}

// ====================================================
// ۳. راه‌اندازی ربات تلگرام Telegraf (Telegram Bot Polling)
// ====================================================

export function startBot() {
  appendBotLog('🚀 Initializing Miyanji Escrow Telegraf runtime in Node.js 22...');

  if (!bot) {
    const msg = 'ℹ️ Telegram Bot Token (BOT_TOKEN) is not set or invalid. Running in simulated console mode.';
    console.log(`[Miyanji Bot] ${msg}`);
    appendBotLog(msg);
    return;
  }

  try {
    bot.start((ctx) => {
      const res = handleSimulatorMessage('/start', ctx.from?.id);
      const keyboard = Markup.keyboard(res.keyboard || MAIN_KEYBOARD).resize();
      ctx.reply(res.reply, keyboard);
    });

    bot.help((ctx) => {
      const res = handleSimulatorMessage('راهنما', ctx.from?.id);
      ctx.reply(res.reply);
    });

    bot.on('text', (ctx) => {
      const text = ctx.message.text;
      const res = handleSimulatorMessage(text, ctx.from?.id);
      const keyboard = res.keyboard ? Markup.keyboard(res.keyboard).resize() : undefined;
      ctx.reply(res.reply, keyboard);
    });

    bot.catch((err: any, ctx) => {
      const errMsg = `⚠️ Telegram Bot error: ${err.message || err}`;
      console.error(errMsg);
      appendBotLog(errMsg);
    });

    bot.launch()
      .then(() => {
        const msg = `✅ Miyanji Telegram Bot connected and polling active for @${process.env.BOT_USERNAME || 'mianji_ir_bot'}`;
        console.log(`[Miyanji Bot] ${msg}`);
        appendBotLog(msg);
      })
      .catch((err: any) => {
        const errMsg = `⚠️ Failed to launch Telegram Bot polling: ${err.message || err}`;
        console.warn(`[Miyanji Bot] ${errMsg}`);
        appendBotLog(errMsg);
      });

    // Graceful stop
    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));
  } catch (err: any) {
    const errMsg = `⚠️ Error configuring bot: ${err.message || err}`;
    console.error(errMsg);
    appendBotLog(errMsg);
  }
}
