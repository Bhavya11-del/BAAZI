import { v4 as uuidv4 } from 'uuid';

let db: any = null;

export function setFirestoreDb(firestoreDb: any): void {
  db = firestoreDb;
}

function getDb(): any {
  return db;
}

// ── User Data ──────────────────────────────────────────────────

export async function loadAllUsers(): Promise<Record<string, any>> {
  const db = getDb();
  if (!db) return {};
  try {
    console.log('[FIRESTORE] Loading all users...');
    const snap = await db.collection('users').get();
    const map: Record<string, any> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data(); });
    console.log(`[FIRESTORE] Loaded ${Object.keys(map).length} users`);
    return map;
  } catch (err) {
    console.error('[FIRESTORE] loadAllUsers failed:', err);
    return {};
  }
}

export async function loadUserById(id: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  try {
    console.log(`[FIRESTORE] Reading user by ID: ${id.slice(0, 12)}...`);
    const doc = await db.collection('users').doc(id).get();
    if (!doc.exists) {
      console.log('[FIRESTORE] User not found');
      return null;
    }
    console.log('[FIRESTORE] User found');
    return doc.data();
  } catch (err) {
    console.error(`[FIRESTORE] loadUserById failed for ${id.slice(0, 12)}:`, err);
    return null;
  }
}

export async function loadUserByFirebaseUid(firebaseUid: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;
  try {
    console.log(`[FIRESTORE] Reading user by firebaseUid: ${firebaseUid.slice(0, 12)}...`);
    const snap = await db.collection('users').where('firebaseUid', '==', firebaseUid).limit(1).get();
    if (snap.empty) {
      console.log('[FIRESTORE] User not found');
      return null;
    }
    const doc = snap.docs[0];
    console.log(`[FIRESTORE] User found: ${doc.id.slice(0, 12)}`);
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.error(`[FIRESTORE] loadUserByFirebaseUid failed for ${firebaseUid.slice(0, 12)}:`, err);
    return null;
  }
}

export async function createUserDocument(userId: string, data: any): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    console.log('[FIRESTORE] Creating user document...');
    await db.collection('users').doc(userId).set(data);
    console.log('[FIRESTORE] User created');
    return true;
  } catch (err) {
    console.error('[FIRESTORE] Save failed:', err);
    return false;
  }
}

export async function saveUser(userId: string, data: any): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn(`[FIRESTORE] FIRESTORE NOT AVAILABLE — user ${userId.slice(0, 12)} NOT persisted`);
    return;
  }
  try {
    console.log(`[FIRESTORE] Saving user ${userId.slice(0, 12)}...`);
    await db.collection('users').doc(userId).set(data, { merge: true });
    console.log('[FIRESTORE] Save successful');
  } catch (err) {
    console.error(`[FIRESTORE] Save failed for user ${userId.slice(0, 12)}:`, err);
  }
}

export async function deleteUser(userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.collection('users').doc(userId).delete();
  } catch {
    console.warn(`[FIRESTORE] deleteUser failed for ${userId.slice(0, 12)}`);
  }
}

// ── Wallet Data ────────────────────────────────────────────────

export async function loadAllWallets(): Promise<Record<string, any>> {
  const db = getDb();
  if (!db) return {};
  try {
    console.log('[FIRESTORE] Loading all wallets...');
    const snap = await db.collection('wallets').get();
    const map: Record<string, any> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data(); });
    console.log(`[FIRESTORE] Loaded ${Object.keys(map).length} wallets`);
    return map;
  } catch (err) {
    console.error('[FIRESTORE] loadAllWallets failed:', err);
    return {};
  }
}

export async function saveWallet(userId: string, wallet: any): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    console.log(`[FIRESTORE] Saving wallet for user ${userId.slice(0, 12)}...`);
    await db.collection('wallets').doc(userId).set(wallet);
    console.log('[FIRESTORE] Save successful');
  } catch (err) {
    console.error(`[FIRESTORE] Save failed for wallet ${userId.slice(0, 12)}:`, err);
  }
}

// ── Transactions ──────────────────────────────────────────────

export async function loadAllTransactions(): Promise<Record<string, any[]>> {
  const db = getDb();
  if (!db) return {};
  try {
    console.log('[FIRESTORE] Loading all transactions...');
    const snap = await db.collection('transactions').get();
    const map: Record<string, any[]> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data().items || []; });
    console.log(`[FIRESTORE] Loaded ${Object.keys(map).length} transaction sets`);
    return map;
  } catch (err) {
    console.error('[FIRESTORE] loadAllTransactions failed:', err);
    return {};
  }
}

export async function saveTransactions(userId: string, txs: any[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    console.log(`[FIRESTORE] Saving ${txs.length} transactions for user ${userId.slice(0, 12)}...`);
    await db.collection('transactions').doc(userId).set({ items: txs });
    console.log('[FIRESTORE] Save successful');
  } catch (err) {
    console.error(`[FIRESTORE] Save failed for transactions ${userId.slice(0, 12)}:`, err);
  }
}

// ── Match History ─────────────────────────────────────────────

export async function loadAllMatchHistory(): Promise<Record<string, any[]>> {
  const db = getDb();
  if (!db) return {};
  try {
    console.log('[FIRESTORE] Loading all match history...');
    const snap = await db.collection('matchHistory').get();
    const map: Record<string, any[]> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data().items || []; });
    console.log(`[FIRESTORE] Loaded ${Object.keys(map).length} match history sets`);
    return map;
  } catch (err) {
    console.error('[FIRESTORE] loadAllMatchHistory failed:', err);
    return {};
  }
}

export async function saveMatchHistory(userId: string, records: any[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    console.log(`[FIRESTORE] Saving ${records.length} match records for user ${userId.slice(0, 12)}...`);
    await db.collection('matchHistory').doc(userId).set({ items: records });
    console.log('[FIRESTORE] Save successful');
  } catch (err) {
    console.error(`[FIRESTORE] Save failed for match history ${userId.slice(0, 12)}:`, err);
  }
}

// ── Daily Reward Cooldown ─────────────────────────────────────

export async function loadAllDailyRewards(): Promise<Record<string, string>> {
  const db = getDb();
  if (!db) return {};
  try {
    console.log('[FIRESTORE] Loading all daily rewards...');
    const snap = await db.collection('dailyRewards').get();
    const map: Record<string, string> = {};
    snap.forEach((doc: any) => { map[doc.id] = doc.data().lastClaim; });
    console.log(`[FIRESTORE] Loaded ${Object.keys(map).length} daily reward states`);
    return map;
  } catch (err) {
    console.error('[FIRESTORE] loadAllDailyRewards failed:', err);
    return {};
  }
}

export async function saveDailyReward(userId: string, lastClaim: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    console.log(`[FIRESTORE] Saving daily reward for user ${userId.slice(0, 12)}...`);
    await db.collection('dailyRewards').doc(userId).set({ lastClaim });
    console.log('[FIRESTORE] Save successful');
  } catch (err) {
    console.error(`[FIRESTORE] Save failed for daily reward ${userId.slice(0, 12)}:`, err);
  }
}


