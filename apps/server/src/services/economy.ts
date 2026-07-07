import { v4 as uuidv4 } from 'uuid';
import { userStore } from '../auth/userStore';

export const CURRENCY_NAME = 'Royal Chips';
export const CURRENCY_SYMBOL = '👑';

export type TransactionType = 'daily_reward' | 'match_win' | 'match_loss' | 'buy_in' | 'admin_grant';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  game?: string;
  createdAt: string;
}

export interface Wallet {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

const DAILY_REWARD_AMOUNT = 50;
const MIN_BUY_IN = 10;
const MAX_BUY_IN = 1000;
const MATCH_WIN_BASE = 30;

class EconomyService {
  private wallets = new Map<string, Wallet>();
  private transactions = new Map<string, Transaction[]>();
  private lastDailyReward = new Map<string, string>();

  getWallet(userId: string): Wallet {
    let wallet = this.wallets.get(userId);
    if (!wallet) {
      wallet = { balance: 500, lifetimeEarned: 0, lifetimeSpent: 0 };
      this.wallets.set(userId, wallet);
      this.addTransaction(userId, 'admin_grant', 500, 'Welcome bonus', undefined);
    }
    return wallet;
  }

  getTransactions(userId: string, limit = 20): Transaction[] {
    return (this.transactions.get(userId) || []).slice(-limit).reverse();
  }

  getBalance(userId: string): number {
    return this.getWallet(userId).balance;
  }

  canAfford(userId: string, amount: number): boolean {
    return this.getWallet(userId).balance >= amount;
  }

  deductBuyIn(userId: string, amount: number, game: string): boolean {
    if (amount < MIN_BUY_IN || amount > MAX_BUY_IN) return false;
    const wallet = this.getWallet(userId);
    if (wallet.balance < amount) return false;
    wallet.balance -= amount;
    wallet.lifetimeSpent += amount;
    this.addTransaction(userId, 'buy_in', -amount, `Buy-in for ${game}`, game);
    return true;
  }

  rewardMatchWin(userId: string, game: string, buyIn: number, multiplier = 1): number {
    const wallet = this.getWallet(userId);
    const reward = Math.floor((MATCH_WIN_BASE + Math.floor(buyIn * 0.5)) * multiplier);
    wallet.balance += reward;
    wallet.lifetimeEarned += reward;
    const desc = multiplier < 1 ? `Win in ${game} (bot match)` : `Win in ${game}`;
    this.addTransaction(userId, 'match_win', reward, desc, game);
    return reward;
  }

  rewardMatchLoss(userId: string, game: string, multiplier = 1): number {
    const consolation = Math.floor(5 * multiplier);
    const wallet = this.getWallet(userId);
    wallet.balance += consolation;
    wallet.lifetimeEarned += consolation;
    const desc = multiplier < 1 ? `Played ${game} (bot match)` : `Played ${game}`;
    this.addTransaction(userId, 'match_loss', consolation, desc, game);
    return consolation;
  }

  claimDailyReward(userId: string): { reward: number; claimed: boolean; nextClaim: string } {
    const last = this.lastDailyReward.get(userId);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (last) {
      const elapsed = now - new Date(last).getTime();
      if (elapsed < cooldown) {
        const nextClaim = new Date(new Date(last).getTime() + cooldown).toISOString();
        return { reward: 0, claimed: false, nextClaim };
      }
    }

    const wallet = this.getWallet(userId);
    wallet.balance += DAILY_REWARD_AMOUNT;
    wallet.lifetimeEarned += DAILY_REWARD_AMOUNT;
    const nowStr = new Date(now).toISOString();
    this.lastDailyReward.set(userId, nowStr);
    this.addTransaction(userId, 'daily_reward', DAILY_REWARD_AMOUNT, 'Daily reward', undefined);
    const nextClaim = new Date(now + cooldown).toISOString();
    return { reward: DAILY_REWARD_AMOUNT, claimed: true, nextClaim };
  }

  getDailyRewardStatus(userId: string): { canClaim: boolean; nextClaim: string | null } {
    const last = this.lastDailyReward.get(userId);
    if (!last) return { canClaim: true, nextClaim: null };
    const elapsed = Date.now() - new Date(last).getTime();
    const cooldown = 24 * 60 * 60 * 1000;
    if (elapsed >= cooldown) return { canClaim: true, nextClaim: null };
    return { canClaim: false, nextClaim: new Date(new Date(last).getTime() + cooldown).toISOString() };
  }

  getValidBuyIn(buyIn: number): number {
    return Math.max(MIN_BUY_IN, Math.min(MAX_BUY_IN, buyIn));
  }

  private addTransaction(userId: string, type: TransactionType, amount: number, description: string, game?: string) {
    const wallet = this.wallets.get(userId)!;
    const tx: Transaction = {
      id: uuidv4(), userId, type, amount,
      balanceBefore: wallet.balance - (amount > 0 ? amount : 0),
      balanceAfter: wallet.balance,
      description, game, createdAt: new Date().toISOString(),
    };
    const txs = this.transactions.get(userId) || [];
    txs.push(tx);
    this.transactions.set(userId, txs);
    // Sync wallet to user store for persistence
    const user = userStore.findById(userId);
    if (user) {
      userStore.updateUser(userId, {
        chips: wallet.balance,
        lifetimeEarned: wallet.lifetimeEarned,
        lifetimeSpent: wallet.lifetimeSpent,
      } as any);
    }
  }
}

export const economyService = new EconomyService();
