export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export interface Card {
    suit: Suit;
    rank: Rank;
    id: string;
}
export declare const SUITS: Suit[];
export declare const RANKS: Rank[];
export declare const RANK_ORDER: Record<Rank, number>;
export declare function createDeck(): Card[];
export declare function shuffleDeck(deck: Card[]): Card[];
export declare function cardToString(card: Card): string;
export declare function compareCards(a: Card, b: Card): number;
