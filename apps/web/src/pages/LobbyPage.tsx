import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { useGameStore } from '../stores/gameStore';
import { Plus, Users, Lock, Unlock, Zap, Hash, Search, Play, Check, Clock, Gift, Crown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const GAMES = [
  { id: 'teen-patti', name: 'Teen Patti', emoji: '🃏', maxPlayers: 6 },
  { id: 'call-break', name: 'Call Break', emoji: '♠️', maxPlayers: 4 },
  { id: 'mendicot', name: 'Mendicot', emoji: '🔟', maxPlayers: 4 },
];

export default function LobbyPage() {
  const navigate = useNavigate();
  const { user, loginAsGuest } = useAuthStore();
  const { socket, connect, connected } = useSocketStore();
  const { setRoom, setRoomId } = useGameStore();

  const [rooms, setRooms] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [selectedGame, setSelectedGame] = useState('teen-patti');
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'>('medium');
  const [isPrivate, setIsPrivate] = useState(false);
  const [filterGame, setFilterGame] = useState('all');
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [buyIn, setBuyIn] = useState(0);
  const [isRanked, setIsRanked] = useState(false);
  const [dailyRewardStatus, setDailyRewardStatus] = useState<{ canClaim: boolean; nextClaimAt?: number } | null>(null);
  const [joiningQuickPlay, setJoiningQuickPlay] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const listenersInitialized = useRef(false);

  // Ensure user and socket are ready before setting up listeners
  useEffect(() => {
    if (!user) { loginAsGuest(); return; }
    if (!socket) { connect(user.token); return; }
    if (!connected) return;

    // Only initialize listeners once per socket connection
    if (listenersInitialized.current) return;
    listenersInitialized.current = true;

    socket.emit('lobby:getRooms');

    const handleRooms = (data: any) => setRooms(data);
    const handleRoomCreated = (room: any) => setRooms(prev => [...prev, room]);
    const handleRoomJoined = ({ room }: any) => {
      setCurrentRoom(room);
      setRoom(room);
      setRoomId(room.id);
      setReady(false);
      setJoiningQuickPlay(null);
      setCreatingRoom(false);
      setJoiningRoom(false);
    };
    const handleRoomUpdated = ({ room }: any) => {
      setCurrentRoom(room);
      setRoom(room);
    };
    const handleReadyChanged = ({ userId: uid, ready: r }: any) => {
      if (uid === user.id) return;
      toast(r ? 'Player is ready' : 'Player is not ready', { duration: 1500 });
    };
    const handleGameStarted = ({ roomId, game: g }: any) => {
      navigate(`/game/${g}`);
    };
    const handleReconnected = ({ room: r }: any) => {
      setCurrentRoom(r);
      setRoom(r);
      setRoomId(r.id);
      setReady(false);
    };
    const handleError = ({ message }: any) => {
      toast.error(message);
      setCreatingRoom(false);
      setJoiningRoom(false);
      setJoiningQuickPlay(null);
    };

    socket.on('lobby:rooms', handleRooms);
    socket.on('lobby:roomCreated', handleRoomCreated);
    socket.on('room:joined', handleRoomJoined);
    socket.on('room:reconnected', handleReconnected);
    socket.on('room:updated', handleRoomUpdated);
    socket.on('room:readyChanged', handleReadyChanged);
    socket.on('game:started', handleGameStarted);
    socket.on('error', handleError);

    return () => {
      socket.off('lobby:rooms', handleRooms);
      socket.off('lobby:roomCreated', handleRoomCreated);
      socket.off('room:joined', handleRoomJoined);
      socket.off('room:reconnected', handleReconnected);
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:readyChanged', handleReadyChanged);
      socket.off('game:started', handleGameStarted);
      socket.off('error', handleError);
      listenersInitialized.current = false;
    };
  }, [user, socket, connected]);

  // Fetch daily reward status
  useEffect(() => {
    if (user?.token) {
      axios.get('http://localhost:3001/api/economy/daily-reward/status', {
        headers: { Authorization: `Bearer ${user.token}` },
      }).then(res => setDailyRewardStatus(res.data)).catch(() => {});
    }
  }, [user?.token]);

  const handleClaimDailyReward = async () => {
    if (!user?.token) return;
    try {
      const res = await axios.post('http://localhost:3001/api/economy/daily-reward', {}, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const { success, balance, message } = res.data;
      if (success) {
        toast.success(`🎁 ${message} — New balance: 👑 ${balance}`);
        useAuthStore.getState().updateUser({ chips: balance });
        setDailyRewardStatus({ canClaim: false, nextClaimAt: Date.now() + 86400000 });
      } else {
        toast.error(message || 'Cannot claim yet');
      }
    } catch {
      toast.error('Failed to claim daily reward');
    }
  };

  const handleCreate = () => {
    if (!socket || !connected) { toast.error('Not connected to server'); return; }
    setCreatingRoom(true);
    const game = GAMES.find(g => g.id === selectedGame)!;
    socket.emit('lobby:createRoom', {
      game: selectedGame, maxPlayers: game.maxPlayers, isPrivate, difficulty,
      buyIn, isRanked,
    });
  };

  const handleJoinCode = () => {
    if (!joinCode.trim() || !socket || !connected) return;
    setJoiningRoom(true);
    socket.emit('lobby:joinRoom', { code: joinCode.toUpperCase() });
  };

  const handleJoinRoom = (roomId: string) => {
    if (!socket || !connected) return;
    setJoiningRoom(true);
    socket.emit('lobby:joinRoom', { roomId });
  };

  const handleQuickPlay = (gameId: string) => {
    if (!socket || !connected) { toast.error('Not connected to server'); return; }
    setJoiningQuickPlay(gameId);
    socket.emit('lobby:quickPlay', { game: gameId });
  };

  const toggleReady = () => {
    if (!socket || !currentRoom) return;
    const newReady = !ready;
    setReady(newReady);
    socket.emit('lobby:setReady', { roomId: currentRoom.id, ready: newReady });
  };

  const handleStartGame = () => {
    if (!socket || !currentRoom) return;
    socket.emit('lobby:startGame', { roomId: currentRoom.id });
  };

  const handleLeaveRoom = () => {
    if (!socket || !currentRoom) return;
    socket.emit('game:leave', { roomId: currentRoom.id });
    setCurrentRoom(null);
    setReady(false);
  };

  const filtered = filterGame === 'all' ? rooms : rooms.filter(r => r.game === filterGame);
  const isHost = currentRoom?.hostId === user?.id;
  const allReady = currentRoom?.players?.every((p: any) => p.isBot || p.ready || (p.id === user?.id && ready));

  // Room view if player is in a room
  if (currentRoom) {
    return (
      <div className="min-h-screen pt-20 px-4 pb-10">
        <div className="max-w-2xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="font-cinzel text-3xl font-bold text-white">🎮 Game Lobby</h1>
            <p className="text-white/40 mt-1">Room code: <span className="text-gold font-mono text-lg">{currentRoom.code}</span></p>
          </motion.div>

          <div className="glass-panel gold-border p-6 mb-6">
            <h2 className="font-cinzel font-bold text-gold text-lg mb-4">
              {GAMES.find(g => g.id === currentRoom.game)?.emoji} {GAMES.find(g => g.id === currentRoom.game)?.name}
              <span className="text-white/40 text-sm ml-3 font-normal">{currentRoom.players.length}/{currentRoom.maxPlayers} players</span>
            </h2>

            <div className="space-y-3 mb-6">
              {currentRoom.players.map((p: any, i: number) => (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl ${p.id === user?.id ? 'bg-gold/10 border border-gold/30' : 'bg-black/20'}`}>
                  <div className="relative">
                    <img src={p.avatar} className="w-10 h-10 rounded-full" alt="" />
                    {p.isBot && <span className="absolute -bottom-1 -right-1 text-xs bg-blue-500 text-white px-1 rounded-full">AI</span>}
                    {p.connected && !p.isBot && <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-felt-darker" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-sm">{p.name} {p.id === user?.id && '(You)'}</div>
                    <div className="text-white/40 text-xs">{p.isBot ? `${p.botDifficulty} Bot` : `${p.elo} ELO`}</div>
                  </div>
                  {!p.isBot && (
                    <div className={`flex items-center gap-2 ${(p.ready || (p.id === user?.id && ready)) ? 'text-green-400' : 'text-white/30'}`}>
                      {(p.ready || (p.id === user?.id && ready)) ? <><Check className="w-4 h-4" /> Ready</> : <><Clock className="w-4 h-4" /> Waiting</>}
                    </div>
                  )}
                  {p.id === currentRoom.hostId && <span className="text-xs text-gold">Host</span>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={toggleReady} className={`${ready ? 'btn-danger' : 'btn-gold'} text-sm !py-2.5 !px-6`}>
                {ready ? 'Not Ready' : 'Ready ✓'}
              </button>
              {isHost ? (
                <button onClick={handleStartGame} disabled={!allReady} className="btn-gold text-sm !py-2.5 !px-6 flex items-center gap-2">
                  <Play className="w-4 h-4" /> Start Game
                </button>
              ) : (
                <span className="text-white/40 text-sm flex items-center px-4 bg-black/20 rounded-xl border border-white/10">
                  <Clock className="w-4 h-4 mr-2" /> Waiting for host to start...
                </span>
              )}
              <button onClick={handleLeaveRoom} className="btn-ghost text-sm !py-2.5 !px-6">Leave Room</button>
            </div>

            {isHost && !allReady && <p className="text-white/30 text-xs text-center mt-4">Waiting for all players to ready up...</p>}
          </div>

          <p className="text-center text-white/30 text-sm">Share the room code <span className="text-gold font-mono">{currentRoom.code}</span> with friends</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 px-4 pb-10">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-cinzel text-3xl font-bold text-white">🎮 Game Lobby</h1>
                <p className="text-white/40 mt-1">Find a room or create your own table</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="glass-panel px-4 py-2 text-sm">
                  <span className="text-yellow-400">👑 {user?.chips ?? 0}</span>
                </div>
                {dailyRewardStatus?.canClaim !== false && (
                  <button onClick={handleClaimDailyReward} className="btn-gold !py-2 !px-4 text-sm flex items-center gap-1.5">
                    <Gift className="w-4 h-4" /> Daily Reward
                  </button>
                )}
              </div>
            </div>
          </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Quick Play */}
          <div className="glass-panel gold-border p-5">
            <h3 className="font-cinzel font-bold text-gold mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Quick Play
            </h3>
            <div className="space-y-2">
              {GAMES.map(g => (
                <button key={g.id} onClick={() => handleQuickPlay(g.id)} disabled={joiningQuickPlay === g.id}
                  className="w-full flex items-center gap-2 py-2.5 px-3 bg-black/20 hover:bg-black/40 rounded-xl transition-all text-sm text-white/80 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                  <span>{g.emoji}</span> {g.name}
                  <span className="ml-auto text-gold text-xs flex items-center gap-1">
                    {joiningQuickPlay === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Zap className="w-3 h-3" /> Play →</>}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Create Room */}
          <div className="glass-panel gold-border p-5">
            <h3 className="font-cinzel font-bold text-gold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Room
            </h3>
            <div className="space-y-3">
              <select value={selectedGame} onChange={e => setSelectedGame(e.target.value)} className="input-field text-sm py-2">
                {GAMES.map(g => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
              </select>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="input-field text-sm py-2">
                <option value="easy">🟢 Easy Bots</option>
                <option value="medium">🟡 Medium Bots</option>
                <option value="hard">🔴 Hard Bots</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                {isPrivate ? <><Lock className="w-3.5 h-3.5" /> Private room</> : <><Unlock className="w-3.5 h-3.5" /> Public room</>}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-white/70 text-xs">Buy-in:</span>
                <input type="range" min={0} max={500} step={10} value={buyIn}
                  onChange={e => setBuyIn(Number(e.target.value))}
                  className="flex-1 accent-yellow-500" />
                <span className="text-gold text-xs font-bold min-w-[40px] text-right">👑 {buyIn}</span>
              </div>
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input type="checkbox" checked={isRanked} onChange={e => setIsRanked(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
                <Crown className="w-3.5 h-3.5" /> Ranked match (affects ELO)
              </label>
              <button onClick={handleCreate} disabled={creatingRoom} className="btn-gold w-full text-sm !py-2.5 flex items-center justify-center gap-2">
                {creatingRoom ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Table'}
              </button>
            </div>
          </div>

          {/* Join by Code */}
          <div className="glass-panel gold-border p-5">
            <h3 className="font-cinzel font-bold text-gold mb-3 flex items-center gap-2">
              <Hash className="w-4 h-4" /> Join by Code
            </h3>
            <div className="space-y-3">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter room code..." maxLength={6}
                className="input-field text-center text-xl font-bold tracking-widest uppercase"
                onKeyDown={e => e.key === 'Enter' && handleJoinCode()} />
              <button onClick={handleJoinCode} disabled={!joinCode.trim() || joiningRoom} className="btn-gold w-full text-sm !py-2.5 flex items-center justify-center gap-2">
                {joiningRoom ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</> : 'Join Room'}
              </button>
              <p className="text-white/30 text-xs text-center">Get the code from your friend</p>
            </div>
          </div>
        </div>

        {/* Public Rooms */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-cinzel font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" /> Public Rooms
              <span className="text-gold text-sm ml-1">({filtered.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-white/40" />
              <select value={filterGame} onChange={e => setFilterGame(e.target.value)} className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-white text-sm outline-none">
                <option value="all">All Games</option>
                {GAMES.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="glass-panel p-12 text-center">
              <div className="text-5xl mb-4">🃏</div>
              <p className="text-white/40">No public rooms right now.</p>
              <p className="text-white/25 text-sm mt-1">Create one or use Quick Play!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((room, i) => (
                <motion.div key={room.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }} className="glass-panel p-4 hover:border-gold/30 transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-cinzel font-bold text-white text-sm">
                        {GAMES.find(g => g.id === room.game)?.emoji} {GAMES.find(g => g.id === room.game)?.name}
                      </div>
                      <div className="text-white/40 text-xs mt-0.5">Code: <span className="text-gold font-mono">{room.code}</span></div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      room.difficulty === 'hard' ? 'border-red-500/40 text-red-400' :
                      room.difficulty === 'medium' ? 'border-yellow-500/40 text-yellow-400' :
                      'border-green-500/40 text-green-400'}`}>{room.difficulty}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {room.players?.map((p: any, j: number) => (
                        <div key={j} title={p.name}
                          className={`w-7 h-7 rounded-full overflow-hidden border-2 ${p.isBot ? 'border-blue-400/50' : p.connected ? 'border-green-400/50' : 'border-red-400/50'}`}>
                          <img src={p.avatar} className="w-full h-full" alt="" />
                        </div>
                      ))}
                      <span className="text-white/40 text-xs">{room.players?.length}/{room.maxPlayers}</span>
                    </div>
                    <button onClick={() => handleJoinRoom(room.id)} disabled={joiningRoom} className="btn-gold !py-1.5 !px-4 text-xs disabled:opacity-50">Join</button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
