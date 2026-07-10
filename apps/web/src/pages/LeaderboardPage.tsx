import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Trophy, Search, ChevronRight } from 'lucide-react';

export default function LeaderboardPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(import.meta.env.VITE_API_URL + '/api/leaderboard')
      .then(res => { setUsers(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  const getTierColor = (tier: string) => ({
    diamond: 'text-cyan-300', platinum: 'text-slate-300',
    gold: 'text-yellow-400', silver: 'text-gray-300', bronze: 'text-amber-600',
  }[tier] || 'text-white');

  return (
    <div className="min-h-screen pt-20 px-4 pb-10">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-gold to-gold-dark rounded-full flex items-center justify-center mx-auto mb-4 shadow-gold">
            <Trophy className="w-10 h-10 text-felt-darker" />
          </div>
          <h1 className="font-cinzel text-4xl font-bold text-shimmer mb-2">Hall of Fame</h1>
          <p className="text-white/60">The greatest Card Kings in India</p>
        </motion.div>

        <div className="glass-panel p-6">
          <div className="flex items-center gap-3 mb-6 bg-black/30 rounded-xl px-4 py-2 border border-white/10">
            <Search className="w-5 h-5 text-white/40" />
            <input 
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              className="bg-transparent border-none outline-none text-white w-full placeholder-white/30"
            />
          </div>

          {loading ? (
            <div className="text-center py-20 text-white/40">Loading rankings...</div>
          ) : (
            <div className="space-y-2">
              {/* Table Header */}
              <div className="flex px-4 py-2 text-xs font-bold text-white/40 uppercase tracking-wider">
                <div className="w-12 text-center">Rank</div>
                <div className="flex-1">Player</div>
                <div className="w-24 text-center hidden sm:block">Win Rate</div>
                <div className="w-24 text-right">ELO Score</div>
              </div>

              {filtered.map((user, i) => {
                const winRate = user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0;
                
                return (
                  <motion.div 
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(`/profile/${user.id}`)}
                    className="flex items-center px-4 py-3 bg-black/20 hover:bg-white/5 rounded-xl border border-white/5 cursor-pointer transition-colors group"
                  >
                    <div className="w-12 flex justify-center">
                      <div className={`w-8 h-8 flex items-center justify-center font-bold rounded-full ${
                        user.rank === 1 ? 'bg-yellow-400 text-felt-darker shadow-[0_0_15px_rgba(250,204,21,0.5)]' :
                        user.rank === 2 ? 'bg-slate-300 text-felt-darker shadow-[0_0_15px_rgba(203,213,225,0.5)]' :
                        user.rank === 3 ? 'bg-amber-600 text-white shadow-[0_0_15px_rgba(217,119,6,0.5)]' : 
                        'bg-white/10 text-white/60'
                      }`}>
                        {user.rank}
                      </div>
                    </div>
                    
                    <div className="flex-1 flex items-center gap-3 pl-4">
                      <img src={user.avatar} className="w-10 h-10 rounded-full border border-white/10" alt="" />
                      <div>
                        <div className="font-bold text-white group-hover:text-gold transition-colors">{user.name}</div>
                        <div className={`text-xs ${getTierColor(user.tier)}`}>{user.tier.toUpperCase()} • Lv.{user.level}</div>
                      </div>
                    </div>

                    <div className="w-24 text-center hidden sm:block">
                      <div className="text-white text-sm">{winRate}%</div>
                      <div className="text-white/30 text-[10px]">{user.wins}W - {user.gamesPlayed - user.wins}L</div>
                    </div>

                    <div className="w-24 text-right flex items-center justify-end gap-2">
                      <span className="font-cinzel font-bold text-gold text-lg">{user.elo}</span>
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-gold transition-colors" />
                    </div>
                  </motion.div>
                );
              })}
              
              {filtered.length === 0 && (
                <div className="text-center py-12 text-white/40">No players found matching "{search}"</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
