import { createHash } from 'crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import {
  validateEntityName,
  type EntityNameErrorCode,
} from '@shared/format/entityNameValidation.js';
import {
  PLAYER_NICKNAME_CHANGE_DIAMOND_COST,
  type PlayerNicknameBlockedCode,
  type UpdatePlayerNicknameSuccess,
} from '@shared/types/player-nickname.js';
import { db as defaultDb } from '../../db/index.js';
import { users } from '../../db/schema.js';

type UserNicknameInput = {
  id: string;
  tgUsername: string | null;
  tgFirstName: string | null;
};

export type PlayerNicknameErrorCode =
  | EntityNameErrorCode
  | PlayerNicknameBlockedCode;

export class PlayerNicknameError extends Error {
  readonly code: PlayerNicknameErrorCode;

  constructor(code: PlayerNicknameErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function nicknameErrorMessage(code: EntityNameErrorCode): string {
  switch (code) {
    case 'empty':
      return 'Nickname cannot be empty.';
    case 'too_short':
      return 'Nickname is too short (min 3 characters).';
    case 'too_long':
      return 'Nickname is too long (max 30 characters).';
    case 'invalid_chars':
      return 'Only Russian/Latin letters, digits, spaces and hyphens are allowed.';
    case 'profanity':
      return 'Nickname contains profanity.';
  }
}

function validateNicknameOrThrow(rawName: string): string {
  const result = validateEntityName(rawName);
  if (!result.valid) {
    throw new PlayerNicknameError(
      result.error!,
      nicknameErrorMessage(result.error!),
    );
  }
  return result.normalized;
}

function fallbackNickname(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, 6);
}

export function suggestPlayerNickname(user: UserNicknameInput): string {
  const candidates = [
    user.tgUsername?.replace(/^@+/, ''),
    user.tgFirstName,
  ];

  for (const candidate of candidates) {
    const result = validateEntityName(candidate ?? '');
    if (result.valid) return result.normalized;
  }

  return fallbackNickname(user.id);
}

export async function updatePlayerNickname(
  userId: string,
  rawName: string,
): Promise<UpdatePlayerNicknameSuccess> {
  const normalized = validateNicknameOrThrow(rawName);

  return defaultDb.transaction(async (tx) => {
    const [userRow] = await tx
      .select({
        id: users.id,
        playerNickname: users.playerNickname,
        playerNicknameChangeCount: users.playerNicknameChangeCount,
        diamonds: users.diamonds,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');

    if (!userRow) {
      throw new PlayerNicknameError('user_not_found', 'User not found.');
    }

    if (userRow.playerNickname === normalized) {
      return {
        status: 'ok',
        playerNickname: normalized,
        playerNicknameChangeCount: userRow.playerNicknameChangeCount,
        diamondsSpent: 0,
        diamondsRemaining: userRow.diamonds,
        initialWrite: false,
      };
    }

    const initialWrite = !userRow.playerNickname;
    const cost = initialWrite
      ? 0
      : userRow.playerNicknameChangeCount === 0
        ? 0
        : PLAYER_NICKNAME_CHANGE_DIAMOND_COST;

    let diamondsRemaining = userRow.diamonds;
    if (cost > 0) {
      const charged = await tx
        .update(users)
        .set({ diamonds: sql`${users.diamonds} - ${cost}` })
        .where(and(eq(users.id, userId), gte(users.diamonds, cost)))
        .returning({ diamonds: users.diamonds });

      if (charged.length === 0) {
        throw new PlayerNicknameError(
          'insufficient_diamonds',
          'Not enough diamonds.',
        );
      }
      diamondsRemaining = charged[0]!.diamonds;
    }

    const nextChangeCount = initialWrite
      ? userRow.playerNicknameChangeCount
      : userRow.playerNicknameChangeCount + 1;
    const [updated] = await tx
      .update(users)
      .set({
        playerNickname: normalized,
        playerNicknameChangeCount: nextChangeCount,
      })
      .where(eq(users.id, userId))
      .returning({
        playerNickname: users.playerNickname,
        playerNicknameChangeCount: users.playerNicknameChangeCount,
      });

    if (!updated?.playerNickname) {
      throw new PlayerNicknameError('user_not_found', 'User not found.');
    }

    return {
      status: 'ok',
      playerNickname: updated.playerNickname,
      playerNicknameChangeCount: updated.playerNicknameChangeCount,
      diamondsSpent: cost,
      diamondsRemaining,
      initialWrite,
    };
  });
}
