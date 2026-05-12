import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleTelegramUpdate } from './webhook.js';
import { TelegramUpdate } from '../../lib/telegram.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const fetchMock = vi.fn();
global.fetch = fetchMock;

vi.mock('../../lib/env.js', () => ({
  env: {
    ADMIN_TELEGRAM_IDS: [12345n],
    PUBLIC_FRONTEND_URL: 'https://test-app.nu',
  },
}));

describe('Bot Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    });
  });

  it('should handle /start command', async () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 100,
        chat: { id: 12345, type: 'private' },
        text: '/start',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('Добро пожаловать');
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe('Открыть New Universe');
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toBeDefined();
  });

  it('should ignore other messages', async () => {
    const update: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 101,
        chat: { id: 12345, type: 'private' },
        text: 'Hello',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should ignore unsupported slash commands', async () => {
    const update: TelegramUpdate = {
      update_id: 6,
      message: {
        message_id: 106,
        chat: { id: 12345, type: 'private' },
        text: '/unknown_command',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should ignore empty text messages safely', async () => {
    const update: TelegramUpdate = {
      update_id: 7,
      message: {
        message_id: 107,
        chat: { id: 12345, type: 'private' },
        text: '   ',
        from: { id: 12345, first_name: 'Test User' },
      },
    };

    await handleTelegramUpdate(update);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should add diamonds via add_diamond command for admin', async () => {
    const now = Date.now();
    const targetUsername = `cmd_admin_target_${now}`;
    const targetTgId = 700000 + now;

    const [target] = await db
      .insert(users)
      .values({
        tgId: BigInt(targetTgId),
        tgUsername: targetUsername,
        tgFirstName: 'Target',
        diamonds: 100,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    expect(target).toBeDefined();

    const update: TelegramUpdate = {
      update_id: 3,
      message: {
        message_id: 102,
        chat: { id: 12345, type: 'private' },
        text: `/add_diamond @${targetUsername} 50`,
        from: { id: 12345, first_name: 'Admin', language_code: 'ru' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, target.id),
      columns: { diamonds: true },
    });

    expect(fetched?.diamonds).toBe(150);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('Админ-операция');

    await db.delete(users).where(eq(users.id, target.id));
  });

  it('should add diamonds via addressed add_diamond command for admin', async () => {
    const now = Date.now();
    const targetUsername = `cmd_admin_target_mention_${now}`;
    const targetTgId = 710000 + now;

    const [target] = await db
      .insert(users)
      .values({
        tgId: BigInt(targetTgId),
        tgUsername: targetUsername,
        tgFirstName: 'Target',
        diamonds: 100,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    expect(target).toBeDefined();

    const update: TelegramUpdate = {
      update_id: 8,
      message: {
        message_id: 108,
        chat: { id: 12345, type: 'private' },
        text: `/add_diamond@TestBot @${targetUsername} 25`,
        from: { id: 12345, first_name: 'Admin', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, target.id),
      columns: { diamonds: true },
    });

    expect(fetched?.diamonds).toBe(125);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('Admin action');

    await db.delete(users).where(eq(users.id, target.id));
  });

  it('should return user-not-found for unknown username in add_diamond', async () => {
    const update: TelegramUpdate = {
      update_id: 5,
      message: {
        message_id: 104,
        chat: { id: 12345, type: 'private' },
        text: '/add_diamond @unknown_player_404 50',
        from: { id: 12345, first_name: 'Admin', language_code: 'ru' },
      },
    };

    await handleTelegramUpdate(update);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(12345);
    expect(body.text).toContain('не найден');
  });

  it('should reject add_diamond command from non-admin', async () => {
    const now = Date.now();
    const targetUsername = `cmd_admin_blocked_${now}`;
    const targetTgId = 800000 + now;

    const [target] = await db
      .insert(users)
      .values({
        tgId: BigInt(targetTgId),
        tgUsername: targetUsername,
        tgFirstName: 'Target',
        diamonds: 100,
      })
      .returning({ id: users.id, diamonds: users.diamonds });

    expect(target).toBeDefined();

    const update: TelegramUpdate = {
      update_id: 4,
      message: {
        message_id: 103,
        chat: { id: 55555, type: 'private' },
        text: `/add_diamond @${targetUsername} 50`,
        from: { id: 55555, first_name: 'Player', language_code: 'en' },
      },
    };

    await handleTelegramUpdate(update);

    const fetched = await db.query.users.findFirst({
      where: eq(users.id, target.id),
      columns: { diamonds: true },
    });
    expect(fetched?.diamonds).toBe(100);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sendMessage');
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe(55555);
    expect(body.text).toContain('Access denied');

    await db.delete(users).where(eq(users.id, target.id));
  });
});
