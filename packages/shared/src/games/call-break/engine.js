"use strict";
// ============================================================
// CALL BREAK GAME ENGINE
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUMP_SUIT = void 0;
exports.initCallBreak = initCallBreak;
exports.dealCallBreak = dealCallBreak;
exports.placeBid = placeBid;
exports.playCard = playCard;
exports.advanceCallBreakTrick = advanceCallBreakTrick;
exports.getCallBreakWinner = getCallBreakWinner;
const deck_1 = require("../../cards/deck");
exports.TRUMP_SUIT = 'spades';
function initCallBreak(players, totalRounds = 5) {
    return {
        phase: 'WAITING',
        players: players.map(p => ({ ...p, cards: [], bid: 0, tricksWon: 0, score: 0, totalScore: 0 })),
        currentTrick: { cards: [], leadSuit: null },
        completedTricks: [],
        currentPlayerIndex: 0,
        dealerIndex: 0,
        currentRound: 1,
        totalRounds,
        biddingPlayerIndex: 0,
        legalCardIds: [],
    };
}
function dealCallBreak(state) {
    const deck = (0, deck_1.shuffleDeck)((0, deck_1.createDeck)());
    const players = state.players.map((p, i) => ({
        ...p,
        cards: deck.slice(i * 13, i * 13 + 13).sort((a, b) => {
            if (a.suit === b.suit)
                return deck_1.RANK_ORDER[b.rank] - deck_1.RANK_ORDER[a.rank];
            return a.suit.localeCompare(b.suit);
        }),
        bid: 0,
        tricksWon: 0,
        score: 0,
    }));
    return {
        ...state,
        phase: 'BIDDING',
        players,
        currentTrick: { cards: [], leadSuit: null },
        completedTricks: [],
        biddingPlayerIndex: (state.dealerIndex + 1) % 4,
        legalCardIds: [],
    };
}
function placeBid(state, playerId, bid) {
    if (bid < 1 || bid > 13)
        return state;
    const players = state.players.map(p => p.id === playerId ? { ...p, bid } : p);
    const nextBiddingIdx = (state.biddingPlayerIndex + 1) % 4;
    const allBid = players.every(p => p.bid > 0);
    return {
        ...state,
        players,
        biddingPlayerIndex: nextBiddingIdx,
        phase: allBid ? 'TRICK_PLAY' : 'BIDDING',
        currentPlayerIndex: allBid ? (state.dealerIndex + 1) % 4 : state.biddingPlayerIndex,
        lastAction: `${players.find(p => p.id === playerId)?.name} bid ${bid}`,
        legalCardIds: allBid ? players[(state.dealerIndex + 1) % 4].cards.map(c => c.id) : [],
    };
}
function playCard(state, playerId, card) {
    const playerIdx = state.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1 || playerIdx !== state.currentPlayerIndex) {
        console.log(`[CB] REJECT: wrong turn — playerIdx=${playerIdx}, currentPlayerIndex=${state.currentPlayerIndex}, playerId=${playerId}`);
        return state;
    }
    const player = state.players[playerIdx];
    const foundCard = player.cards.find(c => c.id === card.id);
    if (!foundCard) {
        console.log(`[CB] REJECT: card ${card.rank} of ${card.suit} (id=${card.id}) not in player ${player.name}'s hand`);
        return state;
    }
    // Validate: must follow suit if possible
    const leadSuit = state.currentTrick.leadSuit;
    if (leadSuit && card.suit !== leadSuit && card.suit !== exports.TRUMP_SUIT) {
        const hasSuit = player.cards.some(c => c.suit === leadSuit);
        if (hasSuit) {
            console.log(`[CB] REJECT: ${player.name} must follow ${leadSuit} but played ${card.suit}`);
            return state;
        }
    }
    console.log(`[CB] PLAY: ${player.name} played ${card.rank} of ${card.suit} (id=${card.id}) — trick slot ${state.currentTrick.cards.length + 1}/4`);
    const newTrickCards = [...state.currentTrick.cards, { playerId, card }];
    const newLeadSuit = state.currentTrick.leadSuit || card.suit;
    const updatedPlayers = state.players.map((p, i) => i === playerIdx ? { ...p, cards: p.cards.filter(c => c.id !== card.id) } : p);
    if (newTrickCards.length === 4) {
        return resolveTrick({
            ...state,
            players: updatedPlayers,
            currentTrick: { cards: newTrickCards, leadSuit: newLeadSuit },
            lastAction: `${player.name} played ${card.rank} of ${card.suit}`,
            legalCardIds: [],
        });
    }
    const nextPlayerIndex = (state.currentPlayerIndex + 1) % 4;
    const nextPlayer = updatedPlayers[nextPlayerIndex];
    const legalCardIds = nextPlayer.cards.map(c => c.id);
    return {
        ...state,
        players: updatedPlayers,
        currentTrick: { cards: newTrickCards, leadSuit: newLeadSuit },
        currentPlayerIndex: nextPlayerIndex,
        lastAction: `${player.name} played ${card.rank} of ${card.suit}`,
        legalCardIds,
    };
}
function resolveTrick(state) {
    const trick = state.currentTrick;
    const leadSuit = trick.leadSuit;
    let winnerEntry = trick.cards[0];
    for (const entry of trick.cards.slice(1)) {
        if (winsOver(entry.card, winnerEntry.card, leadSuit)) {
            winnerEntry = entry;
        }
    }
    const winnerId = winnerEntry.playerId;
    const completedTrick = { ...trick, winnerId };
    const updatedPlayers = state.players.map(p => p.id === winnerId ? { ...p, tricksWon: p.tricksWon + 1 } : p);
    const allTricksPlayed = updatedPlayers[0].cards.length === 0;
    if (allTricksPlayed) {
        return scoreRound({
            ...state,
            players: updatedPlayers,
            completedTricks: [...state.completedTricks, completedTrick],
            currentTrick: { cards: [], leadSuit: null },
        });
    }
    const winner = updatedPlayers.find(p => p.id === winnerId);
    const winnerIdx = state.players.findIndex(p => p.id === winnerId);
    return {
        ...state,
        phase: 'TRICK_COMPLETE',
        players: updatedPlayers,
        completedTricks: [...state.completedTricks, completedTrick],
        currentTrick: { ...trick, winnerId },
        currentPlayerIndex: winnerIdx,
        lastAction: `${winner.name} wins trick`,
    };
}
function advanceCallBreakTrick(state) {
    const winnerId = state.currentTrick.winnerId;
    const winnerIdx = state.players.findIndex(p => p.id === winnerId);
    const winnerPlayer = state.players[winnerIdx];
    const legalCardIds = winnerPlayer.cards.map(c => c.id);
    return {
        ...state,
        phase: 'TRICK_PLAY',
        currentTrick: { cards: [], leadSuit: null },
        currentPlayerIndex: winnerIdx,
        legalCardIds,
    };
}
function winsOver(challenger, current, leadSuit) {
    const challengerIsTrump = challenger.suit === exports.TRUMP_SUIT;
    const currentIsTrump = current.suit === exports.TRUMP_SUIT;
    if (challengerIsTrump && !currentIsTrump)
        return true;
    if (!challengerIsTrump && currentIsTrump)
        return false;
    if (challenger.suit !== current.suit)
        return false;
    return deck_1.RANK_ORDER[challenger.rank] > deck_1.RANK_ORDER[current.rank];
}
function scoreRound(state) {
    const players = state.players.map(p => {
        let roundScore;
        if (p.tricksWon >= p.bid) {
            const extra = p.tricksWon - p.bid;
            roundScore = p.bid + extra * 0.1;
        }
        else {
            roundScore = -p.bid;
        }
        return { ...p, score: roundScore, totalScore: p.totalScore + roundScore };
    });
    if (state.currentRound >= state.totalRounds) {
        return { ...state, players, phase: 'GAME_OVER' };
    }
    return {
        ...state,
        players,
        phase: 'SCORING',
        currentRound: state.currentRound + 1,
        dealerIndex: (state.dealerIndex + 1) % 4,
        lastAction: 'Round complete! Scores updated.',
    };
}
function getCallBreakWinner(state) {
    return [...state.players].sort((a, b) => b.totalScore - a.totalScore)[0];
}
