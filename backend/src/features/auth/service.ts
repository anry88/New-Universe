import { db } from '../../db/index.js';
import { telegramRegistrationReferrals, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { TelegramUser } from '../../lib/telegram.js';
import { generateHomeSystem } from '../world/home-system-generator.js';
import { normalizeLocale } from '@shared/types/locale.js';
import {
  REGISTRATION_SOURCE_DIRECT,
  registrationSourceFromCode,
} from './registration-source.js';
import { suggestPlayerNickname } from '../me/nickname.js';

interface TelegramLoginOptions {
  registrationSourceCode?: string | null;
}

export class AuthService {
  async loginWithTelegram(telegramUser: TelegramUser, options: TelegramLoginOptions = {}) {
    const tgId = BigInt(telegramUser.id);
    let createdUser = false;

    let user = await db.query.users.findFirst({
      where: eq(users.tgId, tgId),
    });

    if (!user) {
      try {
        const pendingReferral = await db.query.telegramRegistrationReferrals.findFirst({
          where: eq(telegramRegistrationReferrals.tgId, tgId),
          columns: { referralCode: true },
        });
        const registrationSource = registrationSourceFromCode(
          options.registrationSourceCode ?? pendingReferral?.referralCode,
        );

        user = await db.transaction(async (tx) => {
          const [newUser] = await tx.insert(users).values({
            tgId,
            tgUsername: telegramUser.username,
            tgFirstName: telegramUser.first_name,
            registrationSource: registrationSource.registrationSource,
            registrationSourceCode: registrationSource.registrationSourceCode,
            preferredLocale: normalizeLocale(telegramUser.language_code),
            diamonds: env.DIAMOND_STARTING_GRANT,
          }).returning();

          await generateHomeSystem(newUser.id, tx);
          await tx
            .delete(telegramRegistrationReferrals)
            .where(eq(telegramRegistrationReferrals.tgId, tgId));
          return newUser;
        });
        createdUser = true;
      } catch (err: any) {
        if (err?.code === '23505' || err?.message?.includes('unique constraint')) {
          user = await db.query.users.findFirst({
            where: eq(users.tgId, tgId),
          });
        }
        if (!user) throw err;
      }
    }

    if (!user) {
      throw new Error('Failed to create or find user');
    }

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      expiresIn: '30d',
    });

    const publicUser = Object.fromEntries(
      Object.entries(user).filter(([key]) => (
        key !== 'registrationSource' && key !== 'registrationSourceCode'
      )),
    ) as Omit<typeof user, 'registrationSource' | 'registrationSourceCode'>;

    return { 
      user: {
        ...publicUser,
        tgId: user.tgId.toString(),
        playerNicknameSuggestion: user.playerNickname
          ? null
          : suggestPlayerNickname(user),
      }, 
      token,
      createdUser,
      registrationSource: {
        registrationSource: user.registrationSource ?? REGISTRATION_SOURCE_DIRECT,
        registrationSourceCode: user.registrationSourceCode ?? null,
      },
    };
  }
}

export const authService = new AuthService();
