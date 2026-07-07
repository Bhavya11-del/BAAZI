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
  const { provider, token } = req.body;
  if (!provider || !token) {
    return res.status(400).json({ error: 'Missing provider or token' });
  }
  try {
    const profile = await socialAuthManager.verify(provider, token);
    let user = userStore.findByEmailOnly(profile.email);
    if (user) {
      userStore.updateUser(user.id, {
        name: profile.name,
        avatar: profile.avatar,
      });
    } else {
      user = userStore.createSocialUser(profile);
    }
    const jwt = signToken(user.id);
    res.json({ token: jwt, user: sanitize(user) });
  } catch (err: any) {
    console.error('Social auth error:', err);
    res.status(401).json({ error: err.message || 'Social authentication failed' });
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
