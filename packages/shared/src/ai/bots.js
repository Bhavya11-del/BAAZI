"use strict";
// ============================================================
// AI BOT SYSTEM — Works for all 3 games
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeenPattiBotAction = getTeenPattiBotAction;
exports.getCallBreakBotBid = getCallBreakBotBid;
exports.getCallBreakBotCard = getCallBreakBotCard;
exports.getMendicotBotCard = getMendicotBotCard;
const deck_1 = require("../cards/deck");
const engine_1 = require("../games/teen-patti/engine");
const engine_2 = require("../games/call-break/engine");
const engine_3 = require("../games/mendicot/engine");
// ===================== TEEN PATTI BOT =====================
function getTeenPattiBotAction(state, botId, difficulty) {
    const player = state.players.find(p => p.id === botId);
    if (!player)
        return { type: 'fold', playerId: botId };
    const isSeen = player.status === 'seen';
    const callAmount = isSeen ? state.currentStake * 2 : state.currentStake;
    if (difficulty === 'easy') {
        return easyTeenPattiAction(player, botId, callAmount, state);
    }
    else if (difficulty === 'medium') {
        return mediumTeenPattiAction(player, botId, callAmount, state, isSeen);
    }
    else {
        return hardTeenPattiAction(player, botId, callAmount, state, isSeen);
    }
}
function easyTeenPattiAction(player, botId, callAmount, state) {
    const rand = Math.random();
    if (!player.cards.length)
        return { type: 'call', playerId: botId };
    // 30% fold, 60% call, 10% raise
    if (rand < 0.3)
        return { type: 'fold', playerId: botId };
    if (rand < 0.9)
        return { type: 'call', playerId: botId };
    return { type: 'raise', playerId: botId, amount: callAmount * 2 };
}
function mediumTeenPattiAction(player, botId, callAmount, state, isSeen) {
    // See cards first if blind and pot is large
    if (!isSeen && state.pot > state.bootAmount * 6 && Math.random() > 0.5) {
        return { type: 'seeCards', playerId: botId };
    }
    if (!isSeen) {
        // Stay blind: 70% call, 20% raise, 10% fold
        const rand = Math.random();
        if (rand < 0.1)
            return { type: 'fold', playerId: botId };
        if (rand < 0.8)
            return { type: 'call', playerId: botId };
        return { type: 'raise', playerId: botId, amount: callAmount * 2 };
    }
    const { rank } = (0, engine_1.evaluateHand)(player.cards);
    const handStrength = { trail: 1, pureSequence: 0.9, sequence: 0.7, color: 0.6, pair: 0.45, highCard: 0.2 }[rank];
    if (handStrength < 0.3)
        return { type: 'fold', playerId: botId };
    if (handStrength > 0.7 && Math.random() > 0.4)
        return { type: 'raise', playerId: botId, amount: callAmount * 2 };
    return { type: 'call', playerId: botId };
}
function hardTeenPattiAction(player, botId, callAmount, state, isSeen) {
    const activePlayers = state.players.filter(p => p.status !== 'packed').length;
    // See cards when there are few active players
    if (!isSeen && activePlayers <= 3) {
        return { type: 'seeCards', playerId: botId };
    }
    if (!isSeen) {
        if (player.chips < callAmount * 2)
            return { type: 'fold', playerId: botId };
        return Math.random() < 0.8 ? { type: 'call', playerId: botId } : { type: 'raise', playerId: botId, amount: callAmount * 2 };
    }
    const { rank } = (0, engine_1.evaluateHand)(player.cards);
    const potOdds = callAmount / state.pot;
    const handStrength = { trail: 0.98, pureSequence: 0.85, sequence: 0.65, color: 0.55, pair: 0.40, highCard: 0.15 }[rank];
    if (handStrength < potOdds * 1.5)
        return { type: 'fold', playerId: botId };
    // Bluff 10% of the time with weak hand
    if (handStrength < 0.3 && Math.random() < 0.10) {
        return { type: 'raise', playerId: botId, amount: callAmount * 3 };
    }
    // Strong hand: raise, medium: call
    if (handStrength > 0.7)
        return { type: 'raise', playerId: botId, amount: callAmount * 2 };
    if (handStrength > 0.4)
        return { type: 'call', playerId: botId };
    return { type: 'fold', playerId: botId };
}
// ===================== CALL BREAK BOT =====================
function getCallBreakBotBid(cards, difficulty) {
    if (difficulty === 'easy') {
        return Math.max(1, Math.floor(Math.random() * 5) + 1);
    }
    const trumps = cards.filter(c => c.suit === engine_2.TRUMP_SUIT);
    const highCards = cards.filter(c => ['A', 'K', 'Q'].includes(c.rank));
    let estimate = trumps.length + Math.floor(highCards.length * 0.6);
    if (difficulty === 'medium')
        estimate = Math.max(1, estimate + (Math.random() > 0.5 ? 1 : -1));
    else
        estimate = Math.max(1, estimate); // hard: accurate
    return Math.min(13, Math.max(1, estimate));
}
function getCallBreakBotCard(state, botId, difficulty) {
    const player = state.players.find(p => p.id === botId);
    if (!player || player.cards.length === 0)
        return null;
    const leadSuit = state.currentTrick.leadSuit;
    const suitCards = leadSuit ? player.cards.filter(c => c.suit === leadSuit) : [];
    const trumpCards = player.cards.filter(c => c.suit === engine_2.TRUMP_SUIT);
    const validCards = suitCards.length > 0 ? suitCards : player.cards;
    if (difficulty === 'easy') {
        return validCards[Math.floor(Math.random() * validCards.length)];
    }
    // Try to win the trick
    const currentWinner = getCurrentTrickWinner(state);
    if (difficulty === 'medium') {
        if (suitCards.length > 0) {
            // Play highest card to try to win
            return suitCards.sort((a, b) => deck_1.RANK_ORDER[b.rank] - deck_1.RANK_ORDER[a.rank])[0];
        }
        // Can't follow suit — play a trump if available
        if (trumpCards.length > 0)
            return trumpCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
        return player.cards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
    }
    // Hard: strategic play
    if (suitCards.length > 0) {
        const winningCard = suitCards.find(c => !currentWinner || deck_1.RANK_ORDER[c.rank] > deck_1.RANK_ORDER[currentWinner.rank]);
        if (winningCard)
            return winningCard;
        return suitCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0]; // dump lowest
    }
    if (trumpCards.length > 0 && trumpCards.length > 3) {
        return trumpCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0]; // play lowest trump
    }
    return player.cards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
}
function getCurrentTrickWinner(state) {
    if (!state.currentTrick.cards.length)
        return null;
    const leadSuit = state.currentTrick.leadSuit;
    let best = state.currentTrick.cards[0].card;
    for (const entry of state.currentTrick.cards.slice(1)) {
        const c = entry.card;
        const bIsTrump = best.suit === engine_2.TRUMP_SUIT;
        const cIsTrump = c.suit === engine_2.TRUMP_SUIT;
        if (cIsTrump && !bIsTrump) {
            best = c;
            continue;
        }
        if (!cIsTrump && bIsTrump)
            continue;
        if (c.suit === best.suit && deck_1.RANK_ORDER[c.rank] > deck_1.RANK_ORDER[best.rank])
            best = c;
    }
    return best;
}
// ===================== MENDICOT BOT =====================
function getMendicotBotCard(state, botId, difficulty) {
    const player = state.players.find(p => p.id === botId);
    if (!player || player.cards.length === 0)
        return null;
    // Always use the engine's legal card computation so the bot never plays illegally
    const legalCards = (0, engine_3.getLegalMendicotCards)(player, state.currentTrick, state.trumpSuit);
    if (legalCards.length === 0)
        return null;
    const leadSuit = state.currentTrick.leadSuit;
    const trump = state.trumpSuit;
    const suitCards = leadSuit ? legalCards.filter(c => c.suit === leadSuit) : [];
    const trumpCards = trump ? legalCards.filter(c => c.suit === trump) : [];
    if (difficulty === 'easy') {
        return legalCards[Math.floor(Math.random() * legalCards.length)];
    }
    if (difficulty === 'medium') {
        // Prefer winning the trick
        if (leadSuit && suitCards.length > 0) {
            // Play highest card of lead suit
            return suitCards.sort((a, b) => deck_1.RANK_ORDER[b.rank] - deck_1.RANK_ORDER[a.rank])[0];
        }
        if (trumpCards.length > 0) {
            // Void in lead suit — choose to trump with the lowest trump
            return trumpCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
        }
        return legalCards.sort((a, b) => deck_1.RANK_ORDER[b.rank] - deck_1.RANK_ORDER[a.rank])[0];
    }
    // Hard: strategic play
    const hasTens = player.cards.some(c => c.rank === '10');
    if (leadSuit && suitCards.length > 0) {
        // If we have the 10 of lead suit and it can win, play it
        const ten = suitCards.find(c => c.rank === '10');
        if (ten && canWinMendicotTrick(state, ten))
            return ten;
        // Try to win with highest card, or dump low if we can't
        const canWin = suitCards.some(c => canWinMendicotTrick(state, c));
        if (canWin)
            return suitCards.sort((a, b) => deck_1.RANK_ORDER[b.rank] - deck_1.RANK_ORDER[a.rank])[0];
        return suitCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
    }
    if (trumpCards.length > 0) {
        // Void in lead suit — play lowest trump (conservative)
        if (hasTens)
            return trumpCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
        return trumpCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
    }
    return legalCards.sort((a, b) => deck_1.RANK_ORDER[a.rank] - deck_1.RANK_ORDER[b.rank])[0];
}
/**
 * Check if a specific card would win the current Mendicot trick so far.
 */
function canWinMendicotTrick(state, card) {
    if (!state.currentTrick.cards.length)
        return true;
    const trump = state.trumpSuit;
    for (const entry of state.currentTrick.cards) {
        const c = entry.card;
        const cIsTrump = trump !== null && c.suit === trump;
        const myIsTrump = trump !== null && card.suit === trump;
        if (cIsTrump && !myIsTrump)
            return false;
        if (c.suit === card.suit && deck_1.RANK_ORDER[c.rank] >= deck_1.RANK_ORDER[card.rank])
            return false;
    }
    return true;
}
