import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
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
import { isGoogleConfigured } from './components/GoogleSignIn';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function AppContent() {
  const { user, loadFromStorage } = useAuthStore();
  const { connect } = useSocketStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (user) connect(user.token);
  }, [user]);

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
  return isGoogleConfigured() ? (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID!}>
      <AppContent />
    </GoogleOAuthProvider>
  ) : (
    <AppContent />
  );
}
