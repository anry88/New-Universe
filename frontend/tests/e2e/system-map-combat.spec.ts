import { expect, test } from '@playwright/test';

test('system map keeps combat deployments, gate routes, and kinetic tracers visible', async ({ page }) => {
  const nowIso = new Date().toISOString();
  const recentCombatIso = new Date(Date.now() - 5_000).toISOString();
  const userId = 'map-combat-user';
  const systemId = 'home-system';
  const planetId = 'home-planet';
  const shipType = {
    id: 'light_fighter',
    name: { en: 'Light Fighter', ru: 'Лёгкий истребитель' },
    role: 'combat',
    hp: 100,
    speed: '2.00',
    cargo: 0,
    dps: 10,
    armor: 3,
    fuelConsumption: '0.30',
    fuelCapacity: 100,
    jumpFuelCapacity: 100,
    refuelFuelCapacity: 0,
    refuelJumpFuelCapacity: 0,
    buildTimeSec: 10,
    buildCost: { iron: 100 },
    requiredBuildings: [],
    sensorRange: 5,
    combatStats: {
      targetClass: 'military_light',
      damageProfile: {
        damageType: 'kinetic',
        dps: 10,
        armorPenetration: 0.2,
        shieldMultiplier: 1,
      },
      engagementRange: 'close',
    },
  };
  const homePlanet = {
    id: planetId,
    systemId,
    name: 'aaaa-1',
    biome: 'rocky',
    size: 12,
    slotCount: 8,
    isDiscovered: true,
    isColonized: true,
    resources: [
      {
        planetId,
        resourceId: 'iron',
        amount: '1000',
        regenRate: '0',
        storageCap: '5000',
        lastUpdateAt: nowIso,
      },
    ],
    buildings: [],
  };
  const user = {
    id: userId,
    tgId: '99281932',
    tgUsername: 'mapcombat',
    tgFirstName: 'Map',
    preferredLocale: 'en',
    createdAt: nowIso,
    premiumUntil: null,
    powerScore: 0,
    diamonds: 0,
    tutorialStep: 4,
    tutorialCompletedAt: nowIso,
    tutorialRewardsClaimed: 31,
    homeSystem: {
      id: systemId,
      ownerId: userId,
      isHome: true,
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      shortTag: 'aaaa',
      name: 'Map Combat Home',
      seed: 42,
      planets: [homePlanet],
    },
    planets: [homePlanet],
    ships: [
      {
        id: 'local-fighter',
        ownerId: userId,
        typeId: 'light_fighter',
        locationPlanetId: null,
        status: 'moving',
        cargoJson: {},
        fuel: '90',
        jumpFuel: '0',
        refuelFuel: '0',
        refuelJumpFuel: '0',
        hp: 100,
        maxHp: 100,
        combatStats: shipType.combatStats,
      },
      {
        id: 'gate-fighter',
        ownerId: userId,
        typeId: 'light_fighter',
        locationPlanetId: null,
        status: 'moving',
        cargoJson: {},
        fuel: '90',
        jumpFuel: '50',
        refuelFuel: '0',
        refuelJumpFuel: '0',
        hp: 100,
        maxHp: 100,
        combatStats: shipType.combatStats,
      },
    ],
    expeditions: [
      {
        id: 'local-exp',
        shipId: 'local-fighter',
        type: 'light_fighter',
        originPlanetId: planetId,
        targetX: 4,
        targetY: 0,
        targetZ: 0,
        targetPlanetId: null,
        status: 'stationed',
        eta: nowIso,
        returnedAt: null,
        result: {
          routeMode: 'local',
          distance: 4,
          speed: 2,
          engineFactor: 1,
          returnTrip: false,
        },
      },
      {
        id: 'gate-exp',
        shipId: 'gate-fighter',
        type: 'light_fighter',
        originPlanetId: planetId,
        targetX: 20,
        targetY: 0,
        targetZ: 0,
        targetPlanetId: null,
        status: 'in_flight',
        eta: new Date(Date.now() + 240_000).toISOString(),
        returnedAt: null,
        result: {
          routeMode: 'jump_gate',
          destinationSystemId: 'public-system',
          originSystemId: systemId,
          originGateDistance: 6,
          targetGateDistance: 4,
          targetSystemPoint: { x: 160, y: 20 },
          distance: 10,
          speed: 2,
          engineFactor: 1,
          returnTrip: false,
        },
      },
    ],
    research: [],
  };

  await page.route('**/auth/telegram', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'mock-token', user: { id: userId, preferredLocale: 'en' } }),
    });
  });
  await page.route('**/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });
  await page.route('**/ships/types', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([shipType]),
    });
  });
  await page.route('**/jump-gate/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        unlocked: true,
        lockedReason: null,
        homeGateAnchor: null,
        calibration: {
          status: 'idle',
          mode: null,
          targetSystemId: null,
          startedAt: null,
          completesAt: null,
        },
        randomJumpAvailability: {
          available: false,
          blockedCode: null,
          readyAt: null,
        },
        knownDestinations: [],
      }),
    });
  });
  await page.route(`**/systems/${systemId}/tactical-state`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        systemId,
        updatedAt: nowIso,
        fleetContacts: [
          {
            id: 'own-contact',
            systemId,
            relation: 'self',
            visibility: 'full',
            status: 'stationed',
            ownerAlias: null,
            shipTypeId: 'light_fighter',
            hp: 100,
            maxHp: 100,
            combatStats: shipType.combatStats,
            lastCombatTickAt: recentCombatIso,
            point: { x: 0, y: 0 },
            motion: null,
            stationedAt: nowIso,
          },
          {
            id: 'foreign-contact',
            systemId,
            relation: 'foreign',
            visibility: 'summary',
            status: 'stationed',
            ownerAlias: '@rival',
            shipTypeId: 'light_fighter',
            hp: 100,
            maxHp: 100,
            combatStats: shipType.combatStats,
            lastCombatTickAt: recentCombatIso,
            point: { x: 0, y: 0 },
            motion: null,
            stationedAt: nowIso,
          },
        ],
      }),
    });
  });

  await page.goto('/map');

  await expect(page.getByTestId('map-ship-local-fighter')).toBeVisible();
  await expect(page.getByTestId('map-ship-gate-fighter')).toBeVisible();
  await expect(page.getByTestId('expedition-trail-gate-exp')).toBeVisible();
  await expect(page.locator('.combat-projectile-round')).toHaveCount(6);
  await expect(page.locator('.combat-projectile-trail--kinetic')).toHaveCount(2);

  const kineticRoundWidth = await page
    .locator('.combat-projectile-round')
    .first()
    .evaluate((node) => getComputedStyle(node).width);
  expect(kineticRoundWidth).toBe('12px');
});
