import { v4 as uuidv4 } from 'uuid';

export interface PresenceInfo {
  userId: string;
  name: string;
  avatar: string;
  socketId: string;
  roomId: string | null;
  connected: boolean;
  lastSeen: string;
  reconnectToken: string;
}

class PresenceManager {
  private users = new Map<string, PresenceInfo>();
  private socketToUser = new Map<string, string>();
  private reconnectTokens = new Map<string, string>();

  register(userId: string, name: string, avatar: string, socketId: string): PresenceInfo {
    const existing = this.users.get(userId);
    const token = existing?.reconnectToken || uuidv4();
    const info: PresenceInfo = {
      userId, name, avatar, socketId, roomId: existing?.roomId || null,
      connected: true, lastSeen: new Date().toISOString(), reconnectToken: token,
    };
    this.users.set(userId, info);
    this.socketToUser.set(socketId, userId);
    this.reconnectTokens.set(token, userId);
    return info;
  }

  disconnect(socketId: string) {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return;
    const info = this.users.get(userId);
    if (info) {
      info.connected = false;
      info.lastSeen = new Date().toISOString();
      info.socketId = '';
    }
    this.socketToUser.delete(socketId);
  }

  reconnect(token: string, newSocketId: string): PresenceInfo | null {
    const userId = this.reconnectTokens.get(token);
    if (!userId) return null;
    const info = this.users.get(userId);
    if (!info) return null;
    info.socketId = newSocketId;
    info.connected = true;
    info.lastSeen = new Date().toISOString();
    this.socketToUser.set(newSocketId, userId);
    return info;
  }

  get(userId: string): PresenceInfo | undefined {
    return this.users.get(userId);
  }

  getBySocket(socketId: string): PresenceInfo | undefined {
    const userId = this.socketToUser.get(socketId);
    if (!userId) return undefined;
    return this.users.get(userId);
  }

  getOnlineUsers(): PresenceInfo[] {
    return Array.from(this.users.values()).filter(u => u.connected);
  }

  setRoomId(userId: string, roomId: string | null) {
    const info = this.users.get(userId);
    if (info) info.roomId = roomId;
  }

  removeFromRoom(userId: string) {
    const info = this.users.get(userId);
    if (info) info.roomId = null;
  }
}

export const presenceManager = new PresenceManager();
