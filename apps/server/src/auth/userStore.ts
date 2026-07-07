import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { STARTING_ELO, MIN_ELO, MAX_ELO } from '../services/elo';
import { SocialProfile } from './socialAuth';

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
}

const SEED_PLAYERS = [
  { name: 'RajKing99', elo: 1850, wins: 487, losses: 112 },
  { name: 'MumbaiAce', elo: 1720, wins: 382, losses: 145 },
  { name: 'DelhiShark', elo: 1650, wins: 310, losses: 130 },
  { name: 'ChennaiBluff', elo: 1550, wins: 265, losses: 140 },
  { name: 'PuneTeen', elo: 1480, wins: 201, losses: 110 },
  { name: 'BengaluruBot', elo: 1400, wins: 178, losses: 105 },
  { name: 'HyderabadAce', elo: 1320, wins: 155, losses: 98 },
  { name: 'KolkataKing', elo: 1250, wins: 130, losses: 90 },
  { name: 'JaipurJoker', elo: 1180, wins: 112, losses: 88 },
  { name: 'AhmedabadAce', elo: 1100, wins: 95, losses: 80 },
];

class UserStore {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map();

  constructor() {
    this.seedUsers();
  }

  private seedUsers() {
    SEED_PLAYERS.forEach(p => {
      const id = uuidv4();
      const gamesPlayed = p.wins + p.losses;
      const user: User = {
        id,
        email: `${p.name.toLowerCase()}@cardkings.in`,
        name: p.name,
        passwordHash: '',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`,
        elo: p.elo,
        highestElo: p.elo,
        level: Math.floor(p.wins / 10) + 1,
        xp: p.wins * 100 + p.losses * 25,
        wins: p.wins,
        losses: p.losses,
        gamesPlayed,
        rankedWins: Math.floor(p.wins * 0.6),
        rankedLosses: Math.floor(p.losses * 0.6),
        rankedGames: Math.floor(gamesPlayed * 0.6),
        chips: 2000 + p.wins * 10,
        lifetimeEarned: 5000 + p.wins * 15,
        lifetimeSpent: 1000 + p.losses * 5,
        achievements: ['first_win', 'games_10'],
        friends: [],
        createdAt: new Date().toISOString(),
        isGuest: false,
      };
      this.users.set(id, user);
      this.emailIndex.set(user.email, id);
    });
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

  findByEmailOnly(email: string): User | undefined {
    const id = this.emailIndex.get(email);
    if (!id) return undefined;
    return this.users.get(id);
  }

  createSocialUser(profile: SocialProfile, guestData?: any): User {
    const id = uuidv4();
    const user: User = {
      id, email: profile.email, name: profile.name, passwordHash: '',
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
      chips: Math.max(guestData?.chips ?? 0, 1000),
      lifetimeEarned: guestData?.lifetimeEarned ?? 0,
      lifetimeSpent: guestData?.lifetimeSpent ?? 0,
      achievements: guestData?.achievements ?? [],
      friends: [],
      createdAt: new Date().toISOString(),
      isGuest: false,
    };
    this.users.set(id, user);
    this.emailIndex.set(profile.email, id);
    return user;
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  updateUser(id: string, updates: Partial<User>) {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, ...updates });
  }

  updateGuestProgress(id: string, data: Partial<User>): boolean {
    const existing = this.users.get(id);
    if (existing && existing.isGuest) {
      this.users.set(id, { ...existing, ...data, id }); // keep original id
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
      return true;
    }
    return false;
  }

  addXP(userId: string, xp: number) {
    const user = this.users.get(userId);
    if (!user) return;
    const newXp = user.xp + xp;
    const newLevel = Math.floor(newXp / 500) + 1;
    this.users.set(userId, { ...user, xp: newXp, level: newLevel });
  }
}

export const userStore = new UserStore();
