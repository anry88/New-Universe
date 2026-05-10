import React, { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResourceBar } from '../components/ResourceBar';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { getResourceSymbol } from '../components/cosmic/resources';
import { MarketOrderDialog } from '../components/MarketOrderDialog';
import { useCreateMarketOrder, useMarketOffers, usePendingMarketOrders, normalizeMarketError } from '../hooks/useMarket';
import { useMe } from '../hooks/useMe';
import type { MarketOffer, MarketSide } from '@shared/types/market';

function formatEta(submittedAt: string, etaSec: number): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 1000));
  const remaining = Math.max(0, etaSec - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export function MarketPage() {
  const navigate = useNavigate();
  const { data: meData } = useMe();
  const offersQuery = useMarketOffers();
  const createOrder = useCreateMarketOrder();
  const { data: pendingOrders = [] } = usePendingMarketOrders();

  const [dialogSide, setDialogSide] = useState<MarketSide | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const homePlanetId = meData?.homeSystem?.planets?.[0]?.id;
  const resourceBalances = meData?.homeSystem?.planets?.[0]?.resources ?? [];

  const groupedOffers = useMemo(() => {
    const grouped = new Map<string, { buy?: MarketOffer; sell?: MarketOffer }>();
    for (const offer of offersQuery.data?.offers ?? []) {
      const current = grouped.get(offer.resourceId) ?? {};
      if (offer.side === 'buy') current.buy = offer;
      if (offer.side === 'sell') current.sell = offer;
      grouped.set(offer.resourceId, current);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [offersQuery.data?.offers]);

  return (
    <div className="cosmic-screen" style={{ '--accent': '#f4b84a' } as React.CSSProperties}>
      <CosmicBackground accent="#f4b84a" starSeed={21} />
      <ResourceBar planetId={homePlanetId} />

      <div className="page-head" style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate('/')}
            style={{ padding: 4, borderRadius: 999, color: 'var(--text-dim)' }}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="page-tag">UTILITY MARKET</div>
            <div className="page-title">Market</div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">{groupedOffers.length}</div>
          <div className="ps-l">RESOURCES</div>
        </div>
      </div>

      <div className="cosmic-scroll">
        <div style={{ display: 'grid', gap: 10, paddingBottom: 20 }}>
          {offersQuery.isLoading && <div className="ship-row">Loading market prices…</div>}
          {offersQuery.isError && <div className="ship-row">Failed to load market prices.</div>}

          {groupedOffers.map(([resourceId, pair]) => (
            <div key={resourceId} className="ship-row">
              <div className="ship-cls">{getResourceSymbol(resourceId)}</div>
              <div>
                <div className="ship-name">{resourceId.toUpperCase()}</div>
                <div className="ship-loc">
                  Buy: {pair.buy?.pricePerUnit.toFixed(2) ?? '—'} Fe · Sell: {pair.sell?.pricePerUnit.toFixed(2) ?? '—'} Fe
                </div>
              </div>
              <div className="ship-stats">
                <button
                  type="button"
                  className="cosmic-cta"
                  style={{ padding: '6px 12px', fontSize: 11 }}
                  onClick={() => {
                    setDialogError(null);
                    setDialogSide('buy');
                  }}
                >
                  BUY
                </button>
                <button
                  type="button"
                  className="cosmic-cta"
                  style={{ padding: '6px 12px', fontSize: 11 }}
                  onClick={() => {
                    setDialogError(null);
                    setDialogSide('sell');
                  }}
                >
                  SELL
                </button>
              </div>
            </div>
          ))}

          <div className="section-head">
            <div className="section-title">PENDING ORDERS</div>
          </div>
          {pendingOrders.length === 0 && <div className="ship-row">No pending market orders.</div>}
          {pendingOrders.map((order) => (
            <div key={order.id} className="ship-row">
              <div className="ship-cls">{order.side.toUpperCase()}</div>
              <div>
                <div className="ship-name">{order.resourceId.toUpperCase()}</div>
                <div className="ship-loc">
                  Qty {order.requestedQty} · ETA {formatEta(order.submittedAt, order.etaSec)}
                </div>
              </div>
              <div className="ship-stats">
                <div className="ship-stat">
                  <span>Status</span>
                  <b>{order.status}</b>
                </div>
              </div>
            </div>
          ))}
          
        </div>
      </div>

      <CosmicBottomNav active="market" />

      <MarketOrderDialog
        isOpen={Boolean(dialogSide)}
        side={dialogSide ?? 'buy'}
        offers={offersQuery.data?.offers ?? []}
        resourceBalances={resourceBalances}
        isSubmitting={createOrder.isPending}
        errorMessage={dialogError}
        onClose={() => setDialogSide(null)}
        onSubmit={async (payload) => {
          if (!homePlanetId) {
            setDialogError('Home planet not found. Reload /me and try again.');
            return;
          }
          try {
            setDialogError(null);
            await createOrder.mutateAsync({
              planetId: homePlanetId,
              ...payload,
            });
            setDialogSide(null);
          } catch (error) {
            setDialogError(normalizeMarketError(error));
          }
        }}
      />
    </div>
  );
}
