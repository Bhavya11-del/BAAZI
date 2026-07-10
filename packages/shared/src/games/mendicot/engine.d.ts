import { Card, Suit } from '../../cards/deck';
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
    cards: {
        playerId: string;
        card: Card;
    }[];
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
/**
 * Returns the subset of cards the player is legally allowed to play.
 *
 * Official Mendicot (Rang) rules:
 *  1. If a suit has been led → MUST follow suit if player has any cards of that suit.
 *  2. If void in led suit → player MAY play a trump card OR discard any other suit.
 *  3. If leading (no lead suit) → any card is legal.
 */
export declare function getLegalMendicotCards(player: MendicotPlayer, trick: MendicotTrick, trumpSuit: Suit | null): Card[];
export declare function initMendicot(players: Omit<MendicotPlayer, 'cards' | 'tricksWon'>[]): MendicotState;
export declare function dealMendicot(state: MendicotState): MendicotState;
export declare function playMendicotCard(state: MendicotState, playerId: string, card: Card): MendicotState;
export declare function advanceMendicotTrick(state: MendicotState): MendicotState;
