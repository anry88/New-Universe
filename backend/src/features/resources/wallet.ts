import { db as defaultDb } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

export interface GrantDiamondsRequest {
  username: string;
  amount: number;
}

export interface GrantDiamondsResult {
  success: boolean;
  status: number;
  data?: {
    userId: string;
    username: string;
    diamondsBefore: number;
    diamondsAfter: number;
    granted: number;
  };
  error?: string;
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').trim().toLowerCase();
}

export async function grantDiamondsToUserByUsername(
  request: GrantDiamondsRequest,
): Promise<GrantDiamondsResult> {
  const amount = request.amount;
  if (!Number.isInteger(amount) || amount < 0) {
    return {
      success: false,
      status: 400,
      error: 'Amount must be an integer >= 0.',
    };
  }

  const username = normalizeUsername(request.username);
  if (!username) {
    return {
      success: false,
      status: 400,
      error: 'Username is required.',
    };
  }

  const user = await defaultDb.query.users.findFirst({
    where: and(
      isNotNull(users.tgUsername),
      eq(sql`lower(${users.tgUsername})`, username),
    ),
    columns: {
      id: true,
      tgUsername: true,
      diamonds: true,
    },
  });

  if (!user) {
    return {
      success: false,
      status: 404,
      error: 'User not found.',
    };
  }

  const updatedUsers = await defaultDb.transaction(async (tx) => {
    const [updatedUser] = await tx
      .update(users)
      .set({
        diamonds: sql`${users.diamonds} + ${amount}`,
      })
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        diamonds: users.diamonds,
      });

    return {
      id: updatedUser?.id,
      diamonds: Number(updatedUser?.diamonds ?? 0),
    };
  });

  if (!updatedUsers) {
    return {
      success: false,
      status: 500,
      error: 'Failed to update diamonds.',
    };
  }

  return {
    success: true,
    status: 200,
    data: {
      userId: updatedUsers.id,
      username: user.tgUsername!,
      diamondsBefore: Number(user.diamonds),
      diamondsAfter: updatedUsers.diamonds,
      granted: amount,
    },
  };
}
