import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { userStore } from './userStore';
import { socialAuthManager } from './socialAuth';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cardkings-india-secret-2024';

function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

authRouter.post('/social', async (req: Request, res: Response) => {
  const { provider, token, guestData } = req.body;
  if (!provider || !token) {
    return res.status(400).json({ error: 'Missing provider or token' });
  }
  try {
    const profile = await socialAuthManager.verify(provider, token);
    let user = userStore.findByEmailOnly(profile.email);

    // If this was a guest upgrade, merge guest progress into the real account
    if (guestData && guestData.isGuest) {
      if (user) {
        // Existing account — merge guest chips/elo/stats (take the higher values)
        userStore.updateUser(user.id, {
          chips: Math.max(user.chips, guestData.chips ?? 0),
          elo: Math.max(user.elo, guestData.elo ?? 800),
          highestElo: Math.max(user.highestElo, guestData.highestElo ?? 800),
          wins: user.wins + (guestData.wins ?? 0),
          gamesPlayed: user.gamesPlayed + (guestData.gamesPlayed ?? 0),
          xp: user.xp + (guestData.xp ?? 0),
          lifetimeEarned: user.lifetimeEarned + (guestData.lifetimeEarned ?? 0),
          lifetimeSpent: user.lifetimeSpent + (guestData.lifetimeSpent ?? 0),
        });
      } else {
        // New account — carry guest progress forward
        user = userStore.createSocialUser(profile, guestData);
      }
    } else {
      if (!user) {
        user = userStore.createSocialUser(profile);
      } else {
        userStore.updateUser(user.id, {
          name: profile.name,
          avatar: profile.avatar,
        });
      }
    }

    const jwt = signToken(user!.id);
    res.json({ token: jwt, user: sanitize(user!) });
  } catch (err: any) {
    const details = {
      message: err.message,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 3).join('\n'),
    };
    console.error(`[Auth] POST /social failed — ${provider}`, details);
    const statusCode = err.code === 'app/no-app' ? 500 : 401;
    res.status(statusCode).json({
      error: err.message || 'Social authentication failed',
      code: err.code || undefined,
    });
  }
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const user = await userStore.createUser(email, name, password);
  if (!user) return res.status(409).json({ error: 'Email already exists' });
  const token = signToken(user.id);
  res.json({ token, user: sanitize(user) });
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await userStore.findByEmail(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user.id);
  res.json({ token, user: sanitize(user) });
});

authRouter.post('/guest', (_req: Request, res: Response) => {
  const user = userStore.createGuest();
  const token = signToken(user.id);
  res.json({ token, user: sanitize(user) });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    const { userId } = jwt.verify(auth.replace('Bearer ', ''), JWT_SECRET) as any;
    const user = userStore.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(sanitize(user));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

authRouter.get('/profile/:id', (req: Request, res: Response) => {
  const user = userStore.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(sanitize(user));
});

function sanitize(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}
