import { expect, test } from '@playwright/test';

test('fleet cargo shortcut opens transfer dialog with selected ship and localized resources', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
        amount: '7000',
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
    playerNickname: 'Cargo Pilot',
    playerNicknameChangeCount: 0,
    createdAt: nowIso,
    preferredLocale: 'en',
    diamonds: 0,
    tutorialStep: 4,
    tutorialCompletedAt: nowIso,
    tutorialRewardsClaimed: 31,
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
        jumpFuel: '0',
        refuelFuel: '0',
        refuelJumpFuel: '0',
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
  await page.route('**/me/session/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ startedAt: nowIso }),
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
          fuelCapacity: 100,
          jumpFuelCapacity: 200,
          refuelFuelCapacity: 0,
          refuelJumpFuelCapacity: 0,
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
  let previewRequests = 0;
  await page.route('**/cargo/transfer/preview', async (route) => {
    previewRequests += 1;
    const body = route.request().postDataJSON();
    expect(body.resources).toEqual([]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        preview: {
          routeMode: 'standard',
          deliveryMode: 'one_way',
          resources: [],
          loads: [],
          totalCargo: 0,
          maxCargo: 5000,
          fuelRequired: 3,
          jumpFuelRequired: 0,
          fuelLoaded: 3,
          jumpFuelLoaded: 0,
          distance: 4,
          requestedDistance: 4,
          speed: 1.2,
          engineFactor: 1,
          etaSeconds: 200,
          eta: nowIso,
          originSystemId: 'home-system',
          targetSystemId: 'home-system',
          targetPlanetName: 'Mars',
        },
      }),
    });
  });

  await page.goto('/ships');
  await page.getByRole('button', { name: /Lightweight Transporter/ }).click();
  await expect(page.getByText('OPEN CARGO')).toBeVisible();
  await page.getByText('OPEN CARGO').click();

  await expect(page).toHaveURL(/\/colonies\?cargoOrigin=/);
  const dialog = page.getByTestId('cargo-transfer-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Cargo Transfer')).toBeVisible();
  await expect(dialog.getByText('0 / 5000')).toBeVisible();
  await expect(dialog.getByTestId('cargo-resource-fuel')).toContainText('Fuel');
  await expect(dialog.getByTestId('cargo-resource-iron')).toContainText('Iron');
  await expect(dialog.locator('[data-testid^="cargo-resource-"]').first()).toContainText('Fuel');
  await expect(dialog.getByText('Iron')).toBeVisible();

  await dialog.getByTestId('cargo-resource-iron').click();
  await expect(dialog.getByText('0 / 5000')).toBeVisible();

  await dialog.locator('select').selectOption(colonyPlanetId);
  await expect.poll(() => previewRequests).toBe(1);
  await expect(dialog.getByTestId('cargo-route-fuel-panel')).toBeVisible();

  const footerBox = await dialog.getByTestId('cargo-transfer-footer').boundingBox();
  const ironBox = await dialog.getByTestId('cargo-resource-iron').boundingBox();
  expect(footerBox?.height).toBeLessThan(130);
  expect(ironBox?.y).toBeLessThan(footerBox?.y ?? 0);
  expect((ironBox?.y ?? 0) + (ironBox?.height ?? 0)).toBeLessThanOrEqual(footerBox?.y ?? 0);

  const fuelSlider = dialog.getByTestId('cargo-fuel-slider');
  await expect(fuelSlider).toHaveAttribute('aria-valuenow', '3');
  const fuelSliderBox = await fuelSlider.boundingBox();
  expect(fuelSliderBox).not.toBeNull();
  const fuelSliderCenter = {
    x: fuelSliderBox!.x + fuelSliderBox!.width / 2,
    y: fuelSliderBox!.y + fuelSliderBox!.height / 2,
  };
  const initialFuelSliderLeft = await fuelSlider.evaluate((node) =>
    parseFloat((node as HTMLElement).style.left),
  );
  await page.mouse.move(fuelSliderCenter.x, fuelSliderCenter.y);
  await page.mouse.down();
  await page.mouse.move(fuelSliderCenter.x + 2, fuelSliderCenter.y);
  await expect.poll(async () =>
    fuelSlider.evaluate((node) => parseFloat((node as HTMLElement).style.left)),
  ).toBeGreaterThan(initialFuelSliderLeft);
  await expect(fuelSlider).toHaveAttribute('aria-valuenow', '3');
  await page.mouse.move(fuelSliderCenter.x + 20, fuelSliderCenter.y);
  await expect.poll(async () => Number(await fuelSlider.getAttribute('aria-valuenow')))
    .toBeGreaterThan(3);
  await page.mouse.up();

  const touchFuelSliderLeft = await fuelSlider.evaluate((node) =>
    parseFloat((node as HTMLElement).style.left),
  );
  const touchPoint = await fuelSlider.evaluate((node) => {
    const rect = (node as HTMLElement).getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId: 19,
      pointerType: 'touch',
    }));
    return point;
  });
  await page.waitForTimeout(50);
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: x + 8,
      clientY: y,
      isPrimary: true,
      pointerId: 19,
      pointerType: 'touch',
    }));
  }, touchPoint);
  await expect.poll(async () =>
    fuelSlider.evaluate((node) => parseFloat((node as HTMLElement).style.left)),
  ).toBeGreaterThan(touchFuelSliderLeft);
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      clientX: x + 8,
      clientY: y,
      isPrimary: true,
      pointerId: 19,
      pointerType: 'touch',
    }));
  }, touchPoint);

  const ironAmount = dialog.getByTestId('cargo-resource-iron').locator('input[type="number"]');
  await ironAmount.fill('9999');
  await expect(ironAmount).toHaveValue('5000');
  await expect(dialog.getByText('5000 / 5000')).toBeVisible();
  await page.waitForTimeout(300);
  expect(previewRequests).toBe(1);
});
