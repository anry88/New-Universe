export const NOTIFICATION_CATEGORIES = [
  "building",
  "ship",
  "research",
  "expedition",
  "discovery",
  "colony",
  "cargo",
  "combat",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  building: true,
  ship: true,
  research: true,
  expedition: true,
  discovery: true,
  colony: true,
  cargo: true,
  combat: true,
};

const NOTIFICATION_TYPE_CATEGORY: Record<string, NotificationCategory> = {
  building_complete: "building",
  building_done: "building",
  ship_done: "ship",
  research_done: "research",
  expedition_returned: "expedition",
  expedition_arrived: "expedition",
  planet_discovered: "discovery",
  colony_founded: "colony",
  cargo_transfer_delivered: "cargo",
  combat_started: "combat",
  ship_destroyed: "combat",
  building_destroyed: "combat",
  colony_destroyed: "combat",
};

export function notificationCategoryForType(
  type: string,
): NotificationCategory | null {
  return NOTIFICATION_TYPE_CATEGORY[type] ?? null;
}

export function normalizeNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<NotificationCategory, unknown>>)
      : {};

  const result: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const category of NOTIFICATION_CATEGORIES) {
    if (typeof candidate[category] === "boolean") {
      result[category] = candidate[category];
    }
  }
  return result;
}

export function notificationEnabledForType(
  preferences: unknown,
  type: string,
): boolean {
  const category = notificationCategoryForType(type);
  if (!category) return true;
  return normalizeNotificationPreferences(preferences)[category];
}
