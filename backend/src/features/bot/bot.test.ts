import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleTelegramUpdate } from './webhook.js';
import { TelegramUpdate } from '../../lib/telegram.js';

const fetchMock = vi.fn();
global.fetch = fetchMock;

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
});
