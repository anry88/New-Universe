import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

test('first day flow on cosmic atlas layout', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  const userId = 'e2e-user-first-day';
  const systemId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const planetId = 'e2e-planet-first-day';
  const nowIso = new Date().toISOString();
  let queueReady = false;
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
  };

  const meUser = {
    id: userId,
    tgId: '99281932',
    tgUsername: 'rogue',
    tgFirstName: 'Andrew',
    createdAt: nowIso,
    premiumUntil: null,
    powerScore: 0,
    diamonds: 0,
    tutorialStep: 4,
    tutorialCompletedAt: nowIso,
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
            { planetId, resourceId: 'iron', amount: '1000', lastUpdateAt: nowIso, regenRate: '1200', storageCap: '5000' },
            { planetId, resourceId: 'water', amount: '1000', lastUpdateAt: nowIso, regenRate: '300', storageCap: '5000' },
            { planetId, resourceId: 'silicon', amount: '600', lastUpdateAt: nowIso, regenRate: '0', storageCap: '5000' },
            { planetId, resourceId: 'methane', amount: '400', lastUpdateAt: nowIso, regenRate: '0', storageCap: '5000' },
            { planetId, resourceId: 'tritium', amount: '50', lastUpdateAt: nowIso, regenRate: '0', storageCap: '5000' },
          ],
          buildings: [] as Array<Record<string, unknown>>,
        },
      ],
    },
    ships: [],
    expeditions: [],
    research: [],
    planets: [
      {
        id: planetId,
        name: 'aaaa-1',
        biome: 'rocky',
        size: 12,
        slotCount: 2,
        resources: [
          { planetId, resourceId: 'iron', amount: '1000', lastUpdateAt: nowIso, regenRate: '1200', storageCap: '5000' },
          { planetId, resourceId: 'water', amount: '1000', lastUpdateAt: nowIso, regenRate: '300', storageCap: '5000' },
          { planetId, resourceId: 'silicon', amount: '600', lastUpdateAt: nowIso, regenRate: '0', storageCap: '5000' },
          { planetId, resourceId: 'methane', amount: '400', lastUpdateAt: nowIso, regenRate: '0', storageCap: '5000' },
          { planetId, resourceId: 'tritium', amount: '50', lastUpdateAt: nowIso, regenRate: '0', storageCap: '5000' },
        ],
        buildings: [],
      }
    ],
  };

  await page.route('**/auth/telegram**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        token: 'e2e-token',
        user: {
          id: userId,
          tgId: '99281932',
          tgUsername: 'rogue',
          tgFirstName: 'Andrew',
          createdAt: nowIso,
          premiumUntil: null,
          powerScore: 0,
          tutorialStep: 4,
          tutorialCompletedAt: nowIso,
        },
      }),
    });
  });

  await page.route('**/me**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ user: meUser }),
    });
  });

  await page.route('**/buildings/types**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify([
        {
          id: 'mine',
          name: { ru: 'Шахта', en: 'Mine' },
          description: { ru: 'Добывает железо на выбранной планете.', en: 'Extracts iron on the selected planet.' },
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

  await page.route('**/buildings/queue**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        queue: queueReady
          ? [
              {
                id: 'queue-item-1',
                planetId,
                buildingTypeId: 'mine',
                level: 1,
                queueAction: 'build',
                queueCompletesAt: new Date(Date.now() + 120_000).toISOString(),
                queueStartedAt: new Date(Date.now() - 10_000).toISOString(),
              },
            ]
          : [],
      }),
    });
  });

  await page.route('**/buildings/build**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    queueReady = true;
    meUser.homeSystem.planets[0].buildings.push({
      id: 'building-mine-1',
      planetId,
      typeId: 'mine',
      level: 1,
      slotIndex: 0,
      queueAction: 'build',
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`**/resources/planets/${planetId}**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ resources: meUser.homeSystem.planets[0].resources }),
    });
  });

  await page.route(`**/planets/${planetId}/resources**`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ resources: meUser.homeSystem.planets[0].resources }),
    });
  });

  await page.goto('/');

  await expect(page.getByTestId('cosmic-topbar')).toBeVisible();
  await expect(page.getByTestId('planet-portrait')).toBeVisible();
  await expect(page.getByTestId('planet-rail')).toBeVisible();
  await expect(page.getByTestId('slot-0')).toBeVisible();

  await page.getByTestId('slot-0').click();
  await expect(page).toHaveURL(new RegExp(`/planet/${planetId}`));
  await expect(page.getByTestId('build-dialog')).toBeVisible();
  const buildResponse = page.waitForResponse((response) =>
    response.url().includes('/buildings/build') && response.request().method() === 'POST'
  );
  await page.getByTestId('build-option-mine').click();
  await buildResponse;
  await page.getByTestId('build-dialog').waitFor({ state: 'hidden', timeout: 10_000 });

  // BuildQueue polls every 15s, so wait for the next poll cycle after build.
  await expect(page.getByTestId('queue-strip')).toBeVisible({ timeout: 25_000 });

  await page.evaluate(() => (document.querySelector('[data-testid="bnav-tech"]') as HTMLElement).click());
  await expect(page).toHaveURL(/\/research$/);

  await page.getByTestId('bnav-ships').click();
  await expect(page).toHaveURL(/\/ships$/);

  await page.getByTestId('bnav-map').click();
  await expect(page).toHaveURL(/\/map$/);
});
