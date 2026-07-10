"use strict";
// ============================================================
// CARD DECK UTILITIES
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANK_ORDER = exports.RANKS = exports.SUITS = void 0;
exports.createDeck = createDeck;
exports.shuffleDeck = shuffleDeck;
exports.cardToString = cardToString;
exports.compareCards = compareCards;
exports.SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
exports.RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
exports.RANK_ORDER = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
function createDeck() {
    const deck = [];
    for (const suit of exports.SUITS) {
        for (const rank of exports.RANKS) {
            deck.push({ suit, rank, id: `${rank}_${suit}` });
        }
    }
    return deck;
}
function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function cardToString(card) {
    const suitSymbol = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
    return `${card.rank}${suitSymbol[card.suit]}`;
}
function compareCards(a, b) {
    return exports.RANK_ORDER[a.rank] - exports.RANK_ORDER[b.rank];
}
