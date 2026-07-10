import { v4 as uuidv4 } from 'uuid';

let firestore: any = null;
let initialized = false;

try {
  const admin = require('firebase-admin');
  if (admin.apps?.length) {
    firestore = require('firebase-admin/firestore');
    initialized = true;
  }
} catch {
  // Firestore not available — run in-memory only
}

function getDb(): any {
  if (!initialized || !firestore) return null;
  try {
    return firestore.getFirestore();
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

export { initialized as persistenceAvailable };
