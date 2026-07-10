import { Card } from '../cards/deck';
import { TeenPattiState, TeenPattiAction } from '../games/teen-patti/engine';
import { CallBreakState } from '../games/call-break/engine';
import { MendicotState } from '../games/mendicot/engine';
export type BotDifficulty = 'easy' | 'medium' | 'hard';
export declare function getTeenPattiBotAction(state: TeenPattiState, botId: string, difficulty: BotDifficulty): TeenPattiAction;
export declare function getCallBreakBotBid(cards: Card[], difficulty: BotDifficulty): number;
export declare function getCallBreakBotCard(state: CallBreakState, botId: string, difficulty: BotDifficulty): Card | null;
export declare function getMendicotBotCard(state: MendicotState, botId: string, difficulty: BotDifficulty): Card | null;
