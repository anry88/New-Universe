import type { ResourceId } from './research.js';

export const RADIOACTIVE_RESOURCE_IDS = [
  'uranium',
  'tritium',
] as const satisfies readonly ResourceId[];

export type RadioactiveResourceId = (typeof RADIOACTIVE_RESOURCE_IDS)[number];

export const ADVANCED_COMMON_POOL_RESOURCE_IDS = [
  'uranium',
  'tritium',
  'antimatter',
  'iridium',
  'cobalt',
] as const satisfies readonly ResourceId[];

export type AdvancedCommonPoolResourceId = (typeof ADVANCED_COMMON_POOL_RESOURCE_IDS)[number];

export const ADVANCED_MILITARY_COMPONENT_RESOURCE_IDS = [
  'silicon_carbide',
  'liquid_nitrogen',
  'military_alloy',
  'military_composite',
] as const satisfies readonly ResourceId[];

export type AdvancedMilitaryComponentResourceId =
  (typeof ADVANCED_MILITARY_COMPONENT_RESOURCE_IDS)[number];
