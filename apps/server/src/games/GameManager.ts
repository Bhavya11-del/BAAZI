import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { userStore } from '../auth/userStore';
import { presenceManager } from '../presence';
import { economyService } from '../services/economy';
import { eloService } from '../services/elo';
import {
  createDeck, shuffleDeck,
  initTeenPattiGame, dealCards as dealTeenPatti, applyAction as applyTeenPattiAction, resolveShowdown,
  initCallBreak, dealCallBreak, placeBid, playCard, advanceCallBreakTrick,
  initMendicot, dealMendicot, playMendicotCard, advanceMendicotTrick,
  getTeenPattiBotAction, getCallBreakBotBid, getCallBreakBotCard, getMendicotBotCard,
} from '@card-kings/shared';

export type GameType = 'teen-patti' | 'call-break' | 'mendicot';

export interface RoomPlayer {
  id: string;
  name: string;
  avatar: string;
  elo: number;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
  connected: boolean;
  ready: boolean;
}

export interface Spectator {
  id: string;
  name: string;
  avatar: string;
}

export interface Room {
  id: string;
  code: string;
  game: GameType;
  players: RoomPlayer[];
  spectators: Spectator[];
  maxPlayers: number;
  isPrivate: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'waiting' | 'playing' | 'finished';
  hostId: string;
  createdAt: string;
  allReady: boolean;
  buyIn: number;
  isRanked: boolean;
  abandonedPlayers: Set<string>;
  prizeDistributed: boolean;
}

interface ActionLogEntry {
  seq: number;
  action: any;
  userId: string;
  timestamp: number;
}

interface TurnTimer {
  roomId: string;
  userId: string;
  startedAt: number;
  timeout: NodeJS.Timeout;
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function makeBotPlayer(difficulty: 'easy' | 'medium' | 'hard', index: number): RoomPlayer {
  const BOT_NAMES = [
    ['Lucky Raju', 'Priya Bot', 'Vikram AI', 'Ananya Pro'],
    ['Sharma Bot', 'Patel AI', 'Singh Pro', 'Gupta Bot'],
    ['Expert Raj', 'Master Dev', 'Pro Arjun', 'Ace Kavya'],
  ];
  const diffIdx = { easy: 0, medium: 1, hard: 2 }[difficulty];
  const name = BOT_NAMES[diffIdx][index % 4];
  return {
    id: `bot_${uuidv4()}`, name, isBot: true, botDifficulty: difficulty, connected: true, ready: true,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
    elo: { easy: 800, medium: 1200, hard: 1800 }[difficulty],
  };
}

export class GameManager {
  private rooms = new Map<string, Room>();
  private gameStates = new Map<string, any>();
  private botTimers = new Map<string, NodeJS.Timeout>();
  private turnTimers = new Map<string, TurnTimer>();
  private trickAdvanceTimers = new Map<string, NodeJS.Timeout>();
  private actionLogs = new Map<string, ActionLogEntry[]>();
  private playerRooms = new Map<string, string>();
  private actionSeq = new Map<string, number>();
  private lastActivity = new Map<string, number>();
  private playerBotActive = new Map<string, boolean>();
  private inactivityInterval: NodeJS.Timeout | null = null;
  private io: Server;

  static readonly TURN_TIMEOUT_MS = 30000;
  static readonly INACTIVITY_TIMEOUT_MS = 150000;
  static readonly INACTIVITY_CHECK_MS = 5000;

  constructor(io: Server) {
    this.io = io;
  }

  // ── Room Creation ──────────────────────────────────────────────

  createRoom(hostId: string, options: { game: string; maxPlayers: number; isPrivate: boolean; difficulty: string; buyIn?: number; isRanked?: boolean }): Room {
    const host = userStore.findById(hostId);
    const maxP = Math.min(options.maxPlayers, this.getMaxPlayersForGame(options.game as GameType));
    const buyIn = options.buyIn ?? 0;
    const isRanked = options.isRanked ?? false;

    const room: Room = {
      id: uuidv4(),
      code: generateCode(),
      game: options.game as GameType,
      players: [{
        id: hostId, name: host?.name || 'Player',
        avatar: host?.avatar || '', elo: host?.elo || 1000,
        isBot: false, connected: true, ready: false,
      }],
      spectators: [],
      maxPlayers: maxP,
      isPrivate: options.isPrivate,
      difficulty: (options.difficulty as any) || 'medium',
      status: 'waiting',
      hostId,
      createdAt: new Date().toISOString(),
      allReady: false,
      buyIn,
      isRanked,
      abandonedPlayers: new Set(),
      prizeDistributed: false,
    };

    // Fill remaining slots with bots
    while (room.players.length < room.maxPlayers) {
      room.players.push(makeBotPlayer(room.difficulty, room.players.length - 1));
    }

    this.rooms.set(room.id, room);
    this.playerRooms.set(hostId, room.id);
    presenceManager.setRoomId(hostId, room.id);
    return room;
  }

  // ── Joining ────────────────────────────────────────────────────

  joinRoom(userId: string, roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return null;
    if (room.players.find(p => p.id === userId)) {
      const p = room.players.find(p => p.id === userId)!;
      p.connected = true;
      this.playerRooms.set(userId, roomId);
      presenceManager.setRoomId(userId, roomId);
      return room;
    }

    const user = userStore.findById(userId);
    if (!user) return null;

    // Check buy-in affordability (using economy wallet)
    if (room.buyIn > 0 && !economyService.canAfford(userId, room.buyIn)) {
      return null;
    }

    const botIdx = room.players.findIndex(p => p.isBot);
    if (botIdx !== -1) {
      room.players[botIdx] = {
        id: userId, name: user.name, avatar: user.avatar, elo: user.elo,
        isBot: false, connected: true, ready: false,
      };
    } else if (room.players.length < room.maxPlayers) {
      room.players.push({
        id: userId, name: user.name, avatar: user.avatar, elo: user.elo,
        isBot: false, connected: true, ready: false,
      });
    } else {
      return null;
    }

    this.playerRooms.set(userId, roomId);
    presenceManager.setRoomId(userId, roomId);
    return room;
  }

  joinByCode(userId: string, code: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.code === code && (room.status === 'waiting' || room.players.find(p => p.id === userId))) {
        return this.joinRoom(userId, room.id);
      }
    }
    return null;
  }

  joinMatchmaking(userId: string, game: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.game === game && !room.isPrivate && room.status === 'waiting') {
        const hasBot = room.players.some(p => p.isBot);
        if (hasBot) return this.joinRoom(userId, room.id);
      }
    }
    return this.createRoom(userId, {
      game, maxPlayers: this.getMaxPlayersForGame(game as GameType), isPrivate: false, difficulty: 'medium',
      buyIn: 0, isRanked: false,
    });
  }

  quickPlay(userId: string, _elo: number, game: string): Room | null {
    return this.joinMatchmaking(userId, game);
  }

  // ── Spectating ─────────────────────────────────────────────────

  joinSpectator(userId: string, roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const user = userStore.findById(userId);
    if (!user) return false;
    if (room.players.find(p => p.id === userId) || room.spectators.find(s => s.id === userId)) return true;
    room.spectators.push({ id: userId, name: user.name, avatar: user.avatar });
    this.playerRooms.set(userId, roomId);
    presenceManager.setRoomId(userId, roomId);
    return true;
  }

  // ── Ready Status ───────────────────────────────────────────────

  setReady(roomId: string, userId: string, ready: boolean): { room: Room; allReady: boolean } | null {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return null;
    const player = room.players.find(p => p.id === userId);
    if (!player || player.isBot) return null;
    player.ready = ready;
    const allReady = room.players.every(p => p.isBot || p.ready);
    room.allReady = allReady;
    return { room, allReady };
  }

  // ── Start Game ─────────────────────────────────────────────────

  startGame(roomId: string, io: Server) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const allReady = room.players.every(p => p.isBot || p.ready);
    if (!allReady && room.players.some(p => !p.isBot)) return;
    if (room.players.filter(p => !p.isBot).length < 1) return;

    // Deduct buy-in from all human players at match start
    if (room.buyIn > 0) {
      for (const p of room.players) {
        if (!p.isBot && !economyService.deductBuyIn(p.id, room.buyIn, room.game)) {
          console.error(`[GM] Player ${p.id.slice(0, 8)} cannot afford buy-in at start — aborting`);
          io.to(roomId).emit('error', { message: 'A player cannot afford the buy-in. Aborting.' });
          room.status = 'waiting';
          return;
        }
      }
    }

    // For ranked matches, auto-select bot difficulty based on player skill
    if (room.isRanked) {
      const humanElos = room.players.filter(p => !p.isBot).map(p => p.elo || 800);
      const avgElo = humanElos.length > 0 ? humanElos.reduce((a, b) => a + b, 0) / humanElos.length : 800;
      if (avgElo < 1000) room.difficulty = 'easy';
      else if (avgElo < 1300) room.difficulty = 'medium';
      else room.difficulty = 'hard';
    }

    room.status = 'playing';
    room.prizeDistributed = false;
    this.clearTurnTimer(roomId);

    let state: any;
    const playerDefs = room.players.map(p => ({
      id: p.id, name: p.name, isBot: p.isBot,
      botDifficulty: p.botDifficulty,
      avatar: p.avatar, chips: 2000,
      teamId: (room.players.indexOf(p) % 2) as 0 | 1,
    }));

    switch (room.game) {
      case 'teen-patti': {
        state = initTeenPattiGame(playerDefs, 10);
        const deck = shuffleDeck(createDeck());
        state = dealTeenPatti(state, deck);
        break;
      }
      case 'call-break': {
        state = initCallBreak(playerDefs, 5);
        state = dealCallBreak(state);
        break;
      }
      case 'mendicot': {
        state = initMendicot(playerDefs);
        state = dealMendicot(state);
        break;
      }
    }

    // Initialize inactivity timers for all human players
    for (const p of room.players) {
      if (!p.isBot) {
        this.lastActivity.set(p.id, Date.now());
        this.playerBotActive.set(p.id, false);
      }
    }

    this.startInactivityChecker(io);

    this.gameStates.set(roomId, state);
    this.actionLogs.set(roomId, []);
    this.actionSeq.set(roomId, 0);
    io.to(roomId).emit('game:started', { roomId, game: room.game });
    this.broadcastState(roomId, io);
    this.scheduleTurnTimer(roomId, io);
    this.scheduleBotTurn(roomId, io);
  }

  // ── Actions (with deduplication) ───────────────────────────────

  handleAction(roomId: string, userId: string, action: any, io: Server) {
    const room = this.rooms.get(roomId);
    const state = this.gameStates.get(roomId);
    if (!room || !state) {
      console.log(`[GM] handleAction: room or state not found (roomId=${roomId})`);
      return;
    }

    // Player took an action — reset inactivity timer and deactivate any bot
    this.resetInactivityTimer(userId);

    console.log(`[GM] ===== handleAction ENTER =====`);
    console.log(`[GM] room.game=${room.game} userId=${userId}`);
    console.log(`[GM] action.type=${action.type} action.card=${JSON.stringify(action.card)}`);
    console.log(`[GM] state.phase=${state.phase} state.currentPlayerIndex=${state.currentPlayerIndex}`);
    console.log(`[GM] state.currentTrick.cards.length=${state.currentTrick?.cards?.length} state.currentTrick.leadSuit=${state.currentTrick?.leadSuit}`);
    console.log(`[GM] state.legalCardIds=${JSON.stringify(state.legalCardIds)}`);
    if (state.players) {
      state.players.forEach((p: any, i: number) => {
        console.log(`[GM] player[${i}]: id=${p.id?.slice(0,12)} name=${p.name} isBot=${p.isBot} cards=${p.cards?.length}`);
      });
    }

    // Deduplication: check sequence number
    const seq = this.actionSeq.get(roomId) || 0;
    if (action.seq !== undefined && action.seq <= seq) {
      console.log(`[GM] DEDUP: action.seq=${action.seq} <= seq=${seq}, ignoring`);
      return;
    }

    // Verify it's this player's turn
    const currentPlayer = this.getCurrentPlayerFromState(state, room.game);
    console.log(`[GM] handleAction: game=${room.game} userId=${userId} action=${JSON.stringify(action)} currentPlayerId=${currentPlayer?.id}`);
    if (currentPlayer?.id !== userId) {
      console.log(`[GM] REJECT: not ${userId}'s turn — current is ${currentPlayer?.id}`);
      this.sendErrorToUser(roomId, userId, io, 'It is not your turn');
      return;
    }

    let newState = state;
    let actionRejected = false;
    let rejectReason = '';
    try {
      switch (room.game) {
        case 'teen-patti': {
          console.log(`[GM] teen-patti action: ${action.type}`);
          newState = applyTeenPattiAction(state, { ...action, playerId: userId });
          if (newState.phase === 'SHOWDOWN') newState = resolveShowdown(newState);
          if (newState === state) {
            actionRejected = true;
            rejectReason = 'Invalid move for current game phase';
            console.log(`[GM] REJECT (teen-patti): ${rejectReason}`);
          }
          break;
        }
        case 'call-break': {
          if (action.type === 'bid') {
            console.log(`[GM] call-break bid: userId=${userId} bid=${action.bid}`);
            newState = placeBid(state, userId, action.bid);
            if (newState === state) {
              actionRejected = true;
              rejectReason = 'Invalid bid (must be 1-13)';
              console.log(`[GM] REJECT (cb bid): ${rejectReason}`);
            }
          } else if (action.type === 'playCard') {
            console.log(`[GM] call-break playCard: userId=${userId} card=${JSON.stringify(action.card)}`);
            newState = playCard(state, userId, action.card);
            if (newState === state) {
              actionRejected = true;
              rejectReason = 'Cannot play that card — check rules (follow suit, your turn)';
              console.log(`[GM] REJECT (cb playCard): state unchanged — card was invalid`);
            } else {
              console.log(`[GM] call-break playCard SUCCESS: phase=${newState.phase} currentPlayerIndex=${newState.currentPlayerIndex} trickCards=${newState.currentTrick?.cards?.length}`);
            }
          }
          break;
        }
        case 'mendicot': {
          if (action.type === 'playCard') {
            console.log(`[GM] mendicot playCard: userId=${userId} card=${JSON.stringify(action.card)}`);
            newState = playMendicotCard(state, userId, action.card);
            if (newState === state) {
              actionRejected = true;
              rejectReason = 'Cannot play that card — check legal moves';
              console.log(`[GM] REJECT (m playCard): state unchanged — card was invalid`);
            } else {
              console.log(`[GM] mendicot playCard SUCCESS: phase=${newState.phase} currentPlayerIndex=${newState.currentPlayerIndex} trickCards=${newState.currentTrick?.cards?.length}`);
            }
          }
          break;
        }
      }
    } catch (e) {
      console.error(`[GM] Action error:`, e);
      this.sendErrorToUser(roomId, userId, io, 'An error occurred processing your action');
      return;
    }

    if (actionRejected) {
      this.sendErrorToUser(roomId, userId, io, rejectReason || 'Invalid move');
      // Re-schedule the turn timer since the action was rejected
      this.scheduleTurnTimer(roomId, io);
      this.scheduleBotTurn(roomId, io);
      return;
    }

    // Clear turn timer ONLY after successful validation
    this.clearTurnTimer(roomId);

    // Log the action
    const log = this.actionLogs.get(roomId) || [];
    log.push({ seq: (this.actionSeq.get(roomId) || 0) + 1, action, userId, timestamp: Date.now() });
    this.actionLogs.set(roomId, log);
    this.actionSeq.set(roomId, (this.actionSeq.get(roomId) || 0) + 1);

    this.gameStates.set(roomId, newState);
    this.broadcastState(roomId, io);

    console.log(`[GM] broadcastState done: phase=${newState.phase} currentPlayerIndex=${newState.currentPlayerIndex}`);

    if (newState.phase === 'RESULT' || newState.phase === 'GAME_OVER' || newState.phase === 'SCORING') {
      console.log(`[GM] game end phase: ${newState.phase}`);
      this.handleGameEnd(roomId, newState, room, io);
    } else if (newState.phase === 'TRICK_COMPLETE') {
      console.log(`[GM] trick complete — scheduling advance`);
      this.scheduleTrickAdvance(roomId, io);
    } else {
      this.scheduleTurnTimer(roomId, io);
      this.scheduleBotTurn(roomId, io);
    }
  }

  nextRound(roomId: string, io: Server) {
    const room = this.rooms.get(roomId);
    const state = this.gameStates.get(roomId);
    if (!room || !state) return;

    let newState = state;
    if (room.game === 'call-break' && state.phase === 'SCORING') {
      newState = dealCallBreak({ ...state, dealerIndex: (state.dealerIndex + 1) % 4 });
    } else if (room.game === 'mendicot' && state.phase === 'SCORING') {
      newState = dealMendicot({ ...state, dealerIndex: (state.dealerIndex + 1) % 4, currentRound: state.currentRound + 1 });
    } else if (room.game === 'teen-patti' && state.phase === 'RESULT') {
      const deck = shuffleDeck(createDeck());
      const activePlayers = state.players.filter((p: any) => p.chips > 0);
      if (activePlayers.length < 2) {
        io.to(roomId).emit('game:finished', { state });
        return;
      }
      newState = initTeenPattiGame(
        activePlayers.map((p: any) => ({ id: p.id, name: p.name, isBot: p.isBot, botDifficulty: p.botDifficulty, chips: p.chips, avatar: p.avatar })),
        state.bootAmount,
      );
      newState = dealTeenPatti(newState, deck);
    }

    this.gameStates.set(roomId, newState);
    this.broadcastState(roomId, io);
    this.scheduleTurnTimer(roomId, io);
    this.scheduleBotTurn(roomId, io);
  }

    // ── Reconnection ───────────────────────────────────────────────

  reconnectPlayer(userId: string, roomId: string): any {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === userId);
    if (player) {
      player.connected = true;
      this.playerRooms.set(userId, roomId);
      presenceManager.setRoomId(userId, roomId);
    }

    // Reset inactivity timer and deactivate any active bot for this player
    this.resetInactivityTimer(userId);

    const state = this.gameStates.get(roomId);
    const lastActions = (this.actionLogs.get(roomId) || []).slice(-20);

    return {
      room,
      gameState: state ? this.maskState(state, userId, room.game) : null,
      lastActions,
      game: room.game,
      phase: state?.phase || 'waiting',
    };
  }

  // ── Leave ──────────────────────────────────────────────────────

  leaveRoom(userId: string, roomId: string, io: Server) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== userId);
    room.spectators = room.spectators.filter(s => s.id !== userId);
    this.playerRooms.delete(userId);
    presenceManager.removeFromRoom(userId);

    if (room.players.filter(p => !p.isBot).length === 0) {
      this.cleanupRoom(roomId, io);
      return;
    }

    // Transfer host if needed
    if (room.hostId === userId && room.status === 'waiting') {
      const nextHost = room.players.find(p => !p.isBot);
      if (nextHost) {
        room.hostId = nextHost.id;
        io.to(roomId).emit('room:hostChanged', { hostId: nextHost.id, hostName: nextHost.name });
      }
    }

    // If game is active, mark as abandoned and bot takes over
    if (room.status === 'playing') {
      room.abandonedPlayers.add(userId);
      // Record abandoned immediately
      economyService.recordAbandoned(userId, room.game, room.buyIn);
      eloService.recordAbandoned(userId, room.game, room.isRanked, room.buyIn, 'Player left match');

      const state = this.gameStates.get(roomId);
      if (state) {
        const bot = makeBotPlayer(room.difficulty, room.players.length);
        const botPlayer = {
          id: bot.id, name: `${userId.slice(0, 6)} (Bot)`, avatar: bot.avatar,
          elo: 1000, isBot: true, botDifficulty: room.difficulty, connected: true, ready: true,
        };
        room.players.push(botPlayer);
        // Replace the left player in game state with the bot
        const gamePlayer = state.players?.find((p: any) => p.id === userId);
        if (gamePlayer) {
          gamePlayer.id = botPlayer.id;
          gamePlayer.name = botPlayer.name;
          gamePlayer.isBot = true;
          gamePlayer.botDifficulty = room.difficulty;
        }
      }
    }

    io.to(roomId).emit('room:updated', { room });
  }

  // ── Disconnect Handling ────────────────────────────────────────

  handleDisconnect(userId: string, io: Server) {
    // If the player already reconnected on a different socket, ignore old disconnect
    const presence = presenceManager.get(userId);
    if (presence?.connected && presence.socketId) {
      console.log(`[GM] ${presence.name} disconnected old socket — active connection exists, skipping`);
      return;
    }

    const roomId = this.playerRooms.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === userId);
    if (!player) return;

    player.connected = false;
    io.to(roomId).emit('room:playerDisconnected', { userId, name: player.name });

    // Reset inactivity timer — the inactivity checker will handle bot takeover
    // if the player doesn't return within INACTIVITY_TIMEOUT_MS and it's their turn
    this.resetInactivityTimer(userId);
  }

  private replaceWithBot(roomId: string, userId: string, io: Server) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const state = this.gameStates.get(roomId);
    if (!state) return;

    const player = room.players.find(p => p.id === userId);
    if (!player || player.connected) return; // they reconnected in time

    const bot = makeBotPlayer(room.difficulty, room.players.length);
    const botPlayer: RoomPlayer = {
      id: bot.id, name: `${player.name} (Bot)`, avatar: bot.avatar,
      elo: 1000, isBot: true, botDifficulty: room.difficulty, connected: true, ready: true,
    };

    const idx = room.players.findIndex(p => p.id === userId);
    if (idx !== -1) room.players[idx] = botPlayer;

    const gamePlayer = state.players?.find((p: any) => p.id === userId);
    if (gamePlayer) {
      gamePlayer.id = botPlayer.id;
      gamePlayer.name = botPlayer.name;
      gamePlayer.isBot = true;
      gamePlayer.botDifficulty = room.difficulty;
    }

    // If it was this player's turn, the bot will take it via scheduleBotTurn
    io.to(roomId).emit('room:botReplaced', { oldUserId: userId, newBot: { id: botPlayer.id, name: botPlayer.name } });
    this.broadcastState(roomId, io);
    this.scheduleBotTurn(roomId, io);
  }

  // ── Turn Timer ─────────────────────────────────────────────────

  private scheduleTurnTimer(roomId: string, io: Server) {
    this.clearTurnTimer(roomId);

    const state = this.gameStates.get(roomId);
    const room = this.rooms.get(roomId);
    if (!state || !room) return;

    if (state.phase === 'TRICK_COMPLETE') return;

    const currentPlayer = this.getCurrentPlayerFromState(state, room.game);
    if (!currentPlayer || currentPlayer.isBot) return;

    const timer = setTimeout(() => {
      // Human didn't act in time
      const room2 = this.rooms.get(roomId);
      if (!room2) return;
      const p = room2.players.find(p => p.id === currentPlayer.id);
      if (!p || p.isBot) return;

      // Auto-fold for Teen Patti (standard game mechanic — not a bot takeover)
      if (room2.game === 'teen-patti') {
        this.handleAction(roomId, currentPlayer.id, { type: 'fold', seq: (this.actionSeq.get(roomId) || 0) + 1 }, io);
        io.to(roomId).emit('game:timeout', { userId: currentPlayer.id, action: 'auto-fold' });
        return;
      }
      // For trick-taking games: inactivity checker handles extended AFK
    }, GameManager.TURN_TIMEOUT_MS);

    this.turnTimers.set(roomId, {
      roomId, userId: currentPlayer.id, startedAt: Date.now(), timeout: timer,
    });

    // Broadcast remaining time
    io.to(roomId).emit('game:turnTimer', {
      userId: currentPlayer.id,
      duration: GameManager.TURN_TIMEOUT_MS,
      startedAt: Date.now(),
    });
  }

  private clearTurnTimer(roomId: string) {
    const existing = this.turnTimers.get(roomId);
    if (existing) {
      clearTimeout(existing.timeout);
      this.turnTimers.delete(roomId);
    }
  }

  // ── Trick Advance (5-second delay) ────────────────────────────

  private scheduleTrickAdvance(roomId: string, io: Server) {
    const existing = this.trickAdvanceTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.advanceTrick(roomId, io);
    }, 5000);
    this.trickAdvanceTimers.set(roomId, timer);
  }

  private advanceTrick(roomId: string, io: Server) {
    this.trickAdvanceTimers.delete(roomId);

    const room = this.rooms.get(roomId);
    const state = this.gameStates.get(roomId);
    if (!room || !state) return;
    if (state.phase !== 'TRICK_COMPLETE') return;

    let newState = state;
    if (room.game === 'mendicot') {
      newState = advanceMendicotTrick(state);
    } else if (room.game === 'call-break') {
      newState = advanceCallBreakTrick(state);
    } else {
      return;
    }

    this.gameStates.set(roomId, newState);
    this.broadcastState(roomId, io);
    this.scheduleTurnTimer(roomId, io);
    this.scheduleBotTurn(roomId, io);
  }

  // ── Bot Turn Scheduling ────────────────────────────────────────

  private scheduleBotTurn(roomId: string, io: Server) {
    const existing = this.botTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const state = this.gameStates.get(roomId);
    const room = this.rooms.get(roomId);
    if (!state || !room) return;

    if (state.phase === 'TRICK_COMPLETE') return;

    const currentPlayer = this.getCurrentPlayerFromState(state, room.game);
    if (!currentPlayer?.isBot) return;

    const delay = this.getBotDelay(currentPlayer.botDifficulty || 'medium');
    const timer = setTimeout(() => {
      this.executeBotTurn(roomId, currentPlayer, io);
    }, delay);
    this.botTimers.set(roomId, timer);
  }

  private executeBotTurn(roomId: string, bot: any, io: Server) {
    const room = this.rooms.get(roomId);
    const state = this.gameStates.get(roomId);
    if (!room || !state) return;

    let newState = state;
    const diff = bot.botDifficulty || 'medium';

    try {
      if (room.game === 'teen-patti') {
        const action = getTeenPattiBotAction(state, bot.id, diff);
        newState = applyTeenPattiAction(state, { ...action, playerId: bot.id });
        if (newState.phase === 'SHOWDOWN') newState = resolveShowdown(newState);
      } else if (room.game === 'call-break') {
        if (state.phase === 'BIDDING') {
          const botter = state.players?.find((p: any) => p.id === bot.id);
          const bid = getCallBreakBotBid(botter?.cards || [], diff);
          newState = placeBid(state, bot.id, bid);
        } else if (state.phase === 'TRICK_PLAY') {
          const card = getCallBreakBotCard(state, bot.id, diff);
          if (card) newState = playCard(state, bot.id, card);
        }
      } else if (room.game === 'mendicot') {
        if (state.phase === 'TRICK_PLAY') {
          const card = getMendicotBotCard(state, bot.id, diff);
          if (card) newState = playMendicotCard(state, bot.id, card);
        }
      }
    } catch (e) {
      console.error('Bot error:', e);
      return;
    }

    this.gameStates.set(roomId, newState);
    this.broadcastState(roomId, io);

    if (newState.phase === 'RESULT' || newState.phase === 'GAME_OVER' || newState.phase === 'SCORING') {
      this.handleGameEnd(roomId, newState, room, io);
    } else if (newState.phase === 'TRICK_COMPLETE') {
      this.scheduleTrickAdvance(roomId, io);
    } else {
      this.scheduleTurnTimer(roomId, io);
      this.scheduleBotTurn(roomId, io);
    }
  }

  // ── State Helpers ──────────────────────────────────────────────

  private getCurrentPlayerFromState(state: any, game: GameType): any {
    if (!state?.players) return null;
    if (game === 'teen-patti') {
      return state.players[state.currentPlayerIndex] || null;
    } else if (game === 'call-break') {
      if (state.phase === 'BIDDING') return state.players[state.biddingPlayerIndex] || null;
      return state.players[state.currentPlayerIndex] || null;
    } else if (game === 'mendicot') {
      return state.players[state.currentPlayerIndex] || null;
    }
    return null;
  }

  private getBotDelay(difficulty: string): number {
    const ranges: Record<string, [number, number]> = {
      easy: [1500, 3000], medium: [800, 1800], hard: [400, 1000],
    };
    const [min, max] = ranges[difficulty] || [1000, 2000];
    return min + Math.random() * (max - min);
  }

  private broadcastState(roomId: string, io: Server) {
    const state = this.gameStates.get(roomId);
    const room = this.rooms.get(roomId);
    if (!state || !room) return;

    const sockets = io.sockets.adapter.rooms.get(roomId);
    const turnTimer = this.turnTimers.get(roomId);

    const common = {
      turnTimer: turnTimer ? {
        userId: turnTimer.userId,
        duration: GameManager.TURN_TIMEOUT_MS,
        startedAt: turnTimer.startedAt,
        remaining: Math.max(0, GameManager.TURN_TIMEOUT_MS - (Date.now() - turnTimer.startedAt)),
      } : null,
    };

    if (!sockets) {
      io.to(roomId).emit('game:state', { ...this.maskState(state, null, room.game), ...common });
      return;
    }

    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      const userId = (socket as any).userId;
      const isSpectator = room.spectators.some(s => s.id === userId);
      const masked = this.maskState(state, isSpectator ? null : userId, room.game);
      socket.emit('game:state', { ...masked, ...common, isSpectator });
    }
  }

  private maskState(state: any, viewerId: string | null, game: GameType): any {
    if (game !== 'teen-patti') return state;
    return {
      ...state,
      players: state.players.map((p: any) => ({
        ...p,
        cards: p.id === viewerId || p.status === 'seen' || state.phase === 'RESULT' || state.phase === 'SHOWDOWN'
          ? p.cards
          : p.cards.map(() => ({ id: 'hidden', suit: 'hidden', rank: '?' })),
      })),
    };
  }

  private handleGameEnd(roomId: string, state: any, room: Room, io: Server) {
    io.to(roomId).emit('game:roundEnd', { state });

    const isFinalPhase = state.phase === 'GAME_OVER';
    if (!isFinalPhase) return;

    // Prevent duplicate distribution
    if (room.prizeDistributed) {
      console.log(`[GM] Prize already distributed for room ${roomId.slice(0, 8)}, skipping`);
      return;
    }
    room.prizeDistributed = true;

    const allPlayers: any[] = state.players || [];
    const winnerId = state.winner as string | undefined;
    const humanPlayers = allPlayers.filter((p: any) => !p.isBot);
    const activeHumans = humanPlayers.filter((p: any) => !room.abandonedPlayers.has(p.id));
    const abandonedHumans = humanPlayers.filter((p: any) => room.abandonedPlayers.has(p.id));
    const botPlayers = allPlayers.filter((p: any) => p.isBot);
    const hasBots = botPlayers.length > 0;

    // ── Determine winner set (could be multiple in team games) ──
    let winnerIds: string[] = [];
    let isTeamGame = false;

    if (room.game === 'mendicot') {
      // Mendicot: team-based winner
      const winningTeamId = state.roundWinner;
      if (winningTeamId !== undefined && winningTeamId !== null) {
        isTeamGame = true;
        winnerIds = allPlayers
          .filter((p: any) => p.teamId === winningTeamId && !room.abandonedPlayers.has(p.id))
          .map((p: any) => p.id);
      }
    } else if (winnerId) {
      // FFA games (teen-patti, call-break): single winner
      winnerIds = [winnerId];
    }

    // Filter out abandoned players from winners
    winnerIds = winnerIds.filter(id => !room.abandonedPlayers.has(id));

    const loserIds = activeHumans
      .filter((p: any) => !winnerIds.includes(p.id))
      .map((p: any) => p.id);

    // ── Prize Pool Distribution ──
    if (room.buyIn > 0) {
      // Count only non-abandoned human players who paid buy-in
      const payingPlayersCount = activeHumans.length;
      const totalPool = room.buyIn * (payingPlayersCount + abandonedHumans.length);

      if (winnerIds.length > 0 && payingPlayersCount > 0) {
        if (isTeamGame) {
          // Split pool equally among winning team members
          const share = Math.floor(totalPool / winnerIds.length);
          let remainder = totalPool - share * winnerIds.length;
          for (const wid of winnerIds) {
            const amount = remainder > 0 ? share + 1 : share;
            economyService.rewardPrize(wid, amount, room.game);
            if (remainder > 0) remainder--;
          }
        } else {
          // FFA: winner takes all
          economyService.rewardPrize(winnerIds[0], totalPool, room.game);
        }
      }
    }

    // ── Record abandoned players ──
    for (const p of abandonedHumans) {
      economyService.recordAbandoned(p.id, room.game, room.buyIn);
      eloService.recordAbandoned(p.id, room.game, room.isRanked, room.buyIn, 'Player left match');
    }

    // ── ELO update for ranked matches ──
    if (room.isRanked && winnerIds.length > 0) {
      const humanWinners = winnerIds.filter(w => !allPlayers.find((p: any) => p.id === w)?.isBot);
      const humanLosers = loserIds;

      if (isTeamGame) {
        for (const wId of humanWinners) {
          for (const lId of humanLosers) {
            if (wId !== lId) {
              eloService.applyRanked(wId, lId, room.game, hasBots, room.buyIn);
            }
          }
        }
      } else if (humanWinners.length > 0) {
        const mainWinner = humanWinners[0];
        if (humanLosers.length > 0) {
          // Human vs human — some also bots present
          for (const lId of humanLosers) {
            eloService.applyRanked(mainWinner, lId, room.game, hasBots, room.buyIn);
          }
        } else {
          // Human won against bots only
          eloService.applyRankedVsBot(mainWinner, true, room.game, room.difficulty, room.buyIn);
        }
      }
    } else if (!room.isRanked) {
      // Record casual match history for active players
      for (const p of activeHumans) {
        const result = winnerIds.includes(p.id) ? 'win' as const : 'loss' as const;
        const opponentName = winnerIds.length > 0
          ? allPlayers.find((o: any) => o.id === winnerIds[0])?.name || 'Unknown'
          : 'Unknown';
        eloService.recordCasual(p.id, winnerIds[0] || '', opponentName, room.game, result, 0, room.buyIn);
      }
    }

    room.status = 'finished';
    io.to(roomId).emit('game:finished', { state });
    this.cleanupRoom(roomId, io);
  }

  // ── Inactivity System ─────────────────────────────────────────

  resetInactivityTimer(userId: string) {
    this.lastActivity.set(userId, Date.now());
    if (this.playerBotActive.get(userId)) {
      this.deactivateBot(userId);
    }
  }

  private startInactivityChecker(io: Server) {
    if (this.inactivityInterval) return;
    console.log('[GM] Starting inactivity checker');
    this.inactivityInterval = setInterval(() => {
      this.checkInactivity(io);
    }, GameManager.INACTIVITY_CHECK_MS);
  }

  private stopInactivityChecker() {
    if (this.inactivityInterval) {
      clearInterval(this.inactivityInterval);
      this.inactivityInterval = null;
      console.log('[GM] Stopped inactivity checker');
    }
  }

  private checkInactivity(io: Server) {
    for (const [roomId, room] of this.rooms) {
      if (room.status !== 'playing') continue;
      const state = this.gameStates.get(roomId);
      if (!state) continue;

      const currentPlayer = this.getCurrentPlayerFromState(state, room.game);
      if (!currentPlayer || currentPlayer.isBot) continue;

      // Ensure it's a human in our room
      const player = room.players.find(p => p.id === currentPlayer.id);
      if (!player || player.isBot) continue;

      const lastActive = this.lastActivity.get(currentPlayer.id) ?? Date.now();
      if (Date.now() - lastActive >= GameManager.INACTIVITY_TIMEOUT_MS) {
        this.activateBotForTurn(roomId, currentPlayer.id, io);
      }
    }
  }

  private activateBotForTurn(roomId: string, userId: string, io: Server) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const state = this.gameStates.get(roomId);
    if (!state) return;

    // Verify the player hasn't become active again since we checked
    const lastActive = this.lastActivity.get(userId) ?? 0;
    if (Date.now() - lastActive < GameManager.INACTIVITY_TIMEOUT_MS) return;

    // Mark bot as active for this player
    this.playerBotActive.set(userId, true);

    io.to(roomId).emit('bot:activated', { userId });
    console.log(`[GM] Bot activated for inactive player ${userId.slice(0, 8)} in room ${roomId.slice(0, 8)}`);

    this.executeInactivityBotTurn(roomId, userId, io, room.difficulty);
  }

  private executeInactivityBotTurn(roomId: string, userId: string, io: Server, difficulty: string) {
    const room = this.rooms.get(roomId);
    const state = this.gameStates.get(roomId);
    if (!room || !state) return;

    let newState = state;
    const diff = difficulty as 'easy' | 'medium' | 'hard';

    try {
      if (room.game === 'teen-patti') {
        const action = getTeenPattiBotAction(state, userId, diff);
        newState = applyTeenPattiAction(state, { ...action, playerId: userId });
        if (newState.phase === 'SHOWDOWN') newState = resolveShowdown(newState);
      } else if (room.game === 'call-break') {
        if (state.phase === 'BIDDING') {
          const botter = state.players?.find((p: any) => p.id === userId);
          const bid = getCallBreakBotBid(botter?.cards || [], diff);
          newState = placeBid(state, userId, bid);
        } else if (state.phase === 'TRICK_PLAY') {
          const card = getCallBreakBotCard(state, userId, diff);
          if (card) newState = playCard(state, userId, card);
        }
      } else if (room.game === 'mendicot') {
        if (state.phase === 'TRICK_PLAY') {
          const card = getMendicotBotCard(state, userId, diff);
          if (card) newState = playMendicotCard(state, userId, card);
        }
      }
    } catch (e) {
      console.error('[GM] Inactivity bot error:', e);
      return;
    }

    this.gameStates.set(roomId, newState);
    this.broadcastState(roomId, io);

    if (newState.phase === 'RESULT' || newState.phase === 'GAME_OVER' || newState.phase === 'SCORING') {
      this.handleGameEnd(roomId, newState, room, io);
    } else if (newState.phase === 'TRICK_COMPLETE') {
      this.scheduleTrickAdvance(roomId, io);
    } else {
      this.scheduleTurnTimer(roomId, io);
      this.scheduleBotTurn(roomId, io);
    }
  }

  private deactivateBot(userId: string) {
    this.playerBotActive.set(userId, false);
    const roomId = this.playerRooms.get(userId);
    if (roomId) {
      const io = this.io;
      io.to(roomId).emit('bot:deactivated', { userId });
    }
  }

  // ── Room Cleanup ──────────────────────────────────────────────

  private cleanupRoom(roomId: string, io: Server) {
    // Clear inactivity data for players in this room
    const room = this.rooms.get(roomId);
    if (room) {
      for (const p of room.players) {
        this.lastActivity.delete(p.id);
        this.playerBotActive.delete(p.id);
      }
    }

    this.rooms.delete(roomId);
    this.gameStates.delete(roomId);
    this.clearTurnTimer(roomId);
    const bt = this.botTimers.get(roomId);
    if (bt) clearTimeout(bt);
    this.botTimers.delete(roomId);
    const tat = this.trickAdvanceTimers.get(roomId);
    if (tat) clearTimeout(tat);
    this.trickAdvanceTimers.delete(roomId);
    this.actionLogs.delete(roomId);
    this.actionSeq.delete(roomId);

    // Stop inactivity checker if no more active game rooms
    const hasActiveGames = Array.from(this.rooms.values()).some(r => r.status === 'playing');
    if (!hasActiveGames) {
      this.stopInactivityChecker();
    }
  }

  // ── Public Getters ────────────────────────────────────────────

  getPublicRooms(): Room[] {
    return Array.from(this.rooms.values()).filter(r => !r.isPrivate && r.status === 'waiting');
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getGameState(roomId: string, userId: string): any {
    const state = this.gameStates.get(roomId);
    const room = this.rooms.get(roomId);
    if (!state || !room) return null;
    return this.maskState(state, userId, room.game);
  }

  getPlayerRoom(userId: string): string | undefined {
    return this.playerRooms.get(userId);
  }

  private sendErrorToUser(roomId: string, userId: string, io: Server, message: string) {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (!sockets) return;
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      if ((socket as any).userId === userId) {
        socket.emit('error', { message });
        break;
      }
    }
  }

  private getMaxPlayersForGame(game: GameType): number {
    return game === 'teen-patti' ? 6 : 4;
  }
}
