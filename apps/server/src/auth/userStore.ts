import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { STARTING_ELO } from '../services/elo';
import { SocialProfile } from './socialAuth';
import { loadAllUsers, saveUser, loadUserById, loadUserByFirebaseUid, createUserDocument } from '../services/persistence';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatar: string;
  elo: number;
  highestElo: number;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  rankedWins: number;
  rankedLosses: number;
  rankedGames: number;
  chips: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  achievements: string[];
  friends: string[];
  createdAt: string;
  isGuest: boolean;
  firebaseUid?: string;
}

class UserStore {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map();
  private firebaseUidIndex: Map<string, string> = new Map();

  async loadFromFirestore(): Promise<void> {
    const data = await loadAllUsers();
    if (Object.keys(data).length === 0) return;
    // Load Firestore users — no hardcoded seed users
    for (const [id, record] of Object.entries(data)) {
      const user: User = {
        id,
        email: record.email || '',
        name: record.name || 'Player',
        passwordHash: record.passwordHash || '',
        avatar: record.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
        elo: record.elo ?? 800,
        highestElo: record.highestElo ?? 800,
        level: record.level ?? 1,
        xp: record.xp ?? 0,
        wins: record.wins ?? 0,
        losses: record.losses ?? 0,
        gamesPlayed: record.gamesPlayed ?? 0,
        rankedWins: record.rankedWins ?? 0,
        rankedLosses: record.rankedLosses ?? 0,
        rankedGames: record.rankedGames ?? 0,
        chips: record.chips ?? 500,
        lifetimeEarned: record.lifetimeEarned ?? 0,
        lifetimeSpent: record.lifetimeSpent ?? 0,
        achievements: record.achievements ?? [],
        friends: record.friends ?? [],
        createdAt: record.createdAt || new Date().toISOString(),
        isGuest: record.isGuest ?? false,
        firebaseUid: record.firebaseUid || undefined,
      };
      this.users.set(id, user);
      if (user.email) this.emailIndex.set(user.email, id);
      if (user.firebaseUid) this.firebaseUidIndex.set(user.firebaseUid, id);
    }
  }

  async createUser(email: string, name: string, password: string): Promise<User | null> {
    if (this.emailIndex.has(email)) return null;
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const user: User = {
      id, email, name, passwordHash,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      elo: STARTING_ELO,
      highestElo: STARTING_ELO,
      level: 1, xp: 0, wins: 0, losses: 0, gamesPlayed: 0,
      rankedWins: 0, rankedLosses: 0, rankedGames: 0,
      chips: 500, lifetimeEarned: 0, lifetimeSpent: 0,
      achievements: [], friends: [],
      createdAt: new Date().toISOString(),
      isGuest: false,
    };
    this.users.set(id, user);
    this.emailIndex.set(email, id);
    saveUser(id, user);
    return user;
  }

  createGuest(explicitId?: string): User {
    const id = explicitId || uuidv4();
    const num = Math.floor(Math.random() * 9999);
    const user: User = {
      id, email: `guest_${num}@guest.local`, name: `Guest${num}`, passwordHash: '',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest${num}`,
      elo: STARTING_ELO,
      highestElo: STARTING_ELO,
      level: 1, xp: 0, wins: 0, losses: 0, gamesPlayed: 0,
      rankedWins: 0, rankedLosses: 0, rankedGames: 0,
      chips: 500, lifetimeEarned: 0, lifetimeSpent: 0,
      achievements: [], friends: [],
      createdAt: new Date().toISOString(),
      isGuest: true,
    };
    this.users.set(id, user);
    saveUser(id, user);
    return user;
  }

  async findByEmail(email: string, password: string): Promise<User | null> {
    const id = this.emailIndex.get(email);
    if (!id) return null;
    const user = this.users.get(id)!;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  async findByIdAsync(id: string): Promise<User | undefined> {
    const cached = this.users.get(id);
    if (cached) return cached;
    // Auto-load from Firestore if missing from memory
    const record = await loadUserById(id);
    if (record) {
      const user: User = {
        id,
        email: record.email || '',
        name: record.name || 'Player',
        passwordHash: record.passwordHash || '',
        avatar: record.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
        elo: record.elo ?? 800,
        highestElo: record.highestElo ?? 800,
        level: record.level ?? 1,
        xp: record.xp ?? 0,
        wins: record.wins ?? 0,
        losses: record.losses ?? 0,
        gamesPlayed: record.gamesPlayed ?? 0,
        rankedWins: record.rankedWins ?? 0,
        rankedLosses: record.rankedLosses ?? 0,
        rankedGames: record.rankedGames ?? 0,
        chips: record.chips ?? 500,
        lifetimeEarned: record.lifetimeEarned ?? 0,
        lifetimeSpent: record.lifetimeSpent ?? 0,
        achievements: record.achievements ?? [],
        friends: record.friends ?? [],
        createdAt: record.createdAt || new Date().toISOString(),
        isGuest: record.isGuest ?? false,
        firebaseUid: record.firebaseUid || undefined,
      };
      this.users.set(id, user);
      if (user.email) this.emailIndex.set(user.email, id);
      if (user.firebaseUid) this.firebaseUidIndex.set(user.firebaseUid, id);
      return user;
    }
    return undefined;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const cachedId = this.firebaseUidIndex.get(firebaseUid);
    if (cachedId) return this.users.get(cachedId);
    // Auto-load from Firestore
    const record = await loadUserByFirebaseUid(firebaseUid);
    if (record) {
      return this.findByIdAsync(record.id);
    }
    return undefined;
  }

  findByEmailOnly(email: string): User | undefined {
    const id = this.emailIndex.get(email);
    if (!id) return undefined;
    return this.users.get(id);
  }

  /**
   * Look up a social user by firebaseUid in Firestore.
   * If found: hydrate into in-memory cache and return.
   * If not found: create a new user document in Firestore with defaults, hydrate, return.
   * Never throws — never rejects a valid Firebase user.
   */
  async findOrCreateSocialUser(profile: SocialProfile, guestData?: any): Promise<User> {
    const firebaseUid = profile.provider === 'firebase' ? profile.providerId : undefined;

    if (firebaseUid) {
      // 1. Check in-memory cache first
      const cachedId = this.firebaseUidIndex.get(firebaseUid);
      if (cachedId) {
        const cached = this.users.get(cachedId);
        if (cached) {
          console.log(`[FIRESTORE] User found in cache: ${cachedId.slice(0, 12)}`);
          return cached;
        }
      }

      // 2. Look up in Firestore by firebaseUid
      console.log('[FIRESTORE] Reading user...');
      const record = await loadUserByFirebaseUid(firebaseUid);
      if (record) {
        console.log('[FIRESTORE] User found');
        const user: User = this.hydrateUser(record.id, record);
        return user;
      }
      console.log('[FIRESTORE] User not found');
    }

    // 3. Not found anywhere — create a brand new user
    console.log('[FIRESTORE] Creating user');
    const id = uuidv4();
    const now = new Date().toISOString();
    const startingChips = Math.max(guestData?.chips ?? 0, 1000);

    const user: User = {
      id,
      email: profile.email,
      name: profile.name,
      passwordHash: '',
      avatar: profile.avatar,
      elo: guestData?.elo ?? STARTING_ELO,
      highestElo: guestData?.highestElo ?? STARTING_ELO,
      level: guestData?.level ?? 1,
      xp: guestData?.xp ?? 0,
      wins: guestData?.wins ?? 0,
      losses: 0,
      gamesPlayed: guestData?.gamesPlayed ?? 0,
      rankedWins: guestData?.rankedWins ?? 0,
      rankedLosses: 0,
      rankedGames: guestData?.rankedGames ?? 0,
      chips: startingChips,
      lifetimeEarned: guestData?.lifetimeEarned ?? 0,
      lifetimeSpent: guestData?.lifetimeSpent ?? 0,
      achievements: guestData?.achievements ?? [],
      friends: [],
      createdAt: now,
      isGuest: false,
      firebaseUid,
    };

    // Write user document to Firestore
    const created = await createUserDocument(id, user);
    if (!created) {
      console.warn('[FIRESTORE] createUserDocument returned false — user may not be persisted');
    }

    // Hydrate in-memory caches
    this.users.set(id, user);
    if (user.email) this.emailIndex.set(user.email, id);
    if (firebaseUid) this.firebaseUidIndex.set(firebaseUid, id);

    console.log('[FIRESTORE] User created');
    return user;
  }

  /**
   * Hydrate a plain Firestore record into a User object and cache it.
   */
  private hydrateUser(id: string, record: any): User {
    const user: User = {
      id,
      email: record.email || '',
      name: record.name || 'Player',
      passwordHash: record.passwordHash || '',
      avatar: record.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
      elo: record.elo ?? STARTING_ELO,
      highestElo: record.highestElo ?? STARTING_ELO,
      level: record.level ?? 1,
      xp: record.xp ?? 0,
      wins: record.wins ?? 0,
      losses: record.losses ?? 0,
      gamesPlayed: record.gamesPlayed ?? 0,
      rankedWins: record.rankedWins ?? 0,
      rankedLosses: record.rankedLosses ?? 0,
      rankedGames: record.rankedGames ?? 0,
      chips: record.chips ?? 1000,
      lifetimeEarned: record.lifetimeEarned ?? 0,
      lifetimeSpent: record.lifetimeSpent ?? 0,
      achievements: record.achievements ?? [],
      friends: record.friends ?? [],
      createdAt: record.createdAt || new Date().toISOString(),
      isGuest: record.isGuest ?? false,
      firebaseUid: record.firebaseUid || undefined,
    };
    this.users.set(id, user);
    if (user.email) this.emailIndex.set(user.email, id);
    if (user.firebaseUid) this.firebaseUidIndex.set(user.firebaseUid, id);
    return user;
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  updateUser(id: string, updates: Partial<User>) {
    const user = this.users.get(id);
    if (user) {
      const updated = { ...user, ...updates };
      this.users.set(id, updated);
      if (user.email !== updated.email) {
        this.emailIndex.delete(user.email);
        if (updated.email) this.emailIndex.set(updated.email, id);
      }
      if (user.firebaseUid !== updated.firebaseUid) {
        if (user.firebaseUid) this.firebaseUidIndex.delete(user.firebaseUid);
        if (updated.firebaseUid) this.firebaseUidIndex.set(updated.firebaseUid, id);
      }
      saveUser(id, updated);
    }
  }

  updateGuestProgress(id: string, data: Partial<User>): boolean {
    const existing = this.users.get(id);
    if (existing && existing.isGuest) {
      const updated = { ...existing, ...data, id }; // keep original id
      this.users.set(id, updated);
      saveUser(id, updated);
      return true;
    }
    if (!existing) {
      const guest: User = {
        id, isGuest: true,
        email: data.email || `guest@guest.local`,
        name: data.name || 'Guest',
        passwordHash: '',
        avatar: data.avatar || '',
        elo: data.elo ?? 800,
        highestElo: data.highestElo ?? 800,
        level: data.level ?? 1,
        xp: data.xp ?? 0,
        wins: data.wins ?? 0,
        losses: data.losses ?? 0,
        gamesPlayed: data.gamesPlayed ?? 0,
        rankedWins: data.rankedWins ?? 0,
        rankedLosses: data.rankedLosses ?? 0,
        rankedGames: data.rankedGames ?? 0,
        chips: data.chips ?? 500,
        lifetimeEarned: data.lifetimeEarned ?? 0,
        lifetimeSpent: data.lifetimeSpent ?? 0,
        achievements: data.achievements ?? [],
        friends: [],
        createdAt: new Date().toISOString(),
      };
      this.users.set(id, guest);
      saveUser(id, guest);
      return true;
    }
    return false;
  }

  addXP(userId: string, xp: number) {
    const user = this.users.get(userId);
    if (!user) return;
    const newXp = user.xp + xp;
    const newLevel = Math.floor(newXp / 500) + 1;
    const updated = { ...user, xp: newXp, level: newLevel };
    this.users.set(userId, updated);
    saveUser(userId, updated);
  }

  /**
   * Place a user directly into the in-memory cache (used by socket auth
   * when a direct Firestore read succeeds after all other lookups fail).
   */
  getOrSetFromFirestore(id: string, user: User): User {
    this.users.set(id, user);
    if (user.email) this.emailIndex.set(user.email, id);
    if (user.firebaseUid) this.firebaseUidIndex.set(user.firebaseUid, id);
    return user;
  }
}

export const userStore = new UserStore();
