import { Card, Suit } from '../../cards/deck';
export type CallBreakPhase = 'WAITING' | 'DEAL' | 'BIDDING' | 'TRICK_PLAY' | 'TRICK_COMPLETE' | 'SCORING' | 'GAME_OVER';
export declare const TRUMP_SUIT: Suit;
export interface CallBreakPlayer {
    id: string;
    name: string;
    cards: Card[];
    bid: number;
    tricksWon: number;
    score: number;
    totalScore: number;
    isBot: boolean;
    botDifficulty?: 'easy' | 'medium' | 'hard';
    avatar?: string;
}
export interface Trick {
    cards: {
        playerId: string;
        card: Card;
    }[];
    leadSuit: Suit | null;
    winnerId?: string;
}
export interface CallBreakState {
    phase: CallBreakPhase;
    players: CallBreakPlayer[];
    currentTrick: Trick;
    completedTricks: Trick[];
    currentPlayerIndex: number;
    dealerIndex: number;
    currentRound: number;
    totalRounds: number;
    biddingPlayerIndex: number;
    lastAction?: string;
    /** IDs of cards the current player is legally allowed to play */
    legalCardIds?: string[];
}
export declare function initCallBreak(players: Omit<CallBreakPlayer, 'cards' | 'bid' | 'tricksWon' | 'score' | 'totalScore'>[], totalRounds?: number): CallBreakState;
export declare function dealCallBreak(state: CallBreakState): CallBreakState;
export declare function placeBid(state: CallBreakState, playerId: string, bid: number): CallBreakState;
export declare function playCard(state: CallBreakState, playerId: string, card: Card): CallBreakState;
export declare function advanceCallBreakTrick(state: CallBreakState): CallBreakState;
export declare function getCallBreakWinner(state: CallBreakState): CallBreakPlayer;
