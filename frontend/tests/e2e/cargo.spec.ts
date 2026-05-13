import { expect, test } from '@playwright/test';

test('fleet cargo shortcut opens transfer dialog with selected ship and localized resources', async ({ page }) => {
  const nowIso = new Date().toISOString();
  const homePlanetId = 'home-planet';
  const colonyPlanetId = 'colony-planet';
  const cargoShipId = 'cargo-1';

  const homePlanet = {
    id: homePlanetId,
    systemId: 'home-system',
    name: 'Earth',
    biome: 'green',
    size: 15,
    slotCount: 12,
    isDiscovered: true,
    isColonized: true,
    resources: [
      {
        planetId: homePlanetId,
        resourceId: 'iron',
        amount: '120',
        regenRate: '0',
        storageCap: '1000',
        lastUpdateAt: nowIso,
      },
      {
        planetId: homePlanetId,
        resourceId: 'fuel',
        amount: '20',
        regenRate: '0',
        storageCap: '1000',
        lastUpdateAt: nowIso,
      },
    ],
    buildings: [{ id: 'yard-1', planetId: homePlanetId, typeId: 'shipyard', level: 2, slotIndex: 1 }],
  };
  const colonyPlanet = {
    id: colonyPlanetId,
    systemId: 'home-system',
    name: 'Mars',
    biome: 'rocky',
    size: 10,
    slotCount: 8,
    isDiscovered: true,
    isColonized: true,
    resources: [],
    buildings: [],
  };
  const user = {
    id: 'cargo-user',
    tgId: '12345678',
    tgUsername: 'cargo',
    tgFirstName: 'Cargo',
    createdAt: nowIso,
    preferredLocale: 'en',
    diamonds: 0,
    tutorialStep: 0,
    tutorialCompletedAt: nowIso,
    homeSystem: {
      id: 'home-system',
      ownerId: 'cargo-user',
      isHome: true,
      name: 'Sol',
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      seed: 123,
      planets: [homePlanet, colonyPlanet],
    },
    planets: [homePlanet, colonyPlanet],
    ships: [
      {
        id: cargoShipId,
        ownerId: 'cargo-user',
        typeId: 'cargo_light',
        locationPlanetId: homePlanetId,
        status: 'idle',
        cargoJson: {},
        fuel: '0',
      },
    ],
    expeditions: [],
    research: [{ userId: 'cargo-user', branch: 'logistics', level: 1, completesAt: null }],
  };

  await page.route('**/auth/telegram', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'mock-token', user: { id: user.id, preferredLocale: 'en' } }),
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
      body: JSON.stringify([
        {
          id: 'cargo_light',
          name: { en: 'Lightweight Transporter', ru: 'Лёгкий транспорт' },
          role: 'logistics',
          hp: 60,
          speed: '1.20',
          cargo: 5000,
          dps: 0,
          armor: 0,
          fuelConsumption: '0.80',
          buildTimeSec: 1200,
          buildCost: { iron: 500, silicon: 300, carbon: 200, methane: 100 },
          requiredBuildings: [{ typeId: 'shipyard', level: 2 }],
          sensorRange: 8,
        },
      ]),
    });
  });
  await page.route('**/ships/queue', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queue: [] }) });
  });
  await page.route('**/resources/planets/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ resources: homePlanet.resources }),
    });
  });

  await page.goto('/ships');
  await expect(page.getByText('OPEN CARGO')).toBeVisible();
  await page.getByText('OPEN CARGO').click();

  await expect(page).toHaveURL(/\/colonies\?cargoOrigin=/);
  const dialog = page.getByTestId('cargo-transfer-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Cargo Transfer')).toBeVisible();
  await expect(dialog.getByText('0 / 5000')).toBeVisible();
  await expect(dialog.getByText('Iron')).toBeVisible();
});
