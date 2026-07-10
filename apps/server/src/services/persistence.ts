import { v4 as uuidv4 } from 'uuid';

let firestoreModule: any = null;
let firestoreResolved = false;

/**
 * Lazily initialise the Firestore reference on first call so that
 * firebase-admin has been given a chance to call initializeApp() first.
 * (At module-load time admin.apps is still empty.)
 */
function resolveFirestore(): boolean {
  if (firestoreResolved) return firestoreModule !== null;
  firestoreResolved = true;
  try {
    const admin = require('firebase-admin');
    if (admin.apps?.length) {
      firestoreModule = require('firebase-admin/firestore');
    }
  } catch {
    // Firestore not available — run in-memory only
  }
  return firestoreModule !== null;
}

function getDb(): any {
  if (!resolveFirestore()) return null;
  try {
    return firestoreModule.getFirestore();
  } catch {
    return null;
  }
}

// ── User Data ──────────────────────────────────────────────────

export async function loadAllUsers(): Promise<Record<string, any>> {
  const db = getDb();
  if (!db) return {};
  try {
    const snap = await db.collection('users').get();
    const map: Record<string, any> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data(); });
    return map;
  } catch {
    return {};
  }
}

export async function loadUserById(id: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const doc = await db.collection('users').doc(id).get();
    if (!doc.exists) return null;
    return doc.data();
  } catch {
    return null;
  }
}

export async function loadUserByFirebaseUid(firebaseUid: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snap = await db.collection('users').where('firebaseUid', '==', firebaseUid).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch {
    return null;
  }
}

export async function saveUser(userId: string, data: any): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('users').doc(userId).set(data, { merge: true });
  } catch {
    // silently fail
  }
}

export async function deleteUser(userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('users').doc(userId).delete();
  } catch {
    // silently fail
  }
}

// ── Wallet Data ────────────────────────────────────────────────

export async function loadAllWallets(): Promise<Record<string, any>> {
  const db = getDb();
  if (!db) return {};
  try {
    const snap = await db.collection('wallets').get();
    const map: Record<string, any> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data(); });
    return map;
  } catch {
    return {};
  }
}

export async function saveWallet(userId: string, wallet: any): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('wallets').doc(userId).set(wallet);
  } catch {
    // silently fail
  }
}

// ── Transactions ──────────────────────────────────────────────

export async function loadAllTransactions(): Promise<Record<string, any[]>> {
  const db = getDb();
  if (!db) return {};
  try {
    const snap = await db.collection('transactions').get();
    const map: Record<string, any[]> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data().items || []; });
    return map;
  } catch {
    return {};
  }
}

export async function saveTransactions(userId: string, txs: any[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('transactions').doc(userId).set({ items: txs });
  } catch {
    // silently fail
  }
}

// ── Match History ─────────────────────────────────────────────

export async function loadAllMatchHistory(): Promise<Record<string, any[]>> {
  const db = getDb();
  if (!db) return {};
  try {
    const snap = await db.collection('matchHistory').get();
    const map: Record<string, any[]> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data().items || []; });
    return map;
  } catch {
    return {};
  }
}

export async function saveMatchHistory(userId: string, records: any[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('matchHistory').doc(userId).set({ items: records });
  } catch {
    // silently fail
  }
}

// ── Daily Reward Cooldown ─────────────────────────────────────

export async function loadAllDailyRewards(): Promise<Record<string, string>> {
  const db = getDb();
  if (!db) return {};
  try {
    const snap = await db.collection('dailyRewards').get();
    const map: Record<string, string> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data().lastClaim; });
    return map;
  } catch {
    return {};
  }
}

export async function saveDailyReward(userId: string, lastClaim: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('dailyRewards').doc(userId).set({ lastClaim });
  } catch {
    // silently fail
  }
}

export function persistenceAvailable(): boolean {
  return resolveFirestore();
}
