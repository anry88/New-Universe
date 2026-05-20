export type AnalyticsCategory =
  | 'retention'
  | 'onboarding'
  | 'building'
  | 'ships'
  | 'research'
  | 'expeditions'
  | 'economy'
  | 'market'
  | 'monetization';

export type AnalyticsSurface = 'frontend' | 'backend';

export interface AnalyticsEventDefinition {
  category: AnalyticsCategory;
  surfaces: readonly AnalyticsSurface[];
  description: string;
  safeProperties: readonly string[];
}

export const ANALYTICS_EVENT_DEFINITIONS = {
  client_session_started: {
    category: 'retention',
    surfaces: ['frontend'],
    description: 'The Mini App shell started a browser session.',
    safeProperties: ['locale', 'path', 'isTelegramEnvironment'],
  },
  session_authenticated: {
    category: 'retention',
    surfaces: ['frontend', 'backend'],
    description: 'A Telegram-authenticated game session was established.',
    safeProperties: ['locale', 'tutorialCompleted', 'diamondsBalanceBand'],
  },
  page_viewed: {
    category: 'retention',
    surfaces: ['frontend'],
    description: 'A routed Mini App page was viewed.',
    safeProperties: ['path', 'locale'],
  },
  tutorial_synced: {
    category: 'onboarding',
    surfaces: ['backend'],
    description: 'Tutorial progress was synchronized from current game state.',
    safeProperties: ['tutorialStep', 'tutorialCompleted', 'claimedRewardCount'],
  },
  tutorial_reward_claimed: {
    category: 'onboarding',
    surfaces: ['backend'],
    description: 'A tutorial reward claim was processed.',
    safeProperties: ['stepId', 'rewardGranted', 'rewardDiamonds', 'tutorialCompleted'],
  },
  building_started: {
    category: 'building',
    surfaces: ['backend'],
    description: 'A building construction queue item was created.',
    safeProperties: ['buildingTypeId', 'slotIndex', 'selectedResourceId', 'rushCost'],
  },
  building_upgraded: {
    category: 'building',
    surfaces: ['backend'],
    description: 'A building upgrade queue item was created.',
    safeProperties: ['buildingTypeId', 'fromLevel', 'rushCost'],
  },
  building_rushed: {
    category: 'building',
    surfaces: ['backend'],
    description: 'A queued building was completed by spending diamonds.',
    safeProperties: ['diamondsSpent', 'diamondsRemaining'],
  },
  building_demolished: {
    category: 'building',
    surfaces: ['backend'],
    description: 'A completed building was demolished by its owner.',
    safeProperties: ['refundResourceCount'],
  },
  extractor_resource_changed: {
    category: 'building',
    surfaces: ['backend'],
    description: 'A completed extractor was retargeted to a different deposit.',
    safeProperties: ['selectedResourceId'],
  },
  ship_build_started: {
    category: 'ships',
    surfaces: ['backend'],
    description: 'A ship construction queue item was created.',
    safeProperties: ['shipTypeId', 'rushCost'],
  },
  ship_build_rushed: {
    category: 'ships',
    surfaces: ['backend'],
    description: 'A queued ship was completed by spending diamonds.',
    safeProperties: ['diamondsSpent', 'diamondsRemaining'],
  },
  ship_refueled: {
    category: 'ships',
    surfaces: ['backend'],
    description: 'A refueler transferred ordinary fuel or Jump Fuel to another ship.',
    safeProperties: ['fuel', 'jumpFuel'],
  },
  research_started: {
    category: 'research',
    surfaces: ['backend'],
    description: 'A research tier timer was started.',
    safeProperties: ['branch', 'level', 'durationSeconds'],
  },
  research_rushed: {
    category: 'research',
    surfaces: ['backend'],
    description: 'An active research tier was completed by spending diamonds.',
    safeProperties: ['branch', 'level', 'diamondsSpent', 'diamondsRemaining'],
  },
  expedition_launched: {
    category: 'expeditions',
    surfaces: ['backend'],
    description: 'A ship mission was launched.',
    safeProperties: ['routeMode', 'hasTargetPlanet', 'fuelRequired', 'jumpFuelRequired'],
  },
  expedition_jump_requested: {
    category: 'expeditions',
    surfaces: ['backend'],
    description: 'A deprecated-compatible Jump Gate request was accepted.',
    safeProperties: ['mode', 'jumpFuelRequired'],
  },
  cargo_transfer_started: {
    category: 'expeditions',
    surfaces: ['backend'],
    description: 'A cargo route was launched between owned settlements.',
    safeProperties: ['routeMode', 'resourceLineCount'],
  },
  resource_conversion_completed: {
    category: 'economy',
    surfaces: ['backend'],
    description: 'A player converted an owned planet resource through a processor.',
    safeProperties: ['fromResourceId', 'toResourceId', 'amount'],
  },
  production_started: {
    category: 'economy',
    surfaces: ['backend'],
    description: 'A manual production order was started.',
    safeProperties: ['recipeId', 'quantity', 'durationSeconds'],
  },
  diamond_resource_purchase_quoted: {
    category: 'monetization',
    surfaces: ['backend'],
    description: 'A diamond price quote for a resource purchase was generated.',
    safeProperties: ['resourceId', 'amount', 'diamondsNeeded', 'unitsPerDiamond'],
  },
  diamond_resource_purchase_completed: {
    category: 'monetization',
    surfaces: ['backend'],
    description: 'A player spent diamonds to buy a planet resource.',
    safeProperties: ['resourceId', 'amount', 'diamondsSpent', 'diamondsRemaining'],
  },
  market_order_created: {
    category: 'market',
    surfaces: ['backend'],
    description: 'A future player-market order was created after market settlement exists.',
    safeProperties: ['resourceId', 'orderType', 'amountBand', 'priceBand'],
  },
  market_order_filled: {
    category: 'market',
    surfaces: ['backend'],
    description: 'A future player-market order was settled after escrowed market settlement exists.',
    safeProperties: ['resourceId', 'orderType', 'amountBand', 'priceBand'],
  },
  market_order_cancelled: {
    category: 'market',
    surfaces: ['backend'],
    description: 'A future player-market order was cancelled and escrow returned.',
    safeProperties: ['resourceId', 'orderType', 'amountBand'],
  },
  stars_diamond_pack_viewed: {
    category: 'monetization',
    surfaces: ['frontend'],
    description: 'A Telegram Stars diamond pack was displayed to the player.',
    safeProperties: ['packDiamonds', 'priceStars', 'bonusPercentVsPrevious'],
  },
  stars_checkout_started: {
    category: 'monetization',
    surfaces: ['frontend', 'backend'],
    description: 'A Telegram Stars checkout was initiated.',
    safeProperties: ['packDiamonds', 'priceStars'],
  },
  stars_checkout_completed: {
    category: 'monetization',
    surfaces: ['backend'],
    description: 'A Telegram Stars payment was confirmed and delivered.',
    safeProperties: ['packDiamonds', 'priceStars'],
  },
  stars_refund_issued: {
    category: 'monetization',
    surfaces: ['backend'],
    description: 'A Telegram Stars payment was refunded.',
    safeProperties: ['packDiamonds', 'priceStars', 'reasonCode'],
  },
  planet_renamed: {
    category: 'economy',
    surfaces: ['backend'],
    description: 'A colonized planet was renamed by its owner.',
    safeProperties: ['renameCount', 'diamondsSpent', 'diamondsRemaining'],
  },
  system_renamed: {
    category: 'economy',
    surfaces: ['backend'],
    description: 'A system was renamed by a player holding the only colonies in it.',
    safeProperties: ['renameCount', 'diamondsSpent', 'diamondsRemaining', 'isHome'],
  },
} as const satisfies Record<string, AnalyticsEventDefinition>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_DEFINITIONS;
export type AnalyticsEventNameForSurface<Surface extends AnalyticsSurface> = {
  [Name in AnalyticsEventName]: Surface extends (typeof ANALYTICS_EVENT_DEFINITIONS)[Name]['surfaces'][number]
    ? Name
    : never;
}[AnalyticsEventName];
export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;
export type SafeAnalyticsProperties = Record<string, AnalyticsValue>;

const FORBIDDEN_PROPERTY_KEY_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /email/i,
  /first_?name/i,
  /init_?data/i,
  /jwt/i,
  /last_?name/i,
  /password/i,
  /phone/i,
  /secret/i,
  /telegram.*(auth|id|init|payload|raw|token|user)/i,
  /tg_?id/i,
  /tg_?username/i,
  /token/i,
  /username/i,
];

const MAX_ANALYTICS_PROPERTIES = 40;
const MAX_ANALYTICS_STRING_LENGTH = 160;

export function isKnownAnalyticsEventName(eventName: string): eventName is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_EVENT_DEFINITIONS, eventName);
}

export function isSafeAnalyticsPropertyKey(key: string): boolean {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) {
    return false;
  }

  return !FORBIDDEN_PROPERTY_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeAnalyticsPropertyValue(value: AnalyticsValue | undefined): AnalyticsValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.slice(0, MAX_ANALYTICS_STRING_LENGTH);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean' || value === null) {
    return value;
  }

  return undefined;
}

export function sanitizeAnalyticsProperties(
  properties: AnalyticsProperties = {},
): SafeAnalyticsProperties {
  const safe: SafeAnalyticsProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (Object.keys(safe).length >= MAX_ANALYTICS_PROPERTIES) break;
    if (!isSafeAnalyticsPropertyKey(key) || value === undefined) continue;

    const safeValue = sanitizeAnalyticsPropertyValue(value);
    if (safeValue !== undefined) safe[key] = safeValue;
  }

  return safe;
}

export function sanitizeAnalyticsEventProperties(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): SafeAnalyticsProperties {
  const allowedProperties = new Set<string>(ANALYTICS_EVENT_DEFINITIONS[eventName].safeProperties);
  const safe: SafeAnalyticsProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    if (Object.keys(safe).length >= MAX_ANALYTICS_PROPERTIES) break;
    if (!allowedProperties.has(key) || !isSafeAnalyticsPropertyKey(key)) continue;

    const safeValue = sanitizeAnalyticsPropertyValue(value);
    if (safeValue !== undefined) safe[key] = safeValue;
  }

  return safe;
}
