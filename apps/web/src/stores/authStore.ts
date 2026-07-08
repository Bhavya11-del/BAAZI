import { create } from 'zustand';
import axios from 'axios';

const API = 'http://localhost:3001/api';

interface AuthUser {
  id: string;
  name: string;
  email: string;
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
  isGuest: boolean;
  token: string;
}

interface AuthStore {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<AuthUser>;
  logout: () => void;
  loadFromStorage: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  loadFromStorage: () => {
    const stored = localStorage.getItem('cardkings_user') || localStorage.getItem('cardsKingUser');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const isGuest = parsed.guest !== undefined ? parsed.guest : (parsed.isGuest !== undefined ? parsed.isGuest : true);
        const user = {
          id: parsed.id || parsed.uid || `guest_${Date.now()}`,
          name: parsed.username || parsed.name || 'Guest',
          email: parsed.email || '',
          avatar: parsed.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${parsed.id || 'guest'}`,
          elo: parsed.elo || 800,
          highestElo: parsed.highestElo || parsed.elo || 800,
          level: parsed.level || 1,
          xp: parsed.xp || 0,
          wins: parsed.wins || 0,
          losses: parsed.losses || 0,
          gamesPlayed: parsed.gamesPlayed || 0,
          rankedWins: parsed.rankedWins || 0,
          rankedLosses: parsed.rankedLosses || 0,
          rankedGames: parsed.rankedGames || 0,
          chips: parsed.chips ?? 500,
          lifetimeEarned: parsed.lifetimeEarned || 0,
          lifetimeSpent: parsed.lifetimeSpent || 0,
          achievements: parsed.achievements || [],
          isGuest,
          token: isGuest && parsed.id ? `guest_${parsed.id}` : (parsed.token || parsed.id || 'guest_token'),
        };
        set({ user, initialized: true });
        return;
      } catch {}
    }
    // Always mark as initialized — even if nothing was stored
    set({ initialized: true });
  },

  login: async (email, password) => {
    set({ loading: true });
    const res = await axios.post(`${API}/auth/login`, { email, password });
    const user = { ...res.data.user, token: res.data.token };
    localStorage.setItem('cardkings_user', JSON.stringify(user));
    set({ user, loading: false });
  },

  register: async (email, name, password) => {
    set({ loading: true });
    const res = await axios.post(`${API}/auth/register`, { email, name, password });
    const user = { ...res.data.user, token: res.data.token };
    localStorage.setItem('cardkings_user', JSON.stringify(user));
    set({ user, loading: false });
  },

  loginAsGuest: async () => {
    set({ loading: true });

    // 1. Check for an existing guest session in localStorage
    const stored = localStorage.getItem('cardkings_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.isGuest && parsed.id) {
          const user: AuthUser = {
            id: parsed.id,
            name: parsed.name || 'Guest',
            email: parsed.email || '',
            avatar: parsed.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${parsed.id}`,
            elo: parsed.elo ?? 800,
            highestElo: parsed.highestElo ?? 800,
            level: parsed.level ?? 1,
            xp: parsed.xp ?? 0,
            wins: parsed.wins ?? 0,
            losses: parsed.losses ?? 0,
            gamesPlayed: parsed.gamesPlayed ?? 0,
            rankedWins: parsed.rankedWins ?? 0,
            rankedLosses: parsed.rankedLosses ?? 0,
            rankedGames: parsed.rankedGames ?? 0,
            chips: parsed.chips ?? 500,
            lifetimeEarned: parsed.lifetimeEarned ?? 0,
            lifetimeSpent: parsed.lifetimeSpent ?? 0,
            achievements: parsed.achievements ?? [],
            isGuest: true,
            token: `guest_${parsed.id}`,
          };
          set({ user, loading: false });
          return;
        }
      } catch { /* stored data invalid — fall through to create new */ }
    }

    // 2. No valid existing guest — create a new one locally
    const id = crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const num = Math.floor(Math.random() * 9999);
    const user: AuthUser = {
      id,
      name: `Guest${num}`,
      email: `guest_${num}@guest.local`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest${num}`,
      elo: 800,
      highestElo: 800,
      level: 1,
      xp: 0,
      wins: 0,
      losses: 0,
      gamesPlayed: 0,
      rankedWins: 0,
      rankedLosses: 0,
      rankedGames: 0,
      chips: 500,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      achievements: [],
      isGuest: true,
      token: `guest_${id}`,
    };
    localStorage.setItem('cardkings_user', JSON.stringify(user));
    set({ user, loading: false });
  },

  loginWithGoogle: async (idToken) => {
    set({ loading: true });
    const currentUser = get().user;
    const guestData = currentUser?.isGuest ? currentUser : undefined;
    const res = await axios.post(`${API}/auth/social`, {
      provider: 'firebase',
      token: idToken,
      guestData,
    });
    const user = { ...res.data.user, token: res.data.token };
    localStorage.setItem('cardkings_user', JSON.stringify(user));
    set({ user, loading: false });
    return user;
  },

  logout: () => {
    localStorage.removeItem('cardkings_user');
    localStorage.removeItem('cardsKingUser');
    set({ user: null });
  },

  updateUser: (updates) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, ...updates };
      localStorage.setItem('cardkings_user', JSON.stringify(updated));
      set({ user: updated });
    }
  },
}));
