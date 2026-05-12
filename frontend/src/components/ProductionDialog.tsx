import React, { useEffect, useMemo, useState } from 'react';
import type {
  ProductionOrder,
  ProductionOrdersResponse,
  ProductionPreviewResponse,
  ProductionRecipeSummary,
  ProductionStartResponse,
} from '@shared/types/production';
import type { Building } from '@shared/types/world';
import { apiFetch } from '../lib/api';
import { canStartProduction, defaultProductionRecipeId, productionBlockedText } from '../lib/production';
import { formatTimerDuration } from '../lib/timers';
import { useI18n } from '../lib/i18n';
import { getResourceSymbol } from './cosmic/resources';

interface ProductionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  building?: Building | null;
  planetId: string;
  accent?: string;
  onStarted?: () => void;
}

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value < 10 ? 2 : 1,
  });
}

export const ProductionDialog: React.FC<ProductionDialogProps> = ({
  isOpen,
  onClose,
  building,
  planetId,
  accent = '#5BD7FF',
  onStarted,
}) => {
  const { locale, t } = useI18n();
  const [recipes, setRecipes] = useState<ProductionRecipeSummary[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [preview, setPreview] = useState<ProductionPreviewResponse | null>(null);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !building) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiFetch<{ recipes: ProductionRecipeSummary[] }>(
        `/resources/production/recipes?planetId=${planetId}&buildingId=${building.id}`,
      ),
      apiFetch<ProductionOrdersResponse>(`/resources/production/orders?planetId=${planetId}`),
    ])
      .then(([recipeResponse, orderResponse]) => {
        if (cancelled) return;
        setRecipes(recipeResponse.recipes);
        setSelectedRecipeId(defaultProductionRecipeId(recipeResponse.recipes));
        setOrders(orderResponse.orders);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('production.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, building, planetId, t]);

  useEffect(() => {
    if (!isOpen || !building || !selectedRecipeId || quantity <= 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    apiFetch<ProductionPreviewResponse>('/resources/production/preview', {
      method: 'POST',
      body: JSON.stringify({
        planetId,
        buildingId: building.id,
        recipeId: selectedRecipeId,
        quantity,
      }),
    })
      .then((response) => {
        if (!cancelled) setPreview(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : t('production.previewFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, building, planetId, selectedRecipeId, quantity, t]);

  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId),
    [recipes, selectedRecipeId],
  );
  const queuedOrders = orders.filter((order) => order.status === 'queued' && order.buildingId === building?.id);
  const blocked = productionBlockedText(preview, locale);

  if (!isOpen || !building) return null;

  const startProduction = async () => {
    if (!canStartProduction(preview, isStarting)) return;
    if (!window.confirm(t('production.confirmStart'))) return;

    setIsStarting(true);
    setError(null);
    try {
      await apiFetch<ProductionStartResponse>('/resources/production/start', {
        method: 'POST',
        body: JSON.stringify({
          planetId,
          buildingId: building.id,
          recipeId: selectedRecipeId,
          quantity,
        }),
      });
      const orderResponse = await apiFetch<ProductionOrdersResponse>(`/resources/production/orders?planetId=${planetId}`);
      setOrders(orderResponse.orders);
      onStarted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('production.startFailed'));
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div
      className="bd-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <div
        className="bd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('production.title')}
        onClick={(event) => event.stopPropagation()}
        style={{ '--accent': accent } as React.CSSProperties}
      >
        <div className="bd-handle" />
        <div className="bd-head">
          <div className="bd-tag">{t('production.tag').toUpperCase()}</div>
          <div className="bd-title">{t('production.title')}</div>
          <div className="bd-sub">{t('production.subtitle')}</div>
        </div>

        {error ? (
          <div className="bd-block-hint" role="status">
            <div className="bd-block-hint-text">{error}</div>
          </div>
        ) : null}

        <div className="bd-list">
          {isLoading ? (
            <div className="bopt" style={{ cursor: 'default' }}>{t('production.loading')}</div>
          ) : null}

          {recipes.length > 0 ? (
            <section className="bd-category">
              <div className="bd-category-head">
                <span className="bd-category-title">{t('production.recipe')}</span>
                <span className="bd-category-count">{recipes.length}</span>
              </div>
              <div className="bd-category-list">
                {recipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    className={`bopt${recipe.id === selectedRecipeId ? ' active' : ''}`}
                    onClick={() => setSelectedRecipeId(recipe.id)}
                  >
                    <div>
                      <div className="bopt-row">
                        <span className="bopt-name">{recipe.name[locale]}</span>
                        <span className="bopt-locked">{getResourceSymbol(recipe.output.resourceId)}</span>
                      </div>
                      <div className="bopt-desc">{recipe.description[locale]}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : !isLoading ? (
            <div className="bopt" style={{ cursor: 'default' }}>{t('production.noRecipes')}</div>
          ) : null}

          {selectedRecipe ? (
            <section className="bd-category">
              <div className="bd-category-head">
                <span className="bd-category-title">{t('production.quantity')}</span>
              </div>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                style={{
                  width: '100%',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.22)',
                  color: 'var(--text)',
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </section>
          ) : null}

          {preview ? (
            <section className="bd-category">
              <div className="bd-category-head">
                <span className="bd-category-title">{t('production.preview')}</span>
              </div>
              <div className="bopt" style={{ cursor: 'default' }}>
                <div>
                  <div className="bopt-row">
                    <span className="bopt-name">
                      +{formatAmount(preview.output.amount)} {getResourceSymbol(preview.output.resourceId)}
                    </span>
                    <span className="bopt-locked">{formatTimerDuration(preview.durationSec)}</span>
                  </div>
                  <div className="bopt-desc">
                    {preview.inputs.map((input) => (
                      <span key={input.resourceId} style={{ display: 'inline-block', marginRight: 10 }}>
                        -{formatAmount(input.amount)} {getResourceSymbol(input.resourceId)}
                      </span>
                    ))}
                  </div>
                  {blocked ? <div className="bopt-desc" style={{ color: '#FFB27A' }}>{blocked}</div> : null}
                </div>
              </div>
            </section>
          ) : null}

          {queuedOrders.length > 0 ? (
            <section className="bd-category">
              <div className="bd-category-head">
                <span className="bd-category-title">{t('production.activeOrders')}</span>
                <span className="bd-category-count">{queuedOrders.length}</span>
              </div>
              {queuedOrders.map((order) => (
                <div key={order.id} className="bopt" style={{ cursor: 'default' }}>
                  <div>
                    <div className="bopt-row">
                      <span className="bopt-name">
                        {order.outputs.map((output) => `+${formatAmount(output.amount)} ${getResourceSymbol(output.resourceId)}`).join(', ')}
                      </span>
                      <span className="bopt-locked">{new Date(order.completesAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          <button
            type="button"
            onClick={startProduction}
            disabled={!canStartProduction(preview, isStarting)}
            className="cosmic-cta"
            style={{ width: '100%', padding: '14px', marginTop: 8 }}
          >
            {isStarting ? t('common.processing') : t('production.start')}
          </button>
        </div>
      </div>
    </div>
  );
};
