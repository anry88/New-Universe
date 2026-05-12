import { describe, expect, it } from 'vitest';
import { canStartProduction, defaultProductionRecipeId, productionBlockedText } from './production';
import type { ProductionPreviewResponse, ProductionRecipeSummary } from '@shared/types/production';

describe('production UI helpers', () => {
  const recipe = {
    id: 'steel_from_iron_water',
    buildingTypeId: 'smelter',
  } as ProductionRecipeSummary;

  const preview: ProductionPreviewResponse = {
    recipeId: recipe.id,
    buildingId: 'b1',
    planetId: 'p1',
    quantity: 10,
    output: { resourceId: 'steel', amount: 10 },
    inputs: [{ resourceId: 'iron', amount: 20 }],
    durationSec: 120,
    completesAt: new Date().toISOString(),
    canStart: true,
  };

  it('selects the first recipe by default', () => {
    expect(defaultProductionRecipeId([recipe])).toBe('steel_from_iron_water');
    expect(defaultProductionRecipeId([])).toBe('');
  });

  it('disables start while processing or server-blocked', () => {
    expect(canStartProduction(preview, false)).toBe(true);
    expect(canStartProduction(preview, true)).toBe(false);
    expect(canStartProduction({ ...preview, canStart: false }, false)).toBe(false);
    expect(canStartProduction({
      ...preview,
      canStart: false,
      blockedReason: {
        code: 'production_insufficient_resources',
        message: { en: 'Not enough iron.', ru: 'Недостаточно железа.' },
      },
    }, false)).toBe(false);
  });

  it('returns localized block copy from server preview', () => {
    const blocked = {
      ...preview,
      canStart: false,
      blockedReason: {
        code: 'production_insufficient_resources',
        message: { en: 'Not enough iron.', ru: 'Недостаточно железа.' },
      },
    } satisfies ProductionPreviewResponse;
    expect(productionBlockedText(blocked, 'ru')).toBe('Недостаточно железа.');
    expect(productionBlockedText(blocked, 'en')).toBe('Not enough iron.');
  });
});
