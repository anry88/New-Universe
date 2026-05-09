import { useMemo, useState } from 'react';
import { getResourceSymbol } from './cosmic/resources';
import type { MarketOffer, MarketSide } from '@shared/types/market';

interface ResourceBalance {
  resourceId: string;
  amount: string;
  storageCap: string;
}

interface MarketOrderDialogProps {
  isOpen: boolean;
  side: MarketSide;
  offers: MarketOffer[];
  resourceBalances: ResourceBalance[];
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (payload: { side: MarketSide; resourceId: string; quantity: number; expectedUnitPrice: number }) => void;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

export function MarketOrderDialog({
  isOpen,
  side,
  offers,
  resourceBalances,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: MarketOrderDialogProps) {
  const [resourceId, setResourceId] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('100');

  const sideOffers = useMemo(
    () => offers.filter((offer) => offer.side === side).sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
    [offers, side]
  );

  const selectedResourceId = resourceId || sideOffers[0]?.resourceId || '';
  const selectedOffer = sideOffers.find((offer) => offer.resourceId === selectedResourceId) ?? null;
  const selectedBalance = resourceBalances.find((balance) => balance.resourceId === selectedResourceId);
  const quantity = Number(quantityInput);

  if (!isOpen) return null;

  return (
    <div className="bd-backdrop" onClick={onClose}>
      <div className="bd-sheet" role="dialog" aria-modal="true" aria-label="Create market order" onClick={(e) => e.stopPropagation()}>
        <div className="bd-handle" />
        <div className="bd-head">
          <div className="bd-tag">MARKET ORDER</div>
          <div className="bd-title">{side === 'buy' ? 'Buy Resource' : 'Sell Resource'}</div>
          <div className="bd-sub">Choose resource and quantity. Prices are from NPC utility market.</div>
        </div>

        <div className="bd-list" style={{ gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Resource</span>
            <select
              value={selectedResourceId}
              onChange={(event) => setResourceId(event.target.value)}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 10 }}
            >
              {sideOffers.map((offer) => (
                <option key={`${offer.side}-${offer.resourceId}`} value={offer.resourceId}>
                  {offer.resourceId.toUpperCase()} ({getResourceSymbol(offer.resourceId)})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Quantity</span>
            <input
              type="number"
              min={1}
              step="1"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 10 }}
            />
          </label>

          {selectedOffer && (
            <div className="bopt" style={{ cursor: 'default' }}>
              <div className="bopt-icon">{getResourceSymbol(selectedOffer.resourceId)}</div>
              <div>
                <div className="bopt-row">
                  <span className="bopt-name">Price per unit</span>
                  <span className="bopt-locked">{formatPrice(selectedOffer.pricePerUnit)} Fe</span>
                </div>
                <div className="bopt-meta">
                  <span className="bopt-cost">
                    Total: {formatPrice((Number.isFinite(quantity) ? quantity : 0) * selectedOffer.pricePerUnit)} Fe
                  </span>
                  {selectedBalance && (
                    <span className="bopt-time">
                      Bal: {Math.floor(Number(selectedBalance.amount))}/{Math.floor(Number(selectedBalance.storageCap))}
                    </span>
                  )}
                </div>
              </div>
              <span />
            </div>
          )}

          {errorMessage && (
            <div style={{ border: '1px solid #ef4444', color: '#fecaca', background: 'rgba(127, 29, 29, 0.35)', borderRadius: 8, padding: 10 }}>
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            className="cosmic-cta"
            disabled={!selectedOffer || !Number.isFinite(quantity) || quantity <= 0 || isSubmitting}
            style={{ width: '100%', padding: '12px' }}
            onClick={() => {
              if (!selectedOffer || !Number.isFinite(quantity) || quantity <= 0) return;
              onSubmit({
                side,
                resourceId: selectedOffer.resourceId,
                quantity,
                expectedUnitPrice: selectedOffer.pricePerUnit,
              });
            }}
          >
            {isSubmitting ? 'Submitting…' : side === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
