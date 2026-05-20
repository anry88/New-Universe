import { db } from '../db/index.js';
import { notifications, users } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

import { logger } from '../lib/logger.js';
import {
  isTelegramBotBlockedByUser,
  sendTelegramMessageDetailed,
  type TelegramBotApiResult,
} from '../lib/telegram.js';
import { createIntervalWorker, removeLegacyRepeatableJobs, type WorkerHandle } from './scheduler.js';
import {
  buildingLabel,
  resourceLabel,
  shipLabel,
} from '@shared/types/entity-labels.js';
import type { Locale } from '@shared/types/locale.js';
import { researchBranchLabel } from '@shared/types/research.js';
import {
  notificationEnabledForType,
  normalizeNotificationPreferences,
} from '@shared/types/notifications.js';

const POLL_INTERVAL_MS = 60000; // 1 minute as per task
const TELEGRAM_BLOCKED_FAILURE_CODE = 'telegram_bot_blocked';

function telegramFailureCode(result: TelegramBotApiResult<unknown>): string {
  if (result.ok) return 'none';
  if (isTelegramBotBlockedByUser(result)) return TELEGRAM_BLOCKED_FAILURE_CODE;
  if (result.errorCode) return `telegram_${result.errorCode}`;
  return result.status === 0 ? 'telegram_network_error' : `telegram_http_${result.status}`;
}

function telegramFailureReason(result: TelegramBotApiResult<unknown>): string | null {
  if (result.ok) return null;
  return result.description ?? null;
}

async function markNotificationSkipped(
  notificationId: string,
  failureCode: string,
  failureReason: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({
      pending: false,
      read: true,
      deliveryStatus: 'skipped',
      failureCode,
      failureReason,
    })
    .where(eq(notifications.id, notificationId));
}

async function markNotificationSent(notificationId: string, sentAt = new Date()): Promise<void> {
  await db
    .update(notifications)
    .set({
      pending: false,
      deliveryStatus: 'sent',
      sentAt,
      failedAt: null,
      failureCode: null,
      failureReason: null,
      lastAttemptAt: sentAt,
      attemptCount: sql`${notifications.attemptCount} + 1`,
    })
    .where(eq(notifications.id, notificationId));
}

async function markNotificationFailed(
  notificationId: string,
  result: TelegramBotApiResult<unknown>,
  attemptedAt = new Date(),
): Promise<void> {
  const terminalBlocked = isTelegramBotBlockedByUser(result);
  await db
    .update(notifications)
    .set({
      pending: terminalBlocked ? false : true,
      read: terminalBlocked ? true : false,
      deliveryStatus: terminalBlocked ? 'failed' : 'pending',
      failedAt: terminalBlocked ? attemptedAt : null,
      failureCode: telegramFailureCode(result),
      failureReason: telegramFailureReason(result),
      lastAttemptAt: attemptedAt,
      attemptCount: sql`${notifications.attemptCount} + 1`,
    })
    .where(eq(notifications.id, notificationId));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function localized(locale: Locale, en: string, ru: string): string {
  return locale === 'ru' ? ru : en;
}

function planetLabel(payload: Record<string, any>, locale: Locale): string {
  return escapeHtml(
    payload.planetName ??
      payload.targetPlanetName ??
      payload.locationName ??
      localized(locale, 'the target planet', 'целевой планете'),
  );
}

function formatResourceList(resources: unknown, locale: Locale): string {
  if (!Array.isArray(resources) || resources.length === 0) {
    return localized(locale, 'cargo', 'груз');
  }

  const items = resources.slice(0, 4).map((resource: any) => {
    const amount = Number(resource?.amount ?? 0);
    const rounded = Number.isFinite(amount) ? Math.round(amount) : 0;
    return `${rounded} ${escapeHtml(resourceLabel(resource?.resourceId, locale))}`;
  });
  const extra = resources.length > items.length
    ? localized(locale, ` and ${resources.length - items.length} more`, ` и еще ${resources.length - items.length}`)
    : '';
  return `${items.join(locale === 'ru' ? ', ' : ', ')}${extra}`;
}

/**
 * Formats a notification message based on type and payload.
 */
export function formatNotificationMessage(
  type: string,
  payload: Record<string, any> = {},
  locale: Locale = 'en',
): string | null {
  switch (type) {
    case 'building_complete':
    case 'building_done': {
      const name = escapeHtml(buildingLabel(payload.typeId, locale));
      const planet = planetLabel(payload, locale);
      if (payload.action === 'upgrade') {
        return localized(
          locale,
          `🏗️ <b>Building upgraded</b>\n\n${name} on <b>${planet}</b> reached level <b>${escapeHtml(payload.level ?? '?')}</b>.`,
          `🏗️ <b>Постройка улучшена</b>\n\n${name} на планете <b>${planet}</b> достигла уровня <b>${escapeHtml(payload.level ?? '?')}</b>.`,
        );
      }
      return localized(
        locale,
        `🏗️ <b>Building complete</b>\n\n${name} on <b>${planet}</b> is ready.`,
        `🏗️ <b>Постройка завершена</b>\n\n${name} на планете <b>${planet}</b> готова.`,
      );
    }
    case 'ship_done':
      return localized(
        locale,
        `🚀 <b>Ship construction complete</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} is ready for launch.`,
        `🚀 <b>Строительство корабля завершено</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} готов к запуску.`,
      );
    case 'expedition_returned':
      return localized(
        locale,
        `🛰️ <b>Expedition returned</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} has returned from the mission.`,
        `🛰️ <b>Экспедиция вернулась</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} вернулся из миссии.`,
      );
    case 'expedition_arrived':
      return localized(
        locale,
        `🛰️ <b>Mission deployed</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} reached <b>${planetLabel(payload, locale)}</b> and is stationed there.`,
        `🛰️ <b>Миссия развернута</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} достиг планеты <b>${planetLabel(payload, locale)}</b> и остался на позиции.`,
      );
    case 'research_done': {
      const branch = escapeHtml(researchBranchLabel(payload.branch ?? '', locale));
      return localized(
        locale,
        `🧬 <b>Research complete</b>\n\n${branch} is now level <b>${escapeHtml(payload.level ?? '?')}</b>.`,
        `🧬 <b>Исследование завершено</b>\n\n${branch}: теперь уровень <b>${escapeHtml(payload.level ?? '?')}</b>.`,
      );
    }
    case 'planet_discovered':
      return localized(
        locale,
        `🪐 <b>New planet discovered</b>\n\nScout data is available for <b>${planetLabel(payload, locale)}</b>.`,
        `🪐 <b>Открыта новая планета</b>\n\nДанные разведки доступны для <b>${planetLabel(payload, locale)}</b>.`,
      );
    case 'colony_founded':
      return localized(
        locale,
        `🌐 <b>Planet colonized</b>\n\nA colonizer founded a new colony on <b>${planetLabel(payload, locale)}</b>.`,
        `🌐 <b>Планета колонизирована</b>\n\nКолонизатор основал новую колонию на <b>${planetLabel(payload, locale)}</b>.`,
      );
    case 'cargo_transfer_delivered':
      return localized(
        locale,
        `📦 <b>Cargo delivered</b>\n\n${formatResourceList(payload.resources, locale)} delivered to <b>${planetLabel(payload, locale)}</b>.`,
        `📦 <b>Груз доставлен</b>\n\n${formatResourceList(payload.resources, locale)} доставлено на <b>${planetLabel(payload, locale)}</b>.`,
      );
    case 'combat_started':
      return localized(
        locale,
        `⚔️ <b>Battle engaged</b>\n\nCombat has begun near <b>${planetLabel(payload, locale)}</b>.`,
        `⚔️ <b>Завязался бой</b>\n\nБой начался возле <b>${planetLabel(payload, locale)}</b>.`,
      );
    case 'ship_destroyed':
      return localized(
        locale,
        `💥 <b>Ship destroyed</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} was lost in combat.`,
        `💥 <b>Корабль уничтожен</b>\n\n${escapeHtml(shipLabel(payload.typeId, locale))} потерян в бою.`,
      );
    case 'building_destroyed':
      return localized(
        locale,
        `🔥 <b>Building destroyed</b>\n\n${escapeHtml(buildingLabel(payload.typeId, locale))} on <b>${planetLabel(payload, locale)}</b> was destroyed.`,
        `🔥 <b>Постройка уничтожена</b>\n\n${escapeHtml(buildingLabel(payload.typeId, locale))} на планете <b>${planetLabel(payload, locale)}</b> уничтожена.`,
      );
    case 'colony_destroyed':
      return localized(
        locale,
        `🔥 <b>Colony destroyed</b>\n\nThe colony on <b>${planetLabel(payload, locale)}</b> has fallen.`,
        `🔥 <b>Колония уничтожена</b>\n\nКолония на планете <b>${planetLabel(payload, locale)}</b> потеряна.`,
      );
    default:
      return null;
  }
}

/**
 * Processes pending notifications and sends them to Telegram.
 * Respects a limit of 20 messages per minute per user.
 */
export async function processNotifications(): Promise<void> {
  // Fetch pending notifications
  const pendingNotifications = await db
    .select({
      notification: notifications,
      user: users,
    })
    .from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(eq(notifications.pending, true))
    .limit(1000); // Batch size

  if (pendingNotifications.length === 0) return;

  // Group by user to respect rate limits
  const userNotificationsMap = new Map<string, typeof pendingNotifications>();
  for (const item of pendingNotifications) {
    const list = userNotificationsMap.get(item.user.id) || [];
    if (list.length < 20) { // Limit 20 messages/min per user as per worker run
      list.push(item);
    }
    userNotificationsMap.set(item.user.id, list);
  }

  for (const [userId, items] of userNotificationsMap.entries()) {
    for (const item of items) {
      const { notification, user } = item;
      const preferences = normalizeNotificationPreferences(user.notificationPreferences);
      if (!notificationEnabledForType(preferences, notification.type)) {
        await markNotificationSkipped(
          notification.id,
          'user_preference_disabled',
          `Notification type ${notification.type} is disabled by user preference`,
        );
        logger.info(
          { notificationId: notification.id, userId, type: notification.type },
          'Push notification skipped by user preference',
        );
        continue;
      }

      if (user.telegramNotificationsBlockedAt) {
        await markNotificationSkipped(
          notification.id,
          TELEGRAM_BLOCKED_FAILURE_CODE,
          'Telegram bot is blocked by the user',
        );
        logger.info(
          { notificationId: notification.id, userId, type: notification.type },
          'Push notification skipped because Telegram bot is blocked by user',
        );
        continue;
      }

      const message = formatNotificationMessage(
        notification.type,
        notification.payload,
        user.preferredLocale,
      );
      
      if (message) {
        const result = await sendTelegramMessageDetailed(Number(user.tgId), message);
        if (result.ok) {
          await markNotificationSent(notification.id);
          logger.info({ notificationId: notification.id, userId, type: notification.type }, 'Push notification sent');
        } else {
          const attemptedAt = new Date();
          await markNotificationFailed(notification.id, result, attemptedAt);

          if (isTelegramBotBlockedByUser(result)) {
            await db
              .update(users)
              .set({ telegramNotificationsBlockedAt: attemptedAt })
              .where(eq(users.id, userId));
          }

          logger.warn(
            {
              notificationId: notification.id,
              userId,
              failureCode: telegramFailureCode(result),
              terminal: isTelegramBotBlockedByUser(result),
            },
            'Failed to send push notification',
          );
        }
      } else {
        // Unknown notification type or formatting failed, mark as not pending anyway
        await db
          .update(notifications)
          .set({
            pending: false,
            deliveryStatus: 'skipped',
            failureCode: 'unknown_notification_type',
            failureReason: `Unknown notification type ${notification.type}`,
          })
          .where(eq(notifications.id, notification.id));
        
        logger.warn({ notificationId: notification.id, type: notification.type }, 'Unknown notification type skipped');
      }
    }
  }
}

/**
 * Creates and initializes the notification worker.
 */
export async function createNotificationsWorker(): Promise<WorkerHandle> {
  await removeLegacyRepeatableJobs('notifications_tick', { name: 'tick' });

  return createIntervalWorker('Notifications', POLL_INTERVAL_MS, processNotifications, {
    runOnStart: true,
  });
}
