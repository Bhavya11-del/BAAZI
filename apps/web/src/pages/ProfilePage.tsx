import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';
import { Trophy, Medal, Star, Swords, Clock, Target, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const ALL_ACHIEVEMENTS = [
  { id: 'first_win', title: 'First Blood', desc: 'Win your first game', icon: '🩸' },
  { id: 'games_10', title: 'Getting Started', desc: 'Play 10 games', icon: '🎮' },
  { id: 'trail_master', title: 'Trail Master', desc: 'Get a Trail in Teen Patti', icon: '🎯' },
  { id: 'mendicot', title: 'Mendicot!', desc: 'Capture all 4 tens', icon: '🔟' },
  { id: 'perfect_bid', title: 'Perfect Prophet', desc: 'Meet exact bid 5 times', icon: '🔮' },
];

export default function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const targetId = id || currentUser?.id;
    if (!targetId) { navigate('/login'); return; }

    if (targetId === currentUser?.id) {
      setUser(currentUser);
      setLoading(false);
    } else {
      axios.get(`http://localhost:3001/api/auth/profile/${targetId}`)
        .then(res => { setUser(res.data); setLoading(false); })
        .catch(() => { navigate('/'); });
    }
  }, [id, currentUser, navigate]);

  if (loading) return <div className="min-h-screen pt-20 text-center text-white/50">Loading profile...</div>;
  if (!user) return <div className="min-h-screen pt-20 text-center text-white/50">User not found</div>;

  const winRate = user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0;

  const getTierColor = (elo: number) => {
    if (elo >= 2100) return 'text-cyan-300';
    if (elo >= 1800) return 'text-slate-300';
    if (elo >= 1500) return 'text-yellow-400';
    if (elo >= 1200) return 'text-gray-300';
    return 'text-amber-600';
  };

  const getTierName = (elo: number) => {
    if (elo >= 2100) return 'Diamond';
    if (elo >= 1800) return 'Platinum';
    if (elo >= 1500) return 'Gold';
    if (elo >= 1200) return 'Silver';
    return 'Bronze';
  };

  return (
    <div className="min-h-screen pt-20 px-4 pb-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel gold-border p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl" />
          
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-start relative z-10">
            {/* Avatar & Level */}
            <div className="relative">
              <div className="w-32 h-32 rounded-full border-4 border-gold/30 overflow-hidden bg-black/40 p-1">
                <img src={user.avatar} className="w-full h-full rounded-full" alt="" />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-4 py-1 rounded-full border border-black text-black font-bold text-sm shadow-lg whitespace-nowrap">
                Level {user.level}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="font-cinzel text-3xl font-bold text-white mb-2">{user.name}</h1>
              <div className={`font-bold text-lg mb-4 ${getTierColor(user.elo)}`}>
                {getTierName(user.elo)} Tier • {user.elo} ELO
              </div>
              
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-white/40 text-xs mb-1 uppercase tracking-wider">Win Rate</div>
                  <div className="text-white font-bold">{winRate}%</div>
                </div>
                <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-white/40 text-xs mb-1 uppercase tracking-wider">Games</div>
                  <div className="text-white font-bold">{user.gamesPlayed}</div>
                </div>
                <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-white/40 text-xs mb-1 uppercase tracking-wider">Record</div>
                  <div className="text-white font-bold"><span className="text-green-400">{user.wins}</span> - <span className="text-red-400">{user.losses}</span></div>
                </div>
                <div className="bg-black/30 px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-white/40 text-xs mb-1 uppercase tracking-wider">Royal Chips</div>
                  <div className="text-yellow-400 font-bold">👑 {user.chips ?? 0}</div>
                </div>
              </div>
            </div>
            
            {/* XP Bar */}
            <div className="w-full md:w-48 bg-black/30 p-4 rounded-xl border border-white/5 text-center">
              <div className="text-white/40 text-xs mb-2">XP Progress</div>
              <div className="text-gold font-bold text-xl mb-3">{user.xp} <span className="text-xs text-white/40">XP</span></div>
              <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden">
                <div className="bg-gold h-full rounded-full" style={{ width: `${(user.xp % 500) / 5}%` }} />
              </div>
              <div className="text-[10px] text-white/30 mt-2">{500 - (user.xp % 500)} XP to next level</div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-6">
            <h3 className="font-cinzel text-lg font-bold text-gold flex items-center gap-2 mb-4"><Star className="w-5 h-5"/> Favorite Game</h3>
            <div className="flex items-center gap-4">
              <div className="text-4xl">🃏</div>
              <div>
                <div className="font-bold text-white">Teen Patti</div>
                <div className="text-white/40 text-sm">68% of matches</div>
              </div>
            </div>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-6">
            <h3 className="font-cinzel text-lg font-bold text-gold flex items-center gap-2 mb-4"><Target className="w-5 h-5"/> Play Style</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-white/60">Aggressive</span><span className="text-gold">75%</span></div>
                <div className="w-full bg-black/30 h-1.5 rounded-full"><div className="bg-gold h-full rounded-full w-[75%]"/></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-white/60">Bluffing</span><span className="text-gold">40%</span></div>
                <div className="w-full bg-black/30 h-1.5 rounded-full"><div className="bg-gold h-full rounded-full w-[40%]"/></div>
              </div>
            </div>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel p-6">
            <h3 className="font-cinzel text-lg font-bold text-gold flex items-center gap-2 mb-4"><Clock className="w-5 h-5"/> Activity</h3>
            <div className="text-white/80 text-sm">Member since</div>
            <div className="font-bold text-white mb-3">{new Date(user.createdAt).toLocaleDateString()}</div>
            <div className="text-white/80 text-sm">Last played</div>
            <div className="font-bold text-white">Today</div>
          </motion.div>
        </div>

        {/* Achievements */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-panel p-6">
          <h2 className="font-cinzel text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Medal className="w-6 h-6 text-gold" /> Achievements
            <span className="text-sm font-normal text-white/40 ml-2">({user.achievements?.length || 0}/{ALL_ACHIEVEMENTS.length})</span>
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_ACHIEVEMENTS.map(ach => {
              const unlocked = user.achievements?.includes(ach.id);
              return (
                <div key={ach.id} className={`flex items-center gap-3 p-3 rounded-xl border ${unlocked ? 'bg-gold/10 border-gold/30' : 'bg-black/20 border-white/5 opacity-50 grayscale'}`}>
                  <div className="text-3xl">{ach.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-white flex items-center gap-1">
                      {ach.title} {unlocked && <CheckCircle2 className="w-3 h-3 text-gold" />}
                    </div>
                    <div className="text-xs text-white/50">{ach.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
