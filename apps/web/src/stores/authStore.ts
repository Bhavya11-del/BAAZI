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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<AuthUser>;
  logout: () => void;
  loadFromStorage: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: false,

  loadFromStorage: () => {
    const stored = localStorage.getItem('cardkings_user') || localStorage.getItem('cardsKingUser');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
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
          isGuest: parsed.guest !== undefined ? parsed.guest : (parsed.isGuest !== undefined ? parsed.isGuest : true),
          token: parsed.token || parsed.id || 'guest_token'
        };
        set({ user });
      } catch {}
    }
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
    try {
      const res = await axios.post(`${API}/auth/guest`);
      const user = { ...res.data.user, token: res.data.token };
      localStorage.setItem('cardkings_user', JSON.stringify(user));
      set({ user, loading: false });
    } catch (e) {
      console.warn("Guest API login failed, falling back to local guest profile:", e);
      const guestId = "guest_" + Date.now();
      const guestUser = {
        id: guestId,
        username: "Guest",
        guest: true,
        coins: 10000,
        level: 1
      };
      localStorage.setItem("cardsKingUser", JSON.stringify(guestUser));
      const mappedUser: AuthUser = {
        id: guestId,
        name: 'Guest',
        email: '',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestId}`,
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
        token: guestId
      };
      localStorage.setItem('cardkings_user', JSON.stringify(mappedUser));
      set({ user: mappedUser, loading: false });
    }
  },

  loginWithGoogle: async (accessToken) => {
    set({ loading: true });
    const res = await axios.post(`${API}/auth/social`, {
      provider: 'google',
      token: accessToken,
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
