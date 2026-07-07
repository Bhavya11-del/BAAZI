import { v4 as uuidv4 } from 'uuid';
import { userStore } from '../auth/userStore';

// ── Constants ──────────────────────────────────────────────────
export const MIN_ELO = 500;
export const MAX_ELO = 2000;
export const STARTING_ELO = 800;
export const DEFAULT_K = 32;

export type MatchResult = 'win' | 'loss';

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
  createdAt: string;
}

class ELO {
  private matchHistory = new Map<string, MatchRecord[]>();

  /**
   * Calculate expected score for player A against player B.
   */
  expectedScore(eloA: number, eloB: number): number {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  /**
   * Calculate new ELO after a match. Returns the adjusted ELO clamped to [MIN, MAX].
   */
  calculate(winnerElo: number, loserElo: number, k = DEFAULT_K): { winnerNew: number; loserNew: number } {
    const expectedWinner = this.expectedScore(winnerElo, loserElo);
    const expectedLoser = 1 - expectedWinner;

    let winnerNew = Math.round(winnerElo + k * (1 - expectedWinner));
    let loserNew = Math.round(loserElo + k * (0 - expectedLoser));

    // Clamp
    winnerNew = Math.min(MAX_ELO, Math.max(MIN_ELO, winnerNew));
    loserNew = Math.min(MAX_ELO, Math.max(MIN_ELO, loserNew));

    return { winnerNew, loserNew };
  }

  /**
   * Apply ELO changes after a ranked match and store record.
   */
  applyRanked(
    winnerId: string, loserId: string, game: string, k = DEFAULT_K,
  ): { winnerChange: number; loserChange: number } {
    const winner = userStore.findById(winnerId);
    const loser = userStore.findById(loserId);
    if (!winner || !loser) return { winnerChange: 0, loserChange: 0 };

    const { winnerNew, loserNew } = this.calculate(winner.elo, loser.elo, k);
    const winnerChange = winnerNew - winner.elo;
    const loserChange = loserNew - loser.elo;

    userStore.updateUser(winnerId, {
      elo: winnerNew,
      highestElo: Math.max(winner.highestElo || winner.elo, winnerNew),
      rankedWins: (winner.rankedWins || 0) + 1,
      rankedGames: (winner.rankedGames || 0) + 1,
    } as any);

    userStore.updateUser(loserId, {
      elo: loserNew,
      highestElo: Math.max(loser.highestElo || loser.elo, loserNew),
      rankedLosses: (loser.rankedLosses || 0) + 1,
      rankedGames: (loser.rankedGames || 0) + 1,
    } as any);

    const timestamp = new Date().toISOString();

    this.recordMatch(winnerId, loserId, game, 'win', winnerChange, winner.elo, winnerNew, true, timestamp);
    this.recordMatch(loserId, winnerId, game, 'loss', loserChange, loser.elo, loserNew, true, timestamp);

    return { winnerChange, loserChange };
  }

  /**
   * Apply ELO change for a human playing against bots.
   * Uses a scaled K-factor based on bot difficulty.
   */
  applyRankedVsBot(
    humanId: string, isWinner: boolean, game: string, botDifficulty: string, k: number,
  ): number {
    const human = userStore.findById(humanId);
    if (!human) return 0;

    const botBaseElo: Record<string, number> = { easy: 700, medium: 1000, hard: 1400 };
    const botElo = botBaseElo[botDifficulty] || 1000;

    let change: number;
    if (isWinner) {
      const { winnerNew } = this.calculate(human.elo, botElo, k);
      change = winnerNew - human.elo;
    } else {
      const { loserNew } = this.calculate(botElo, human.elo, k);
      change = loserNew - human.elo;
    }

    const newElo = Math.min(MAX_ELO, Math.max(MIN_ELO, human.elo + change));
    const actualChange = newElo - human.elo;

    userStore.updateUser(humanId, {
      elo: newElo,
      highestElo: Math.max(human.highestElo || human.elo, newElo),
      [isWinner ? 'rankedWins' : 'rankedLosses']: (human[isWinner ? 'rankedWins' : 'rankedLosses'] || 0) + 1,
      rankedGames: (human.rankedGames || 0) + 1,
    } as any);

    const timestamp = new Date().toISOString();
    this.recordMatch(humanId, `bot_${botDifficulty}`, game, isWinner ? 'win' : 'loss', actualChange, human.elo, newElo, true, timestamp);
    return actualChange;
  }

  /**
   * Record a casual match (no ELO change, but history is stored).
   */
  recordCasual(
    userId: string, opponentId: string, opponentName: string, game: string, result: MatchResult, chipsChange: number,
  ) {
    const user = userStore.findById(userId);
    if (!user) return;

    const record: MatchRecord = {
      id: uuidv4(), userId, game, opponentId, opponentName, result,
      eloChange: 0, eloBefore: user.elo, eloAfter: user.elo,
      isRanked: false, chipsChange, createdAt: new Date().toISOString(),
    };
    const history = this.matchHistory.get(userId) || [];
    history.push(record);
    this.matchHistory.set(userId, history);
  }

  /**
   * Get match history for a user.
   */
  getMatchHistory(userId: string, limit = 20): MatchRecord[] {
    return (this.matchHistory.get(userId) || []).slice(-limit).reverse();
  }

  private recordMatch(
    userId: string, opponentId: string, game: string, result: MatchResult,
    eloChange: number, eloBefore: number, eloAfter: number, isRanked: boolean, timestamp: string,
  ) {
    const opponent = userStore.findById(opponentId);
    const record: MatchRecord = {
      id: uuidv4(), userId, game, opponentId, opponentName: opponent?.name || 'Unknown',
      result, eloChange, eloBefore, eloAfter, isRanked, chipsChange: 0, createdAt: timestamp,
    };
    const history = this.matchHistory.get(userId) || [];
    history.push(record);
    this.matchHistory.set(userId, history);
  }
}

export const eloService = new ELO();
