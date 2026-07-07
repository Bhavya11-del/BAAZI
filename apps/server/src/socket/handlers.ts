import { Server, Socket } from 'socket.io';
import { GameManager } from '../games/GameManager';
import { userStore } from '../auth/userStore';
import { presenceManager } from '../presence';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cardkings-india-secret-2024';

export function setupSocketHandlers(io: Server, gameManager: GameManager) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token || token.startsWith('guest_') || token === 'guest_token') {
      const guestId = (token && token.startsWith('guest_')) ? token : undefined;
      const guest = (guestId && userStore.findById(guestId)) || userStore.createGuest(guestId);
      (socket as any).userId = guest.id;
      (socket as any).user = guest;
      return next();
    }
    try {
      const { userId } = jwt.verify(token, JWT_SECRET) as any;
      const user = userStore.findById(userId);
      if (!user) return next(new Error('User not found'));
      (socket as any).userId = userId;
      (socket as any).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
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
        // Cancel any grace timer for bot takeover
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
      const VALID_EMOTES = ['👍', '😄', '🎉', '😮', '👏', '🤔', '😎', '🃏'];
      if (!VALID_EMOTES.includes(data.emote)) return;
      io.to(data.roomId).emit('chat:emote', {
        userId: user.id, name: user.name, emote: data.emote,
      });
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
