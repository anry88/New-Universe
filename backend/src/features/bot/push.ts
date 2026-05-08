import { db } from '../../db/index.js';
import { notifications } from '../../db/schema/notifications.js';

/**
 * Queues a push notification for a user.
 * The notification will be picked up by the notification worker.
 */
export async function sendPush(userId: string, type: string, payload: Record<string, any> = {}) {
  await db.insert(notifications).values({
    userId,
    type,
    payload,
    pending: true,
  });
}
