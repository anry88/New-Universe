import { expect, test } from '@playwright/test';

test('onboarding overlay can be skipped for later', async ({ page }) => {
  const userId = 'e2e-user-1';
  const systemId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const planetId = 'e2e-planet-1';
  const nowIso = new Date().toISOString();

  const user = {
    id: userId,
    tgId: '99281932',
    tgUsername: 'rogue',
    tgFirstName: 'Andrew',
    preferredLocale: 'en',
    createdAt: nowIso,
    premiumUntil: null,
    powerScore: 0,
    diamonds: 0,
    tutorialStep: 0,
    tutorialCompletedAt: null as string | null,
    tutorialRewardsClaimed: 0,
    homeSystem: {
      id: systemId,
      ownerId: userId,
      isHome: true,
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      shortTag: 'aaaa',
      name: "rogue's system aaaa",
      seed: 42,
      planets: [
        {
          id: planetId,
          systemId,
          biome: 'rocky',
          size: 12,
          slotCount: 2,
          name: 'aaaa-1',
          resources: [
            { planetId, resourceId: 'iron', amount: '1000', lastUpdateAt: nowIso, regenRate: '3600' },
            { planetId, resourceId: 'water', amount: '1000', lastUpdateAt: nowIso, regenRate: '0' },
            { planetId, resourceId: 'silicon', amount: '600', lastUpdateAt: nowIso, regenRate: '0' },
            { planetId, resourceId: 'methane', amount: '400', lastUpdateAt: nowIso, regenRate: '0' },
            { planetId, resourceId: 'tritium', amount: '50', lastUpdateAt: nowIso, regenRate: '0' },
          ],
          buildings: [] as Array<Record<string, unknown>>,
        },
      ],
    },
    ships: [],
    expeditions: [],
    research: [],
  };

  await page.route('**/auth/telegram', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'e2e-token',
        user: {
          id: userId,
          tgId: '99281932',
          tgUsername: 'rogue',
          tgFirstName: 'Andrew',
          preferredLocale: 'en',
          createdAt: nowIso,
          premiumUntil: null,
          powerScore: 0,
          diamonds: 0,
          tutorialStep: 0,
          tutorialCompletedAt: null,
          tutorialRewardsClaimed: 0,
        },
      }),
    });
  });

  await page.route('**/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });

  await page.route('**/tutorial/sync', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/buildings/types', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'mine',
          name: { ru: 'Шахта', en: 'Mine' },
          category: 'extraction',
          maxLevel: 20,
          deps: [],
          baseCost: { iron: 100, silicon: 50 },
          baseTimeSec: 10,
          baseOutput: {},
          energyConsumption: 0,
        },
      ]),
    });
  });

  await page.route('**/buildings/queue', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ queue: [] }),
    });
  });

  await page.route('**/buildings/build', async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { planetId: string; typeId: string; slotIndex: number };
    const planet = user.homeSystem.planets[0];
    planet.buildings.push({
      id: 'building-mine-1',
      planetId: body.planetId,
      typeId: body.typeId,
      level: 1,
      slotIndex: body.slotIndex,
      queueAction: 'build',
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`**/planets/${planetId}/resources`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        resources: user.homeSystem.planets[0].resources,
      }),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Tutorial' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Tutorial' })).not.toBeVisible();
});
