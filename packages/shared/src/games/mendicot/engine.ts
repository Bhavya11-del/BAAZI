// ============================================================
// MENDICOT GAME ENGINE
// ============================================================

import { Card, Suit, RANK_ORDER, createDeck, shuffleDeck } from '../../cards/deck';

export type MendicotPhase = 'WAITING' | 'DEAL' | 'TRUMP_SELECTION' | 'TRICK_PLAY' | 'TRICK_COMPLETE' | 'SCORING' | 'GAME_OVER';

export interface MendicotPlayer {
  id: string;
  name: string;
  teamId: 0 | 1;
  cards: Card[];
  tricksWon: number;
  isBot: boolean;
  botDifficulty?: 'easy' | 'medium' | 'hard';
  avatar?: string;
}

export interface MendicotTeam {
  id: 0 | 1;
  tensWon: number;
  tricksWon: number;
  score: number;
  totalScore: number;
}

export interface MendicotTrick {
  cards: { playerId: string; card: Card }[];
  leadSuit: Suit | null;
  winnerId?: string;
}

export interface MendicotState {
  phase: MendicotPhase;
  players: MendicotPlayer[];
  teams: [MendicotTeam, MendicotTeam];
  currentTrick: MendicotTrick;
  completedTricks: MendicotTrick[];
  currentPlayerIndex: number;
  dealerIndex: number;
  trumpSuit: Suit | null;
  trumpRevealed: boolean;
  currentRound: number;
  lastAction?: string;
  roundWinner?: 0 | 1;
  mendicot?: boolean;
  /** IDs of cards the current player is legally allowed to play */
  legalCardIds?: string[];
}

const TEN_IDS = new Set(['10_spades', '10_hearts', '10_diamonds', '10_clubs']);

// ── Legal Move Computation ─────────────────────────────────────

/**
 * Returns the subset of cards the player is legally allowed to play.
 *
 * Official Mendicot (Rang) rules:
 *  1. If a suit has been led → MUST follow suit if player has any cards of that suit.
 *  2. If void in led suit → player MAY play a trump card OR discard any other suit.
 *  3. If leading (no lead suit) → any card is legal.
 */
export function getLegalMendicotCards(
  player: MendicotPlayer,
  trick: MendicotTrick,
  trumpSuit: Suit | null
): Card[] {
  const cards = player.cards;
  if (cards.length === 0) return [];

  const leadSuit = trick.leadSuit;

  // Leading the trick — any card is legal
  if (!leadSuit) return cards;

  // Must follow lead suit if possible
  const suitCards = cards.filter(c => c.suit === leadSuit);
  if (suitCards.length > 0) return suitCards;

  // Void in lead suit — may play trump OR discard any other card
  return cards;
}

// ── Init / Deal ────────────────────────────────────────────────

export function initMendicot(players: Omit<MendicotPlayer, 'cards' | 'tricksWon'>[]): MendicotState {
  return {
    phase: 'WAITING',
    players: players.map(p => ({ ...p, cards: [], tricksWon: 0 })),
    teams: [
      { id: 0, tensWon: 0, tricksWon: 0, score: 0, totalScore: 0 },
      { id: 1, tensWon: 0, tricksWon: 0, score: 0, totalScore: 0 },
    ],
    currentTrick: { cards: [], leadSuit: null },
    completedTricks: [],
    currentPlayerIndex: 0,
    dealerIndex: 0,
    trumpSuit: null,
    trumpRevealed: false,
    currentRound: 1,
    legalCardIds: [],
  };
}

export function dealMendicot(state: MendicotState): MendicotState {
  const deck = shuffleDeck(createDeck());
  const players = state.players.map((p, i) => ({
    ...p,
    cards: deck.slice(i * 13, i * 13 + 13).sort((a, b) => {
      if (a.suit === b.suit) return RANK_ORDER[b.rank] - RANK_ORDER[a.rank];
      return a.suit.localeCompare(b.suit);
    }),
    tricksWon: 0,
  }));

  const nextPlayerIndex = (state.dealerIndex + 1) % 4;
  const emptyTrick: MendicotTrick = { cards: [], leadSuit: null };

  // All cards legal for the first player (they lead)
  const legalCardIds = players[nextPlayerIndex].cards.map(c => c.id);

  return {
    ...state,
    phase: 'TRICK_PLAY',
    players,
    teams: [
      { id: 0, tensWon: 0, tricksWon: 0, score: state.teams[0].score, totalScore: state.teams[0].totalScore },
      { id: 1, tensWon: 0, tricksWon: 0, score: state.teams[1].score, totalScore: state.teams[1].totalScore },
    ],
    currentTrick: emptyTrick,
    completedTricks: [],
    trumpSuit: null,
    trumpRevealed: false,
    currentPlayerIndex: nextPlayerIndex,
    legalCardIds,
  };
}

// ── Play Card ──────────────────────────────────────────────────

export function playMendicotCard(state: MendicotState, playerId: string, card: Card): MendicotState {
  const playerIdx = state.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1 || playerIdx !== state.currentPlayerIndex) return state;

  const player = state.players[playerIdx];
  if (!player.cards.find(c => c.id === card.id)) return state;

  // ── Enforce legal move: reject illegal plays silently ────────
  const legalCards = getLegalMendicotCards(player, state.currentTrick, state.trumpSuit);
  const isLegal = legalCards.some(c => c.id === card.id);
  if (!isLegal) return state;

  let newTrumpSuit = state.trumpSuit;
  let newTrumpRevealed = state.trumpRevealed;

  // ── Trump reveal (CUT): only when no trump established yet ───
  // If player is void in lead suit and plays any card of a new suit,
  // that card's suit becomes the trump.
  const leadSuit = state.currentTrick.leadSuit;
  if (leadSuit && card.suit !== leadSuit && !state.trumpSuit) {
    const hasSuit = player.cards.some(c => c.suit === leadSuit);
    if (!hasSuit) {
      newTrumpSuit = card.suit;
      newTrumpRevealed = true;
    }
  }

  const newTrickCards = [...state.currentTrick.cards, { playerId, card }];
  const newLeadSuit = state.currentTrick.leadSuit || card.suit;

  const updatedPlayers = state.players.map((p, i) =>
    i === playerIdx ? { ...p, cards: p.cards.filter(c => c.id !== card.id) } : p
  );

  const updatedTrick: MendicotTrick = { cards: newTrickCards, leadSuit: newLeadSuit };

  // Trick complete — resolve it
  if (newTrickCards.length === 4) {
    const stateWithTrick: MendicotState = {
      ...state,
      players: updatedPlayers,
      currentTrick: updatedTrick,
      trumpSuit: newTrumpSuit,
      trumpRevealed: newTrumpRevealed,
      lastAction: `${player.name} played ${card.rank} of ${card.suit}`,
      legalCardIds: [],
    };
    return resolveMendicotTrick(stateWithTrick);
  }

  // Trick still ongoing — compute legal cards for the next player
  const nextIdx = (playerIdx + 1) % 4;
  const nextPlayer = updatedPlayers[nextIdx];
  const legalCardIds = getLegalMendicotCards(nextPlayer, updatedTrick, newTrumpSuit).map(c => c.id);

  return {
    ...state,
    players: updatedPlayers,
    currentTrick: updatedTrick,
    trumpSuit: newTrumpSuit,
    trumpRevealed: newTrumpRevealed,
    lastAction: `${player.name} played ${card.rank} of ${card.suit}`,
    currentPlayerIndex: nextIdx,
    legalCardIds,
  };
}

// ── Trick Resolution ───────────────────────────────────────────

function resolveMendicotTrick(state: MendicotState): MendicotState {
  const trick = state.currentTrick;
  const leadSuit = trick.leadSuit!;
  const trump = state.trumpSuit;

  // Find the winner
  let winnerEntry = trick.cards[0];
  for (const entry of trick.cards.slice(1)) {
    if (mendicotWinsOver(entry.card, winnerEntry.card, leadSuit, trump)) {
      winnerEntry = entry;
    }
  }

  const winnerId = winnerEntry.playerId;
  const winner = state.players.find(p => p.id === winnerId)!;
  const winnerTeam = winner.teamId;

  // Count tens captured in this trick
  const tensInTrick = trick.cards.filter(entry => TEN_IDS.has(entry.card.id)).length;

  const completedTrick = { ...trick, winnerId };

  const updatedPlayers = state.players.map(p =>
    p.id === winnerId ? { ...p, tricksWon: p.tricksWon + 1 } : p
  );

  const updatedTeams: [MendicotTeam, MendicotTeam] = [
    {
      ...state.teams[0],
      tricksWon: winnerTeam === 0 ? state.teams[0].tricksWon + 1 : state.teams[0].tricksWon,
      tensWon: winnerTeam === 0 ? state.teams[0].tensWon + tensInTrick : state.teams[0].tensWon,
    },
    {
      ...state.teams[1],
      tricksWon: winnerTeam === 1 ? state.teams[1].tricksWon + 1 : state.teams[1].tricksWon,
      tensWon: winnerTeam === 1 ? state.teams[1].tensWon + tensInTrick : state.teams[1].tensWon,
    },
  ];

  // All 13 tricks played — score the round
  const allTricksPlayed = updatedPlayers[0].cards.length === 0;
  if (allTricksPlayed) {
    return scoreMendicotRound({
      ...state,
      players: updatedPlayers,
      teams: updatedTeams,
      completedTricks: [...state.completedTricks, completedTrick],
      currentTrick: { cards: [], leadSuit: null },
      legalCardIds: [],
    });
  }

  // Trick complete — keep cards visible, show result
  const trickWinnerName = updatedPlayers.find(p => p.id === winnerId)!.name;
  const winnerIdx = state.players.findIndex(p => p.id === winnerId);

  return {
    ...state,
    phase: 'TRICK_COMPLETE',
    players: updatedPlayers,
    teams: updatedTeams,
    completedTricks: [...state.completedTricks, completedTrick],
    currentTrick: { ...trick, winnerId },
    currentPlayerIndex: winnerIdx,
    lastAction: `${trickWinnerName} wins trick`,
    legalCardIds: [],
  };
}

export function advanceMendicotTrick(state: MendicotState): MendicotState {
  const winnerId = state.currentTrick.winnerId!;
  const winnerIdx = state.players.findIndex(p => p.id === winnerId);
  const winnerPlayer = state.players[winnerIdx];
  const emptyTrick: MendicotTrick = { cards: [], leadSuit: null };
  const legalCardIds = winnerPlayer.cards.map(c => c.id);

  return {
    ...state,
    phase: 'TRICK_PLAY',
    currentTrick: emptyTrick,
    currentPlayerIndex: winnerIdx,
    legalCardIds,
  };
}

// ── Win Evaluation ─────────────────────────────────────────────

function mendicotWinsOver(challenger: Card, current: Card, leadSuit: Suit, trump: Suit | null): boolean {
  const challengerIsTrump = trump ? challenger.suit === trump : false;
  const currentIsTrump = trump ? current.suit === trump : false;

  if (challengerIsTrump && !currentIsTrump) return true;
  if (!challengerIsTrump && currentIsTrump) return false;
  // Neither or both are trump: same suit comparison
  if (challenger.suit !== current.suit) return false;
  return RANK_ORDER[challenger.rank] > RANK_ORDER[current.rank];
}

// ── Scoring ────────────────────────────────────────────────────

function scoreMendicotRound(state: MendicotState): MendicotState {
  const [t0, t1] = state.teams;
  let roundWinner: 0 | 1;
  let mendicot = false;

  if (t0.tensWon >= 3) {
    roundWinner = 0;
    mendicot = t0.tensWon === 4;
  } else if (t1.tensWon >= 3) {
    roundWinner = 1;
    mendicot = t1.tensWon === 4;
  } else {
    // 2-2 split in tens: majority tricks wins
    roundWinner = t0.tricksWon >= 7 ? 0 : 1;
  }

  const scoreGain = mendicot ? 2 : 1;
  const updatedTeams: [MendicotTeam, MendicotTeam] = [
    { ...t0, score: roundWinner === 0 ? scoreGain : 0, totalScore: t0.totalScore + (roundWinner === 0 ? scoreGain : 0) },
    { ...t1, score: roundWinner === 1 ? scoreGain : 0, totalScore: t1.totalScore + (roundWinner === 1 ? scoreGain : 0) },
  ];

  return {
    ...state,
    teams: updatedTeams,
    phase: 'SCORING',
    roundWinner,
    mendicot,
    lastAction: mendicot ? '🎉 MENDICOT! All 4 tens captured!' : `Team ${roundWinner + 1} wins the round!`,
  };
}
