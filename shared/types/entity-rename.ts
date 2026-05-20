import type { EntityNameErrorCode } from '../format/entityNameValidation.js';

/** Diamond cost of the *second and onward* rename for each entity. */
export const PLANET_RENAME_DIAMOND_COST = 20;
export const SYSTEM_RENAME_DIAMOND_COST = 200;

export interface RenameEntityRequest {
  name: string;
}

export interface RenameEntitySuccess {
  status: 'ok';
  /** Stored (normalized) name after the rename. */
  name: string;
  /** Server-side rename counter after the increment. */
  renameCount: number;
  /** Diamonds spent on this call (0 for the first free rename). */
  diamondsSpent: number;
  /** Player's diamond balance after the call. */
  diamondsRemaining: number;
}

/** Codes returned when the rename is refused for non-validation reasons. */
export type RenameBlockedCode =
  | 'not_found'
  | 'not_owned'
  | 'foreign_colony_present'
  | 'no_player_colony'
  | 'insufficient_diamonds';

export interface RenameEntityFailure {
  status: 'error';
  /** Either a name-validation error code or a domain-block code. */
  code: EntityNameErrorCode | RenameBlockedCode;
  message: string;
}

export type RenameEntityResponse = RenameEntitySuccess | RenameEntityFailure;
