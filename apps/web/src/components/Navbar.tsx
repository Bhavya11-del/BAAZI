import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Crown, Home, Trophy, Swords, User, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const inGame = location.pathname.startsWith('/game/');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => { logout(); navigate('/'); };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16">
      <div className="absolute inset-0 bg-felt-darker/80 backdrop-blur-xl border-b border-gold/20" />
      <div className="relative h-full max-w-7xl mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center group-hover:shadow-gold transition-shadow">
            <Crown className="w-5 h-5 text-felt-darker" />
          </div>
          <div>
            <span className="font-cinzel font-bold text-gold text-lg leading-none block">Card Kings</span>
            <span className="text-gold/50 text-xs font-cinzel">INDIA</span>
          </div>
        </Link>

        {/* Nav Links — hidden during active match */}
        {!inGame && (
          <div className="hidden md:flex items-center gap-6">
            <Link to="/lobby" className="text-white/70 hover:text-gold transition-colors text-sm font-medium flex items-center gap-1.5">
              <Swords className="w-4 h-4" /> Play
            </Link>
            <Link to="/leaderboard" className="text-white/70 hover:text-gold transition-colors text-sm font-medium flex items-center gap-1.5">
              <Trophy className="w-4 h-4" /> Leaderboard
            </Link>
          </div>
        )}

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setDropdownOpen(v => !v)} className="flex items-center gap-2 glass-panel px-3 py-1.5 hover:border-gold/30 transition-all cursor-pointer">
                  <img src={user.avatar} className="w-7 h-7 rounded-full" alt="" />
                  <div className="hidden sm:block text-left">
                    <div className="text-white text-xs font-semibold leading-none">{user.name}</div>
                    <div className="text-gold text-xs">Lv.{user.level ?? '-'} · {user.elo != null ? `${user.elo} ELO` : '- ELO'}</div>
                    <div className="text-yellow-400 text-[10px]">👑 {user.chips != null ? `${user.chips} Chips` : '- Chips'}</div>
                  </div>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 glass-panel border border-gold/20 rounded-lg overflow-hidden z-50">
                    <Link to={`/profile/${user.id}`} onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                      <User className="w-4 h-4" /> Profile
                    </Link>
                    <Link to="/leaderboard" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                      <Trophy className="w-4 h-4" /> Leaderboard
                    </Link>
                    <hr className="border-gold/10" />
                    <button onClick={() => { setDropdownOpen(false); handleLogout(); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors">
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                )}
              </div>
              {!inGame && (
                <Link to="/" className="btn-ghost !px-3 !py-2" title="Home">
                  <Home className="w-4 h-4" />
                </Link>
              )}
            </>
          ) : (
            <Link to="/login" className="btn-gold !py-2 !px-5 text-sm">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
