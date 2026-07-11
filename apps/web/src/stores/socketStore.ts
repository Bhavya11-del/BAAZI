import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './authStore';
import toast from 'react-hot-toast';

interface SocketStore {
  socket: Socket | null;
  connected: boolean;
  reconnectToken: string | null;
  authToken: string | null;
  connectError: string | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  connect: (token?: string, reconnectToken?: string) => void;
  disconnect: () => void;
  emit: (event: string, data?: any) => void;
  clearConnectError: () => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  socket: null,
  connected: false,
  reconnectToken: null,
  authToken: null,
  connectError: null,
  heartbeatInterval: null,

  connect: (token?: string, reconnectToken?: string) => {
    const existing = get().socket;
    const currentAuthToken = get().authToken;

    if (!token) token = 'guest_token';

    console.log('[CLIENT socketStore.connect] connecting with token type:', token.startsWith('guest_') ? 'guest' : 'jwt', 'token preview:', token.substring(0, 30) + '...');
    if (token.startsWith('eyJ')) {
      try {
        const parts = token.split('.');
        const payload = JSON.parse(atob(parts[1]));
        console.log('[CLIENT socketStore.connect] JWT payload:', JSON.stringify({ userId: payload.userId, firebaseUid: payload.firebaseUid || '(none)' }));
      } catch (e) {}
    }

    if (existing?.connected && currentAuthToken === token) return;

    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    set({ connected: false });

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
      auth: { token, reconnectToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      set({ connected: true, connectError: null, authToken: token });
      // Start heartbeat to keep inactivity timer alive
      const hb = setInterval(() => socket.emit('heartbeat'), 30000);
      set({ heartbeatInterval: hb });
      // Sync guest progress to server after reconnection
      const authUser = useAuthStore.getState().user;
      if (authUser?.isGuest && authUser.id) {
        socket.emit('guest:sync', {
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          avatar: authUser.avatar,
          elo: authUser.elo,
          highestElo: authUser.highestElo,
          level: authUser.level,
          xp: authUser.xp,
          wins: authUser.wins,
          losses: authUser.losses,
          gamesPlayed: authUser.gamesPlayed,
          rankedWins: authUser.rankedWins,
          rankedLosses: authUser.rankedLosses,
          rankedGames: authUser.rankedGames,
          chips: authUser.chips,
          lifetimeEarned: authUser.lifetimeEarned,
          lifetimeSpent: authUser.lifetimeSpent,
          achievements: authUser.achievements,
        });
      }
    });

    // Bot inactivity events
    socket.on('bot:activated', (data: { userId: string }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser?.id === data.userId) {
        toast('You have been marked inactive. A bot is temporarily playing your turns.', { duration: 5000 });
      }
    });
    socket.on('bot:deactivated', (data: { userId: string }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser?.id === data.userId) {
        toast.success('You are back! Control has been returned to you.', { duration: 4000 });
      }
    });

    socket.on('auth:success', (data: any) => {
      if (data.reconnectToken) {
        set({ reconnectToken: data.reconnectToken });
        localStorage.setItem('cardkings_reconnectToken', data.reconnectToken);
      }
    });

    // User data updated (after match for chips/elo/wins/losses sync)
    socket.on('user:updated', (data: { userId: string; user: any }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.id === data.userId && data.user) {
        useAuthStore.getState().updateUser(data.user);
        console.log('[CLIENT] user:updated — wallet/ELO synced after match', data.user);
      }
    });

    socket.on('disconnect', (reason: string) => {
      set({ connected: false });
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('Socket connect error:', err.message);
      set({ connectError: err.message || 'Connection failed' });
    });

    (socket as any).io.on('reconnect_attempt', () => {
      const storedToken = localStorage.getItem('cardkings_reconnectToken');
      if (storedToken) {
        (socket as any).io.opts.auth = { token, reconnectToken: storedToken };
      }
    });

    set({ socket, authToken: token });
  },

  disconnect: () => {
    const hb = get().heartbeatInterval;
    if (hb) clearInterval(hb);
    const existing = get().socket;
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }
    set({ socket: null, connected: false, reconnectToken: null, authToken: null, connectError: null, heartbeatInterval: null });
  },

  emit: (event, data) => {
    get().socket?.emit(event, data);
  },

  clearConnectError: () => set({ connectError: null }),
}));
