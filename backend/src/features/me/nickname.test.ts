import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import {
  PlayerNicknameError,
  suggestPlayerNickname,
  updatePlayerNickname,
} from './nickname.js';
import { PLAYER_NICKNAME_CHANGE_DIAMOND_COST } from '@shared/types/player-nickname.js';

async function createUser(input: {
  diamonds?: number;
  tgUsername?: string | null;
  tgFirstName?: string | null;
  playerNickname?: string | null;
  playerNicknameChangeCount?: number;
} = {}) {
  const [user] = await db
    .insert(users)
    .values({
      tgId: BigInt(Math.floor(Math.random() * 1_000_000_000_000)),
      tgUsername: input.tgUsername ?? null,
      tgFirstName: input.tgFirstName ?? null,
      playerNickname: input.playerNickname ?? null,
      playerNicknameChangeCount: input.playerNicknameChangeCount ?? 0,
      diamonds: input.diamonds ?? 100,
    })
    .returning();
  return user;
}

async function loadUser(userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId) });
}

describe('player nickname', () => {
  it('suggests Telegram username, then first name, then a six-character fallback', () => {
    expect(
      suggestPlayerNickname({
        id: '00000000-0000-0000-0000-000000000001',
        tgUsername: '@ValidPilot',
        tgFirstName: 'Иван',
      }),
    ).toBe('ValidPilot');

    expect(
      suggestPlayerNickname({
        id: '00000000-0000-0000-0000-000000000002',
        tgUsername: 'bad_user',
        tgFirstName: 'Иван Пилот',
      }),
    ).toBe('Иван Пилот');

    expect(
      suggestPlayerNickname({
        id: '00000000-0000-0000-0000-000000000003',
        tgUsername: 'x',
        tgFirstName: '!!',
      }),
    ).toMatch(/^[a-f0-9]{6}$/);
  });

  it('initializes a missing nickname without counting it as a change', async () => {
    const user = await createUser({ diamonds: 50 });

    const result = await updatePlayerNickname(user.id, 'Звездный Пилот');

    expect(result).toMatchObject({
      playerNickname: 'Звездный Пилот',
      playerNicknameChangeCount: 0,
      diamondsSpent: 0,
      diamondsRemaining: 50,
      initialWrite: true,
    });
    const stored = await loadUser(user.id);
    expect(stored?.playerNickname).toBe('Звездный Пилот');
    expect(stored?.playerNicknameChangeCount).toBe(0);
    expect(stored?.diamonds).toBe(50);
  });

  it('keeps the first profile change free and charges later changes', async () => {
    const user = await createUser({
      diamonds: 50,
      playerNickname: 'First Pilot',
      playerNicknameChangeCount: 0,
    });

    const freeChange = await updatePlayerNickname(user.id, 'Second Pilot');
    expect(freeChange.diamondsSpent).toBe(0);
    expect(freeChange.playerNicknameChangeCount).toBe(1);

    const paidChange = await updatePlayerNickname(user.id, 'Third Pilot');
    expect(paidChange.diamondsSpent).toBe(PLAYER_NICKNAME_CHANGE_DIAMOND_COST);
    expect(paidChange.diamondsRemaining).toBe(50 - PLAYER_NICKNAME_CHANGE_DIAMOND_COST);
    expect(paidChange.playerNicknameChangeCount).toBe(2);
  });

  it('rejects invalid names and insufficient diamond balance', async () => {
    const user = await createUser({
      diamonds: 5,
      playerNickname: 'Known Pilot',
      playerNicknameChangeCount: 1,
    });

    await expect(updatePlayerNickname(user.id, 'ab')).rejects.toMatchObject({
      code: 'too_short',
    });
    await expect(updatePlayerNickname(user.id, 'bad!')).rejects.toBeInstanceOf(
      PlayerNicknameError,
    );
    await expect(updatePlayerNickname(user.id, 'blyad')).rejects.toMatchObject({
      code: 'profanity',
    });
    await expect(updatePlayerNickname(user.id, 'блядь')).rejects.toMatchObject({
      code: 'profanity',
    });
    await expect(updatePlayerNickname(user.id, 'Paid Change')).rejects.toMatchObject({
      code: 'insufficient_diamonds',
    });

    const stored = await loadUser(user.id);
    expect(stored?.playerNickname).toBe('Known Pilot');
    expect(stored?.diamonds).toBe(5);
  });
});
