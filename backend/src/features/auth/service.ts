import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { env } from '../../lib/env.js';
import { TelegramUser } from '../../lib/telegram.js';
import { generateHomeSystem } from '../world/home-system-generator.js';

export class AuthService {
  async loginWithTelegram(telegramUser: TelegramUser) {
    const tgId = BigInt(telegramUser.id);

    let user = await db.query.users.findFirst({
      where: eq(users.tgId, tgId),
    });

    if (!user) {
      try {
        user = await db.transaction(async (tx) => {
          const [newUser] = await tx.insert(users).values({
            tgId,
            tgUsername: telegramUser.username,
            tgFirstName: telegramUser.first_name,
            diamonds: env.DIAMOND_STARTING_GRANT,
          }).returning();

          await generateHomeSystem(newUser.id, tx);
          return newUser;
        });
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

    return { 
      user: {
        ...user,
        tgId: user.tgId.toString(),
      }, 
      token 
    };
  }
}

export const authService = new AuthService();
