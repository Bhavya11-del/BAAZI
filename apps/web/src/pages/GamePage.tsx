import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocketStore } from '../stores/socketStore';
import { useGameStore } from '../stores/gameStore';
import PlayingCard from '../components/PlayingCard';
import toast from 'react-hot-toast';
import { MessageSquare, X, Send, RotateCcw, LogOut, Eye, Home, RefreshCw, AlertCircle } from 'lucide-react';

const EMOTES = ['👍', '😄', '🎉', '😮', '👏', '🤔', '😎', '🃏'];
const SUIT_SYMBOLS: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS: Record<string, string> = { spades: 'text-gray-900', hearts: 'text-red-600', diamonds: 'text-red-600', clubs: 'text-gray-900' };
const RANK_NAMES: Record<string, string> = {
  trail: '🎯 Trail (Three of a Kind)', pureSequence: '🌟 Pure Sequence', sequence: '📈 Sequence',
  color: '🎨 Color (Flush)', pair: '👥 Pair', highCard: '📊 High Card',
};

export default function GamePage() {
  const { gameType } = useParams<{ gameType: string }>();
  const navigate = useNavigate();
  const { user, initialized, loginAsGuest } = useAuthStore();
  const { socket, connect, connected, connectError } = useSocketStore();
  const { gameState, room, roomId, setGameState, setRoom, setRoomId, addChatMessage, chatMessages, clearGame } = useGameStore();

  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [bidValue, setBidValue] = useState(1);
  const [localRoomId, setLocalRoomId] = useState<string | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [turnRemaining, setTurnRemaining] = useState<number | null>(null);
  const [reconnectAttempted, setReconnectAttempted] = useState(false);
  const [matchmakingTimeout, setMatchmakingTimeout] = useState(false);
  const [matchmakingRetries, setMatchmakingRetries] = useState(0);
  const [findingStatus, setFindingStatus] = useState<'connecting' | 'matchmaking' | 'timeout' | 'error' | 'joined'>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const quickPlayEmitted = useRef(false);
  const matchmakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const turnTimerRef = useRef<any>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // Reconnection: check if we were in a game
  useEffect(() => {
    const savedRoomId = localStorage.getItem('cardkings_lastRoom');
    const savedGameType = localStorage.getItem('cardkings_lastGame');
    if (savedRoomId && savedGameType && !reconnectAttempted) {
      setReconnectAttempted(true);
      setLocalRoomId(savedRoomId);
    }
  }, []);

  // Init
  useEffect(() => {
    if (!initialized) return; // Wait for auth store init to finish
    if (!user) { loginAsGuest(); return; }
    if (!socket) { connect(user.token); return; }
    if (!connected) {
      setFindingStatus('connecting');
      return;
    }

    // Try reconnection first
    const savedRoomId = localStorage.getItem('cardkings_lastRoom');
    if (savedRoomId && !roomId) {
      setFindingStatus('connecting');
      socket.emit('game:getState', { roomId: savedRoomId });
    }

    // If no room at all, quick-join via lobby (only once)
    if (!roomId && !savedRoomId && !quickPlayEmitted.current) {
      quickPlayEmitted.current = true;
      setFindingStatus('matchmaking');
      socket.emit('lobby:quickPlay', { game: gameType });
    }

    // If we already have a roomId (from lobby navigation), request current state
    if (roomId && !gameState) {
      socket.emit('game:getState', { roomId });
    }

    const onRoomJoined = ({ room: r }: any) => {
      setRoom(r); setRoomId(r.id); setLocalRoomId(r.id);
      localStorage.setItem('cardkings_lastRoom', r.id);
      localStorage.setItem('cardkings_lastGame', gameType || '');
      setIsSpectator(false);
      setFindingStatus('joined');
      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }
      setMatchmakingTimeout(false);
    };

    const onRoomReconnected = ({ room: r, gameState: gs }: any) => {
      setRoom(r); setRoomId(r.id); setLocalRoomId(r.id);
      if (gs) setGameState(gs);
      localStorage.setItem('cardkings_lastRoom', r.id);
      toast.success('Reconnected to game!');
      setFindingStatus('joined');
      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }
      setMatchmakingTimeout(false);
    };

    const onRoomUpdated = ({ room: r }: any) => setRoom(r);
    const onGameStarted = () => toast('🎮 Game started!', { icon: '🃏' });

    const onGameState = (state: any) => {
      setGameState(state);
      setIsSpectator(!!state.isSpectator);
      if (state.phase === 'RESULT' || state.phase === 'GAME_OVER' || state.phase === 'SCORING') {
        setShowResult(true);
      } else {
        setShowResult(false);
      }
      if (state.turnTimer) {
        setTurnRemaining(state.turnTimer.remaining);
      } else {
        setTurnRemaining(null);
      }
    };

    const onTurnTimer = ({ userId: tid, duration, startedAt }: any) => {
      if (tid !== user?.id) return;
      const elapsed = Date.now() - startedAt;
      setTurnRemaining(Math.max(0, duration - elapsed));
    };

    const onTimeout = ({ userId: tid }: any) => {
      if (tid === user?.id) toast.error('Time\'s up! Action taken.');
      setTurnRemaining(null);
    };

    const onRoundEnd = ({ state }: any) => { setGameState(state); setShowResult(true); };
    const onFinished = ({ state }: any) => {
      setGameState(state); setShowResult(true);
      localStorage.removeItem('cardkings_lastRoom');
      localStorage.removeItem('cardkings_lastGame');
    };

    const onChatMessage = (msg: any) => addChatMessage(msg);
    const onChatEmote = (data: any) => {
      toast(`${data.name}: ${data.emote}`, { duration: 2000, icon: undefined });
    };
    const onError = ({ message }: any) => {
      console.log('[CARD-PLAY] Server error:', message);
      toast.error(message);
      setLastError(message);
      setTimeout(() => setLastError(null), 5000);
      if (message?.toLowerCase().includes('room not found') || message?.toLowerCase().includes('no rooms')) {
        setFindingStatus('error');
      }
    };

    socket.on('room:joined', onRoomJoined);
    socket.on('room:reconnected', onRoomReconnected);
    socket.on('room:updated', onRoomUpdated);
    socket.on('game:started', onGameStarted);
    socket.on('game:state', onGameState);
    socket.on('game:turnTimer', onTurnTimer);
    socket.on('game:timeout', onTimeout);
    socket.on('game:roundEnd', onRoundEnd);
    socket.on('game:finished', onFinished);
    socket.on('chat:message', onChatMessage);
    socket.on('chat:emote', onChatEmote);
    socket.on('error', onError);

    // Set 10-second matchmaking timeout
    if (findingStatus === 'matchmaking' && !matchmakingTimerRef.current) {
      matchmakingTimerRef.current = setTimeout(() => {
        setMatchmakingTimeout(true);
        setFindingStatus('timeout');
        toast.error('Matchmaking is taking longer than expected. You can retry or cancel.');
      }, 10000);
    }

    return () => {
      socket.off('room:joined', onRoomJoined);
      socket.off('room:reconnected', onRoomReconnected);
      socket.off('room:updated', onRoomUpdated);
      socket.off('game:started', onGameStarted);
      socket.off('game:state', onGameState);
      socket.off('game:turnTimer', onTurnTimer);
      socket.off('game:timeout', onTimeout);
      socket.off('game:roundEnd', onRoundEnd);
      socket.off('game:finished', onFinished);
      socket.off('chat:message', onChatMessage);
      socket.off('chat:emote', onChatEmote);
      socket.off('error', onError);
      if (matchmakingTimerRef.current) {
        clearTimeout(matchmakingTimerRef.current);
        matchmakingTimerRef.current = null;
      }
    };
  }, [user, initialized, socket, connected, gameType, findingStatus]);

  // Live turn timer countdown
  useEffect(() => {
    if (turnRemaining === null || turnRemaining <= 0) return;
    const interval = setInterval(() => {
      setTurnRemaining(prev => Math.max(0, (prev || 0) - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [turnRemaining !== null]);

  const rid = localRoomId || roomId;
  const myPlayer = gameState?.players?.find((p: any) => p.id === user?.id);
  const isMyTurn = (() => {
    if (!gameState || !user || isSpectator) return false;
    if (gameType === 'call-break' && gameState.phase === 'BIDDING')
      return gameState.players[gameState.biddingPlayerIndex]?.id === user.id;
    return gameState.players[gameState.currentPlayerIndex]?.id === user.id;
  })();

  const sendAction = (action: any) => {
    if (!rid) { console.log('[CARD-PLAY] sendAction BLOCKED: no rid'); return; }
    if (isSpectator) { console.log('[CARD-PLAY] sendAction BLOCKED: is spectator'); return; }
    if (!socket) { console.log('[CARD-PLAY] sendAction BLOCKED: no socket'); return; }
    if (!socket.connected) { console.log('[CARD-PLAY] sendAction BLOCKED: socket not connected'); return; }
    const payload = { roomId: rid, action: { ...action, seq: Date.now() } };
    console.log('[CARD-PLAY] EMITTING game:action', JSON.stringify(payload));
    socket.emit('game:action', payload);
  };

  const sendChat = () => {
    if (!chatInput.trim() || !rid) return;
    socket?.emit('chat:message', { roomId: rid, message: chatInput });
    setChatInput('');
  };

  const sendEmote = (emote: string) => {
    if (!rid) return;
    socket?.emit('chat:emote', { roomId: rid, emote });
    setShowEmotes(false);
  };

  const handleLeave = () => {
    if (rid) socket?.emit('game:leave', { roomId: rid });
    clearGame();
    localStorage.removeItem('cardkings_lastRoom');
    localStorage.removeItem('cardkings_lastGame');
    navigate('/lobby');
  };

  const handleNextRound = () => {
    if (!rid) return;
    socket?.emit('game:nextRound', { roomId: rid });
    setShowResult(false);
  };

  const tpFold = () => sendAction({ type: 'fold' });
  const tpCall = () => sendAction({ type: 'call' });
  const tpRaise = (amount: number) => sendAction({ type: 'raise', amount });
  const tpShow = () => sendAction({ type: 'show' });
  const tpSeeCards = () => sendAction({ type: 'seeCards' });
  const cbBid = (bid: number) => sendAction({ type: 'bid', bid });
  const cbPlayCard = (card: any) => sendAction({ type: 'playCard', card });
  const mPlayCard = (card: any) => sendAction({ type: 'playCard', card });

  if (!gameState && !room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">

          {findingStatus === 'connecting' && !connectError && (
            <>
              <div className="text-6xl mb-4 animate-float">🃏</div>
              <div className="font-cinzel text-xl text-gold mb-2">Connecting...</div>
              <div className="thinking-dots"><span/><span/><span/></div>
              <p className="text-white/30 text-sm mt-4">Establishing secure connection</p>
            </>
          )}

          {findingStatus === 'connecting' && connectError && (
            <>
              <div className="text-6xl mb-4">🔌</div>
              <div className="font-cinzel text-xl text-gold mb-2">Connection issue</div>
              <p className="text-white/50 text-sm mb-6">
                Could not connect to game server. Please check that the server is running.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    connect(user?.token);
                  }}
                  className="btn-gold text-sm !px-6 !py-2.5 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Reconnect
                </button>
                <button onClick={() => navigate('/lobby')} className="btn-ghost text-sm !px-6 !py-2.5">
                  Back to Lobby
                </button>
              </div>
            </>
          )}

          {findingStatus === 'matchmaking' && !matchmakingTimeout && (
            <>
              <div className="text-6xl mb-4 animate-float">🃏</div>
              <div className="font-cinzel text-xl text-gold mb-2">Finding a table...</div>
              <div className="thinking-dots"><span/><span/><span/></div>
              <p className="text-white/30 text-sm mt-4">Searching for available rooms</p>
              <button
                onClick={() => {
                  if (matchmakingTimerRef.current) {
                    clearTimeout(matchmakingTimerRef.current);
                    matchmakingTimerRef.current = null;
                  }
                  quickPlayEmitted.current = false;
                  navigate('/lobby');
                }}
                className="btn-ghost text-sm mt-6 !px-6 !py-2"
              >
                Cancel
              </button>
            </>
          )}

          {findingStatus === 'timeout' && (
            <>
              <div className="text-6xl mb-4">⏱️</div>
              <div className="font-cinzel text-xl text-gold mb-2">Taking longer than usual</div>
              <p className="text-white/50 text-sm mb-6">
                No rooms found yet. We can retry or create a new room for you.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    setMatchmakingTimeout(false);
                    setMatchmakingRetries(prev => prev + 1);
                    setFindingStatus('matchmaking');
                    quickPlayEmitted.current = false;
                    if (socket) {
                      quickPlayEmitted.current = true;
                      setFindingStatus('matchmaking');
                      socket.emit('lobby:quickPlay', { game: gameType });
                    }
                  }}
                  className="btn-gold text-sm !px-6 !py-2.5 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Retry
                </button>
                <button
                  onClick={() => {
                    quickPlayEmitted.current = false;
                    navigate('/lobby');
                  }}
                  className="btn-ghost text-sm !px-6 !py-2.5 flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" /> Back to Lobby
                </button>
              </div>
            </>
          )}

          {findingStatus === 'error' && (
            <>
              <div className="text-6xl mb-4">⚠️</div>
              <div className="font-cinzel text-xl text-gold mb-2">Could not join game</div>
              <p className="text-white/50 text-sm mb-6">
                An error occurred while finding a table. Please try again.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    setFindingStatus('matchmaking');
                    setMatchmakingTimeout(false);
                    quickPlayEmitted.current = false;
                    if (socket) {
                      quickPlayEmitted.current = true;
                      socket.emit('lobby:quickPlay', { game: gameType });
                    }
                    setMatchmakingRetries(prev => prev + 1);
                  }}
                  className="btn-gold text-sm !px-6 !py-2.5 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Try Again
                </button>
                <button onClick={() => navigate('/lobby')} className="btn-ghost text-sm !px-6 !py-2.5">
                  Back to Lobby
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  const players = gameState?.players || room?.players || [];

  return (
    <div className="min-h-screen pt-16 flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 felt-table" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.4)_100%)]" />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 border-b border-gold/10 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="font-cinzel text-gold font-bold text-sm">
            {{ 'teen-patti': '🃏 Teen Patti', 'call-break': '♠️ Call Break', 'mendicot': '🔟 Mendicot' }[gameType!]}
          </div>
          {rid && <div className="text-white/30 text-xs font-mono">#{rid.slice(0, 8)}</div>}
          {gameState?.phase && (
            <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full border border-gold/30">
              {gameState.phase}
            </span>
          )}
          {isSpectator && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">Spectator</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Turn timer */}
          {isMyTurn && turnRemaining !== null && turnRemaining > 0 && (
            <div className={`text-sm font-bold ${turnRemaining < 10000 ? 'text-red-400' : 'text-gold'}`}>
              {Math.ceil(turnRemaining / 1000)}s
            </div>
          )}
          <button onClick={() => setShowChat(s => !s)} className="btn-ghost !px-3 !py-1.5 text-sm relative">
            <MessageSquare className="w-4 h-4" />
            {chatMessages.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-gold rounded-full" />}
          </button>
          <button onClick={handleLeave} className="btn-danger !px-3 !py-1.5 text-sm">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Game Table */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between p-4 max-w-5xl mx-auto w-full">
        {/* Opponents (top) */}
        <div className="flex justify-center gap-4 w-full flex-wrap">
          {players.filter((p: any) => p.id !== user?.id).slice(0, 3).map((p: any, i: number) => (
            <PlayerSlot key={p.id} player={p} gameState={gameState} gameType={gameType!} position="top" index={i} />
          ))}
        </div>

        {/* Center */}
        <div className="flex-1 flex items-center justify-center w-full my-4">
          <CenterArea gameState={gameState} gameType={gameType!} />
        </div>

        {/* My Hand */}
        {myPlayer && !isSpectator && (
          <div className="w-full">
            <MyHand
              player={myPlayer} gameState={gameState} gameType={gameType!}
              isMyTurn={isMyTurn}
              onTeenPattiAction={{ fold: tpFold, call: tpCall, raise: tpRaise, show: tpShow, see: tpSeeCards }}
              onCBBid={cbBid} onCBPlayCard={cbPlayCard} onMPlayCard={mPlayCard}
              bidValue={bidValue} setBidValue={setBidValue}
              lastError={lastError}
            />
          </div>
        )}

        {/* Spectator message */}
        {isSpectator && (
          <div className="text-center text-white/40 text-sm glass-panel px-6 py-3">
            <Eye className="w-4 h-4 inline mr-2" /> You are spectating this game
          </div>
        )}
      </div>

      {/* Result Modal */}
      <AnimatePresence>
        {showResult && gameState && (
          <ResultModal gameState={gameState} gameType={gameType!} user={user} onNext={handleNextRound} onLeave={handleLeave} />
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}
            className="fixed right-0 top-16 bottom-0 w-72 z-50 glass-dark border-l border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <span className="font-cinzel text-gold text-sm font-bold">Chat</span>
              <div className="flex gap-2">
                <button onClick={() => setShowEmotes(s => !s)} className="text-xl hover:scale-110 transition-transform">😊</button>
                <button onClick={() => setShowChat(false)}><X className="w-4 h-4 text-white/50" /></button>
              </div>
            </div>
            {showEmotes && (
              <div className="p-2 border-b border-white/10 flex flex-wrap gap-2">
                {EMOTES.map(e => (
                  <button key={e} onClick={() => sendEmote(e)} className="text-2xl hover:scale-125 transition-transform">{e}</button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.map((msg: any) => (
                <div key={msg.id} className={`flex gap-2 ${msg.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                  <img src={msg.avatar} className="w-6 h-6 rounded-full flex-shrink-0" alt="" />
                  <div className={`max-w-[80%] ${msg.userId === user?.id ? 'items-end' : 'items-start'} flex flex-col`}>
                    <span className="text-white/40 text-xs">{msg.name}</span>
                    <div className={`px-3 py-1.5 rounded-xl text-sm ${msg.userId === user?.id ? 'bg-gold/20 text-white' : 'bg-white/10 text-white/80'}`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-white/10 flex gap-2">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Say something..." className="input-field text-sm !py-2 flex-1" />
              <button onClick={sendChat} className="btn-gold !px-3 !py-2">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Player Slot Component ─────────────────────────────────────
function PlayerSlot({ player, gameState, gameType, position, index }: any) {
  const isCurrentTurn = (() => {
    if (!gameState) return false;
    if (gameType === 'call-break' && gameState.phase === 'BIDDING')
      return gameState.players[gameState.biddingPlayerIndex]?.id === player.id;
    return gameState.players?.[gameState.currentPlayerIndex]?.id === player.id;
  })();

  const cards = player.cards || [];
  const cardCount = cards.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
      className={`flex flex-col items-center gap-2 ${isCurrentTurn ? 'relative' : ''}`}
    >
      {isCurrentTurn && (
        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
          className="absolute -top-1 -right-1 w-3 h-3 bg-gold rounded-full z-10" />
      )}
      <div className="flex gap-1">
        {Array.from({ length: Math.min(cardCount, 5) }).map((_, i) => (
          <div key={i} className="w-8 h-11 rounded-md card-back border border-gold/20"
            style={{ transform: `rotate(${(i - 2) * 3}deg)` }} />
        ))}
        {cardCount > 5 && <div className="text-white/40 text-xs self-end">+{cardCount - 5}</div>}
      </div>

      <div className={`glass-panel px-3 py-2 flex items-center gap-2 ${isCurrentTurn ? 'border-gold/60 shadow-gold' : ''}`}>
        <div className="relative">
          <img src={player.avatar} className="w-8 h-8 rounded-full" alt="" />
          {player.isBot && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border border-felt-darker text-[6px] flex items-center justify-center text-white">AI</div>}
          {!player.connected && !player.isBot && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border border-felt-darker" />}
        </div>
        <div>
          <div className="text-white text-xs font-semibold leading-none">{player.name}</div>
          {gameType === 'teen-patti' && (
            <div className="text-xs text-white/40 mt-0.5">
              {player.status === 'packed' ? '❌ Packed' : player.status === 'blind' ? '🙈 Blind' : '👁 Seen'}
              {player.chips !== undefined && <span className="ml-2 text-gold">₹{player.chips}</span>}
            </div>
          )}
          {gameType === 'call-break' && player.bid > 0 && (
            <div className="text-xs text-gold mt-0.5">Bid: {player.bid} | Won: {player.tricksWon}</div>
          )}
          {gameType === 'mendicot' && (
            <div className="text-xs text-gold mt-0.5">Team {(player.teamId ?? 0) + 1}</div>
          )}
          {isCurrentTurn && <div className="thinking-dots mt-1"><span/><span/><span/></div>}
        </div>
      </div>
    </motion.div>
  );
}

// ── Center Area Component ──────────────────────────────────────
function CenterArea({ gameState, gameType }: any) {
  if (!gameState) return (
    <div className="glass-panel p-8 text-center">
      <div className="text-4xl animate-float">🃏</div>
      <div className="text-white/40 text-sm mt-2">Waiting for players...</div>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
      {gameType === 'teen-patti' && (
        <div className="glass-panel p-6 text-center w-full">
          <div className="text-white/50 text-xs mb-1">POT</div>
          <div className="font-cinzel text-3xl font-bold text-gold">₹{gameState.pot || 0}</div>
          <div className="text-white/40 text-xs mt-1">Current Stake: ₹{gameState.currentStake || 0}</div>
          {gameState.lastAction && (
            <motion.div key={gameState.lastAction} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-white/60 text-xs bg-black/20 rounded-lg px-3 py-1.5 inline-block">
              {gameState.lastAction}
            </motion.div>
          )}
        </div>
      )}

      {(gameType === 'call-break' || gameType === 'mendicot') && (
        <div className="w-full">
          <div className="glass-panel p-4 mb-3">
            <div className="text-white/40 text-xs text-center mb-3">
              {gameState.phase === 'TRICK_COMPLETE' ? 'Trick Complete' : 'Current Trick'}
            </div>
            <AnimatePresence mode="popLayout">
              {gameState.currentTrick?.cards?.length > 0 ? (
                <motion.div
                  key="trick-cards"
                  className="flex justify-center gap-3 min-h-[80px] items-center flex-wrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.35 } }}
                >
                  {(gameState.currentTrick?.cards || []).map((entry: any, i: number) => {
                    const isWinner = gameState.phase === 'TRICK_COMPLETE' && gameState.currentTrick?.winnerId === entry.playerId;
                    return (
                      <motion.div
                        key={entry.playerId + entry.card.id}
                        layout
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="flex flex-col items-center gap-1"
                      >
                        <div className="relative">
                          <PlayingCard
                            suit={entry.card.suit} rank={entry.card.rank}
                            size="sm" dealDelay={i * 0.1}
                            className={isWinner ? 'ring-2 ring-gold ring-offset-1 ring-offset-felt-darker' : ''}
                          />
                          {isWinner && (
                            <div className="absolute -top-2 -right-2 w-5 h-5 bg-gold rounded-full flex items-center justify-center text-[10px] text-felt-darker font-bold shadow-gold">
                              👑
                            </div>
                          )}
                        </div>
                        <div className={`text-xs truncate max-w-[50px] ${isWinner ? 'text-gold font-bold' : 'text-white/40'}`}>
                          {gameState.players.find((p: any) => p.id === entry.playerId)?.name?.split(' ')[0]}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="empty-trick"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center min-h-[80px] items-center"
                >
                  <div className="text-white/20 text-sm">Play a card to start</div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Winner notification — always BELOW the cards, never overlaid */}
            {gameState.phase === 'TRICK_COMPLETE' && gameState.currentTrick?.winnerId && (
              <motion.div
                key="winner-msg"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 text-center"
              >
                <span className="text-gold font-bold text-sm">
                  🏆 {gameState.players.find((p: any) => p.id === gameState.currentTrick.winnerId)?.name?.split(' ')[0]} wins trick!
                </span>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {gameType === 'call-break' && (
              <>
                <div className="glass-panel p-3 text-center">
                  <div className="text-white/40 text-xs">Round</div>
                  <div className="font-cinzel font-bold text-gold">{gameState.currentRound}/{gameState.totalRounds}</div>
                </div>
                <div className="glass-panel p-3 text-center">
                  <div className="text-white/40 text-xs">Trump</div>
                  <div className="font-bold text-2xl">♠</div>
                </div>
              </>
            )}
            {gameType === 'mendicot' && (
              <>
                <div className="glass-panel p-3 text-center">
                  <div className="text-white/40 text-xs mb-1">Team 1 Tens</div>
                  <div className="text-gold font-bold text-xl">{gameState.teams?.[0]?.tensWon || 0}</div>
                </div>
                <div className="glass-panel p-3 text-center">
                  <div className="text-white/40 text-xs mb-1">Team 2 Tens</div>
                  <div className="text-gold font-bold text-xl">{gameState.teams?.[1]?.tensWon || 0}</div>
                </div>
              </>
            )}
          </div>
          {gameState.trumpSuit && gameState.trumpRevealed && (
            <div className="glass-panel p-2 mt-2 text-center text-sm">
              <span className="text-white/50">Trump: </span>
              <span className={SUIT_COLORS[gameState.trumpSuit] + ' font-bold'}>
                {SUIT_SYMBOLS[gameState.trumpSuit]} {gameState.trumpSuit?.toUpperCase()}
              </span>
            </div>
          )}
          {gameState.lastAction && (
            <motion.div key={gameState.lastAction} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-2 text-white/50 text-xs text-center">
              {gameState.lastAction}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

// ── My Hand + Controls ──────────────────────────────────────────
function MyHand({ player, gameState, gameType, isMyTurn, onTeenPattiAction, onCBBid, onCBPlayCard, onMPlayCard, bidValue, setBidValue, lastError }: any) {
  const [seeCards, setSeeCards] = useState(false);
  const cards = player.cards || [];
  const isSeen = player.status === 'seen';
  const legalCardIds: string[] = gameState?.legalCardIds || [];

  const handleSee = () => { setSeeCards(true); onTeenPattiAction.see(); };

  const handleCardClick = (card: any) => {
    console.log('[CARD-PLAY] handleCardClick called', { cardId: card.id, rank: card.rank, suit: card.suit, isMyTurn, gameType, phase: gameState?.phase });

    if (!isMyTurn) {
      console.log('[CARD-PLAY] BLOCKED: not my turn');
      return;
    }
    if (gameType !== 'call-break' && gameType !== 'mendicot') {
      console.log('[CARD-PLAY] BLOCKED: wrong game type');
      return;
    }
    if (gameState?.phase === 'BIDDING' || gameState?.phase === 'TRICK_COMPLETE') {
      console.log('[CARD-PLAY] BLOCKED: wrong phase');
      return;
    }

    // Single-click-to-play
    console.log('[CARD-PLAY] PLAYING card:', card.id, card.rank, 'of', card.suit);
    const payload = { type: 'playCard', card };
    console.log('[CARD-PLAY] Sending action payload:', JSON.stringify(payload));
    if (gameType === 'call-break') {
      onCBPlayCard(card);
    } else {
      onMPlayCard(card);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className={`glass-panel px-4 py-2 flex items-center gap-3 ${isMyTurn ? 'border-gold/60 shadow-gold animate-pulse-gold' : ''}`}>
        <img src={player.avatar} className="w-8 h-8 rounded-full" alt="" />
        <div>
          <div className="text-white font-semibold text-sm">You {isMyTurn && '• Your Turn!'}</div>
          {gameType === 'teen-patti' && (
            <div className="text-xs text-gold">₹{player.chips} chips · {player.status === 'blind' ? '🙈 Blind' : '👁 Seen'}</div>
          )}
          {gameType === 'call-break' && player.bid > 0 && (
            <div className="text-xs text-gold">Bid: {player.bid} | Won: {player.tricksWon} | Score: {player.totalScore?.toFixed(1)}</div>
          )}
          {gameType === 'mendicot' && (
            <div className="text-xs text-gold">Team {(player.teamId ?? 0) + 1} · {player.tricksWon} tricks</div>
          )}
        </div>
      </div>

      {/* Error display */}
      {lastError && (
        <div className="text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg border border-red-500/40 animate-pulse">
          <AlertCircle className="w-4 h-4 inline mr-1" /> {lastError}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-1 md:gap-2 max-w-2xl">
        {cards.map((card: any, i: number) => {
          const isHidden = card.id === 'hidden' || (gameType === 'teen-patti' && !seeCards && player.status === 'blind');
          const canPlay = isMyTurn && (gameType === 'call-break' || gameType === 'mendicot') && gameState?.phase !== 'BIDDING' && gameState?.phase !== 'TRICK_COMPLETE';
          const isLegal = legalCardIds.length === 0 || legalCardIds.includes(card.id);

          return (
            <PlayingCard
              key={card.id + i}
              suit={isHidden ? undefined : card.suit}
              rank={isHidden ? undefined : card.rank}
              faceDown={isHidden}
              dealDelay={i * 0.06}
              size="md"
              disabled={!canPlay || (!isLegal && legalCardIds.length > 0)}
              onClick={canPlay ? () => handleCardClick(card) : undefined}
            />
          );
        })}
      </div>

      {isMyTurn && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap justify-center gap-2 mt-1">

          {gameType === 'teen-patti' && player.status !== 'packed' && (
            <>
              {!isSeen && (
                <button onClick={handleSee} className="btn-ghost text-sm !py-2 !px-4 flex items-center gap-1.5">
                  <Eye className="w-4 h-4" /> See Cards
                </button>
              )}
              <button onClick={onTeenPattiAction.fold} className="btn-danger text-sm !py-2 !px-4">❌ Pack</button>
              <button onClick={onTeenPattiAction.call} className="btn-ghost text-sm !py-2 !px-5">
                ✅ Chaal (₹{isSeen ? gameState.currentStake * 2 : gameState.currentStake})
              </button>
              <button onClick={() => onTeenPattiAction.raise(gameState.currentStake * (isSeen ? 4 : 2))} className="btn-gold text-sm !py-2 !px-4">
                📈 Raise
              </button>
              {isSeen && (
                <button onClick={onTeenPattiAction.show} className="btn-gold text-sm !py-2 !px-4">👁 Show</button>
              )}
            </>
          )}

          {gameType === 'call-break' && gameState?.phase === 'BIDDING' && (
            <div className="flex items-center gap-3 glass-panel px-5 py-3">
              <span className="text-white/70 text-sm">Your Bid:</span>
              <button onClick={() => setBidValue((v: number) => Math.max(1, v - 1))} className="w-8 h-8 bg-black/30 rounded-lg text-white hover:bg-black/50 text-lg">-</button>
              <span className="font-cinzel font-bold text-gold text-xl w-8 text-center">{bidValue}</span>
              <button onClick={() => setBidValue((v: number) => Math.min(13, v + 1))} className="w-8 h-8 bg-black/30 rounded-lg text-white hover:bg-black/50 text-lg">+</button>
              <button onClick={() => onCBBid(bidValue)} className="btn-gold text-sm !py-1.5">Confirm Bid</button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── Result Modal ─────────────────────────────────────────────
function ResultModal({ gameState, gameType, user, onNext, onLeave }: any) {
  const winner = gameState?.winner ? gameState.players?.find((p: any) => p.id === gameState.winner) : null;
  const iWon = winner?.id === user?.id;

  let title = '', subtitle = '', emoji = '';

  if (gameType === 'teen-patti') {
    title = iWon ? 'You Win! 🎉' : `${winner?.name || 'Someone'} Wins!`;
    subtitle = gameState.winnerHand ? RANK_NAMES[gameState.winnerHand] || '' : '';
    emoji = iWon ? '🏆' : '😔';
  } else if (gameType === 'call-break') {
    if (gameState.phase === 'GAME_OVER') {
      const top = [...(gameState.players || [])].sort((a: any, b: any) => b.totalScore - a.totalScore)[0];
      title = top?.id === user?.id ? 'Game Over — You Win! 🏆' : `Game Over — ${top?.name} Wins!`;
      emoji = top?.id === user?.id ? '🏆' : '📊';
    } else {
      title = 'Round Complete!';
      emoji = '📊';
    }
    subtitle = gameState.players?.map((p: any) => `${p.name}: ${p.totalScore?.toFixed(1)}`).join(' | ') || '';
  } else if (gameType === 'mendicot') {
    const w = gameState.roundWinner;
    const myTeam = gameState.players?.find((p: any) => p.id === user?.id)?.teamId;
    title = gameState.mendicot ? '🎊 MENDICOT!' : w === myTeam ? 'Your Team Wins!' : `Team ${(w ?? 0) + 1} Wins!`;
    subtitle = gameState.mendicot ? 'All 4 tens captured!' : `Team 1: ${gameState.teams?.[0]?.tensWon || 0} tens | Team 2: ${gameState.teams?.[1]?.tensWon || 0} tens`;
    emoji = gameState.mendicot ? '🎊' : w === myTeam ? '🏆' : '🎯';
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.5, y: 50 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="glass-panel gold-border p-8 text-center max-w-md w-full mx-4">
        <div className="text-7xl mb-4 animate-bounce-in">{emoji}</div>
        <h2 className="font-cinzel text-2xl font-bold text-shimmer mb-2">{title}</h2>
        {subtitle && <p className="text-white/60 text-sm mb-6">{subtitle}</p>}

        {gameType === 'call-break' && gameState.players && (
          <div className="mb-6 space-y-2">
            {[...gameState.players].sort((a: any, b: any) => b.totalScore - a.totalScore).map((p: any, i: number) => (
              <div key={p.id} className={`flex items-center justify-between px-4 py-2 rounded-xl ${p.id === user?.id ? 'bg-gold/20 border border-gold/30' : 'bg-black/20'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gold">{i + 1}.</span>
                  <img src={p.avatar} className="w-6 h-6 rounded-full" alt="" />
                  <span className="text-sm text-white">{p.name}</span>
                </div>
                <span className="text-gold font-bold">{p.totalScore?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          {gameState.phase !== 'GAME_OVER' && (
            <button onClick={onNext} className="btn-gold flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              {gameType === 'teen-patti' ? 'Next Round' : 'Continue'}
            </button>
          )}
          <button onClick={onLeave} className="btn-ghost">Leave Table</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
