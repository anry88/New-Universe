import type { ProductionPreviewResponse, ProductionRecipeSummary } from '@shared/types/production';

export function defaultProductionRecipeId(recipes: ProductionRecipeSummary[]): string {
  return recipes[0]?.id ?? '';
}

export function canStartProduction(preview: ProductionPreviewResponse | null, isProcessing: boolean): boolean {
  return Boolean(preview?.canStart && !preview.blockedReason && !isProcessing);
}

export function productionBlockedText(preview: ProductionPreviewResponse | null, locale: 'en' | 'ru'): string | null {
  if (!preview?.blockedReason) return null;
  return preview.blockedReason.message[locale] ?? preview.blockedReason.message.en;
}
