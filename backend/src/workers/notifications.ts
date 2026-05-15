import { db } from '../db/index.js';
import { notifications, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

import { logger } from '../lib/logger.js';
import { sendTelegramMessage } from '../lib/telegram.js';
import { createIntervalWorker, removeLegacyRepeatableJobs, type WorkerHandle } from './scheduler.js';

const POLL_INTERVAL_MS = 60000; // 1 minute as per task

/**
 * Formats a notification message based on type and payload.
 */
function formatNotificationMessage(type: string, payload: any): string | null {
  switch (type) {
    case 'building_complete':
    case 'building_done':
      return `🏗️ <b>Building Complete!</b>\n\nYour ${payload.typeId} on planet <b>${payload.planetName || payload.planetId}</b> is ready.`;
    case 'ship_done':
      return `🚀 <b>Ship Construction Complete!</b>\n\nYour ${payload.typeId} is ready for launch.`;
    case 'expedition_returned':
      return `🛰️ <b>Expedition Returned!</b>\n\nYour ship has returned from mission.`;
    case 'expedition_arrived':
      return `🛰️ <b>Mission Deployed!</b>\n\nYour ship has reached its destination and is now stationed there.`;
    case 'research_done':
      return `🧬 <b>Research Complete!</b>\n\nBranch <b>${payload.branch ?? '?'}</b> is now at level <b>${payload.level ?? '?'}</b>.`;
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
      const message = formatNotificationMessage(notification.type, notification.payload);
      
      if (message) {
        const result = await sendTelegramMessage(Number(user.tgId), message);
        if (result) {
          await db
            .update(notifications)
            .set({
              pending: false,
              sentAt: new Date(),
            })
            .where(eq(notifications.id, notification.id));
          
          logger.info({ notificationId: notification.id, userId, type: notification.type }, 'Push notification sent');
        } else {
          logger.warn({ notificationId: notification.id, userId }, 'Failed to send push notification');
        }
      } else {
        // Unknown notification type or formatting failed, mark as not pending anyway
        await db
          .update(notifications)
          .set({
            pending: false,
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
