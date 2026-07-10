import { Server, Socket } from 'socket.io';
import { GameManager } from '../games/GameManager';
import { userStore } from '../auth/userStore';
import { presenceManager } from '../presence';
import { loadUserById } from '../services/persistence';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cardkings-india-secret-2024';

export function setupSocketHandlers(io: Server, gameManager: GameManager) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    console.log('[SOCKET AUTH] Incoming connection');

    // ── Guest token ──────────────────────────────────────────────
    if (!token || token.startsWith('guest_') || token === 'guest_token') {
      const rawId = token?.startsWith('guest_') ? token.slice(6) : undefined;
      console.log(`[SOCKET AUTH] Guest token — rawId: ${rawId || 'none'}`);

      (async () => {
        try {
          if (rawId) {
            let guest = await userStore.findByIdAsync(rawId);
            if (guest) {
              console.log('[SOCKET AUTH] Guest found — accepted');
              (socket as any).userId = guest.id;
              (socket as any).user = guest;
              return next();
            }
            console.log('[SOCKET AUTH] Guest not found — creating new');
          }
          const guest = userStore.createGuest(rawId);
          console.log(`[SOCKET AUTH] New guest created: ${guest.id}`);
          (socket as any).userId = guest.id;
          (socket as any).user = guest;
          next();
        } catch (err) {
          console.log('[SOCKET AUTH] Error:', err);
          next(new Error('Authentication error'));
        }
      })();
      return;
    }

    // ── JWT token ─────────────────────────────────────────────────
    (async () => {
      try {
        let decoded: any;
        try {
          decoded = jwt.verify(token, JWT_SECRET);
          console.log(`[SOCKET AUTH] Decoded JWT — userId: ${decoded.userId}, firebaseUid: ${decoded.firebaseUid || '(none)'}`);
        } catch (err) {
          console.log('[SOCKET AUTH] Invalid token');
          return next(new Error('Invalid token'));
        }

        // ── 1. Lookup by internal ID (cache first, then Firestore) ──
        let user = await userStore.findByIdAsync(decoded.userId);
        if (user) {
          console.log(`[SOCKET AUTH] Lookup by internal ID — found: ${user.id}`);
          (socket as any).userId = user.id;
          (socket as any).user = user;
          console.log('[SOCKET AUTH] Accepted');
          return next();
        }
        console.log('[SOCKET AUTH] Lookup by internal ID — not found');

        // ── 2. Lookup by Firebase UID (if present in JWT) ──────────
        if (decoded.firebaseUid) {
          user = await userStore.findByFirebaseUid(decoded.firebaseUid);
          if (user) {
            console.log(`[SOCKET AUTH] Lookup by Firebase UID — found: ${user.id}`);
            (socket as any).userId = user.id;
            (socket as any).user = user;
            console.log('[SOCKET AUTH] Accepted');
            return next();
          }
          console.log('[SOCKET AUTH] Lookup by Firebase UID — not found');
        } else {
          console.log('[SOCKET AUTH] Lookup by Firebase UID — skipped (no firebaseUid in JWT)');
        }

        // ── 3. Direct Firestore query by document ID (final fallback) ──
        console.log('[SOCKET AUTH] Lookup in Firestore');
        const record = await loadUserById(decoded.userId);
        if (record) {
          // Hydrate user into the in-memory cache so subsequent lookups succeed
          const hydrated = {
            id: decoded.userId,
            email: record.email || '',
            name: record.name || 'Player',
            passwordHash: record.passwordHash || '',
            avatar: record.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${decoded.userId}`,
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
          } as any;
          userStore.getOrSetFromFirestore(decoded.userId, hydrated);
          (socket as any).userId = hydrated.id;
          (socket as any).user = hydrated;
          console.log('[SOCKET AUTH] Hydrated user into cache');
          console.log('[SOCKET AUTH] Accepted');
          return next();
        }

        console.log('[SOCKET AUTH] Lookup in Firestore — not found');
        console.log('[SOCKET AUTH] Rejected');
        next(new Error('User not found'));
      } catch (err) {
        console.log('[SOCKET AUTH] Error:', err);
        next(new Error('Authentication error'));
      }
    })();
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    const presence = presenceManager.register(user.id, user.name, user.avatar || '', socket.id);

    // ── RECONNECTION ─────────────────────────────────────────
    const existingRoomId = presence.roomId;
    let isReconnection = false;
    if (existingRoomId) {
      const recovery = gameManager.reconnectPlayer(user.id, existingRoomId);
      if (recovery) {
        isReconnection = true;
        socket.join(existingRoomId);
        socket.emit('room:reconnected', recovery);
        socket.to(existingRoomId).emit('room:playerReconnected', { userId: user.id, name: user.name });
      }
    }

    console.log(`🟢 ${user.name} connected [${socket.id}]${isReconnection ? ' (reconnected)' : ''}`);
    socket.emit('auth:success', { user: sanitizeUser(user), reconnectToken: presence.reconnectToken });

    // ── LOBBY ─────────────────────────────────────────────────
    socket.on('lobby:getRooms', () => {
      socket.emit('lobby:rooms', gameManager.getPublicRooms());
    });

    socket.on('lobby:createRoom', (data: { game: string; maxPlayers: number; isPrivate: boolean; difficulty: string; buyIn?: number; isRanked?: boolean }) => {
      const room = gameManager.createRoom(user.id, data);
      socket.join(room.id);
      socket.emit('room:joined', { room });
      if (!data.isPrivate) io.emit('lobby:roomCreated', room);
    });

    socket.on('lobby:joinRoom', (data: { roomId?: string; code?: string; game?: string }) => {
      const room = data.roomId
        ? gameManager.joinRoom(user.id, data.roomId)
        : data.code
          ? gameManager.joinByCode(user.id, data.code)
          : gameManager.joinMatchmaking(user.id, data.game || 'teen-patti');

      if (!room) {
        socket.emit('error', { message: 'Room not found or full' });
        return;
      }
      socket.join(room.id);
      socket.emit('room:joined', { room });
      io.to(room.id).emit('room:updated', { room });
    });

    socket.on('lobby:quickPlay', (data: { game: string }) => {
      const room = gameManager.quickPlay(user.id, user.elo || 1000, data.game);
      if (!room) {
        socket.emit('error', { message: 'No rooms available, creating one...' });
        return;
      }
      socket.join(room.id);
      // Auto-ready the player
      gameManager.setReady(room.id, user.id, true);
      const updatedRoom = gameManager.getRoom(room.id);
      socket.emit('room:joined', { room: updatedRoom });
      io.to(room.id).emit('room:updated', { room: updatedRoom });
      // Auto-start if all ready (bots are always ready)
      gameManager.startGame(room.id, io);
    });

    // ── READY / START ──────────────────────────────────────────
    socket.on('lobby:setReady', (data: { roomId: string; ready: boolean }) => {
      const result = gameManager.setReady(data.roomId, user.id, data.ready);
      if (result) {
        io.to(data.roomId).emit('room:readyChanged', { userId: user.id, ready: data.ready, allReady: result.allReady });
        io.to(data.roomId).emit('room:updated', { room: result.room });
      }
    });

    socket.on('lobby:startGame', (data: { roomId: string }) => {
      const room = gameManager.getRoom(data.roomId);
      if (!room || room.hostId !== user.id) {
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }
      // Auto-ready the host so the game can start even if the host didn't click Ready
      gameManager.setReady(data.roomId, user.id, true);
      gameManager.startGame(data.roomId, io);
    });

    // ── SPECTATE ───────────────────────────────────────────────
    socket.on('game:spectate', (data: { roomId: string }) => {
      const ok = gameManager.joinSpectator(user.id, data.roomId);
      if (!ok) { socket.emit('error', { message: 'Cannot spectate this room' }); return; }
      socket.join(data.roomId);
      socket.emit('room:joined', { room: gameManager.getRoom(data.roomId) });
      socket.to(data.roomId).emit('room:spectatorJoined', { userId: user.id, name: user.name });
    });

    // ── GUEST SYNC ────────────────────────────────────────────
    socket.on('guest:sync', (data: any) => {
      if (user.isGuest && data) {
        userStore.updateGuestProgress(user.id, data);
        socket.emit('guest:synced', { ok: true });
      }
    });

    // ── GAME ───────────────────────────────────────────────────
    socket.on('game:action', (data: { roomId: string; action: any }) => {
      gameManager.handleAction(data.roomId, user.id, data.action, io);
    });

    socket.on('game:getState', (data: { roomId: string }) => {
      const state = gameManager.getGameState(data.roomId, user.id);
      if (state) socket.emit('game:state', state);
    });

    socket.on('game:nextRound', (data: { roomId: string }) => {
      gameManager.nextRound(data.roomId, io);
    });

    socket.on('game:leave', (data: { roomId: string }) => {
      socket.leave(data.roomId);
      gameManager.leaveRoom(user.id, data.roomId, io);
    });

    // ── CHAT ───────────────────────────────────────────────────
    socket.on('chat:message', (data: { roomId: string; message: string }) => {
      gameManager.resetInactivityTimer(user.id);
      const msg = {
        id: Date.now().toString(),
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        message: data.message.slice(0, 200),
        timestamp: new Date().toISOString(),
      };
      io.to(data.roomId).emit('chat:message', msg);
    });

    socket.on('chat:emote', (data: { roomId: string; emote: string }) => {
      gameManager.resetInactivityTimer(user.id);
      const VALID_EMOTES = ['👍', '😄', '🎉', '😮', '👏', '🤔', '😎', '🃏'];
      if (!VALID_EMOTES.includes(data.emote)) return;
      io.to(data.roomId).emit('chat:emote', {
        userId: user.id, name: user.name, emote: data.emote,
      });
    });

    // ── HEARTBEAT ──────────────────────────────────────────────
    socket.on('heartbeat', () => {
      gameManager.resetInactivityTimer(user.id);
    });

    // ── DISCONNECT ─────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔴 ${user.name} disconnected`);
      presenceManager.disconnect(socket.id);
      gameManager.handleDisconnect(user.id, io);
    });
  });
}

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}
