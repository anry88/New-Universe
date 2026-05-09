import { expect, test } from '@playwright/test';

test('colonization flow: eligibility and founding', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  const userId = 'e2e-colony-user';
  const homeSystemId = 'home-system';
  const homePlanetId = 'home-planet';
  const targetPlanetId = 'target-planet';
  const nowIso = new Date().toISOString();

  const user = {
    id: userId,
    tgId: '12345678',
    tgUsername: 'pioneer',
    tgFirstName: 'Elon',
    createdAt: nowIso,
    tutorialCompletedAt: nowIso,
    homeSystem: {
      id: homeSystemId,
      ownerId: userId,
      isHome: true,
      name: 'Alpha Centauri',
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      seed: 123,
      planets: [
        {
          id: homePlanetId,
          name: 'Earth',
          biome: 'green',
          size: 15,
          slotCount: 12,
          resources: [],
          buildings: [],
        },
        {
          id: targetPlanetId,
          name: 'Target Planet',
          biome: 'rocky',
          size: 12,
          slotCount: 10,
          resources: [],
          buildings: [],
        }
      ],
    },
    ships: [
      {
        id: 'colonizer-1',
        typeId: 'colonizer',
        locationPlanetId: targetPlanetId,
        status: 'idle',
        fuel: '100',
      }
    ],
    expeditions: [],
    research: [
      { branch: 'engineering', level: 5 },
      { branch: 'logistics', level: 1 },
    ],
    planets: [
      {
        id: homePlanetId,
        name: 'Earth',
        biome: 'green',
        size: 15,
        slotCount: 12,
        resources: [],
        buildings: [],
      }
    ]
  };

  // Mock API
  await page.route('**/auth/telegram', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'mock-token', user: { id: userId } }),
    });
  });

  await page.route('**/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });

  await page.route(`**/colonies/eligibility/${targetPlanetId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eligibility: {
          allowed: true,
          details: {
            currentColonies: 1,
            maxColonies: 2,
            cooldownRemainingSec: 0,
            requiredResearch: { branch: 'engineering', level: 2 },
            currentResearch: 5,
          }
        },
        rules: {
          foundingCost: { iron: 5000, silicon: 2000 }
        }
      }),
    });
  });

  await page.route('**/colonies/found', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`**/planets/${targetPlanetId}/resources`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ resources: [] }),
    });
  });

  // Start test
  await page.goto('/map');
  await expect(page.getByText('DRAG TO PAN')).toBeVisible();

  // Select the target planet on the map
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="planet-btn-"]').length >= 2);
  const planetBtnSelector = `[data-testid="planet-btn-${targetPlanetId}"]`;
  await page.waitForSelector(planetBtnSelector);
  await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).click(), planetBtnSelector);

  // Info card should appear
  await expect(page.getByTestId('selection-card')).toBeVisible();
  await expect(page.getByText(/SELECTED/i)).toBeVisible();

  // Info card should appear with "Colonize" button
  await page.waitForSelector('[data-testid="colonize-button"]');
  await page.evaluate(() => (document.querySelector('[data-testid="colonize-button"]') as HTMLElement).click());

  // Dialog should appear
  await expect(page.getByText(/Founding Requirements/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Research/i)).toBeVisible();
  await expect(page.getByText(/5 \/ 2/i)).toBeVisible();

  // Click "FOUND COLONY"
  const confirmBtn = page.getByTestId('found-colony-button');
  await expect(confirmBtn).toBeEnabled();
  await page.evaluate(() => (document.querySelector('[data-testid="found-colony-button"]') as HTMLElement).click());

  // Verify dialog closes
  await expect(page.getByText(/Founding Requirements/i)).toBeHidden({ timeout: 10_000 });
});

test('colonization flow: blocked attempt (cooldown)', async ({ page }) => {
  const targetPlanetId = 'target-planet-cooldown';
  const targetPlanetName = 'TARGET-COOLDOWN';
  
  const user = {
    id: 'user-id',
    tgId: '12345',
    createdAt: new Date().toISOString(),
    tutorialCompletedAt: new Date().toISOString(),
    homeSystem: {
        id: 'home',
        name: 'Home',
        sectorX: 0,
        sectorY: 0,
        sectorZ: 0,
        seed: 456,
        planets: [
            { 
              id: targetPlanetId, 
              name: targetPlanetName, 
              biome: 'rocky',
              size: 10,
              slotCount: 8,
              resources: [],
              buildings: [],
            }
        ]
    },
    ships: [],
    expeditions: [],
    research: [],
    planets: [
      {
        id: 'home-planet',
        name: 'Earth',
        biome: 'green',
        size: 15,
        slotCount: 12,
        resources: [],
        buildings: [],
      }
    ]
  };

  await page.route('**/auth/telegram', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ token: 't', user: { id: 'u' } }) });
  });
  await page.route('**/me', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ user }) });
  });

  // Mock eligibility with cooldown
  await page.route(`**/colonies/eligibility/${targetPlanetId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eligibility: {
          allowed: false,
          reason: 'Colonization on cooldown',
          details: {
            currentColonies: 1,
            maxColonies: 2,
            cooldownRemainingSec: 3600,
            requiredResearch: { branch: 'engineering', level: 2 },
            currentResearch: 5,
          }
        },
        rules: { foundingCost: {} }
      }),
    });
  });

  await page.goto('/map');
  await expect(page.getByText('DRAG TO PAN')).toBeVisible();
  const cooldownPlanetSelector = `[data-testid="planet-btn-${targetPlanetId}"]`;
  await page.waitForSelector(cooldownPlanetSelector);
  await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).click(), cooldownPlanetSelector);
  await expect(page.getByTestId('selection-card')).toBeVisible();
  await expect(page.getByText(/SELECTED/i)).toBeVisible();

  await page.waitForSelector('[data-testid="colonize-button"]');
  await page.evaluate(() => (document.querySelector('[data-testid="colonize-button"]') as HTMLElement).click());

  // FOUND COLONY should be disabled
  const confirmBtn = page.getByTestId('found-colony-button');
  await expect(confirmBtn).toBeDisabled({ timeout: 10_000 });
  await expect(page.getByText(/60m \/ Ready/i)).toBeVisible();
  await expect(page.getByText(/Colonization on cooldown/i)).toBeVisible();
});
