import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { telegramRegistrationReferrals, users } from '../../db/schema.js';
import type { TelegramUser } from '../../lib/telegram.js';

export const REGISTRATION_SOURCE_DIRECT = 'direct';
export const REGISTRATION_SOURCE_TELEGRAM_START = 'telegram_start';

export type RegistrationSource =
  | typeof REGISTRATION_SOURCE_DIRECT
  | typeof REGISTRATION_SOURCE_TELEGRAM_START;

export interface RegistrationSourceCapture {
  registrationSource: RegistrationSource;
  registrationSourceCode: string | null;
}

const TELEGRAM_START_PARAMETER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeRegistrationSourceCode(rawCode?: string | null): string | null {
  const code = rawCode?.trim();
  if (!code || !TELEGRAM_START_PARAMETER_PATTERN.test(code)) {
    return null;
  }

  return code;
}

export function registrationSourceFromCode(rawCode?: string | null): RegistrationSourceCapture {
  const registrationSourceCode = normalizeRegistrationSourceCode(rawCode);
  if (!registrationSourceCode) {
    return {
      registrationSource: REGISTRATION_SOURCE_DIRECT,
      registrationSourceCode: null,
    };
  }

  return {
    registrationSource: REGISTRATION_SOURCE_TELEGRAM_START,
    registrationSourceCode,
  };
}

export async function recordTelegramStartRegistrationSource(
  actor: TelegramUser | undefined,
  rawCode: string | undefined,
): Promise<string | null> {
  if (actor?.id == null) {
    return null;
  }

  const referralCode = normalizeRegistrationSourceCode(rawCode);
  if (!referralCode) {
    return null;
  }

  const tgId = BigInt(actor.id);
  const existingUser = await db.query.users.findFirst({
    where: eq(users.tgId, tgId),
    columns: { id: true },
  });

  if (existingUser) {
    return null;
  }

  const now = new Date();
  await db
    .insert(telegramRegistrationReferrals)
    .values({
      tgId,
      referralCode,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: telegramRegistrationReferrals.tgId,
      set: {
        referralCode,
        updatedAt: now,
      },
    });

  return referralCode;
}
