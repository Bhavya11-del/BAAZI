import { Card } from '../../cards/deck';
export type TeenPattiPhase = 'WAITING' | 'ANTE' | 'DEAL' | 'BETTING' | 'SHOWDOWN' | 'RESULT';
export type PlayerStatus = 'active' | 'blind' | 'seen' | 'packed' | 'allin';
export type HandRank = 'trail' | 'pureSequence' | 'sequence' | 'color' | 'pair' | 'highCard';
export interface TeenPattiPlayer {
    id: string;
    name: string;
    cards: Card[];
    chips: number;
    bet: number;
    status: PlayerStatus;
    isBot: boolean;
    botDifficulty?: 'easy' | 'medium' | 'hard';
    avatar?: string;
}
export interface TeenPattiState {
    phase: TeenPattiPhase;
    players: TeenPattiPlayer[];
    pot: number;
    currentStake: number;
    currentPlayerIndex: number;
    dealerIndex: number;
    winner?: string;
    winnerHand?: HandRank;
    lastAction?: string;
    roundNumber: number;
    bootAmount: number;
    sideshowPending?: {
        requesterId: string;
        targetId: string;
    };
}
export declare function evaluateHand(cards: Card[]): {
    rank: HandRank;
    score: number;
};
export declare function initTeenPattiGame(players: Omit<TeenPattiPlayer, 'cards' | 'bet' | 'status'>[], bootAmount?: number): TeenPattiState;
export declare function dealCards(state: TeenPattiState, deck: Card[]): TeenPattiState;
export interface TeenPattiAction {
    type: 'fold' | 'call' | 'raise' | 'show' | 'sideshow' | 'seeCards';
    amount?: number;
    playerId: string;
}
export declare function applyAction(state: TeenPattiState, action: TeenPattiAction): TeenPattiState;
export declare function resolveShowdown(state: TeenPattiState): TeenPattiState;
