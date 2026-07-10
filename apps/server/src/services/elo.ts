import { v4 as uuidv4 } from 'uuid';
import { userStore } from '../auth/userStore';
import { loadAllMatchHistory, saveMatchHistory } from './persistence';

// ── Constants ──────────────────────────────────────────────────
export const MIN_ELO = 500;
export const MAX_ELO = 2000;
export const STARTING_ELO = 800;
export const DEFAULT_K = 32;
export const BOT_ELO_MULTIPLIER = 0.5;

export type MatchResult = 'win' | 'loss' | 'abandoned';

export interface MatchRecord {
  id: string;
  userId: string;
  game: string;
  opponentId: string;
  opponentName: string;
  result: MatchResult;
  eloChange: number;
  eloBefore: number;
  eloAfter: number;
  isRanked: boolean;
  chipsChange: number;
  buyIn: number;
  reason?: string;
  createdAt: string;
}

class ELO {
  private matchHistory = new Map<string, MatchRecord[]>();

  async loadFromFirestore(): Promise<void> {
    const data = await loadAllMatchHistory();
    for (const [id, records] of Object.entries(data)) {
      this.matchHistory.set(id, records);
    }
  }

  /**
   * Dynamic K-factor based on player's current ELO and role (winner/loser).
   * Below 1000: winners climb faster, losers lose less.
   * Above 1000: progression flattens, competition tightens.
   */
  getDynamicKFactor(elo: number, isWinner: boolean): number {
    if (elo < 800) return isWinner ? 52 : 18;
    if (elo < 1000) return isWinner ? 44 : 22;
    if (elo < 1300) return isWinner ? 32 : 28;
    if (elo < 1600) return isWinner ? 26 : 30;
    return isWinner ? 22 : 32;
  }

  /**
   * Get the effective K-factor for a match.
   * - Human vs Human: uses player's ELO-based dynamic K
   * - Human vs Bot: reduces K by BOT_ELO_MULTIPLIER
   */
  getEffectiveK(elo: number, isWinner: boolean, isBotMatch: boolean): number {
    const k = this.getDynamicKFactor(elo, isWinner);
    return isBotMatch ? Math.round(k * BOT_ELO_MULTIPLIER) : k;
  }

  /**
   * Calculate expected score for player A against player B.
   */
  expectedScore(eloA: number, eloB: number): number {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  /**
   * Calculate new ELO after a match with individual K-factors per player.
   * Returns the adjusted ELO clamped to [MIN, MAX].
   */
  calculate(winnerElo: number, loserElo: number, kWinner = DEFAULT_K, kLoser = DEFAULT_K): { winnerNew: number; loserNew: number } {
    const expectedWinner = this.expectedScore(winnerElo, loserElo);
    const expectedLoser = 1 - expectedWinner;

    let winnerNew = Math.round(winnerElo + kWinner * (1 - expectedWinner));
    let loserNew = Math.round(loserElo + kLoser * (0 - expectedLoser));

    // Clamp
    winnerNew = Math.min(MAX_ELO, Math.max(MIN_ELO, winnerNew));
    loserNew = Math.min(MAX_ELO, Math.max(MIN_ELO, loserNew));

    return { winnerNew, loserNew };
  }

  /**
   * Apply ELO changes after a ranked human vs human match.
   * Uses dynamic K-factors based on each player's current ELO.
   */
  applyRanked(
    winnerId: string, loserId: string, game: string, isBotMatch: boolean = false, buyIn: number = 0,
  ): { winnerChange: number; loserChange: number } {
    const winner = userStore.findById(winnerId);
    const loser = userStore.findById(loserId);
    if (!winner || !loser) {
      console.log(`[ELO] SKIP applyRanked: winner=${winnerId.slice(0,8)} found=${!!winner} loser=${loserId.slice(0,8)} found=${!!loser}`);
      return { winnerChange: 0, loserChange: 0 };
    }

    const kWinner = this.getEffectiveK(winner.elo, true, isBotMatch);
    const kLoser = this.getEffectiveK(loser.elo, false, isBotMatch);
    const { winnerNew, loserNew } = this.calculate(winner.elo, loser.elo, kWinner, kLoser);
    const winnerChange = winnerNew - winner.elo;
    const loserChange = loserNew - loser.elo;

    console.log(`[ELO] Match complete: game=${game} isBotMatch=${isBotMatch}`);
    console.log(`[ELO] Ranked: winner=${winner.name} old=${winner.elo} delta=+${winnerChange} new=${winnerNew}`);
    console.log(`[ELO] Ranked: loser=${loser.name} old=${loser.elo} delta=${loserChange} new=${loserNew}`);

    userStore.updateUser(winnerId, {
      elo: winnerNew,
      highestElo: Math.max(winner.highestElo || winner.elo, winnerNew),
      wins: (winner.wins || 0) + 1,
      gamesPlayed: (winner.gamesPlayed || 0) + 1,
      rankedWins: (winner.rankedWins || 0) + 1,
      rankedGames: (winner.rankedGames || 0) + 1,
    } as any);

    userStore.updateUser(loserId, {
      elo: loserNew,
      highestElo: Math.max(loser.highestElo || loser.elo, loserNew),
      losses: (loser.losses || 0) + 1,
      gamesPlayed: (loser.gamesPlayed || 0) + 1,
      rankedLosses: (loser.rankedLosses || 0) + 1,
      rankedGames: (loser.rankedGames || 0) + 1,
    } as any);

    console.log(`[ELO] Firestore saved: winner=${winnerId.slice(0,8)} loser=${loserId.slice(0,8)}`);

    const timestamp = new Date().toISOString();

    this.recordMatch(winnerId, loserId, game, 'win', winnerChange, winner.elo, winnerNew, true, timestamp, buyIn);
    this.recordMatch(loserId, winnerId, game, 'loss', loserChange, loser.elo, loserNew, true, timestamp, buyIn);

    return { winnerChange, loserChange };
  }

  /**
   * Apply ELO change for a human playing against bots.
   * Uses dynamic K-factors (reduced by BOT_ELO_MULTIPLIER) based on human ELO.
   */
  applyRankedVsBot(
    humanId: string, isWinner: boolean, game: string, botDifficulty: string, buyIn: number = 0,
  ): number {
    const human = userStore.findById(humanId);
    if (!human) {
      console.log(`[ELO] SKIP applyRankedVsBot: human not found id=${humanId.slice(0,8)}`);
      return 0;
    }

    const botBaseElo: Record<string, number> = { easy: 700, medium: 1000, hard: 1400 };
    const botElo = botBaseElo[botDifficulty] || 1000;

    const k = this.getEffectiveK(human.elo, isWinner, true);
    let change: number;
    if (isWinner) {
      const { winnerNew } = this.calculate(human.elo, botElo, k, DEFAULT_K);
      change = winnerNew - human.elo;
    } else {
      const { loserNew } = this.calculate(botElo, human.elo, DEFAULT_K, k);
      change = loserNew - human.elo;
    }

    const newElo = Math.min(MAX_ELO, Math.max(MIN_ELO, human.elo + change));
    const actualChange = newElo - human.elo;

    console.log(`[ELO] Bot match: game=${game} difficulty=${botDifficulty}`);
    console.log(`[ELO] ${isWinner ? 'Winner' : 'Loser'}: human=${human.name} old=${human.elo} delta=${actualChange} new=${newElo}`);

    userStore.updateUser(humanId, {
      elo: newElo,
      highestElo: Math.max(human.highestElo || human.elo, newElo),
      [isWinner ? 'wins' : 'losses']: (human[isWinner ? 'wins' : 'losses'] || 0) + 1,
      gamesPlayed: (human.gamesPlayed || 0) + 1,
      [isWinner ? 'rankedWins' : 'rankedLosses']: (human[isWinner ? 'rankedWins' : 'rankedLosses'] || 0) + 1,
      rankedGames: (human.rankedGames || 0) + 1,
    } as any);

    console.log(`[ELO] Firestore saved: ${humanId.slice(0,8)}`);

    const timestamp = new Date().toISOString();
    this.recordMatch(humanId, `bot_${botDifficulty}`, game, isWinner ? 'win' : 'loss', actualChange, human.elo, newElo, true, timestamp, buyIn);
    return actualChange;
  }

  /**
   * Record an abandoned match — no ELO change, no chips change, just history.
   */
  recordAbandoned(userId: string, game: string, isRanked: boolean, buyIn: number, reason: string = 'Player left match') {
    const user = userStore.findById(userId);
    if (!user) {
      console.log(`[ELO] SKIP recordAbandoned: user not found id=${userId.slice(0,8)}`);
      return;
    }

    console.log(`[ELO] Abandoned: user=${user.name} game=${game} reason=${reason}`);

    const record: MatchRecord = {
      id: uuidv4(), userId, game,
      opponentId: '', opponentName: '',
      result: 'abandoned',
      eloChange: 0, eloBefore: user.elo, eloAfter: user.elo,
      isRanked, chipsChange: 0, buyIn,
      reason,
      createdAt: new Date().toISOString(),
    };
    const history = this.matchHistory.get(userId) || [];
    history.push(record);
    this.matchHistory.set(userId, history);
    saveMatchHistory(userId, history);
  }

  /**
   * Record a casual match (no ELO change, but history is stored).
   */
  recordCasual(
    userId: string, opponentId: string, opponentName: string, game: string, result: MatchResult, chipsChange: number, buyIn: number = 0,
  ) {
    const user = userStore.findById(userId);
    if (!user) {
      console.log(`[ELO] SKIP recordCasual: user not found id=${userId.slice(0,8)}`);
      return;
    }

    console.log(`[ELO] Casual: user=${user.name} game=${game} result=${result}`);

    // Update base stats (no ELO change in casual)
    userStore.updateUser(userId, {
      [result === 'win' ? 'wins' : 'losses']: (user[result === 'win' ? 'wins' : 'losses'] || 0) + 1,
      gamesPlayed: (user.gamesPlayed || 0) + 1,
    } as any);

    const record: MatchRecord = {
      id: uuidv4(), userId, game, opponentId, opponentName, result,
      eloChange: 0, eloBefore: user.elo, eloAfter: user.elo,
      isRanked: false, chipsChange, buyIn, createdAt: new Date().toISOString(),
    };
    const history = this.matchHistory.get(userId) || [];
    history.push(record);
    this.matchHistory.set(userId, history);
    saveMatchHistory(userId, history);
  }

  /**
   * Get match history for a user.
   */
  getMatchHistory(userId: string, limit = 20): MatchRecord[] {
    return (this.matchHistory.get(userId) || []).slice(-limit).reverse();
  }

  private recordMatch(
    userId: string, opponentId: string, game: string, result: MatchResult,
    eloChange: number, eloBefore: number, eloAfter: number, isRanked: boolean, timestamp: string, buyIn: number = 0,
  ) {
    const opponent = userStore.findById(opponentId);
    const record: MatchRecord = {
      id: uuidv4(), userId, game, opponentId, opponentName: opponent?.name || 'Unknown',
      result, eloChange, eloBefore, eloAfter, isRanked, chipsChange: 0, buyIn, createdAt: timestamp,
    };
    const history = this.matchHistory.get(userId) || [];
    history.push(record);
    this.matchHistory.set(userId, history);
    saveMatchHistory(userId, history);
  }
}

export const eloService = new ELO();
