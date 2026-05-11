/**
 * Colony Bootstrap Configuration (v1)
 * 
 * Defines the initial resources, buildings, and storage capacities
 * granted to a newly founded colony. These values are designed to 
 * give the colony a jump-start without providing enough resources 
 * to bypass early-game logistics.
 */
export const COLONY_BOOTSTRAP_CONFIG = {
  version: 1,
  // Starting resources provided on the planet (one-time grant)
  resources: [
    { resourceId: 'iron', amount: 500 },
    { resourceId: 'silicon', amount: 300 },
    { resourceId: 'carbon', amount: 200 },
    { resourceId: 'water', amount: 100 },
    { resourceId: 'fuel', amount: 50 },
  ],
  // Default storage capacity for newly initialized resources
  // In New Universe, Command Center L1 usually provides some base capacity.
  defaultStorageCap: 2000,
};
