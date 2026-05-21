import type { EntityNameErrorCode } from '../format/entityNameValidation.js';

/** Diamond cost of the second and onward player nickname change. */
export const PLAYER_NICKNAME_CHANGE_DIAMOND_COST = 20;

export interface UpdatePlayerNicknameRequest {
  name: string;
}

export interface UpdatePlayerNicknameSuccess {
  status: 'ok';
  playerNickname: string;
  playerNicknameChangeCount: number;
  diamondsSpent: number;
  diamondsRemaining: number;
  /** True when this call initializes a missing nickname and does not count as a change. */
  initialWrite: boolean;
}

export type PlayerNicknameBlockedCode =
  | 'user_not_found'
  | 'insufficient_diamonds';

export interface UpdatePlayerNicknameFailure {
  status: 'error';
  code: EntityNameErrorCode | PlayerNicknameBlockedCode;
  message: string;
}

export type UpdatePlayerNicknameResponse =
  | UpdatePlayerNicknameSuccess
  | UpdatePlayerNicknameFailure;
