/**
 * Firebase Admin SDK Initialization & Firestore Shared Sync Layer
 * Connects Miyanji Telegram Bot to the shared Firebase project (mianji-3639d)
 * and named Firestore database (ai-studio-web-c8e655a8-004c-4987-89aa-e319ee39ab73).
 */

import fs from 'fs';
import crypto from 'crypto';
import { initializeApp, cert, getApps, App, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import type { Contract, UserProfile } from '../types';

export const DEFAULT_FIREBASE_PROJECT_ID = 'mianji-3639d';
export const DEFAULT_FIREBASE_DATABASE_ID = 'ai-studio-web-c8e655a8-004c-4987-89aa-e319ee39ab73';
export const DEFAULT_FIREBASE_API_KEY = 'AIzaSyDPLvDhCVsyBgteXD8mZLzYoNnA9nIA5RQ';

export const FIREBASE_PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID || '').trim() || DEFAULT_FIREBASE_PROJECT_ID;
export const FIREBASE_DATABASE_ID =
  (process.env.FIREBASE_DATABASE_ID || '').trim() || DEFAULT_FIREBASE_DATABASE_ID;

let firebaseApp: App | null = null;
let firestoreDb: Firestore | null = null;
let firebaseAuthClient: Auth | null = null;
let firebaseInitialized = false;
let firebaseInitError: string | null = null;

function parseServiceAccountFromEnv(): ServiceAccount | null {
  const rawEnv = (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    ''
  ).trim();

  let jsonText = rawEnv;

  if (!jsonText && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS.trim();
    if (credPath && fs.existsSync(credPath)) {
      jsonText = fs.readFileSync(credPath, 'utf-8').trim();
    }
  }

  if (!jsonText) {
    return null;
  }

  // Strip accidental surrounding single/double quotes from dashboard copy-paste
  if (
    (jsonText.startsWith("'") && jsonText.endsWith("'")) ||
    (jsonText.startsWith('"') && jsonText.endsWith('"'))
  ) {
    try {
      const unwrapped = JSON.parse(jsonText);
      if (typeof unwrapped === 'string') {
        jsonText = unwrapped.trim();
      }
    } catch {
      jsonText = jsonText.slice(1, -1).trim();
    }
  }

  // Support base64-encoded service account JSON
  if (!jsonText.startsWith('{')) {
    try {
      const decoded = Buffer.from(jsonText, 'base64').toString('utf-8').trim();
      if (decoded.startsWith('{')) {
        jsonText = decoded;
      }
    } catch {
      // ignore
    }
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, any>;
  } catch {
    // Recover if dashboard env var turned \n inside private_key into actual line breaks
    const sanitized = jsonText.replace(/\r?\n/g, (match, offset, full) => {
      const before = full.slice(0, offset);
      const quoteCount = (before.match(/(?<!\\)"/g) || []).length;
      return quoteCount % 2 === 1 ? '\\n' : match;
    });
    parsed = JSON.parse(sanitized) as Record<string, any>;
  }
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  if (!parsed.project_id) {
    parsed.project_id = FIREBASE_PROJECT_ID;
  }
  return parsed as ServiceAccount;
}

try {
  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    firebaseApp =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount),
            projectId: FIREBASE_PROJECT_ID,
          });

    firestoreDb = getFirestore(firebaseApp, FIREBASE_DATABASE_ID);
    firebaseAuthClient = getAuth(firebaseApp);
    firebaseInitialized = true;
    console.log(
      `✅ Firebase Admin SDK initialized (project: ${FIREBASE_PROJECT_ID}, database: ${FIREBASE_DATABASE_ID}).`
    );
  } else {
    console.info(
      'ℹ️ FIREBASE_SERVICE_ACCOUNT_JSON is not set. Firestore sync will activate once configured in environment variables.'
    );
  }
} catch (err: any) {
  firebaseInitError = err?.message || String(err);
  console.error('⚠️ Failed to initialize Firebase Admin SDK:', firebaseInitError);
  firebaseApp = null;
  firestoreDb = null;
  firebaseAuthClient = null;
  firebaseInitialized = false;
}

export const firestore = firestoreDb;
export const firebaseAuth = firebaseAuthClient;

export function isFirebaseConfigured(): boolean {
  return firebaseInitialized && firestoreDb !== null;
}

export function getFirebaseInitError(): string | null {
  return firebaseInitError;
}

// ====================================================
// Telegram WebApp initData HMAC-SHA256 Verification
// ====================================================

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = 86400
): { valid: boolean; user?: TelegramWebAppUser; authDate?: number; error?: string } {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'Missing hash in initData' };
    }

    const authDateStr = params.get('auth_date');
    const authDate = authDateStr ? Number(authDateStr) : 0;
    if (authDate && maxAgeSeconds > 0) {
      const age = Math.floor(Date.now() / 1000) - authDate;
      if (age > maxAgeSeconds) {
        return { valid: false, error: 'Telegram initData expired' };
      }
    }

    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') {
        pairs.push(`${key}=${value}`);
      }
    });
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const a = Buffer.from(calculatedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, error: 'Invalid Telegram initData signature' };
    }

    const userRaw = params.get('user');
    const user = userRaw ? (JSON.parse(userRaw) as TelegramWebAppUser) : undefined;
    return { valid: true, user, authDate };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Failed to parse initData' };
  }
}

export async function createFirebaseCustomToken(
  uid: string,
  claims?: Record<string, unknown>
): Promise<string | null> {
  if (!firebaseAuthClient) return null;
  try {
    return await firebaseAuthClient.createCustomToken(String(uid), claims);
  } catch (err: any) {
    console.warn('⚠️ Firebase createCustomToken warning:', err?.message || err);
    return null;
  }
}

// ====================================================
// Firestore Collections Helpers (`users`, `deals`, `otp_codes`)
// ====================================================

export interface FirestoreUserRecord {
  id: string | number;
  telegram_id: number;
  chat_id: number;
  phone_number: string;
  full_name: string;
  username?: string;
  kyc_status: string;
  kyc_level?: string;
  wallet_balance: number;
  escrow_locked_balance: number;
  role?: string;
  national_id?: string;
  sheba?: string;
  referral_code?: string;
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
  updatedAt?: unknown;
}

export async function upsertFirestoreUser(
  user: Partial<UserProfile> & { id: number | string }
): Promise<boolean> {
  if (!firestoreDb) return false;

  try {
    const docId = String(user.id);
    const ref = firestoreDb.collection('users').doc(docId);
    const existingSnap = await ref.get();
    const existingData = existingSnap.exists ? existingSnap.data() || {} : {};

    const resolvedKycStatus =
      existingData.kyc_status === 'verified'
        ? 'verified'
        : user.kyc_status || existingData.kyc_status || 'pending';

    const payload: Record<string, any> = {
      id: docId,
      telegram_id: Number(user.telegram_id || user.id),
      chat_id: Number(user.chat_id || existingData.chat_id || user.telegram_id || user.id),
      phone_number: user.phone_number ?? existingData.phone_number ?? '',
      full_name: user.full_name || existingData.full_name || 'کاربر میانجی',
      username: user.username ?? existingData.username ?? '',
      kyc_status: resolvedKycStatus,
      kyc_level: user.kyc_level || existingData.kyc_level || 'basic',
      wallet_balance:
        typeof user.wallet_balance === 'number'
          ? user.wallet_balance
          : Number(existingData.wallet_balance ?? 0),
      escrow_locked_balance:
        typeof user.escrow_locked_balance === 'number'
          ? user.escrow_locked_balance
          : Number(existingData.escrow_locked_balance ?? 0),
      role: user.role || existingData.role || 'employer',
      national_id: user.national_id ?? existingData.national_id ?? '',
      sheba: user.sheba ?? existingData.sheba ?? '',
      referral_code: user.referral_code || existingData.referral_code || `REF-${docId}`,
      is_verified:
        resolvedKycStatus === 'verified' ? true : Boolean(user.is_verified ?? existingData.is_verified),
      created_at: existingData.created_at || user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await ref.set(payload, { merge: true });
    return true;
  } catch (err: any) {
    console.warn('⚠️ Firestore upsertUser warning:', err?.message || err);
    return false;
  }
}

export async function getFirestoreUserById(
  telegramId: number
): Promise<FirestoreUserRecord | null> {
  if (!firestoreDb) return null;
  try {
    const snap = await firestoreDb.collection('users').doc(String(telegramId)).get();
    if (!snap.exists) return null;
    return snap.data() as FirestoreUserRecord;
  } catch (err: any) {
    console.warn('⚠️ Firestore getFirestoreUserById warning:', err?.message || err);
    return null;
  }
}

export async function getFirestoreUserByPhone(
  normalizedPhone: string
): Promise<FirestoreUserRecord | null> {
  if (!firestoreDb || !normalizedPhone) return null;
  try {
    const candidates = Array.from(
      new Set([
        normalizedPhone,
        normalizedPhone.startsWith('0') ? `+98${normalizedPhone.slice(1)}` : normalizedPhone,
        normalizedPhone.startsWith('0') ? `98${normalizedPhone.slice(1)}` : normalizedPhone,
        normalizedPhone.startsWith('0') ? normalizedPhone.slice(1) : normalizedPhone,
      ])
    );

    for (const phoneCandidate of candidates) {
      const q = await firestoreDb
        .collection('users')
        .where('phone_number', '==', phoneCandidate)
        .limit(1)
        .get();
      if (!q.empty) {
        return q.docs[0].data() as FirestoreUserRecord;
      }
    }
    return null;
  } catch (err: any) {
    console.warn('⚠️ Firestore getFirestoreUserByPhone warning:', err?.message || err);
    return null;
  }
}

export async function upsertFirestoreDeal(contract: Contract): Promise<boolean> {
  if (!firestoreDb) return false;
  try {
    const docId = contract.contract_id || contract.id;
    const payload = {
      id: contract.id,
      contract_id: contract.contract_id,
      title: contract.title,
      buyer_id: contract.buyer_id ?? null,
      seller_id: contract.seller_id ?? null,
      buyer_fullname: contract.buyer_fullname ?? null,
      seller_fullname: contract.seller_fullname ?? null,
      buyer_phone: contract.buyer_phone ?? null,
      seller_phone: contract.seller_phone ?? null,
      amount: Number(contract.amount || 0),
      status: contract.status,
      category: contract.category || 'GEN',
      deadline: Number(contract.deadline || 7),
      description: contract.description || '',
      commission_payer: contract.commission_payer || 'split_50_50',
      creator_id: contract.creator_id ?? null,
      invite_token: contract.invite_token ?? null,
      escrow_deposit_status: contract.escrow_deposit_status ?? 'unpaid',
      history: Array.isArray(contract.history) ? contract.history : [],
      created_at: contract.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await firestoreDb.collection('deals').doc(docId).set(payload, { merge: true });
    return true;
  } catch (err: any) {
    console.warn('⚠️ Firestore upsertDeal warning:', err?.message || err);
    return false;
  }
}

export async function deleteFirestoreDeal(contractId: string): Promise<boolean> {
  if (!firestoreDb) return false;
  try {
    await firestoreDb.collection('deals').doc(contractId).delete();
    return true;
  } catch (err: any) {
    console.warn('⚠️ Firestore deleteDeal warning:', err?.message || err);
    return false;
  }
}

export interface FirestoreOtpRecord {
  phone_number: string;
  code: string;
  expires_at: number;
  attempts: number;
  purpose: string;
  telegram_id?: number;
  created_at: string;
}

export async function saveFirestoreOtp(
  phoneNumber: string,
  record: Omit<FirestoreOtpRecord, 'phone_number' | 'created_at'>
): Promise<boolean> {
  if (!firestoreDb || !phoneNumber) return false;
  try {
    await firestoreDb
      .collection('otp_codes')
      .doc(phoneNumber)
      .set({
        phone_number: phoneNumber,
        code: record.code,
        expires_at: record.expires_at,
        attempts: record.attempts,
        purpose: record.purpose,
        telegram_id: record.telegram_id ?? null,
        created_at: new Date().toISOString(),
      });
    return true;
  } catch (err: any) {
    console.warn('⚠️ Firestore saveOtp warning:', err?.message || err);
    return false;
  }
}

export async function getFirestoreOtp(
  phoneNumber: string
): Promise<FirestoreOtpRecord | null> {
  if (!firestoreDb || !phoneNumber) return null;
  try {
    const snap = await firestoreDb.collection('otp_codes').doc(phoneNumber).get();
    if (!snap.exists) return null;
    return snap.data() as FirestoreOtpRecord;
  } catch (err: any) {
    console.warn('⚠️ Firestore getOtp warning:', err?.message || err);
    return null;
  }
}

export async function deleteFirestoreOtp(phoneNumber: string): Promise<boolean> {
  if (!firestoreDb || !phoneNumber) return false;
  try {
    await firestoreDb.collection('otp_codes').doc(phoneNumber).delete();
    return true;
  } catch (err: any) {
    console.warn('⚠️ Firestore deleteOtp warning:', err?.message || err);
    return false;
  }
}

export async function fetchAllFirestoreUsers(): Promise<FirestoreUserRecord[]> {
  if (!firestoreDb) return [];
  try {
    const snap = await firestoreDb.collection('users').limit(1000).get();
    return snap.docs.map((doc) => doc.data() as FirestoreUserRecord);
  } catch (err: any) {
    console.warn('⚠️ Firestore fetchAllUsers warning:', err?.message || err);
    return [];
  }
}

export async function fetchAllFirestoreDeals(): Promise<Record<string, any>[]> {
  if (!firestoreDb) return [];
  try {
    const snap = await firestoreDb.collection('deals').limit(1000).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    console.warn('⚠️ Firestore fetchAllDeals warning:', err?.message || err);
    return [];
  }
}
