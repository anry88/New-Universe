import { TelegramUpdate } from '../../lib/telegram.js';
import { env } from '../../lib/env.js';
import {
  handleAddDiamondCommand,
  handleAdminAskCommand,
  handleAdminRefundCommand,
  handleAdminRejectCommand,
  handleAnswerSupportCommand,
  handlePaySupportCommand,
  handleStartCommand,
  isAddDiamondCommand,
  isAdminAskCommand,
  isAdminRefundCommand,
  isAdminRejectCommand,
  isAnswerSupportCommand,
  isPaySupportCommand,
} from './commands.js';
import { logger } from '../../lib/logger.js';
import {
  answerStarsPreCheckout,
  recordSuccessfulStarsPayment,
} from '../monetization/service.js';
import { trackBackendEvent } from '../../lib/analytics.js';

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.pre_checkout_query) {
    const accepted = await answerStarsPreCheckout(update.pre_checkout_query);
    logger.info(
      {
        updateId: update.update_id,
        preCheckoutQueryId: update.pre_checkout_query.id,
        accepted,
      },
      'Handled Telegram Stars pre-checkout query',
    );
    return;
  }

  const message = update.message;
  
  if (!message) {
    logger.debug({ updateId: update.update_id }, 'Ignoring Telegram update without message');
    return;
  }

  if (message.successful_payment) {
    const result = await recordSuccessfulStarsPayment({
      payment: message.successful_payment,
      actor: message.from,
    });

    if (result.success && result.pack && result.userId && !result.duplicate) {
      trackBackendEvent('stars_checkout_completed', {
        packDiamonds: result.pack.diamonds,
        priceStars: result.pack.priceStars,
      }, {
        userId: result.userId,
      });
    }

    logger.info(
      {
        updateId: update.update_id,
        paymentId: result.paymentId,
        duplicate: result.duplicate,
        success: result.success,
        reason: result.reason,
      },
      'Handled Telegram Stars successful payment',
    );
    return;
  }

  if (!message.text) {
    logger.debug({ updateId: update.update_id }, 'Ignoring Telegram update without text message');
    return;
  }

  const text = message.text;
  const chatId = message.chat.id;
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  const argsText = rawCommand ? text.trim().slice(rawCommand.length).trim() : '';

  if (!rawCommand) {
    logger.debug({ updateId: update.update_id, chatId }, 'Ignoring empty Telegram text message');
    return;
  }

  const command = rawCommand.split('@')[0].toLowerCase();

  if (command === '/start') {
    logger.info({ chatId }, 'Handling /start command');
    await handleStartCommand(chatId, message.from);
    return;
  }

  if (isAddDiamondCommand(command)) {
    logger.info({ chatId, command }, 'Handling admin add_diamond command');
    await handleAddDiamondCommand(chatId, args, message.from, {
      adminTelegramIds: env.ADMIN_TELEGRAM_IDS,
      locale: message.from?.language_code?.toLowerCase().startsWith('ru') ? 'ru' : 'en',
    });
    return;
  }

  if (isPaySupportCommand(command)) {
    logger.info({ chatId, command }, 'Handling payment support command');
    await handlePaySupportCommand(chatId, argsText, message.from);
    return;
  }

  if (isAnswerSupportCommand(command)) {
    logger.info({ chatId, command }, 'Handling payment support answer command');
    await handleAnswerSupportCommand(chatId, argsText, message.from);
    return;
  }

  if (isAdminRefundCommand(command)) {
    logger.info({ chatId, command }, 'Handling admin refund command');
    await handleAdminRefundCommand(chatId, argsText, message.from);
    return;
  }

  if (isAdminRejectCommand(command)) {
    logger.info({ chatId, command }, 'Handling admin reject command');
    await handleAdminRejectCommand(chatId, argsText, message.from);
    return;
  }

  if (isAdminAskCommand(command)) {
    logger.info({ chatId, command }, 'Handling admin ask command');
    await handleAdminAskCommand(chatId, argsText, message.from);
    return;
  }

  if (command.startsWith('/')) {
    logger.info(
      {
        updateId: update.update_id,
        chatId,
        command,
        fromId: message.from?.id,
      },
      'Ignoring unsupported Telegram bot command',
    );
  }
}
