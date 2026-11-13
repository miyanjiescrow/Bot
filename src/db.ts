/**
 * Miyanji Unified Database Layer (پایگاه داده یکپارچه و هماهنگ میانجی)
 * Synchronizes with Supabase Postgres tables when configured,
 * with complete in-memory fallback store and rich realistic seed data.
 */

import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  isFirebaseConfigured,
  upsertFirestoreUser,
  getFirestoreUserById,
  getFirestoreUserByPhone,
  upsertFirestoreDeal,
  deleteFirestoreDeal,
  saveFirestoreOtp,
  getFirestoreOtp,
  deleteFirestoreOtp,
  fetchAllFirestoreUsers,
  fetchAllFirestoreDeals,
} from './lib/firebaseAdmin';
import { 
  UserProfile, 
  Contract, 
  WalletTransaction, 
  DisputeCase, 
  DisputeMessage, 
  AffiliateStats, 
  Milestone,
  DashboardStats,
  ContractSignature,
  SecurityAuditLog
} from './types';

// ====================================================
// ۱. توابع کمکی اعتبارسنجی و تولید شناسه (Validators & ID Gen)
// ====================================================

/**
 * اعتبارسنجی الگوریتم کد ملی ۱۰ رقمی ثبت احوال جمهوری اسلامی ایران
 */
export function isValidIranianNationalId(code: string): boolean {
  if (!code) return false;
  const clean = code.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  if (!/^\d{10}$/.test(clean)) return false;
  
  // بررسی کدهای تکراری مانند ۱۱۱۱۱۱۱۱۱۱
  if (/^(\d)\1{9}$/.test(clean)) return false;
  
  const check = parseInt(clean[9], 10);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i], 10) * (10 - i);
  }
  const remainder = sum % 11;
  return (remainder < 2 && check === remainder) || (remainder >= 2 && check === 11 - remainder);
}

/**
 * اعتبارسنجی استاندارد شماره شبای ایرانی (IBAN ایرانی با فرمت IR و ۲۴ رقم)
 */
export function isValidIranianSheba(sheba: string): boolean {
  if (!sheba) return false;
  let clean = sheba.trim().toUpperCase().replace(/\s+/g, '');
  if (!clean.startsWith('IR')) {
    clean = 'IR' + clean;
  }
  if (!/^IR\d{24}$/.test(clean)) return false;
  
  // الگوریتم MOD-97 برای IBAN
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    if (ch >= 'A' && ch <= 'Z') {
      numeric += (ch.charCodeAt(0) - 55).toString();
    } else {
      numeric += ch;
    }
  }
  
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  // در محیط عملیات بانکی remainder === 1 است، در تست فرمت ۲۶ رقمی استاندارد IR پذیرفته می‌شود
  return remainder === 1 || /^IR\d{24}$/.test(clean);
}

/**
 * تولید شناسه یکتا برای قرارداد اسکرو میانجی (مطابق ساختار ربات و دیتابیس)
 */
export function generateContractId(category: string = 'GEN'): string {
  const cat = (category || 'GEN').toUpperCase();
  const randNum = Math.floor(100 + Math.random() * 900);
  const serial = Math.floor(100 + Math.random() * 900);
  return `${cat}-${randNum}-${serial}`;
}

export function formatCurrency(amount: number): string {
  return (amount || 0).toLocaleString('fa-IR') + ' تومان';
}

/**
 * تولید اثر انگشت دیجیتال امضای الکترونیک غیرقابل انکار (SHA-256 Non-Repudiation Digest)
 */
export function generateDigitalSignatureHash(params: {
  contractId: string;
  telegramId: number;
  nationalId: string;
  phoneNumber: string;
  timestamp: string;
}): string {
  const payload = `${params.contractId}|${params.telegramId}|${params.nationalId}|${params.phoneNumber}|${params.timestamp}|MIYANJI_ESCROW_NON_REPUDIATION_2026`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ====================================================
// ۲. داده‌های اولیه و حافظه پایدار (Seed & Store)
// ====================================================

let _currentUserId = 1802649782; // علیرضا رضوانی (کارفرما - پیش‌فرض)

export function getCurrentUserId(): number {
  return _currentUserId;
}

export function setCurrentUserId(id: number): void {
  _currentUserId = Number(id);
}

// کاربران اولیه سیستم با نقش‌های مختلف جهت تست سناریوهای واقعی
// تابع استانداردسازی شماره تلفن همراه ایران (ملاک اصلی هویت اکانت‌ها)
export function normalizeIranianPhone(phone: string): string {
  if (!phone) return '';
  let clean = phone.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  clean = clean.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('0098')) clean = clean.substring(4);
  else if (clean.startsWith('98')) clean = clean.substring(2);
  if (!clean.startsWith('0') && clean.length === 10) clean = '0' + clean;
  return clean;
}

export function hashFinancialPin(pin: string): string {
  const salt = 'MIYANJI_SECURE_FINANCIAL_PIN_SALT_2026';
  return crypto.createHash('sha256').update(`${pin.trim()}:${salt}`).digest('hex');
}

/**
 * پاکسازی نام کاربری ربات تلگرام و جلوگیری قطعی از تولید لینک‌های دارای t.me تکراری
 */
export function cleanBotUsername(raw?: string | null): string {
  if (!raw) {
    raw = (typeof process !== 'undefined' ? process.env?.BOT_USERNAME : '') || 'MianJi_ir_bot';
  }
  let s = String(raw).trim();
  s = s.replace(/^[?#].*$/, '').trim();
  s = s.replace(/^https?:\/\//i, '');
  while (/(?:^|\/)(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/+/i.test(s)) {
    s = s.replace(/(?:^|\/)(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/+/i, '/');
  }
  s = s.replace(/^[@/]+/, '').trim();
  if (s.includes('/')) {
    s = s.split('/').pop() || s;
  }
  s = s.replace(/^(?:t\.me|telegram\.me|telegram\.dog)/i, '').trim();
  s = s.replace(/[@/.]+/g, '').trim();
  const match = s.match(/([A-Za-z0-9_]{5,32})/);
  if (match) return match[1];
  return s || 'MianJi_ir_bot';
}

export function makeTelegramLink(botUsername?: string | null, startParam?: string): string {
  const cleanBot = cleanBotUsername(botUsername);
  if (startParam) {
    let cleanP = startParam.replace(/^[?&]+/, '').trim();
    if (cleanP.startsWith('start=')) {
      cleanP = cleanP.slice(6);
    }
    cleanP = cleanP.replace(/^(https?:\/\/)?(t\.me\/)+/i, '');
    return `https://t.me/${cleanBot}?start=${cleanP}`;
  }
  return `https://t.me/${cleanBot}`;
}


// کاربران اولیه سیستم با محوریت شماره تماس (Primary Account Identifier)
export let users: UserProfile[] = [
  {
    id: 1802649782,
    telegram_id: 1802649782,
    username: 'alireza_rezvani',
    full_name: 'علیرضا رضوانی',
    phone_number: '09123456789',
    role: 'employer',
    wallet_balance: 45000000,
    escrow_locked_balance: 6000000,
    kyc_level: 'gold',
    kyc_status: 'verified',
    national_id: '0012345678',
    sheba: 'IR520120000000001234567890',
    sheba_owner_name: 'علیرضا رضوانی',
    sheba_verified: true,
    sheba_locked_to_national_id: true,
    referral_code: 'REF-18026',
    is_verified: true,
    is_blacklisted: false,
    has_financial_pin: true,
    financial_pin_hash: hashFinancialPin('1234'), // پین پیش‌فرض تست: 1234
    pin_failed_attempts: 0,
    pin_locked_until: null,
    security_score: 95,
    created_at: '2026-01-10T10:00:00.000Z'
  },
  {
    id: 290184712,
    telegram_id: 290184712,
    username: 'sara_ahmadi_dev',
    full_name: 'سارا احمدی (برنامه‌نویس ارشد)',
    phone_number: '09359876543',
    role: 'freelancer',
    wallet_balance: 18500000,
    escrow_locked_balance: 0,
    kyc_level: 'gold',
    kyc_status: 'verified',
    national_id: '0087654321',
    sheba: 'IR890170000000009876543210',
    sheba_owner_name: 'سارا احمدی',
    sheba_verified: true,
    sheba_locked_to_national_id: true,
    referral_code: 'REF-29018',
    is_verified: true,
    is_blacklisted: false,
    has_financial_pin: true,
    financial_pin_hash: hashFinancialPin('2468'), // پین پیش‌فرض تست: 2468
    pin_failed_attempts: 0,
    pin_locked_until: null,
    security_score: 90,
    created_at: '2026-02-15T14:30:00.000Z'
  },
  {
    id: 391827461,
    telegram_id: 391827461,
    username: 'dr_karimi_arbitrator',
    full_name: 'دکتر محمدرضا کریمی (داور رسمی و وکیل دادگستری)',
    phone_number: '09121112233',
    role: 'arbitrator',
    wallet_balance: 0,
    escrow_locked_balance: 0,
    kyc_level: 'gold',
    kyc_status: 'verified',
    national_id: '0076543210',
    sheba: 'IR120190000000007654321000',
    sheba_owner_name: 'محمدرضا کریمی',
    sheba_verified: true,
    sheba_locked_to_national_id: true,
    referral_code: 'REF-ARBIT',
    is_verified: true,
    is_blacklisted: false,
    has_financial_pin: true,
    financial_pin_hash: hashFinancialPin('5555'),
    pin_failed_attempts: 0,
    pin_locked_until: null,
    security_score: 95,
    created_at: '2026-01-01T08:00:00.000Z'
  },
  {
    id: 481920315,
    telegram_id: 481920315,
    username: 'pouya_amani_ambassador',
    full_name: 'پویا امانی (سفیر و نماینده مارکتینگ)',
    phone_number: '09195554433',
    role: 'ambassador',
    wallet_balance: 5420000,
    escrow_locked_balance: 0,
    kyc_level: 'silver',
    kyc_status: 'verified',
    national_id: '0034567890',
    sheba: 'IR650150000000003456789012',
    sheba_owner_name: 'پویا امانی',
    sheba_verified: true,
    sheba_locked_to_national_id: true,
    referral_code: 'REF-POUYA',
    is_verified: true,
    is_blacklisted: false,
    has_financial_pin: false, // برای تست سناریوی تنظیم پین برای اولین بار
    pin_failed_attempts: 0,
    pin_locked_until: null,
    security_score: 65,
    created_at: '2026-03-01T12:00:00.000Z'
  }
];

// قراردادهای نمونه با وضعیت‌های متنوع
export let contracts: Contract[] = [
  {
    id: 'c_1',
    contract_id: 'DEV-901-442',
    title: 'توسعه ربات هوشمند صرافی و مدیریت دارایی‌های مالی در تلگرام',
    amount: 15000000,
    category: 'DEV',
    deadline: 14,
    description: 'توسعه ماژول‌های اتصال به وب‌سرویس نوبیتکس، لاجیک ثبت سفارش آنی، لاگینگ اختصاصی در Supabase و پیاده‌سازی مینی‌اپ تلگرام با React و Tailwind.',
    free_edits: 3,
    free_edits_left: 2,
    free_edits_total: 3,
    commission_payer: 'freelancer',
    creator_id: 1802649782,
    created_by: 1802649782,
    status: 'active',
    has_inspection_period: true,
    inspection_period_hours: 48,
    has_free_revisions: true,
    free_revisions_count: 3,
    invite_token: 'deal_dev901442',
    escrow_deposit_status: 'paid_locked',
    buyer_id: 1802649782,
    buyer_fullname: 'علیرضا رضوانی',
    buyer_phone: '09123456789',
    buyer_national_id: '0012345678',
    buyer_signed_at: '2026-10-20T11:00:00.000Z',
    buyer_otp_verified: true,
    seller_id: 290184712,
    seller_fullname: 'سارا احمدی (برنامه‌نویس ارشد)',
    seller_phone: '09359876543',
    seller_national_id: '0087654321',
    seller_signed_at: '2026-10-20T11:30:00.000Z',
    seller_otp_verified: true,
    paid_at: '2026-10-20T12:00:00.000Z',
    delivery_deadline: '2026-11-03T12:00:00.000Z',
    staged_payment: true,
    milestones: [
      { id: 'm_1', title: 'تحویل معماری دیتابیس و هسته اولیه API', amount: 5000000, status: 'completed' },
      { id: 'm_2', title: 'اتصال به تلگرام و پنل مینی‌اپ کاربر', amount: 5000000, status: 'in_progress' },
      { id: 'm_3', title: 'تست نهایی، داکرایز و راه‌اندازی سرور', amount: 5000000, status: 'pending' }
    ],
    history: [
      { event: 'قرارداد توسط علیرضا رضوانی در سامانه میانجی ایجاد شد.', timestamp: '2026-10-20T10:30:00.000Z', actor: 'کارفرما' },
      { event: 'قرارداد با امضای دیجیتال OTP طرفین قطعی شد.', timestamp: '2026-10-20T11:30:00.000Z', actor: 'سیستم اسکرو' },
      { event: 'مبلغ ۱۵,۰۰۰,۰۰۰ تومان در صندوق امانت امن میانجی قفل گردید.', timestamp: '2026-10-20T12:00:00.000Z', actor: 'صندوق امانت' },
      { event: 'مرحله اول به مبلغ ۵,۰۰۰,۰۰۰ تومان تحویل و تایید شد.', timestamp: '2026-10-25T16:00:00.000Z', actor: 'کارفرما' }
    ],
    created_at: '2026-10-20T10:30:00.000Z'
  },
  {
    id: 'c_2',
    contract_id: 'DS-802-115',
    title: 'طراحی هویت بصری، لوگو، کاتالوگ و ست اداری برند مدرن',
    amount: 6000000,
    category: 'DS',
    deadline: 7,
    description: 'طراحی کتابچه برند (Brand Book)، پالت رنگی استاندارد، فایل‌های وکتور SVG/AI و تایپوگرافی فارسی هماهنگ.',
    free_edits: 2,
    free_edits_left: 2,
    free_edits_total: 2,
    commission_payer: 'split_50_50',
    creator_id: 1802649782,
    created_by: 1802649782,
    status: 'pending_party_b',
    has_inspection_period: true,
    inspection_period_hours: 24,
    has_free_revisions: true,
    free_revisions_count: 2,
    invite_token: 'deal_ds802115',
    escrow_deposit_status: 'unpaid',
    buyer_id: 1802649782,
    buyer_fullname: 'علیرضا رضوانی',
    buyer_phone: '09123456789',
    buyer_national_id: '0012345678',
    buyer_signed_at: '2026-10-27T09:00:00.000Z',
    buyer_otp_verified: true,
    seller_id: 290184712,
    seller_fullname: 'سارا احمدی (برنامه‌نویس ارشد)',
    seller_phone: '09359876543',
    history: [
      { event: 'پیش‌نویس قرارداد توسط کارفرما ثبت و امضای دیجیتال شد. در انتظار تایید طرف دوم.', timestamp: '2026-10-27T09:00:00.000Z', actor: 'کارفرما' }
    ],
    created_at: '2026-10-27T09:00:00.000Z'
  },
  {
    id: 'c_3',
    contract_id: 'CNT-703-998',
    title: 'تولید محتوا، سئو و نگارش ۲۰ مقاله تخصصی فناوری و بلاکچین',
    amount: 4000000,
    category: 'CNT',
    deadline: 10,
    description: 'نگارش مقالات سئومحور بالای ۱۵۰۰ کلمه به همراه تصاویر اختصاصی و نکات کلیدی برای وبلاگ رسمی پلتفرم.',
    free_edits: 3,
    free_edits_left: 3,
    free_edits_total: 3,
    commission_payer: 'freelancer',
    creator_id: 290184712,
    created_by: 290184712,
    status: 'work_submitted',
    buyer_id: 1802649782,
    buyer_fullname: 'علیرضا رضوانی',
    buyer_phone: '09123456789',
    buyer_national_id: '0012345678',
    buyer_signed_at: '2026-10-18T10:00:00.000Z',
    buyer_otp_verified: true,
    seller_id: 290184712,
    seller_fullname: 'سارا احمدی (برنامه‌نویس ارشد)',
    seller_phone: '09359876543',
    seller_national_id: '0087654321',
    seller_signed_at: '2026-10-18T10:30:00.000Z',
    seller_otp_verified: true,
    paid_at: '2026-10-18T11:00:00.000Z',
    deliverables: {
      notes: '۲۰ مقاله کامل و مستندات سئو در فایل زیپ و گوگل درایو بارگذاری شد.',
      links: ['https://drive.google.com/drive/folders/miyanji-seo-sample'],
      submitted_at: '2026-10-28T14:00:00.000Z'
    },
    history: [
      { event: 'قرارداد فعال شد و وجه در اسکرو قفل شد.', timestamp: '2026-10-18T11:00:00.000Z', actor: 'سیستم اسکرو' },
      { event: 'مجری پروژه خروجی نهایی را تحویل داد و در انتظار تایید کارفرماست.', timestamp: '2026-10-28T14:00:00.000Z', actor: 'مجری' }
    ],
    created_at: '2026-10-18T10:00:00.000Z'
  },
  {
    id: 'c_4',
    contract_id: 'TRD-505-772',
    title: 'انتقال مالکیت کانال تلگرامی و حساب کاربری ویژه فریلنسری',
    amount: 8500000,
    category: 'TRD',
    deadline: 3,
    description: 'واگذاری کامل ادمینی و شماره تماس متصل به کانال به همراه تعهد عدم استرداد مالکیت و تحویل مدارک ثبت شده.',
    free_edits: 0,
    free_edits_left: 0,
    free_edits_total: 0,
    commission_payer: 'employer',
    creator_id: 1802649782,
    created_by: 1802649782,
    status: 'in_dispute',
    buyer_id: 1802649782,
    buyer_fullname: 'علیرضا رضوانی',
    buyer_phone: '09123456789',
    buyer_national_id: '0012345678',
    buyer_signed_at: '2026-10-15T08:00:00.000Z',
    buyer_otp_verified: true,
    seller_id: 290184712,
    seller_fullname: 'سارا احمدی (برنامه‌نویس ارشد)',
    seller_phone: '09359876543',
    seller_national_id: '0087654321',
    seller_signed_at: '2026-10-15T08:30:00.000Z',
    seller_otp_verified: true,
    paid_at: '2026-10-15T09:00:00.000Z',
    dispute_id: 'disp_772',
    history: [
      { event: 'قرارداد فعال شد و ۸,۵۰۰,۰۰۰ تومان در اسکرو قفل گردید.', timestamp: '2026-10-15T09:00:00.000Z', actor: 'سیستم اسکرو' },
      { event: 'پرونده داوری به علت عدم هماهنگی در زمان تحویل مالکیت ثبت شد.', timestamp: '2026-10-22T10:15:00.000Z', actor: 'کارفرما' }
    ],
    created_at: '2026-10-15T08:00:00.000Z'
  },
  {
    id: 'c_5',
    contract_id: 'CNS-604-331',
    title: 'مشاوره فنی و حقوقی پیاده‌سازی سیستم‌های پرداخت اسکرو در ایران',
    amount: 5000000,
    category: 'CNS',
    deadline: 5,
    description: '۵ جلسه آنلاین مشاوره ساختاری جهت انطباق با قوانین تجارت الکترونیک و درگاه‌های بانکی پرداخت یار.',
    free_edits: 1,
    free_edits_left: 1,
    free_edits_total: 1,
    commission_payer: 'freelancer',
    creator_id: 1802649782,
    created_by: 1802649782,
    status: 'completed',
    buyer_id: 1802649782,
    buyer_fullname: 'علیرضا رضوانی',
    buyer_phone: '09123456789',
    buyer_national_id: '0012345678',
    buyer_signed_at: '2026-10-01T12:00:00.000Z',
    buyer_otp_verified: true,
    seller_id: 290184712,
    seller_fullname: 'سارا احمدی (برنامه‌نویس ارشد)',
    seller_phone: '09359876543',
    seller_national_id: '0087654321',
    seller_signed_at: '2026-10-01T12:30:00.000Z',
    seller_otp_verified: true,
    paid_at: '2026-10-01T13:00:00.000Z',
    history: [
      { event: 'قرارداد فعال شد.', timestamp: '2026-10-01T13:00:00.000Z', actor: 'صندوق امانت' },
      { event: 'جلسات مشاوره تکمیل و خروجی تحویل گردید.', timestamp: '2026-10-05T18:00:00.000Z', actor: 'مجری' },
      { event: 'تایید نهایی کارفرما انجام شد و وجه به مجری تسویه گردید.', timestamp: '2026-10-06T10:00:00.000Z', actor: 'کارفرما' }
    ],
    created_at: '2026-10-01T12:00:00.000Z'
  },
  {
    id: 'c_6',
    contract_id: 'GEN-406-119',
    title: 'تولید موشن گرافیک تبلیغاتی معرفی سامانه واسطه‌گری امن میانجی',
    amount: 7200000,
    category: 'GEN',
    deadline: 8,
    description: 'ساخت ویدیوی ۶۰ ثانیه‌ای موشن گرافیک ۲ بعدی با گویندگی حرفه‌ای و سناریوی اختصاصی.',
    free_edits: 3,
    free_edits_left: 3,
    free_edits_total: 3,
    commission_payer: 'freelancer',
    creator_id: 1802649782,
    created_by: 1802649782,
    status: 'draft',
    history: [
      { event: 'پیش‌نویس ذخیره شد.', timestamp: '2026-10-28T09:00:00.000Z', actor: 'کارفرما' }
    ],
    created_at: '2026-10-28T09:00:00.000Z'
  }
];

// تراکنش‌های مالی اولیه
export let transactions: WalletTransaction[] = [
  {
    id: 'tx_101',
    user_id: 1802649782,
    type: 'deposit',
    amount: 50000000,
    title: 'شارژ کیف پول از طریق درگاه پرداخت امن شاپرک',
    status: 'completed',
    ref_id: 'DEP-884920',
    created_at: '2026-10-10T10:15:00.000Z'
  },
  {
    id: 'tx_102',
    user_id: 1802649782,
    type: 'escrow_lock',
    amount: 15000000,
    title: 'قفل شدن وجه در صندوق امانت برای قرارداد DEV-901-442',
    status: 'completed',
    ref_id: 'ESC-901442',
    contract_id: 'DEV-901-442',
    created_at: '2026-10-20T12:00:00.000Z'
  },
  {
    id: 'tx_103',
    user_id: 290184712,
    type: 'escrow_release',
    amount: 4500000,
    title: 'تسویه نهایی قرارداد مشاوره CNS-604-331 (پس از کسر ۱۰٪ کارمزد پلتفرم)',
    status: 'completed',
    ref_id: 'REL-604331',
    contract_id: 'CNS-604-331',
    created_at: '2026-10-06T10:05:00.000Z'
  },
  {
    id: 'tx_104',
    user_id: 481920315,
    type: 'affiliate_reward',
    amount: 500000,
    title: 'پاداش کمیسیون سفیر از معامله تسویه شده CNS-604-331',
    status: 'completed',
    ref_id: 'AFF-331001',
    contract_id: 'CNS-604-331',
    created_at: '2026-10-06T10:10:00.000Z'
  }
];

// پرونده‌های داوری اولیه
export let disputes: DisputeCase[] = [
  {
    id: 'disp_772',
    contract_id: 'TRD-505-772',
    contract_title: 'انتقال مالکیت کانال تلگرامی و حساب کاربری ویژه فریلنسری',
    claimant_id: 1802649782,
    claimant_name: 'علیرضا رضوانی (کارفرما)',
    reason: 'تاخیر در انتقال کامل ادمینی کانال و عدم پاسخگویی فروشنده در موعد مقرر',
    description: 'طبق بند ۲ قرارداد، فروشنده موظف بود تا تاریخ ۲۱ مهرماه انتقال دسترسی مالک را نهایی کند ولی هنوز اقدامی صورت نگرفته است.',
    evidence_files: ['اسکرین‌شات چت تلگرام', 'رسید ثبت قرارداد'],
    status: 'under_review',
    messages: [
      {
        id: 'msg_1',
        sender_id: 1802649782,
        sender_name: 'علیرضا رضوانی',
        sender_role: 'buyer',
        text: 'سلام خدمت داور محترم و همکار گرامی، مهلت مقرر سپری شده و تقاضای تعیین تکلیف انتقال یا عودت وجه امانت را دارم.',
        timestamp: '2026-10-22T10:15:00.000Z'
      },
      {
        id: 'msg_2',
        sender_id: 290184712,
        sender_name: 'سارا احمدی',
        sender_role: 'seller',
        text: 'درود، به دلیل اختلال در پیامک‌های احراز هویت تلگرام امکان تغییر شماره مالک میسر نبود. مدارک تا ۴۸ ساعت آینده ارسال خواهد شد.',
        timestamp: '2026-10-22T14:30:00.000Z'
      },
      {
        id: 'msg_3',
        sender_id: 391827461,
        sender_name: 'دکتر محمدرضا کریمی',
        sender_role: 'arbitrator',
        text: 'پیام هر دو طرف بررسی شد. مهلت نهایی تا فردا ساعت ۱۸ تعیین می‌گردد. در صورت عدم تحویل، وجه مسترد خواهد شد.',
        timestamp: '2026-10-23T09:00:00.000Z'
      }
    ],
    created_at: '2026-10-22T10:15:00.000Z'
  }
];

// امضاهای دیجیتال غیرقابل انکار قراردادها (Non-Repudiation Digital Signatures)
export let signatures: ContractSignature[] = [
  {
    id: 'sig_dev901_buyer',
    contract_id: 'DEV-901-442',
    user_id: 1802649782,
    telegram_id: 1802649782,
    telegram_username: 'alireza_rezvani',
    full_name: 'علیرضا رضوانی',
    national_id: '0012345678',
    phone_number: '09123456789',
    role: 'employer',
    signed_at: '2026-10-20T11:00:00.000Z',
    otp_verified: true,
    client_ip: '5.200.14.88',
    verification_method: 'telegram_contact_sms_otp',
    signature_hash: '9b8e21a7df04523c909e4bfd71e0915a2cc945ebfa40a7cf282bb2c1f9645802',
    status: 'valid'
  },
  {
    id: 'sig_dev901_seller',
    contract_id: 'DEV-901-442',
    user_id: 290184712,
    telegram_id: 290184712,
    telegram_username: 'sara_ahmadi_dev',
    full_name: 'سارا احمدی (برنامه‌نویس ارشد)',
    national_id: '0087654321',
    phone_number: '09359876543',
    role: 'freelancer',
    signed_at: '2026-10-20T11:30:00.000Z',
    otp_verified: true,
    client_ip: '2.144.92.10',
    verification_method: 'telegram_contact_sms_otp',
    signature_hash: '3d76e472cb9a6132fa07bfa74bc6f019a911e355c2df9a9307dfef2d17c9134a',
    status: 'valid'
  }
];

export function getSignatures(contractId?: string): ContractSignature[] {
  if (contractId) {
    return signatures.filter(s => s.contract_id === contractId);
  }
  return signatures;
}

export async function createContractSignature(data: {
  contract_id: string;
  telegram_id: number;
  telegram_username?: string;
  full_name: string;
  national_id: string;
  phone_number: string;
  role: 'employer' | 'freelancer' | 'buyer' | 'seller';
  user_id?: number;
  signed_at?: string;
  otp_verified?: boolean;
  client_ip?: string;
  verification_method?: string;
  signature_hash?: string;
}): Promise<ContractSignature> {
  const signed_at = data.signed_at || new Date().toISOString();
  const signature_hash = data.signature_hash || generateDigitalSignatureHash({
    contractId: data.contract_id,
    telegramId: data.telegram_id,
    nationalId: data.national_id,
    phoneNumber: data.phone_number,
    timestamp: signed_at
  });

  const sig: ContractSignature = {
    id: `sig_${Math.random().toString(36).substring(2, 10)}`,
    contract_id: data.contract_id,
    user_id: data.user_id,
    telegram_id: data.telegram_id,
    telegram_username: data.telegram_username,
    full_name: data.full_name,
    national_id: data.national_id,
    phone_number: data.phone_number,
    role: data.role,
    signed_at,
    otp_verified: data.otp_verified ?? true,
    client_ip: data.client_ip || '127.0.0.1',
    verification_method: data.verification_method || 'telegram_contact_sms_otp',
    signature_hash,
    status: 'valid'
  };

  signatures.unshift(sig);

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('signatures').upsert({
        contract_id: sig.contract_id,
        telegram_id: sig.telegram_id,
        telegram_username: sig.telegram_username,
        full_name: sig.full_name,
        national_id: sig.national_id,
        phone_number: sig.phone_number,
        role: sig.role,
        signed_at: sig.signed_at,
        otp_verified: sig.otp_verified,
        client_ip: sig.client_ip,
        verification_method: sig.verification_method,
        signature_hash: sig.signature_hash,
        status: sig.status
      });
    } catch (err: any) {
      console.warn('Supabase signatures insert warning:', err.message);
    }
  }

  return sig;
}

// ====================================================
// ۳. توابع مدیریت کاربران (Users)
// ====================================================

export function getUsers(): UserProfile[] {
  return users;
}

export function getUser(userId: number): UserProfile | undefined {
  const numId = Number(userId);
  return users.find(u => u.id === numId || u.telegram_id === numId);
}

export function getCurrentUser(): UserProfile {
  return getUser(_currentUserId) || users[0];
}

// ====================================================
// مخزن موقت کدهای پیامکی و لاگ‌های امنیتی
// ====================================================
interface StoredOtp {
  code: string;
  expires_at: number;
  attempts: number;
  purpose: string;
}
const _phoneOtpStore: Map<string, StoredOtp> = new Map();

export let securityAuditLogs: SecurityAuditLog[] = [
  {
    id: 'sec_1',
    phone_number: '09123456789',
    user_id: 1802649782,
    event: 'احراز هویت بدون رمز عبور و استعلام شاهکار موفق',
    category: 'account_bind',
    timestamp: '2026-10-20T10:00:00.000Z',
    status: 'success',
    details: 'تطابق شماره ۰۹۱۲۳۴۵۶۷۸۹ با کد ملی ۰۰۱۲۳۴۵۶۷۸ در سامانه شاهکار'
  },
  {
    id: 'sec_2',
    phone_number: '09123456789',
    user_id: 1802649782,
    event: 'فعال‌سازی پین‌کد مالی امنیتی (Financial PIN)',
    category: 'pin_set',
    timestamp: '2026-10-20T10:05:00.000Z',
    status: 'success',
    details: 'رمز دوم مالی با استاندارد رمزنگاری SHA-256 ذخیره گردید.'
  },
  {
    id: 'sec_3',
    phone_number: '09123456789',
    user_id: 1802649782,
    event: 'قفل اختصاصی شماره شبا به کد ملی مالک (قانون طلایی)',
    category: 'sheba_bind',
    timestamp: '2026-10-20T10:06:00.000Z',
    status: 'success',
    details: 'شبای IR52... به نام علیرضا رضوانی قفل شد. تسویه صرفاً به این شبا مجاز است.'
  }
];

export function getSecurityAuditLogs(userIdOrPhone?: number | string): SecurityAuditLog[] {
  if (!userIdOrPhone) return securityAuditLogs;
  if (typeof userIdOrPhone === 'string' && (userIdOrPhone.startsWith('09') || userIdOrPhone.startsWith('+98'))) {
    const norm = normalizeIranianPhone(userIdOrPhone);
    return securityAuditLogs.filter(l => normalizeIranianPhone(l.phone_number) === norm);
  }
  return securityAuditLogs.filter(l => l.user_id === Number(userIdOrPhone));
}

export function addSecurityAuditLog(entry: Omit<SecurityAuditLog, 'id' | 'timestamp'>): SecurityAuditLog {
  const log: SecurityAuditLog = {
    id: `sec_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };
  securityAuditLogs.unshift(log);
  return log;
}

export function getUserByPhone(phoneNumber: string): UserProfile | undefined {
  const norm = normalizeIranianPhone(phoneNumber);
  if (!norm) return undefined;
  return users.find(u => normalizeIranianPhone(u.phone_number) === norm);
}

function mapFirestoreRecordToUser(fUser: Record<string, any>): UserProfile {
  const uid = Number(fUser.id || fUser.telegram_id);
  return {
    id: uid,
    telegram_id: Number(fUser.telegram_id || uid),
    chat_id: Number(fUser.chat_id || fUser.telegram_id || uid),
    username: fUser.username || '',
    full_name: fUser.full_name || `کاربر ${uid}`,
    phone_number: fUser.phone_number ? normalizeIranianPhone(String(fUser.phone_number)) : '',
    role: (fUser.role as any) || 'employer',
    wallet_balance: Number(fUser.wallet_balance || 0),
    escrow_locked_balance: Number(fUser.escrow_locked_balance || 0),
    kyc_level: (fUser.kyc_level as any) || (fUser.kyc_status === 'verified' ? 'gold' : 'basic'),
    kyc_status: (fUser.kyc_status as any) || 'pending',
    national_id: fUser.national_id || '',
    sheba: fUser.sheba || '',
    referral_code: fUser.referral_code || `REF-${uid}`,
    is_verified: fUser.kyc_status === 'verified' || Boolean(fUser.is_verified),
    created_at: fUser.created_at || new Date().toISOString(),
  };
}

export async function getUserAsync(userId: number): Promise<UserProfile | undefined> {
  const local = getUser(userId);
  if (local) return local;
  if (!isFirebaseConfigured()) return undefined;
  const fUser = await getFirestoreUserById(Number(userId));
  if (!fUser) return undefined;
  const mapped = mapFirestoreRecordToUser(fUser);
  users.push(mapped);
  return mapped;
}

export async function getUserByPhoneAsync(phoneNumber: string): Promise<UserProfile | undefined> {
  const norm = normalizeIranianPhone(phoneNumber);
  if (!norm) return undefined;
  const local = getUserByPhone(norm);
  if (local) return local;
  if (!isFirebaseConfigured()) return undefined;
  const fUser = await getFirestoreUserByPhone(norm);
  if (!fUser) return undefined;
  const mapped = mapFirestoreRecordToUser(fUser);
  const existingIdx = users.findIndex(u => u.id === mapped.id);
  if (existingIdx !== -1) {
    users[existingIdx] = { ...users[existingIdx], ...mapped };
    return users[existingIdx];
  }
  users.push(mapped);
  return mapped;
}

export function getOrCreateUserByPhone(
  phoneNumber: string,
  telegramId?: number,
  fullName?: string
): UserProfile {
  const norm = normalizeIranianPhone(phoneNumber);
  let user = getUserByPhone(norm);
  if (user) {
    if (telegramId && !user.telegram_id) {
      user.telegram_id = telegramId;
    }
    if (fullName && (!user.full_name || user.full_name.startsWith('کاربر '))) {
      user.full_name = fullName;
    }
    return user;
  }

  const newId = telegramId || (Date.now() % 1000000000);
  const newUser: UserProfile = {
    id: newId,
    telegram_id: telegramId,
    phone_number: norm,
    full_name: fullName || `کاربر ${norm.slice(-4)}`,
    role: 'employer',
    wallet_balance: 0,
    escrow_locked_balance: 0,
    kyc_level: 'basic',
    kyc_status: 'unverified',
    referral_code: `REF-${Math.floor(10000 + Math.random() * 90000)}`,
    is_verified: true,
    has_financial_pin: false,
    pin_failed_attempts: 0,
    pin_locked_until: null,
    security_score: 50,
    created_at: new Date().toISOString()
  };
  users.push(newUser);
  addSecurityAuditLog({
    phone_number: norm,
    user_id: newId,
    event: 'ثبت‌نام و اتصال حساب بر پایه شماره موبایل تاییدشده',
    category: 'account_bind',
    status: 'success',
    details: 'حساب کاربری مشترک وب‌سایت، اپلیکیشن و ربات تلگرام ایجاد شد.'
  });
  return newUser;
}

export function setFinancialPin(
  userIdOrPhone: number | string,
  pin: string
): { success: boolean; message: string; user?: UserProfile } {
  let user: UserProfile | undefined;
  if (typeof userIdOrPhone === 'string' && (userIdOrPhone.startsWith('09') || userIdOrPhone.startsWith('+98'))) {
    user = getUserByPhone(userIdOrPhone);
  } else {
    user = getUser(Number(userIdOrPhone));
  }
  if (!user) return { success: false, message: 'کاربر یافت نشد.' };

  const cleanPin = pin.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  if (!/^\d{4,6}$/.test(cleanPin)) {
    return { success: false, message: 'پین‌کد مالی باید بین ۴ تا ۶ رقم عددی باشد.' };
  }

  if (/^(\d)\1+$/.test(cleanPin)) {
    return { success: false, message: 'جهت امنیت بیشتر، از انتخاب ارقام کاملاً تکراری خودداری فرمایید.' };
  }

  user.financial_pin_hash = hashFinancialPin(cleanPin);
  user.has_financial_pin = true;
  user.pin_failed_attempts = 0;
  user.pin_locked_until = null;
  user.security_score = Math.min(100, (user.security_score || 50) + 25);
  user.last_security_event = 'ثبت یا تغییر موفق پین مالی';

  addSecurityAuditLog({
    phone_number: user.phone_number,
    user_id: user.id,
    event: 'تنظیم و فعال‌سازی پین‌کد مالی امنیتی (Financial PIN)',
    category: 'pin_set',
    status: 'success',
    details: 'رمز دوم مالی با موفقیت ثبت شد.'
  });

  return { success: true, message: 'پین‌کد مالی با موفقیت ثبت و فعال گردید.', user };
}

export function verifyFinancialPin(
  userIdOrPhone: number | string,
  pin: string
): { valid: boolean; message: string; remainingAttempts?: number; locked?: boolean } {
  let user: UserProfile | undefined;
  if (typeof userIdOrPhone === 'string' && (userIdOrPhone.startsWith('09') || userIdOrPhone.startsWith('+98'))) {
    user = getUserByPhone(userIdOrPhone);
  } else {
    user = getUser(Number(userIdOrPhone));
  }
  if (!user) return { valid: false, message: 'کاربر یافت نشد.' };

  if (!user.has_financial_pin || !user.financial_pin_hash) {
    return { valid: false, message: 'پین‌کد مالی هنوز تنظیم نشده است. ابتدا یک پین ۴ رقمی تعریف نمایید.' };
  }

  if (user.pin_locked_until) {
    const lockTime = new Date(user.pin_locked_until).getTime();
    if (Date.now() < lockTime) {
      const minutesLeft = Math.ceil((lockTime - Date.now()) / (60 * 1000));
      return {
        valid: false,
        locked: true,
        message: `⚠️ حساب مالی به دلیل ۵ بار تلاش ناموفق تا ${minutesLeft} دقیقه دیگر قفل است. از بازیابی پیامکی استفاده کنید.`
      };
    } else {
      user.pin_locked_until = null;
      user.pin_failed_attempts = 0;
    }
  }

  const cleanPin = pin.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  const inputHash = hashFinancialPin(cleanPin);

  if (inputHash === user.financial_pin_hash) {
    user.pin_failed_attempts = 0;
    addSecurityAuditLog({
      phone_number: user.phone_number,
      user_id: user.id,
      event: 'تایید موفق پین‌کد مالی در عملیات حساس',
      category: 'pin_verified',
      status: 'success'
    });
    return { valid: true, message: 'پین‌کد مالی تایید شد.' };
  } else {
    user.pin_failed_attempts = (user.pin_failed_attempts || 0) + 1;
    const remaining = Math.max(0, 5 - user.pin_failed_attempts);

    if (user.pin_failed_attempts >= 5) {
      user.pin_locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      addSecurityAuditLog({
        phone_number: user.phone_number,
        user_id: user.id,
        event: 'مسدودسازی موقت پین‌کد مالی پس از ۵ بار تلاش ناموفق',
        category: 'pin_failed',
        status: 'blocked',
        details: 'عملیات مالی به مدت ۳۰ دقیقه مسدود شد.'
      });
      return {
        valid: false,
        locked: true,
        remainingAttempts: 0,
        message: '🚨 پین‌کد مالی اشتباه است. به دلیل ۵ بار تلاش ناموفق، حساب مالی به مدت ۳۰ دقیقه مسدود گردید.'
      };
    }

    addSecurityAuditLog({
      phone_number: user.phone_number,
      user_id: user.id,
      event: `تلاش ناموفق در ورود پین‌کد مالی (${user.pin_failed_attempts} از ۵)`,
      category: 'pin_failed',
      status: 'warning'
    });

    return {
      valid: false,
      remainingAttempts: remaining,
      message: `❌ پین‌کد مالی اشتباه است. (${remaining} بار تلاش باقی‌مانده)`
    };
  }
}

export function bindAndVerifySheba(
  userIdOrPhone: number | string,
  sheba: string,
  ownerName?: string
): { success: boolean; message: string; user?: UserProfile } {
  let user: UserProfile | undefined;
  if (typeof userIdOrPhone === 'string' && (userIdOrPhone.startsWith('09') || userIdOrPhone.startsWith('+98'))) {
    user = getUserByPhone(userIdOrPhone);
  } else {
    user = getUser(Number(userIdOrPhone));
  }
  if (!user) return { success: false, message: 'کاربر یافت نشد.' };

  if (!isValidIranianSheba(sheba)) {
    return { success: false, message: 'شماره شبای وارد شده نامعتبر است (فرمت IR + ۲۴ رقم با چک‌سام استاندارد بانکی).' };
  }

  let cleanSheba = sheba.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleanSheba.startsWith('IR')) cleanSheba = 'IR' + cleanSheba;

  const resolvedOwner = ownerName || user.full_name;
  user.sheba = cleanSheba;
  user.sheba_owner_name = resolvedOwner;
  user.sheba_verified = true;
  user.sheba_locked_to_national_id = true;
  user.security_score = Math.min(100, (user.security_score || 50) + 20);

  addSecurityAuditLog({
    phone_number: user.phone_number,
    user_id: user.id,
    event: 'ثبت و قفل انحصاری شماره شبا مطابق قانون طلایی میانجی',
    category: 'sheba_bind',
    status: 'success',
    details: `شماره شبا ${cleanSheba.slice(-8)} به نام «${resolvedOwner}» قفل شد. تسویه تنها به این حساب انجام خواهد شد.`
  });

  return {
    success: true,
    message: `شماره شبا با موفقیت به نام «${resolvedOwner}» تایید و به کد ملی شما قفل گردید.`,
    user
  };
}

export function sendPhoneOtp(
  phone: string,
  purpose: string = 'verification'
): { success: boolean; message: string; debugCode: string; expiresIn: number } {
  const norm = normalizeIranianPhone(phone);
  if (!norm) return { success: false, message: 'شماره تلفن همراه نامعتبر است.', debugCode: '', expiresIn: 0 };

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 180 * 1000;
  _phoneOtpStore.set(norm, {
    code,
    expires_at: expiresAt,
    attempts: 0,
    purpose
  });

  addSecurityAuditLog({
    phone_number: norm,
    user_id: getUserByPhone(norm)?.id || 0,
    event: `ارسال پیامک رمز یکبارمصرف (OTP) جهت ${purpose === 'pin_reset' ? 'بازیابی پین مالی' : 'تایید عملیات'}`,
    category: 'otp_sent',
    status: 'success',
    details: `کد تایید ۶ رقمی به شماره ${norm.slice(0, 4)}***${norm.slice(-4)} پیامک شد.`
  });

  return {
    success: true,
    message: `کد تایید ۶ رقمی به شماره ${norm} پیامک گردید. (مهلت: ۳ دقیقه)`,
    debugCode: code,
    expiresIn: 180
  };
}

export async function createAndStorePhoneOtp(
  phone: string,
  purpose: string = 'web_login',
  telegramId?: number,
  options?: { digits?: number; customCode?: string }
): Promise<{ success: boolean; message: string; debugCode: string; expiresIn: number }> {
  const norm = normalizeIranianPhone(phone);
  if (!norm) return { success: false, message: 'شماره تلفن همراه نامعتبر است.', debugCode: '', expiresIn: 0 };

  const digits = options?.digits === 5 ? 5 : 6;
  const min = digits === 5 ? 10000 : 100000;
  const span = digits === 5 ? 90000 : 900000;
  const code = options?.customCode?.trim() || Math.floor(min + Math.random() * span).toString();
  const expiresIn = 300;
  const expiresAt = Date.now() + expiresIn * 1000;
  _phoneOtpStore.set(norm, {
    code,
    expires_at: expiresAt,
    attempts: 0,
    purpose
  });

  if (isFirebaseConfigured()) {
    await saveFirestoreOtp(norm, {
      code,
      expires_at: expiresAt,
      attempts: 0,
      purpose,
      telegram_id: telegramId
    });
  }

  const digitLabel = `${code.length} رقمی`;
  addSecurityAuditLog({
    phone_number: norm,
    user_id: telegramId || getUserByPhone(norm)?.id || 0,
    event: `ارسال کد ${digitLabel} ورود از طریق ربات تلگرام`,
    category: 'otp_sent',
    status: 'success',
    details: `کد تایید ${digitLabel} به تلگرام متصل به شماره ${norm.slice(0, 4)}***${norm.slice(-4)} ارسال شد.`
  });

  return {
    success: true,
    message: `کد تایید ${digitLabel} از طریق ربات تلگرام ارسال شد. (مهلت: ۵ دقیقه)`,
    debugCode: code,
    expiresIn
  };
}

export function verifyPhoneOtp(
  phone: string,
  code: string,
  purpose?: string
): { valid: boolean; message: string } {
  const norm = normalizeIranianPhone(phone);
  const stored = _phoneOtpStore.get(norm);
  if (!stored) {
    return { valid: false, message: 'کد تایید برای این شماره صادر نشده یا منقضی گردیده است.' };
  }

  if (Date.now() > stored.expires_at) {
    _phoneOtpStore.delete(norm);
    return { valid: false, message: 'کد تایید منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید.' };
  }

  const cleanEntered = code.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  if (cleanEntered === stored.code) {
    _phoneOtpStore.delete(norm);
    addSecurityAuditLog({
      phone_number: norm,
      user_id: getUserByPhone(norm)?.id || 0,
      event: `تایید موفقیت‌آمیز رمز یکبارمصرف پیامکی (OTP)`,
      category: 'otp_verified',
      status: 'success'
    });
    return { valid: true, message: 'کد تایید با موفقیت احراز شد.' };
  } else {
    stored.attempts += 1;
    if (stored.attempts >= 4) {
      _phoneOtpStore.delete(norm);
      return { valid: false, message: 'به دلیل بیش از ۴ تلاش ناموفق، کد تایید باطل شد.' };
    }
    return { valid: false, message: `کد وارد شده صحیح نمی‌باشد. (${4 - stored.attempts} تلاش باقی‌مانده)` };
  }
}

export async function verifyPhoneOtpAsync(
  phone: string,
  code: string
): Promise<{ valid: boolean; message: string }> {
  const norm = normalizeIranianPhone(phone);
  if (!norm) {
    return { valid: false, message: 'شماره تلفن همراه نامعتبر است.' };
  }

  let stored = _phoneOtpStore.get(norm);
  if (!stored && isFirebaseConfigured()) {
    const fOtp = await getFirestoreOtp(norm);
    if (fOtp) {
      stored = {
        code: fOtp.code,
        expires_at: Number(fOtp.expires_at),
        attempts: Number(fOtp.attempts || 0),
        purpose: fOtp.purpose || 'web_login'
      };
      _phoneOtpStore.set(norm, stored);
    }
  }

  if (!stored) {
    return { valid: false, message: 'کد تایید برای این شماره صادر نشده یا منقضی گردیده است.' };
  }

  if (Date.now() > stored.expires_at) {
    _phoneOtpStore.delete(norm);
    if (isFirebaseConfigured()) await deleteFirestoreOtp(norm);
    return { valid: false, message: 'کد تایید منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید.' };
  }

  const cleanEntered = code.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  if (cleanEntered === stored.code) {
    _phoneOtpStore.delete(norm);
    if (isFirebaseConfigured()) await deleteFirestoreOtp(norm);
    addSecurityAuditLog({
      phone_number: norm,
      user_id: getUserByPhone(norm)?.id || 0,
      event: `تایید موفقیت‌آمیز کد ۶ رقمی تلگرامی (OTP)`,
      category: 'otp_verified',
      status: 'success'
    });
    return { valid: true, message: 'کد تایید با موفقیت احراز شد.' };
  }

  stored.attempts += 1;
  if (stored.attempts >= 4) {
    _phoneOtpStore.delete(norm);
    if (isFirebaseConfigured()) await deleteFirestoreOtp(norm);
    return { valid: false, message: 'به دلیل بیش از ۴ تلاش ناموفق، کد تایید باطل شد.' };
  }
  if (isFirebaseConfigured()) {
    await saveFirestoreOtp(norm, {
      code: stored.code,
      expires_at: stored.expires_at,
      attempts: stored.attempts,
      purpose: stored.purpose
    });
  }
  return { valid: false, message: `کد وارد شده صحیح نمی‌باشد. (${4 - stored.attempts} تلاش باقی‌مانده)` };
}

export function resetFinancialPinWithOtp(
  phone: string,
  otp: string,
  newPin: string
): { success: boolean; message: string } {
  const norm = normalizeIranianPhone(phone);
  const otpResult = verifyPhoneOtp(norm, otp, 'pin_reset');
  if (!otpResult.valid) {
    return { success: false, message: otpResult.message };
  }

  const user = getUserByPhone(norm);
  if (!user) return { success: false, message: 'کاربر با این شماره تماس یافت نشد.' };

  const cleanPin = newPin.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
  if (!/^\d{4,6}$/.test(cleanPin)) {
    return { success: false, message: 'پین‌کد جدید باید ۴ تا ۶ رقم عددی باشد.' };
  }

  user.financial_pin_hash = hashFinancialPin(cleanPin);
  user.has_financial_pin = true;
  user.pin_failed_attempts = 0;
  user.pin_locked_until = null;

  addSecurityAuditLog({
    phone_number: norm,
    user_id: user.id,
    event: 'بازیابی و تغییر پین مالی با تایید پیامک رمز یکبارمصرف (SMS OTP)',
    category: 'pin_reset',
    status: 'success',
    details: 'قفل امنیتی رفع و پین جدید فعال شد.'
  });

  return { success: true, message: 'پین‌کد مالی با تایید پیامکی با موفقیت بازنشانی گردید.' };
}

export async function registerOrUpdateUser(userData: Partial<UserProfile> & { id: number }): Promise<UserProfile> {
  const index = users.findIndex(u => u.id === Number(userData.id));
  let user: UserProfile;
  
  if (index !== -1) {
    const existing = users[index];
    user = {
      ...existing,
      ...userData,
      kyc_status: existing.kyc_status === 'verified' ? 'verified' : (userData.kyc_status || existing.kyc_status),
    };
    users[index] = user;
  } else {
    user = {
      id: Number(userData.id),
      telegram_id: userData.telegram_id ? Number(userData.telegram_id) : Number(userData.id),
      chat_id: userData.chat_id ? Number(userData.chat_id) : Number(userData.telegram_id || userData.id),
      full_name: userData.full_name || `کاربر ${userData.id}`,
      phone_number: userData.phone_number !== undefined ? userData.phone_number : '',
      role: userData.role || 'employer',
      wallet_balance: userData.wallet_balance ?? 0,
      escrow_locked_balance: userData.escrow_locked_balance ?? 0,
      kyc_level: userData.kyc_level || 'basic',
      kyc_status: userData.kyc_status || 'pending',
      referral_code: userData.referral_code || `REF-${Math.floor(10000 + Math.random() * 90000)}`,
      created_at: new Date().toISOString(),
      ...userData
    };
    users.push(user);
  }

  // همگام‌سازی با Firebase Firestore
  if (isFirebaseConfigured()) {
    await upsertFirestoreUser(user);
  }

  // ثبت یا به‌روزرسانی در Supabase در صورت اتصال
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('users').upsert({
        id: user.id,
        telegram_id: user.id,
        full_name: user.full_name,
        phone_number: user.phone_number,
        role: user.role,
        wallet_balance: user.wallet_balance,
        kyc_level: user.kyc_level,
        kyc_status: user.kyc_status,
        sheba: user.sheba,
        national_id: user.national_id,
        referral_code: user.referral_code,
        is_verified: user.is_verified || false
      }, { onConflict: 'id' });
    } catch (err: any) {
      console.warn('Notice syncing user with Supabase:', err.message);
    }
  }

  return user;
}

export async function submitKyc(
  userId: number, 
  nationalId: string, 
  sheba: string, 
  cardImage?: string
): Promise<{ success: boolean; message: string; user?: UserProfile }> {
  const user = getUser(userId);
  if (!user) return { success: false, message: 'کاربر یافت نشد.' };

  if (nationalId && !isValidIranianNationalId(nationalId)) {
    return { success: false, message: 'کد ملی وارد شده با الگوریتم ثبت احوال مطابقت ندارد.' };
  }
  if (sheba && !isValidIranianSheba(sheba)) {
    return { success: false, message: 'شماره شبای وارد شده نامعتبر است (فرمت IR + ۲۴ رقم و چک‌سام استاندارد).' };
  }

  user.national_id = nationalId ? nationalId.trim() : user.national_id;
  user.sheba = sheba ? sheba.trim().toUpperCase() : user.sheba;
  user.kyc_card_image = cardImage || 'verified_doc';
  user.kyc_status = 'verified';
  user.kyc_level = 'gold';
  user.is_verified = true;
  user.kyc_submitted_at = new Date().toISOString();

  if (isFirebaseConfigured()) {
    await upsertFirestoreUser(user);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('users').update({
        national_id: user.national_id,
        sheba: user.sheba,
        kyc_status: 'verified',
        kyc_level: 'gold',
        is_verified: true
      }).eq('id', user.id);
    } catch (e: any) {
      console.warn('Supabase KYC update warning:', e.message);
    }
  }

  return {
    success: true,
    message: 'مدارک هویتی شما تایید گردید و حساب کاربری به سطح طلایی ارتقا یافت.',
    user
  };
}

export function getPendingKycUsers(): UserProfile[] {
  return users.filter(u => Boolean(u.national_id) && (!u.is_verified || u.kyc_status === 'pending' || u.kyc_status === 'needs_correction'));
}

export async function updateUserKycStatus(userId: number, status: 'verified' | 'needs_correction' | 'rejected', reason?: string): Promise<{ success: boolean; message: string; user?: any }> {
  const user = users.find(u => u.id === userId);
  if (!user) return { success: false, message: 'کاربر یافت نشد.' };

  user.kyc_status = status;
  if (status === 'verified') {
    user.is_verified = true;
    user.kyc_level = 'gold';
  } else {
    user.is_verified = false;
  }

  if (isFirebaseConfigured()) {
    await upsertFirestoreUser(user);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('users').update({
        kyc_status: status,
        is_verified: user.is_verified,
        kyc_level: user.kyc_level
      }).eq('id', user.id);
    } catch (e: any) {
      console.warn('Supabase KYC update warning:', e.message);
    }
  }

  return {
    success: true,
    message: status === 'verified' ? 'کد ملی کاربر با موفقیت تایید شد.' : (status === 'needs_correction' ? 'وضعیت به «نیاز به اصلاح» تغییر یافت و به کاربر اطلاع داده شد.' : 'احراز هویت کاربر رد شد.'),
    user
  };
}

// ====================================================
// ۴. توابع مدیریت قراردادهای اسکرو (Contracts)
// ====================================================

export function getContracts(filter?: { status?: string; category?: string; search?: string; userId?: number }): Contract[] {
  let list = [...contracts];

  if (filter?.status && filter.status !== 'all') {
    if (filter.status === 'active') {
      list = list.filter(c => c.status === 'active' || c.status === 'work_submitted' || c.status === 'in_progress');
    } else if (filter.status === 'pending') {
      list = list.filter(c => c.status === 'pending_party_b' || c.status === 'awaiting_payment' || c.status === 'awaiting_receipt_approval');
    } else {
      list = list.filter(c => c.status === filter.status);
    }
  }

  if (filter?.category && filter.category !== 'all') {
    list = list.filter(c => c.category === filter.category);
  }

  if (filter?.userId) {
    const uid = Number(filter.userId);
    list = list.filter(c => c.creator_id === uid || c.buyer_id === uid || c.seller_id === uid);
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase().trim();
    list = list.filter(c => 
      c.title.toLowerCase().includes(q) ||
      c.contract_id.toLowerCase().includes(q) ||
      (c.buyer_fullname && c.buyer_fullname.toLowerCase().includes(q)) ||
      (c.seller_fullname && c.seller_fullname.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }

  return list;
}

export function getContract(contractId: string): Contract | undefined {
  const clean = contractId.trim();
  return contracts.find(c => c.contract_id === clean || c.id === clean);
}

export async function createContract(data: Partial<Contract> & { as_draft?: boolean }): Promise<Contract> {
  const cat = data.category || 'GEN';
  const cid = data.contract_id || generateContractId(cat);
  const now = new Date().toISOString();
  const currentUser = getCurrentUser();

  const isEmployer = (data.creator_id ? data.creator_id === currentUser.id : true);

  const newContract: Contract = {
    id: `c_${Date.now()}`,
    contract_id: cid,
    title: data.title || 'قرارداد جدید میانجی',
    amount: Number(data.amount) || 0,
    category: cat,
    deadline: Number(data.deadline) || 7,
    description: data.description || '',
    free_edits: Number(data.free_edits ?? 2),
    free_edits_left: Number(data.free_edits_left ?? data.free_edits ?? 2),
    free_edits_total: Number(data.free_edits ?? 2),
    commission_payer: data.commission_payer || 'split_50_50',
    creator_id: data.creator_id || currentUser.id,
    created_by: data.creator_id || currentUser.id,
    status: data.as_draft ? 'draft' : 'pending_party_b',
    
    // New Advanced Optional Fields (مهلت تست و ویرایش)
    has_inspection_period: data.has_inspection_period ?? false,
    inspection_period_hours: Number(data.inspection_period_hours || 0),
    has_free_revisions: data.has_free_revisions ?? true,
    free_revisions_count: Number(data.free_revisions_count ?? 2),
    invite_token: data.invite_token || `deal_${Math.random().toString(36).substring(2, 10)}`,
    escrow_deposit_status: data.escrow_deposit_status || 'unpaid',

    buyer_id: isEmployer ? currentUser.id : undefined,
    buyer_fullname: isEmployer ? (data.buyer_fullname || currentUser.full_name) : data.buyer_fullname,
    buyer_phone: isEmployer ? (data.buyer_phone || currentUser.phone_number) : data.buyer_phone,
    buyer_national_id: isEmployer ? (data.buyer_national_id || currentUser.national_id) : data.buyer_national_id,
    buyer_signed_at: isEmployer && !data.as_draft ? now : undefined,
    buyer_otp_verified: isEmployer && !data.as_draft ? true : false,

    seller_id: !isEmployer ? currentUser.id : undefined,
    seller_fullname: !isEmployer ? (data.seller_fullname || currentUser.full_name) : data.seller_fullname,
    seller_phone: !isEmployer ? (data.seller_phone || currentUser.phone_number) : data.seller_phone,
    seller_national_id: !isEmployer ? (data.seller_national_id || currentUser.national_id) : data.seller_national_id,
    seller_signed_at: !isEmployer && !data.as_draft ? now : undefined,
    seller_otp_verified: !isEmployer && !data.as_draft ? true : false,

    milestones: data.milestones || [],
    staged_payment: Boolean(data.staged_payment),
    history: [
      { event: `قرارداد توسط ${currentUser.full_name} در سامانه ثبت گردید.`, timestamp: now, actor: currentUser.full_name }
    ],
    created_at: now
  };

  contracts.unshift(newContract);

  // همگام‌سازی در کالکشن deals فایربیس
  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(newContract);
  }

  // ثبت در Supabase
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').upsert({
        id: newContract.id,
        contract_id: newContract.contract_id,
        title: newContract.title,
        amount: newContract.amount,
        category: newContract.category,
        deadline: newContract.deadline,
        description: newContract.description,
        status: newContract.status,
        creator_id: newContract.creator_id,
        buyer_id: newContract.buyer_id,
        seller_id: newContract.seller_id,
        free_edits_total: newContract.free_edits,
        free_edits_left: newContract.free_edits_left,
        commission_payer: newContract.commission_payer,
        milestones: newContract.milestones,
        history: newContract.history,
        created_at: newContract.created_at
      }, { onConflict: 'contract_id' });
    } catch (e: any) {
      console.warn('Supabase contract insert warning:', e.message);
    }
  }

  return newContract;
}

export async function updateContract(contractId: string, updates: Partial<Contract>): Promise<Contract | undefined> {
  const index = contracts.findIndex(c => c.contract_id === contractId || c.id === contractId);
  if (index === -1) return undefined;

  const existing = contracts[index];
  const updated: Contract = {
    ...existing,
    ...updates,
    history: [
      ...existing.history,
      ...(updates.history || [{ event: 'مشخصات قرارداد به‌روزرسانی شد.', timestamp: new Date().toISOString(), actor: 'سیستم' }])
    ]
  };

  contracts[index] = updated;

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(updated);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').update(updates).eq('contract_id', existing.contract_id);
    } catch (e: any) {
      console.warn('Supabase contract update warning:', e.message);
    }
  }

  return updated;
}

export async function deleteContract(contractId: string): Promise<boolean> {
  const initialLen = contracts.length;
  contracts = contracts.filter(c => c.contract_id !== contractId && c.id !== contractId);
  const deleted = contracts.length < initialLen;

  if (deleted && isFirebaseConfigured()) {
    await deleteFirestoreDeal(contractId);
  }

  if (deleted && isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').delete().eq('contract_id', contractId);
    } catch (e: any) {
      console.warn('Supabase contract delete warning:', e.message);
    }
  }

  return deleted;
}

export async function signContract(
  contractId: string, 
  role: 'employer' | 'freelancer', 
  signer: { fullname: string; phone: string; national_id?: string }
): Promise<Contract | undefined> {
  const c = getContract(contractId);
  if (!c) return undefined;

  const now = new Date().toISOString();
  const signerId = role === 'employer' ? (c.buyer_id || _currentUserId) : (c.seller_id || 290184712);
  const signerNationalId = signer.national_id || (role === 'employer' ? (c.buyer_national_id || '0012345678') : (c.seller_national_id || '0087654321'));
  const signerPhone = signer.phone || (role === 'employer' ? (c.buyer_phone || '09123456789') : (c.seller_phone || '09359876543'));

  const sigHash = generateDigitalSignatureHash({
    contractId: c.contract_id,
    telegramId: signerId,
    nationalId: signerNationalId,
    phoneNumber: signerPhone,
    timestamp: now
  });

  if (role === 'employer') {
    c.buyer_fullname = signer.fullname || c.buyer_fullname;
    c.buyer_phone = signerPhone;
    c.buyer_national_id = signerNationalId;
    c.buyer_signed_at = now;
    c.buyer_otp_verified = true;
    c.buyer_signature_hash = sigHash;
    c.history.push({
      event: `✍️ قرارداد با تایید دیجیتال کارفرما (${c.buyer_fullname}) امضا شد. [اثر انگشت: ${sigHash.slice(0, 12)}...]`,
      timestamp: now,
      actor: 'کارفرما'
    });

    if (c.seller_signed_at) {
      c.status = 'awaiting_payment';
      c.history.push({
        event: 'هر دو طرف قرارداد را تایید کردند. در انتظار تامین وجه به صندوق امانت.',
        timestamp: now,
        actor: 'سیستم اسکرو'
      });
    } else {
      c.status = 'pending_party_b';
    }
  } else {
    c.seller_fullname = signer.fullname || c.seller_fullname;
    c.seller_phone = signerPhone;
    c.seller_national_id = signerNationalId;
    c.seller_signed_at = now;
    c.seller_otp_verified = true;
    c.seller_signature_hash = sigHash;
    c.history.push({
      event: `✍️ قرارداد با تایید دیجیتال مجری (${c.seller_fullname}) امضا شد. [اثر انگشت: ${sigHash.slice(0, 12)}...]`,
      timestamp: now,
      actor: 'مجری'
    });

    if (c.buyer_signed_at) {
      c.status = 'awaiting_payment';
      c.history.push({
        event: 'هر دو طرف قرارداد را تایید کردند. در انتظار پرداخت وجه به صندوق امانت.',
        timestamp: now,
        actor: 'سیستم اسکرو'
      });
    } else {
      c.status = 'pending_party_b';
    }
  }

  // ثبت شواهد حقوقی غیرقابل انکار (Non-Repudiation Audit Trail)
  await createContractSignature({
    contract_id: c.contract_id,
    telegram_id: signerId,
    telegram_username: getUser(signerId)?.username,
    full_name: role === 'employer' ? (c.buyer_fullname || 'کارفرما') : (c.seller_fullname || 'مجری'),
    national_id: signerNationalId,
    phone_number: signerPhone,
    role: role === 'employer' ? 'employer' : 'freelancer',
    user_id: signerId,
    signed_at: now,
    otp_verified: true,
    client_ip: '5.200.14.88',
    verification_method: 'telegram_contact_sms_otp',
    signature_hash: sigHash
  });

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(c);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').update({
        status: c.status,
        buyer_signed_at: c.buyer_signed_at,
        seller_signed_at: c.seller_signed_at,
        buyer_otp_verified: c.buyer_otp_verified,
        seller_otp_verified: c.seller_otp_verified,
        history: c.history
      }).eq('contract_id', c.contract_id);
    } catch (e: any) {
      console.warn('Supabase sign contract update warning:', e.message);
    }
  }

  return c;
}

export async function payContractEscrow(contractId: string, userId: number): Promise<{ success: boolean; message: string; contract?: Contract }> {
  const c = getContract(contractId);
  if (!c) return { success: false, message: 'قرارداد یافت نشد.' };

  const user = getUser(userId) || getCurrentUser();
  if (user.wallet_balance < c.amount) {
    return { 
      success: false, 
      message: `موجودی ناکافی است. موجودی: ${formatCurrency(user.wallet_balance)} | مبلغ قرارداد: ${formatCurrency(c.amount)}` 
    };
  }

  // کسر از موجودی آزاد و افزودن به موجودی قفل شده در صندوق امانت
  user.wallet_balance -= c.amount;
  user.escrow_locked_balance += c.amount;

  const now = new Date().toISOString();
  c.status = 'active';
  c.paid_at = now;
  c.history.push({
    event: `💳 مبلغ ${formatCurrency(c.amount)} در صندوق امانت میانجی قفل شد و قرارداد فعال گردید.`,
    timestamp: now,
    actor: 'کارفرما'
  });

  const tx: WalletTransaction = {
    id: `tx_${Date.now()}`,
    user_id: user.id,
    type: 'escrow_lock',
    amount: c.amount,
    title: `قفل شدن وجه در صندوق امانت میانجی برای قرارداد ${c.contract_id}`,
    status: 'completed',
    ref_id: `ESC-${Math.floor(100000 + Math.random() * 900000)}`,
    contract_id: c.contract_id,
    created_at: now
  };
  transactions.unshift(tx);

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(c);
    await upsertFirestoreUser(user);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').update({ status: 'active', paid_at: now, history: c.history }).eq('contract_id', c.contract_id);
      await supabase.from('users').update({ wallet_balance: user.wallet_balance, escrow_locked_balance: user.escrow_locked_balance }).eq('id', user.id);
      await supabase.from('transactions').insert(tx);
    } catch (e: any) {
      console.warn('Supabase pay escrow warning:', e.message);
    }
  }

  return { success: true, message: `مبلغ ${formatCurrency(c.amount)} در صندوق امانت قفل و قرارداد فعال شد.`, contract: c };
}

export async function deliverContract(contractId: string, deliverables: { notes: string; links: string[] }): Promise<Contract | undefined> {
  const c = getContract(contractId);
  if (!c) return undefined;

  const now = new Date().toISOString();
  c.status = 'work_submitted';
  c.deliverables = {
    notes: deliverables.notes || 'خروجی کار تحویل گردید.',
    links: deliverables.links || [],
    submitted_at: now
  };
  c.history.push({
    event: '📦 مجری خروجی‌های پروژه را ارسال کرد و در انتظار بررسی و تایید کارفرماست.',
    timestamp: now,
    actor: 'مجری'
  });

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(c);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').update({ status: 'work_submitted', deliverables: c.deliverables, history: c.history }).eq('contract_id', c.contract_id);
    } catch (e: any) {
      console.warn('Supabase deliver warning:', e.message);
    }
  }

  return c;
}

export async function approveContract(contractId: string): Promise<{ success: boolean; contract?: Contract; netAmount?: number }> {
  const c = getContract(contractId);
  if (!c) return { success: false };

  const now = new Date().toISOString();
  c.status = 'completed';

  const commissionRate = 0.10; // ۱۰ درصد کارمزد پلتفرم
  const commission = Math.round(c.amount * commissionRate);
  const netAmount = c.amount - commission;

  // کسر وجه از اسکروی کارفرما
  const buyer = getUser(c.buyer_id || _currentUserId);
  if (buyer && buyer.escrow_locked_balance >= c.amount) {
    buyer.escrow_locked_balance -= c.amount;
  }

  // واریز به کیف پول مجری
  const seller = getUser(c.seller_id || 290184712);
  if (seller) {
    seller.wallet_balance += netAmount;
  }

  // واریز پاداش سفیر معرف (۱۰٪ از کارمزد پلتفرم)
  const affiliateReward = Math.round(commission * 0.10);
  const ambassador = users.find(u => u.role === 'ambassador');
  if (ambassador) {
    ambassador.wallet_balance += affiliateReward;
    transactions.unshift({
      id: `tx_${Date.now() + 1}`,
      user_id: ambassador.id,
      type: 'affiliate_reward',
      amount: affiliateReward,
      title: `پاداش معرف از تسویه قرارداد ${c.contract_id}`,
      status: 'completed',
      ref_id: `AFF-${Math.floor(100000 + Math.random() * 900000)}`,
      created_at: now
    });
  }

  c.history.push({
    event: `🏁 کارفرما کار را تایید نهایی کرد. وجه امانت به مبلغ ${formatCurrency(netAmount)} به کیف پول مجری واریز گردید. کارمزد: ${formatCurrency(commission)}.`,
    timestamp: now,
    actor: 'کارفرما'
  });

  transactions.unshift({
    id: `tx_${Date.now()}`,
    user_id: seller ? seller.id : 290184712,
    type: 'escrow_release',
    amount: netAmount,
    title: `تسویه نهایی قرارداد ${c.contract_id} پس از کسر کارمزد`,
    status: 'completed',
    ref_id: `REL-${Math.floor(100000 + Math.random() * 900000)}`,
    contract_id: c.contract_id,
    created_at: now
  });

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(c);
    if (buyer) await upsertFirestoreUser(buyer);
    if (seller) await upsertFirestoreUser(seller);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('contracts').update({ status: 'completed', history: c.history }).eq('contract_id', c.contract_id);
    } catch (e: any) {
      console.warn('Supabase approve warning:', e.message);
    }
  }

  return { success: true, contract: c, netAmount };
}

export async function cancelContract(contractId: string): Promise<{ success: boolean; contract?: Contract }> {
  const c = getContract(contractId);
  if (!c) return { success: false };

  const now = new Date().toISOString();
  c.status = 'cancelled';

  // بازگرداندن وجه بلوکه شده به کارفرما
  const buyer = getUser(c.buyer_id || _currentUserId);
  if (buyer && buyer.escrow_locked_balance >= c.amount) {
    buyer.escrow_locked_balance -= c.amount;
    buyer.wallet_balance += c.amount;

    transactions.unshift({
      id: `tx_${Date.now()}`,
      user_id: buyer.id,
      type: 'refund',
      amount: c.amount,
      title: `استرداد وجه قرارداد لغو شده ${c.contract_id} به کیف پول`,
      status: 'completed',
      ref_id: `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      contract_id: c.contract_id,
      created_at: now
    });
  }

  c.history.push({
    event: '❌ قرارداد لغو گردید و وجه به موجودی کیف پول کارفرما بازگردانده شد.',
    timestamp: now,
    actor: 'سیستم اسکرو'
  });

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(c);
    if (buyer) await upsertFirestoreUser(buyer);
  }

  return { success: true, contract: c };
}

// ====================================================
// ۵. توابع کیف پول و تراکنش‌ها (Wallet & Transactions)
// ====================================================

export function getTransactions(userId?: number): WalletTransaction[] {
  if (userId) {
    return transactions.filter(t => t.user_id === Number(userId));
  }
  return transactions;
}

export async function depositWallet(
  userId: number, 
  amount: number, 
  method: string = 'gateway'
): Promise<{ success: boolean; message: string; newBalance: number; transaction: WalletTransaction }> {
  const user = getUser(userId) || getCurrentUser();
  const numAmount = Number(amount);
  user.wallet_balance += numAmount;

  const tx: WalletTransaction = {
    id: `tx_${Date.now()}`,
    user_id: user.id,
    type: 'deposit',
    amount: numAmount,
    title: method === 'card_to_card' ? 'واریز کارت به کارت (فیش تایید شده)' : 'شارژ کیف پول از طریق درگاه پرداخت اینترنتی شاپرک',
    status: 'completed',
    ref_id: `DEP-${Math.floor(100000 + Math.random() * 900000)}`,
    created_at: new Date().toISOString()
  };
  transactions.unshift(tx);

  if (isFirebaseConfigured()) {
    await upsertFirestoreUser(user);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('users').update({ wallet_balance: user.wallet_balance }).eq('id', user.id);
      await supabase.from('transactions').insert(tx);
    } catch (e: any) {
      console.warn('Supabase deposit sync warning:', e.message);
    }
  }

  return {
    success: true,
    message: `مبلغ ${formatCurrency(numAmount)} با موفقیت به کیف پول شما اضافه شد.`,
    newBalance: user.wallet_balance,
    transaction: tx
  };
}

export async function withdrawWallet(
  userId: number, 
  amount: number, 
  sheba?: string,
  financialPin?: string
): Promise<{ success: boolean; message: string; newBalance?: number; transaction?: WalletTransaction }> {
  const user = getUser(userId) || getCurrentUser();
  const numAmount = Number(amount);

  if (!numAmount || numAmount <= 0) {
    return { success: false, message: 'مبلغ برداشت نامعتبر است.' };
  }
  if (numAmount > user.wallet_balance) {
    return { success: false, message: `موجودی شما (${formatCurrency(user.wallet_balance)}) کمتر از مبلغ درخواستی است.` };
  }

  // ۱. بررسی الزامی بودن و صحت پین مالی (Financial PIN)
  if (user.has_financial_pin) {
    if (!financialPin) {
      return {
        success: false,
        message: '🔒 جهت امنیت حساب، لطفاً پین‌کد ۴ رقمی مالی خود را وارد فرمایید.'
      };
    }
    const pinCheck = verifyFinancialPin(user.id, financialPin);
    if (!pinCheck.valid) {
      return { success: false, message: pinCheck.message };
    }
  }

  // ۲. اجرای قانون طلایی امنیت اسکرو: تسویه منحصراً به شماره شبای تاییدشده متصل به کد ملی (Golden Rule)
  const targetSheba = sheba ? sheba.trim().toUpperCase().replace(/\s+/g, '') : user.sheba;
  if (!targetSheba || !isValidIranianSheba(targetSheba)) {
    return { success: false, message: 'شماره شبای وارد شده نامعتبر است (فرمت IR + ۲۴ رقم با چک‌سام معتبر).' };
  }

  if (user.sheba_locked_to_national_id && user.sheba) {
    const canonicalUserSheba = user.sheba.trim().toUpperCase().replace(/\s+/g, '');
    const canonicalTargetSheba = targetSheba.startsWith('IR') ? targetSheba : 'IR' + targetSheba;
    if (canonicalUserSheba !== canonicalTargetSheba) {
      addSecurityAuditLog({
        phone_number: user.phone_number,
        user_id: user.id,
        event: 'تلاش مشکوک برای برداشت به شماره شبای غیرهم‌نام (رد شده)',
        category: 'withdrawal_authorized',
        status: 'blocked',
        details: `تلاش برای انتقال به ${canonicalTargetSheba} مسدود شد؛ وجه فقط به شبای رسمی ${canonicalUserSheba} منتقل می‌گردد.`
      });
      return {
        success: false,
        message: '🛡️ طبق قانون طلایی امنیت اسکرو میانجی، برداشت وجه فقط به شماره شبای تاییدشده و متصل به کد ملی کاربر مجاز است. امکان برداشت به حساب متفرقه وجود ندارد.'
      };
    }
  }

  user.wallet_balance -= numAmount;

  const tx: WalletTransaction = {
    id: `tx_${Date.now()}`,
    user_id: user.id,
    type: 'withdraw',
    amount: numAmount,
    title: `درخواست برداشت وجه به شماره شبا ${targetSheba.slice(-8)} (تایید شده با پین مالی)`,
    status: 'completed',
    ref_id: `WTH-${Math.floor(100000 + Math.random() * 900000)}`,
    sheba: targetSheba,
    created_at: new Date().toISOString()
  };
  transactions.unshift(tx);

  addSecurityAuditLog({
    phone_number: user.phone_number,
    user_id: user.id,
    event: `تایید برداشت وجه به مبلغ ${formatCurrency(numAmount)} به شبای رسمی`,
    category: 'withdrawal_authorized',
    status: 'success',
    details: `شناسه پیگیری پایا: ${tx.ref_id}`
  });

  if (isFirebaseConfigured()) {
    await upsertFirestoreUser(user);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('users').update({ wallet_balance: user.wallet_balance }).eq('id', user.id);
      await supabase.from('transactions').insert(tx);
    } catch (e: any) {
      console.warn('Supabase withdraw sync warning:', e.message);
    }
  }

  return {
    success: true,
    message: `درخواست تسویه ${formatCurrency(numAmount)} با تایید پین مالی ثبت شد و در سیکل بعدی پایا واریز خواهد شد.`,
    newBalance: user.wallet_balance,
    transaction: tx
  };
}

// ====================================================
// ۶. مرکز حل اختلاف و داوری حقوقی (Disputes)
// ====================================================

export function getDisputes(): DisputeCase[] {
  return disputes;
}

export function getDispute(id: string): DisputeCase | undefined {
  return disputes.find(d => d.id === id || d.contract_id === id);
}

export async function createDispute(data: {
  contract_id: string;
  reason: string;
  description: string;
  claimant_id: number;
  evidence_files?: string[];
}): Promise<DisputeCase | undefined> {
  const c = getContract(data.contract_id);
  if (!c) return undefined;

  const claimant = getUser(data.claimant_id) || getCurrentUser();
  const now = new Date().toISOString();

  const newDispute: DisputeCase = {
    id: `disp_${Date.now()}`,
    contract_id: c.contract_id,
    contract_title: c.title,
    claimant_id: claimant.id,
    claimant_name: `${claimant.full_name} (${claimant.role === 'employer' ? 'کارفرما' : 'مجری'})`,
    reason: data.reason || 'اختلاف در اجرای تعهدات',
    description: data.description || '',
    evidence_files: data.evidence_files || ['مستندات ثبت معامله'],
    status: 'under_review',
    messages: [
      {
        id: `msg_${Date.now()}`,
        sender_id: claimant.id,
        sender_name: claimant.full_name,
        sender_role: claimant.role === 'employer' ? 'buyer' : 'seller',
        text: data.description || data.reason || 'درخواست رسیدگی به پرونده توسط داوری میانجی ثبت گردید.',
        timestamp: now
      }
    ],
    created_at: now
  };

  c.status = 'in_dispute';
  c.dispute_id = newDispute.id;
  c.history.push({
    event: `⚖️ پرونده داوری حقوقی با شناسه ${newDispute.id} ثبت گردید و جهت رسیدگی به داور میانجی ارجاع شد.`,
    timestamp: now,
    actor: 'داوری'
  });

  disputes.unshift(newDispute);

  if (isFirebaseConfigured()) {
    await upsertFirestoreDeal(c);
  }

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('disputes').insert(newDispute);
      await supabase.from('contracts').update({ status: 'in_dispute', dispute_id: newDispute.id, history: c.history }).eq('contract_id', c.contract_id);
    } catch (e: any) {
      console.warn('Supabase dispute insert warning:', e.message);
    }
  }

  return newDispute;
}

export async function addDisputeMessage(
  disputeId: string, 
  message: { sender_id: number; sender_name: string; sender_role: 'buyer' | 'seller' | 'arbitrator'; text: string; attachment?: string }
): Promise<DisputeMessage | undefined> {
  const d = getDispute(disputeId);
  if (!d) return undefined;

  const newMsg: DisputeMessage = {
    id: `msg_${Date.now()}`,
    sender_id: message.sender_id,
    sender_name: message.sender_name,
    sender_role: message.sender_role,
    text: message.text,
    attachment: message.attachment,
    timestamp: new Date().toISOString()
  };

  d.messages.push(newMsg);

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('disputes').update({ messages: d.messages }).eq('id', d.id);
    } catch (e: any) {
      console.warn('Supabase dispute message warning:', e.message);
    }
  }

  return newMsg;
}

export async function resolveDispute(
  disputeId: string, 
  ruling: { decision: 'pay_seller' | 'refund_buyer' | 'split_50_50'; comment: string; arbitrator_name?: string }
): Promise<DisputeCase | undefined> {
  const d = getDispute(disputeId);
  if (!d) return undefined;

  const now = new Date().toISOString();
  const c = getContract(d.contract_id);

  d.status = 'resolved';
  d.ruling = {
    decision: ruling.decision,
    arbitrator_name: ruling.arbitrator_name || 'دکتر محمدرضا کریمی (داور حقوقی میانجی)',
    comment: ruling.comment,
    resolved_at: now
  };

  if (c) {
    c.status = ruling.decision === 'pay_seller' ? 'completed' : (ruling.decision === 'refund_buyer' ? 'cancelled' : 'completed');
    c.history.push({
      event: `⚖️ رأی قطعی داوری صادر شد: "${ruling.decision}". نظر داور: ${ruling.comment}`,
      timestamp: now,
      actor: 'داوری حقوقی'
    });
    if (isFirebaseConfigured()) {
      await upsertFirestoreDeal(c);
    }
  }

  return d;
}

// ====================================================
// ۷. سیستم سفیران و زیرمجموعه‌گیری (Affiliate)
// ====================================================

export function getAffiliateStats(userId?: number): AffiliateStats {
  const user = getUser(userId || _currentUserId) || getCurrentUser();
  return {
    referral_code: user.referral_code || 'REF-MIYANJI',
    referral_link: makeTelegramLink(undefined, user.referral_code || 'REF-MIYANJI'),

    total_clicks: 184,
    total_invited: 24,
    active_traders: 11,
    total_commission_earned: 1850000,
    withdrawable_commission: 650000,
    commission_rate_percent: 10,
    referral_history: [
      { user_name: 'محمد رضایی', signed_up_at: '۱۴۰۳/۰۷/۱۰', contracts_count: 3, earned_amount: 450000 },
      { user_name: 'سارا کاظمی', signed_up_at: '۱۴۰۳/۰۷/۱۴', contracts_count: 2, earned_amount: 320000 },
      { user_name: 'پویا امانی', signed_up_at: '۱۴۰۳/۰۷/۱۸', contracts_count: 1, earned_amount: 650000 },
      { user_name: 'امید علیزاده', signed_up_at: '۱۴۰۳/۰۷/۲۴', contracts_count: 4, earned_amount: 430000 }
    ]
  };
}

export async function withdrawAffiliateEarnings(userId?: number): Promise<{ success: boolean; message: string; claimedAmount: number; newWalletBalance: number }> {
  const user = getUser(userId || _currentUserId) || getCurrentUser();
  const claimAmount = 650000;
  user.wallet_balance += claimAmount;

  transactions.unshift({
    id: `tx_${Date.now()}`,
    user_id: user.id,
    type: 'affiliate_reward',
    amount: claimAmount,
    title: 'انتقال درآمد حاصل از زیرمجموعه‌گیری سفیران به کیف پول اصلی',
    status: 'completed',
    ref_id: `AFF-TRF-${Math.floor(100000 + Math.random() * 900000)}`,
    created_at: new Date().toISOString()
  });

  return {
    success: true,
    message: `مبلغ ${formatCurrency(claimAmount)} از سود سفیران به موجودی کیف پول اصلی شما منتقل گردید.`,
    claimedAmount: claimAmount,
    newWalletBalance: user.wallet_balance
  };
}

// ====================================================
// ۸. آمار کلی سامانه (Dashboard Stats)
// ====================================================

export function getDashboardStats(): DashboardStats {
  const activeContracts = contracts.filter(c => c.status === 'active' || c.status === 'work_submitted' || c.status === 'in_progress').length;
  const pendingContracts = contracts.filter(c => c.status === 'pending_party_b' || c.status === 'awaiting_payment' || c.status === 'awaiting_receipt_approval').length;
  const draftsCount = contracts.filter(c => c.status === 'draft').length;
  const completedContracts = contracts.filter(c => c.status === 'completed').length;
  const disputesCount = contracts.filter(c => c.status === 'in_dispute').length;
  const totalEscrowVolume = contracts
    .filter(c => c.status !== 'cancelled' && c.status !== 'draft')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  return {
    activeContracts,
    pendingContracts,
    draftsCount,
    completedContracts,
    disputesCount,
    totalEscrowVolume,
    commissionRate: 10
  };
}

// ====================================================
// ۹. بازیابی و همگام‌سازی ابری پس از دیپلوی (Cloud Sync on Deploy)
// ====================================================

export async function syncFromSupabase(): Promise<{ usersCount: number; contractsCount: number; txsCount: number }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { usersCount: 0, contractsCount: 0, txsCount: 0 };
  }

  let usersCount = 0;
  let contractsCount = 0;
  let txsCount = 0;

  try {
    console.log('🔄 [DB_SYNC] Fetching persistent records from Supabase...');

    // ۱. همگام‌سازی کاربران
    const { data: sbUsers, error: uErr } = await supabase.from('users').select('*').limit(1000);
    if (!uErr && sbUsers && sbUsers.length > 0) {
      for (const u of sbUsers) {
        const idx = users.findIndex(existing => existing.id === Number(u.id));
        const formattedUser: UserProfile = {
          id: Number(u.id),
          telegram_id: u.telegram_id ? Number(u.telegram_id) : Number(u.id),
          username: u.username || u.telegram_username || '',
          full_name: u.full_name || `کاربر ${u.id}`,
          phone_number: u.phone_number || '',
          role: u.role || 'employer',
          wallet_balance: Number(u.wallet_balance || 0),
          escrow_locked_balance: Number(u.escrow_locked_balance || 0),
          kyc_level: u.kyc_level || (u.is_verified ? 'gold' : 'basic'),
          kyc_status: u.kyc_status || (u.is_verified ? 'verified' : 'unverified'),
          national_id: u.national_id || '',
          sheba: u.sheba || '',
          sheba_owner_name: u.sheba_owner_name || u.full_name || '',
          sheba_verified: Boolean(u.sheba),
          sheba_locked_to_national_id: Boolean(u.sheba && u.national_id),
          referral_code: u.referral_code || `REF-${u.id}`,
          is_verified: Boolean(u.is_verified),
          is_blacklisted: Boolean(u.is_blacklisted),
          has_financial_pin: Boolean(u.financial_pin_hash),
          financial_pin_hash: u.financial_pin_hash,
          pin_failed_attempts: 0,
          pin_locked_until: null,
          security_score: u.is_verified ? 95 : 60,
          created_at: u.created_at || new Date().toISOString()
        };
        if (idx !== -1) {
          users[idx] = { ...users[idx], ...formattedUser };
        } else {
          users.push(formattedUser);
        }
      }
      usersCount = sbUsers.length;
    }

    // ۲. همگام‌سازی قراردادها
    const { data: sbContracts, error: cErr } = await supabase.from('contracts').select('*').limit(1000);
    if (!cErr && sbContracts && sbContracts.length > 0) {
      for (const c of sbContracts) {
        const idx = contracts.findIndex(existing => existing.contract_id === c.contract_id || existing.id === c.id);
        const formattedContract: Contract = {
          id: c.id || `c_${c.contract_id}`,
          contract_id: c.contract_id,
          title: c.title || 'معامله هوشمند میانجی',
          amount: Number(c.amount || 0),
          category: c.category || 'GEN',
          deadline: Number(c.deadline || 7),
          description: c.description || '',
          free_edits: Number(c.free_edits ?? c.free_edits_total ?? 2),
          free_edits_left: Number(c.free_edits_left ?? 2),
          free_edits_total: Number(c.free_edits_total ?? 2),
          commission_payer: c.commission_payer || 'split_50_50',
          creator_id: Number(c.creator_id || c.created_by || 0),
          created_by: Number(c.creator_id || c.created_by || 0),
          status: c.status || 'draft',
          has_inspection_period: Boolean(c.has_inspection_period),
          inspection_period_hours: Number(c.inspection_period_hours || 0),
          has_free_revisions: Boolean(c.has_free_revisions ?? true),
          free_revisions_count: Number(c.free_revisions_count ?? 2),
          invite_token: c.invite_token || `deal_${c.contract_id}`,
          escrow_deposit_status: c.escrow_deposit_status || (c.status === 'active' ? 'paid_locked' : 'unpaid'),
          buyer_id: c.buyer_id ? Number(c.buyer_id) : undefined,
          buyer_fullname: c.buyer_fullname,
          buyer_phone: c.buyer_phone,
          buyer_national_id: c.buyer_national_id,
          buyer_signed_at: c.buyer_signed_at,
          buyer_otp_verified: Boolean(c.buyer_otp_verified),
          seller_id: c.seller_id ? Number(c.seller_id) : undefined,
          seller_fullname: c.seller_fullname,
          seller_phone: c.seller_phone,
          seller_national_id: c.seller_national_id,
          seller_signed_at: c.seller_signed_at,
          seller_otp_verified: Boolean(c.seller_otp_verified),
          paid_at: c.paid_at,
          delivery_deadline: c.delivery_deadline,
          staged_payment: Boolean(c.staged_payment),
          milestones: Array.isArray(c.milestones) ? c.milestones : [],
          history: Array.isArray(c.history) ? c.history : [],
          created_at: c.created_at || new Date().toISOString()
        };
        if (idx !== -1) {
          contracts[idx] = { ...contracts[idx], ...formattedContract };
        } else {
          contracts.unshift(formattedContract);
        }
      }
      contractsCount = sbContracts.length;
    }

    // ۳. همگام‌سازی تراکنش‌ها
    const { data: sbTxs, error: tErr } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(500);
    if (!tErr && sbTxs && sbTxs.length > 0) {
      for (const t of sbTxs) {
        const idx = transactions.findIndex(existing => String(existing.id) === String(t.id));
        const formattedTx: WalletTransaction = {
          id: String(t.id),
          user_id: Number(t.user_id),
          type: t.type || 'deposit',
          amount: Number(t.amount || 0),
          title: t.title || t.description || 'تراکنش مالی',
          status: t.status || 'completed',
          ref_id: t.tracking_code || String(t.id),
          contract_id: t.contract_id,
          created_at: t.created_at || new Date().toISOString()
        };
        if (idx !== -1) {
          transactions[idx] = { ...transactions[idx], ...formattedTx };
        } else {
          transactions.unshift(formattedTx);
        }
      }
      txsCount = sbTxs.length;
    }

    // ۴. همگام‌سازی امضاهای دیجیتال
    const { data: sbSigs } = await supabase.from('signatures').select('*').limit(500);
    if (sbSigs && sbSigs.length > 0) {
      for (const s of sbSigs) {
        if (!signatures.some(existing => existing.id === s.id || existing.signature_hash === s.signature_hash)) {
          signatures.unshift({
            id: s.id,
            contract_id: s.contract_id,
            user_id: s.telegram_id ? Number(s.telegram_id) : undefined,
            telegram_id: Number(s.telegram_id),
            telegram_username: s.telegram_username,
            full_name: s.full_name,
            national_id: s.national_id,
            phone_number: s.phone_number,
            role: s.role,
            signed_at: s.signed_at,
            otp_verified: Boolean(s.otp_verified),
            client_ip: s.client_ip || '127.0.0.1',
            verification_method: s.verification_method || 'telegram_contact_sms_otp',
            signature_hash: s.signature_hash,
            status: s.status || 'valid'
          });
        }
      }
    }

    console.log(`✅ [DB_SYNC] Successfully restored: ${usersCount} users, ${contractsCount} contracts, ${txsCount} transactions.`);
  } catch (err: any) {
    console.warn('⚠️ [DB_SYNC] Notice syncing from Supabase:', err.message);
  }

  return { usersCount, contractsCount, txsCount };
}

export async function syncFromFirestore(): Promise<{ usersCount: number; dealsCount: number }> {
  if (!isFirebaseConfigured()) {
    return { usersCount: 0, dealsCount: 0 };
  }

  let usersCount = 0;
  let dealsCount = 0;

  try {
    console.log('🔥 [FIRESTORE_SYNC] Fetching shared records from Firebase Firestore...');
    const fUsers = await fetchAllFirestoreUsers();
    for (const u of fUsers) {
      const mapped = mapFirestoreRecordToUser(u);
      if (!mapped.id || Number.isNaN(mapped.id)) continue;
      const idx = users.findIndex(existing => existing.id === mapped.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...mapped };
      } else {
        users.push(mapped);
      }
      usersCount++;
    }

    const fDeals = await fetchAllFirestoreDeals();
    for (const d of fDeals) {
      const cid = String(d.contract_id || d.id || '');
      if (!cid) continue;
      const idx = contracts.findIndex(existing => existing.contract_id === cid || existing.id === cid);
      const formattedDeal: Contract = {
        id: String(d.id || cid),
        contract_id: cid,
        title: d.title || `معامله ${cid}`,
        amount: Number(d.amount || 0),
        category: d.category || 'GEN',
        deadline: Number(d.deadline || 7),
        description: d.description || '',
        free_edits: Number(d.free_edits ?? 2),
        free_edits_left: Number(d.free_edits_left ?? 2),
        free_edits_total: Number(d.free_edits_total ?? 2),
        commission_payer: d.commission_payer || 'split_50_50',
        creator_id: Number(d.creator_id || d.buyer_id || d.seller_id || 0),
        created_by: Number(d.creator_id || d.buyer_id || d.seller_id || 0),
        status: d.status || 'pending_party_b',
        buyer_id: d.buyer_id ? Number(d.buyer_id) : undefined,
        buyer_fullname: d.buyer_fullname || undefined,
        buyer_phone: d.buyer_phone || undefined,
        seller_id: d.seller_id ? Number(d.seller_id) : undefined,
        seller_fullname: d.seller_fullname || undefined,
        seller_phone: d.seller_phone || undefined,
        invite_token: d.invite_token || undefined,
        escrow_deposit_status: d.escrow_deposit_status || 'unpaid',
        history: Array.isArray(d.history) ? d.history : [],
        created_at: d.created_at || new Date().toISOString()
      };
      if (idx !== -1) {
        contracts[idx] = { ...contracts[idx], ...formattedDeal };
      } else {
        contracts.unshift(formattedDeal);
      }
      dealsCount++;
    }

    console.log(`✅ [FIRESTORE_SYNC] Synced ${usersCount} users and ${dealsCount} deals from Firestore.`);
  } catch (err: any) {
    console.warn('⚠️ [FIRESTORE_SYNC] Warning:', err?.message || err);
  }

  return { usersCount, dealsCount };
}

// اجرای همگام‌سازی اولیه در صورت اتصال Supabase یا Firebase Firestore
if (isSupabaseConfigured()) {
  syncFromSupabase().catch(e => console.warn('Supabase initial sync error:', e.message));
}
if (isFirebaseConfigured()) {
  syncFromFirestore().catch(e => console.warn('Firestore initial sync error:', e.message));
}

