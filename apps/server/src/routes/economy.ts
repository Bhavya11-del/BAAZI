import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { economyService } from '../services/economy';
import { eloService } from '../services/elo';

const JWT_SECRET = process.env.JWT_SECRET || 'cardkings-india-secret-2024';

function getUserId(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    const { userId } = jwt.verify(auth.replace('Bearer ', ''), JWT_SECRET) as any;
    return userId;
  } catch {
    return null;
  }
}

export const economyRouter = Router();

economyRouter.get('/wallet', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const wallet = economyService.getWallet(userId);
  res.json(wallet);
});

economyRouter.get('/transactions', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const transactions = economyService.getTransactions(userId, limit);
  res.json(transactions);
});

economyRouter.post('/daily-reward', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const result = economyService.claimDailyReward(userId);
  res.json(result);
});

economyRouter.get('/daily-reward/status', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const status = economyService.getDailyRewardStatus(userId);
  res.json(status);
});

economyRouter.get('/match-history', (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const history = eloService.getMatchHistory(userId, limit);
  res.json(history);
});
