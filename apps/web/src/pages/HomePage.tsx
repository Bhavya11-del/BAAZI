import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { useGameStore } from '../stores/gameStore';
import { useEffect, useState } from 'react';
import { Crown, Swords, Users, Bot, Star, Trophy, ChevronRight, Zap } from 'lucide-react';
import axios from 'axios';

const GAMES = [
  {
    id: 'teen-patti', name: 'Teen Patti', emoji: '🃏', players: '3-6',
    description: 'The legendary Indian poker. Blind bets, sideshows & the thrill of the show!',
    gradient: 'from-amber-600 via-amber-500 to-yellow-400',
    badge: 'HOT', available: true,
  },
  {
    id: 'call-break', name: 'Call Break', emoji: '♠️', players: '4',
    description: 'Bid your tricks wisely. Spades are always trump in this classic!',
    gradient: 'from-slate-600 via-slate-500 to-slate-400',
    badge: 'POPULAR', available: true,
  },
  {
    id: 'mendicot', name: 'Mendicot', emoji: '🔟', players: '4',
    description: 'Team up and capture the 10s! First to 3 tens wins the hand.',
    gradient: 'from-emerald-700 via-emerald-600 to-teal-500',
    badge: 'TEAM', available: true,
  },
  {
    id: 'rummy', name: 'Indian Rummy', emoji: '🎴', players: '2-6',
    description: 'Meld your cards into sequences and sets. Coming soon!',
    gradient: 'from-purple-700 via-purple-600 to-violet-500',
    badge: 'SOON', available: false,
  },
  {
    id: 'court-piece', name: 'Court Piece', emoji: '👑', players: '4',
    description: 'Rang — the ultimate team trick-taking game. Coming soon!',
    gradient: 'from-rose-700 via-rose-600 to-pink-500',
    badge: 'SOON', available: false,
  },
  {
    id: 'bluff', name: 'Bluff', emoji: '🤥', players: '3-6',
    description: 'Lie, bluff, or call bluffs! Pure psychological warfare.',
    gradient: 'from-orange-700 via-orange-600 to-amber-500',
    badge: 'SOON', available: false,
  },
];

const DAILY_CHALLENGES: any[] = [];

export default function HomePage() {
  const navigate = useNavigate();
  const { user, loginAsGuest } = useAuthStore();
  const { socket, connect } = useSocketStore();
  const { setRoom, setRoomId } = useGameStore();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loadingGame, setLoadingGame] = useState<string | null>(null);

  useEffect(() => {
    axios.get('http://localhost:3001/api/leaderboard')
      .then(r => setLeaderboard(r.data.slice(0, 8)))
      .catch(() => {});
  }, []);

  const handleQuickPlay = async (gameId: string) => {
    if (!user) { navigate('/login'); return; }
    setLoadingGame(gameId);
    if (!socket) connect(user.token);
    navigate(`/game/${gameId}`);
  };

  const handleGuestPlay = async (gameId: string) => {
    setLoadingGame(gameId);
    await loginAsGuest();
    navigate(`/game/${gameId}`);
  };

  const getTierColor = (tier: string) => ({
    diamond: 'text-cyan-300', platinum: 'text-slate-300',
    gold: 'text-yellow-400', silver: 'text-gray-300', bronze: 'text-amber-600',
  }[tier] || 'text-white');

  const getTierBadge = (tier: string) => `rank-badge-${tier}`;

  return (
    <div className="min-h-screen pt-16">
      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 px-4">
        {/* Background orbs */}
        <div className="absolute top-10 left-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="flex justify-center mb-6">
              <div className="flex gap-2 text-5xl animate-float">
                <span>🃏</span><span className="animation-delay-200">👑</span><span>🃏</span>
              </div>
            </div>
            <h1 className="font-cinzel text-5xl md:text-7xl font-black mb-4">
              <span className="text-shimmer">Card Kings</span>
              <span className="block text-white/90 text-3xl md:text-4xl mt-2 font-bold">INDIA</span>
            </h1>
            <p className="text-white/60 text-xl max-w-2xl mx-auto mb-10 font-inter">
              Play India's favourite card games online. Challenge AI bots or real players
              in Teen Patti, Call Break, Mendicot & more!
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => user ? navigate('/lobby') : navigate('/login')}
                className="btn-gold text-lg px-10 py-4 flex items-center justify-center gap-2"
              >
                <Swords className="w-5 h-5" />
                {user ? 'Play Now' : 'Sign In & Play'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => handleGuestPlay('teen-patti')}
                className="btn-ghost text-lg px-10 py-4 flex items-center justify-center gap-2"
              >
                <Bot className="w-5 h-5" />
                Play as Guest
              </motion.button>
            </div>

            {/* Stats bar — real data */}
            {leaderboard.length > 0 && (
              <div className="flex justify-center gap-8 mt-12">
                {[
                  { label: 'Registered Players', value: leaderboard.length, icon: '👥' },
                  { label: 'Games Available', value: '3', icon: '🎮' },
                ].map((stat, i) => (
                  <motion.div
                    key={i} initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
                    className="text-center"
                  >
                    <div className="text-2xl mb-1">{stat.icon}</div>
                    <div className="font-cinzel font-bold text-gold text-xl">{stat.value}</div>
                    <div className="text-white/40 text-xs">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── GAMES GRID ─────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <Crown className="w-6 h-6 text-gold" />
          <h2 className="font-cinzel text-2xl font-bold text-white">Featured Games</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAMES.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass-panel gold-border overflow-hidden group ${!game.available ? 'opacity-60' : ''}`}
            >
              {/* Gradient header */}
              <div className={`bg-gradient-to-r ${game.gradient} p-6 relative overflow-hidden`}>
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_50%,white,transparent)]" />
                <div className="flex justify-between items-start">
                  <span className="text-5xl">{game.emoji}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    game.badge === 'HOT' ? 'bg-red-500 text-white' :
                    game.badge === 'POPULAR' ? 'bg-blue-500 text-white' :
                    game.badge === 'TEAM' ? 'bg-emerald-600 text-white' :
                    'bg-white/20 text-white'
                  }`}>{game.badge}</span>
                </div>
                <h3 className="font-cinzel font-bold text-xl text-white mt-3">{game.name}</h3>
                <div className="flex items-center gap-1 mt-1 text-white/70 text-sm">
                  <Users className="w-3.5 h-3.5" />{game.players} players
                </div>
              </div>

              {/* Body */}
              <div className="p-5">
                <p className="text-white/60 text-sm mb-5">{game.description}</p>
                {game.available ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleQuickPlay(game.id)}
                      disabled={loadingGame === game.id}
                      className="btn-gold flex-1 text-sm !py-2.5 flex items-center justify-center gap-1.5"
                    >
                      {loadingGame === game.id ? (
                        <span className="thinking-dots"><span/><span/><span/></span>
                      ) : (
                        <><Zap className="w-4 h-4" /> Quick Play</>
                      )}
                    </button>
                    <button
                      onClick={() => navigate('/lobby')}
                      className="btn-ghost !px-3 !py-2.5"
                      title="Browse rooms"
                    >
                      <Users className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-white/30 text-sm py-2 border border-white/10 rounded-xl">
                    🔒 Coming Soon
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── LEADERBOARD + DAILY CHALLENGES ─────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 pb-20 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="lg:col-span-2 glass-panel p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-gold" />
              <h2 className="font-cinzel font-bold text-lg text-white">Global Leaderboard</h2>
            </div>
            <button onClick={() => navigate('/leaderboard')} className="text-gold text-sm flex items-center gap-1 hover:text-gold-light">
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {leaderboard.length === 0 ? (
              <div className="text-white/30 text-center py-8 text-sm">Loading leaderboard...</div>
            ) : leaderboard.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className={`w-7 h-7 flex items-center justify-center font-bold text-sm rounded-full ${
                  i === 0 ? 'bg-yellow-400 text-felt-darker' :
                  i === 1 ? 'bg-slate-300 text-felt-darker' :
                  i === 2 ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/60'
                }`}>{i + 1}</div>
                <img src={entry.avatar} className="w-9 h-9 rounded-full" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-sm truncate">{entry.name}</div>
                  <div className={`text-xs ${getTierColor(entry.tier)}`}>{entry.tier.toUpperCase()}</div>
                </div>
                <div className="text-right">
                  <div className="text-gold font-bold text-sm">{entry.elo}</div>
                  <div className="text-white/40 text-xs">{entry.wins}W</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Player Stats */}
        <div className="space-y-4">

          {/* Quick Stats */}
          {user && (
            <div className="glass-panel p-5">
              <h3 className="font-cinzel text-sm font-bold text-gold mb-4">Your Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Wins', value: user.wins > 0 ? user.wins : '-', icon: '🏆' },
                  { label: 'Games', value: user.gamesPlayed > 0 ? user.gamesPlayed : '-', icon: '🎮' },
                  { label: 'Level', value: user.level != null ? user.level : '-', icon: '⭐' },
                  { label: 'ELO', value: user.elo != null ? user.elo : '-', icon: '📊' },
                ].map((stat, i) => (
                  <div key={i} className="bg-black/20 rounded-xl p-3 text-center">
                    <div className="text-lg mb-1">{stat.icon}</div>
                    <div className="font-bold text-white">{stat.value}</div>
                    <div className="text-white/40 text-xs">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      {/* ── MENDICOT LEARNING SECTION ─────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <span className="text-2xl">🔟</span>
            <div>
              <h2 className="font-cinzel text-2xl font-bold text-white">Learn Mendicot (Mendhi Kot)</h2>
              <p className="text-white/40 text-sm mt-0.5">Card stats, probabilities & strategy for new players</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Card Distribution Table */}
            <div className="lg:col-span-2 glass-panel p-6">
              <h3 className="font-cinzel font-bold text-gold text-lg mb-5 flex items-center gap-2">
                🃏 Card Distribution (52-Card Deck)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-white/40 font-medium pb-3 pr-4">Card Type</th>
                      <th className="text-center text-white/40 font-medium pb-3 px-4">Count</th>
                      <th className="text-center text-white/40 font-medium pb-3 px-4">Chance</th>
                      <th className="text-right text-white/40 font-medium pb-3 pl-4">Bar</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {[
                      { type: 'Aces', count: 4, pct: 7.69, color: 'bg-yellow-400' },
                      { type: 'Kings', count: 4, pct: 7.69, color: 'bg-amber-500' },
                      { type: 'Queens', count: 4, pct: 7.69, color: 'bg-orange-500' },
                      { type: 'Jacks', count: 4, pct: 7.69, color: 'bg-red-500' },
                      { type: 'Face Cards (J, Q, K)', count: 12, pct: 23.08, color: 'bg-purple-500' },
                      { type: 'Number Cards (2–10)', count: 36, pct: 69.23, color: 'bg-blue-500' },
                      { type: '★ All Point Cards (A,K,Q,J,10)', count: 20, pct: 38.46, color: 'bg-emerald-400' },
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className={`py-3 pr-4 font-medium ${row.type.startsWith('★') ? 'text-emerald-400' : 'text-white/80'}`}>
                          {row.type}
                        </td>
                        <td className="py-3 px-4 text-center text-gold font-bold">{row.count}</td>
                        <td className="py-3 px-4 text-center text-white/70">{row.pct}%</td>
                        <td className="py-3 pl-4">
                          <div className="bg-white/10 rounded-full h-2 w-24 ml-auto">
                            <motion.div
                              className={`h-2 rounded-full ${row.color}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${(row.pct / 70) * 100}%` }}
                              transition={{ delay: 0.4 + i * 0.08, duration: 0.7 }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Probabilities in 13 cards */}
            <div className="space-y-4">
              <div className="glass-panel p-5">
                <h3 className="font-cinzel font-bold text-gold text-sm mb-4 flex items-center gap-2">
                  🎲 Your 13-Card Hand (4-Player)
                </h3>
                <div className="space-y-3">
                  {[
                    { label: 'Avg. Face cards (J,Q,K)', value: '~3 cards', color: 'text-purple-400' },
                    { label: 'Avg. Aces', value: '~1 card', color: 'text-yellow-400' },
                    { label: 'Avg. 10s', value: '~1 card', color: 'text-emerald-400' },
                    { label: 'Avg. Point cards total', value: '~5 cards', color: 'text-gold' },
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center bg-black/20 rounded-xl px-3 py-2.5">
                      <span className="text-white/60 text-xs">{item.label}</span>
                      <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-5">
                <h3 className="font-cinzel font-bold text-gold text-sm mb-4">📊 Probabilities</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Getting ≥1 face card', pct: 97, color: 'bg-purple-500' },
                    { label: 'Getting ≥1 Ace', pct: 69, color: 'bg-yellow-400' },
                    { label: 'Getting ≥1 Ten', pct: 69, color: 'bg-emerald-400' },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/60">{item.label}</span>
                        <span className="text-white font-bold">{item.pct}%</span>
                      </div>
                      <div className="bg-white/10 rounded-full h-2">
                        <motion.div
                          className={`h-2 rounded-full ${item.color}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${item.pct}%` }}
                          transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Strategy Tips */}
          <div className="glass-panel p-6 mt-6">
            <h3 className="font-cinzel font-bold text-gold text-lg mb-5 flex items-center gap-2">
              ♟️ Mendicot Strategy Tips
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: '🃏', tip: 'Don\'t waste Aces early', desc: 'Aces win most tricks. Save them to capture opponent 10s late in the game.' },
                { icon: '🔟', tip: 'Track 10s carefully', desc: '10s are the most valuable point cards. Know which have been played at all times.' },
                { icon: '🤝', tip: 'Feed your partner', desc: 'If your partner wins a trick, play your point cards into it safely instead of risking them.' },
                { icon: '♠️', tip: 'Watch exhausted suits', desc: 'Remember which suits have been played out — players must cut (trump) when void.' },
                { icon: '🎯', tip: 'Late-game trump matters', desc: 'Trump management in the final tricks often decides who wins — don\'t waste trumps early.' },
                { icon: '📊', tip: 'Point cards to capture', desc: '38.46% of deck are point cards. Drawing at least 5 per hand is average — play accordingly.' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  className="bg-black/20 rounded-xl p-4 border border-white/5 hover:border-gold/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{item.icon}</span>
                    <div>
                      <div className="text-white font-semibold text-sm mb-1">{item.tip}</div>
                      <div className="text-white/45 text-xs leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Quick Reference Stats */}
            <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Face Cards', value: '12', sub: 'J + Q + K', icon: '👑' },
                { label: 'Total Number Cards', value: '36', sub: '2 through 10', icon: '🔢' },
                { label: 'Point Cards (A,K,Q,J,10)', value: '20', sub: '38.46% of deck', icon: '⭐' },
                { label: 'Deck Size', value: '52', sub: '4 suits × 13 ranks', icon: '🃏' },
              ].map((stat, i) => (
                <div key={i} className="bg-black/20 rounded-xl p-4 text-center border border-white/5">
                  <div className="text-2xl mb-2">{stat.icon}</div>
                  <div className="font-cinzel font-bold text-gold text-2xl">{stat.value}</div>
                  <div className="text-white/70 text-xs font-medium mt-1">{stat.label}</div>
                  <div className="text-white/30 text-xs mt-0.5">{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
