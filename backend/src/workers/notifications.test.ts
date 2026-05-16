import { describe, expect, it, vi, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { users, notifications } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { formatNotificationMessage, processNotifications } from './notifications.js';
import * as telegram from '../lib/telegram.js';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@shared/types/notifications.js';

vi.mock('../lib/telegram.js', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
}));

describe('Notifications Worker', () => {
  beforeEach(async () => {
    // Clean up notifications before each test
    await db.delete(notifications);
    vi.clearAllMocks();
  });

  async function createTestUser(
    values: Partial<typeof users.$inferInsert> = {},
  ) {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 100000000)),
      tgUsername: `notiftest_${Date.now()}`,
      tgFirstName: 'NotifTest',
      ...values,
    }).returning();
    return user;
  }

  it('should process pending notifications', async () => {
    const user = await createTestUser();
    
    await db.insert(notifications).values({
      userId: user.id,
      type: 'building_done',
      payload: { typeId: 'mine', planetId: 'p1' },
      pending: true,
    });

    await processNotifications();

    expect(telegram.sendTelegramMessage).toHaveBeenCalled();
    expect(telegram.sendTelegramMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.stringContaining('Mine'),
    );
    
    const updated = await db.query.notifications.findFirst({
      where: eq(notifications.userId, user.id),
    });
    expect(updated!.pending).toBe(false);
    expect(updated!.sentAt).toBeDefined();
  });

  it('should respect rate limit of 20 per user per run', async () => {
    const user = await createTestUser();
    
    // Insert 25 notifications
    for (let i = 0; i < 25; i++) {
      await db.insert(notifications).values({
        userId: user.id,
        type: 'building_done',
        payload: { typeId: 'mine', planetId: 'p1', index: i },
        pending: true,
      });
    }

    // @ts-expect-error: vi.mock'ed function has mock methods
    telegram.sendTelegramMessage.mockClear();


    
    await processNotifications();

    expect(telegram.sendTelegramMessage).toHaveBeenCalledTimes(20);
    
    const pendingItems = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.pending, true)));
    
    expect(pendingItems.length).toBe(5);
  });

  it('should handle multiple users independently', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    await db.insert(notifications).values({
      userId: user1.id,
      type: 'building_done',
      payload: { typeId: 'mine' },
      pending: true,
    });

    await db.insert(notifications).values({
      userId: user2.id,
      type: 'ship_done',
      payload: { typeId: 'scout' },
      pending: true,
    });

    // @ts-expect-error: vi.mock'ed function has mock methods
    telegram.sendTelegramMessage.mockClear();



    await processNotifications();

    expect(telegram.sendTelegramMessage).toHaveBeenCalledTimes(2);
    
    const pendingCount = await db
      .select()
      .from(notifications)
      .where(eq(notifications.pending, true));
    
    expect(pendingCount.length).toBe(0);
  });

  it('formats notifications using the user locale', async () => {
    const user = await createTestUser({ preferredLocale: 'ru' });

    await db.insert(notifications).values({
      userId: user.id,
      type: 'ship_done',
      payload: { typeId: 'colonizer' },
      pending: true,
    });

    // @ts-expect-error: vi.mock'ed function has mock methods
    telegram.sendTelegramMessage.mockClear();

    await processNotifications();

    expect(telegram.sendTelegramMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.stringContaining('Строительство корабля завершено'),
    );
    expect(telegram.sendTelegramMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.stringContaining('Колонизатор'),
    );
  });

  it('does not send notifications disabled by user preferences', async () => {
    const user = await createTestUser({
      notificationPreferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        cargo: false,
      },
    });

    await db.insert(notifications).values({
      userId: user.id,
      type: 'cargo_transfer_delivered',
      payload: {
        targetPlanetName: 'nu-2',
        resources: [{ resourceId: 'iron', amount: 50 }],
      },
      pending: true,
    });

    // @ts-expect-error: vi.mock'ed function has mock methods
    telegram.sendTelegramMessage.mockClear();

    await processNotifications();

    expect(telegram.sendTelegramMessage).not.toHaveBeenCalled();
    const updated = await db.query.notifications.findFirst({
      where: eq(notifications.userId, user.id),
    });
    expect(updated!.pending).toBe(false);
    expect(updated!.read).toBe(true);
  });

  it('formats new gameplay notification types', () => {
    expect(formatNotificationMessage('planet_discovered', { planetName: 'nu-3' }, 'en'))
      .toContain('New planet discovered');
    expect(formatNotificationMessage('colony_founded', { planetName: 'nu-4' }, 'ru'))
      .toContain('Планета колонизирована');
    expect(formatNotificationMessage('combat_started', { locationName: 'Sector 1' }, 'ru'))
      .toContain('Завязался бой');
  });
});
