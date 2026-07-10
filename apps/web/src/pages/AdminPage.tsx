import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ShieldAlert, Users, Activity, Settings, BarChart } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    Promise.all([
      axios.get(import.meta.env.VITE_API_URL + '/api/auth/stats').catch(() => null),
      axios.get(import.meta.env.VITE_API_URL + '/api/leaderboard').catch(() => null),
    ]).then(([statsRes, lbRes]) => {
      const serverStats = statsRes?.data || {};
      const totalUsers = serverStats.totalUsers ?? (lbRes?.data?.length ?? '-');
      setStats({
        totalUsers,
        activeGames: serverStats.activeGames ?? '-',
        onlineNow: serverStats.onlineNow ?? '-',
        revenue: 'Free to Play',
      });
      setLoading(false);
    });
  }, [user, navigate]);

  if (loading) return <div className="min-h-screen pt-20 text-center text-white/50">Loading admin data...</div>;
  if (!stats) return null;

  return (
    <div className="min-h-screen pt-20 px-4 pb-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          <h1 className="font-cinzel text-3xl font-bold text-white">Admin Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: <Users className="w-6 h-6 text-blue-400" /> },
            { label: 'Active Games', value: stats.activeGames, icon: <Activity className="w-6 h-6 text-green-400" /> },
            { label: 'Online Now', value: stats.onlineNow.toLocaleString(), icon: <BarChart className="w-6 h-6 text-gold" /> },
            { label: 'Platform Revenue', value: stats.revenue, icon: <Settings className="w-6 h-6 text-purple-400" /> }
          ].map((stat, i) => (
            <div key={i} className="glass-panel p-6 border-l-4 border-l-gold">
              <div className="flex justify-between items-start mb-2">
                <div className="text-white/60 text-sm">{stat.label}</div>
                {stat.icon}
              </div>
              <div className="font-cinzel font-bold text-2xl text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-panel p-6">
            <h2 className="font-cinzel text-lg font-bold text-white mb-4">Server Metrics</h2>
            <p className="text-white/40 text-sm">Real-time server statistics will appear here once monitoring endpoints are implemented.</p>
          </div>

          <div className="glass-panel p-6">
            <h2 className="font-cinzel text-lg font-bold text-white mb-4">System Status</h2>
            <div className="space-y-4">
              {[
                { name: 'API Server', status: 'Operational', color: 'bg-green-500' },
                { name: 'Socket Server', status: 'Operational', color: 'bg-green-500' },
                { name: 'Database', status: 'Operational', color: 'bg-green-500' },
                { name: 'Matchmaking', status: 'High Load', color: 'bg-amber-500' }
              ].map(sys => (
                <div key={sys.name} className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                  <span className="text-white/80 text-sm">{sys.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">{sys.status}</span>
                    <div className={`w-2 h-2 rounded-full ${sys.color} shadow-[0_0_8px_currentColor]`} />
                  </div>
                </div>
              ))}
              
              <button onClick={() => toast.success('Servers restarting... (Simulation)')} className="w-full mt-4 btn-ghost !py-2 text-sm flex items-center justify-center gap-2">
                <Settings className="w-4 h-4" /> Restart Servers
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
