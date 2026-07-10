import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin';
import { authRouter } from './auth/authRoutes';
import { economyRouter } from './routes/economy';
import { setupSocketHandlers } from './socket/handlers';
import { GameManager } from './games/GameManager';
import { userStore } from './auth/userStore';
import { MIN_ELO, MAX_ELO } from './services/elo';

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
if (firebaseProjectId) {
  try {
    const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (base64Key) {
      const serviceAccount = JSON.parse(
        Buffer.from(base64Key, 'base64').toString('utf-8')
      );
      initializeApp({ credential: cert(serviceAccount) });
      console.log('Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_KEY');
    } else if (filePath) {
      const resolvedPath = path.resolve(filePath);
      const raw = fs.readFileSync(resolvedPath, 'utf-8');
      const serviceAccount = JSON.parse(raw);
      initializeApp({ credential: cert(serviceAccount) });
      console.log('Firebase Admin initialized from', resolvedPath);
    } else {
      initializeApp({ projectId: firebaseProjectId });
      console.log('Firebase Admin initialized with project ID. For local dev, set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH in .env');
    }
  } catch (err) {
    console.error('Firebase Admin initialization FAILED:', err);
  }
} else {
  console.warn('Firebase Admin not configured — social auth (Google sign-in) will return 401. Set FIREBASE_PROJECT_ID in apps/server/.env');
}

const app = express();
const httpServer = createServer(app);

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/economy', economyRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const TIER_THRESHOLDS = [
  { name: 'diamond', min: 1700 },
  { name: 'platinum', min: 1500 },
  { name: 'gold', min: 1300 },
  { name: 'silver', min: 1100 },
  { name: 'bronze', min: MIN_ELO },
];

function getEloTier(elo: number): string {
  for (const t of TIER_THRESHOLDS) {
    if (elo >= t.min) return t.name;
  }
  return 'bronze';
}

app.get('/api/leaderboard', (_req, res) => {
  const users = userStore.getAllUsers()
    .filter(u => !u.isGuest)
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 100)
    .map((u, i) => {
      const winRate = u.gamesPlayed > 0 ? Math.round((u.wins / u.gamesPlayed) * 100) : 0;
      return {
        rank: i + 1,
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        elo: u.elo,
        highestElo: u.highestElo,
        level: u.level,
        wins: u.wins,
        losses: u.losses,
        gamesPlayed: u.gamesPlayed,
        winRate,
        tier: getEloTier(u.elo),
        chips: u.chips,
      };
    });
  res.json(users);
});

const gameManager = new GameManager(io);
setupSocketHandlers(io, gameManager);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🃏 Card Kings India Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready`);
});
