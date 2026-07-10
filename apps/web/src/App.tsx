import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { useSocketStore } from './stores/socketStore';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import Navbar from './components/Navbar';

function AppContent() {
  const { user, initialized, loadFromStorage } = useAuthStore();
  const { connect } = useSocketStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (user) connect(user.token);
  }, [user, initialized]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-felt-darker">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center">
            <span className="text-2xl">🃏</span>
          </div>
          <div className="text-gold font-cinzel text-xl font-bold animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/lobby.html" element={<LobbyPage />} />
        <Route path="/game/:gameType" element={<GamePage />} />
        <Route path="/profile/:id?" element={<ProfilePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
