import { useEffect, useMemo, useState } from 'react';
import { getResourceLabel, getResourceSymbol } from './cosmic/resources';
import { apiFetch } from '../lib/api';

interface ResourceDiamondPurchaseDialogProps {
  open: boolean;
  planetId: string | null;
  resourceId: string | null;
  diamondBalance: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
}

export function ResourceDiamondPurchaseDialog({
  open,
  planetId,
  resourceId,
  diamondBalance,
  busy,
  onClose,
  onConfirm,
}: ResourceDiamondPurchaseDialogProps) {
  const [amount, setAmount] = useState('100');
  const parsedAmount = useMemo(() => Math.max(0, Math.floor(Number(amount))), [amount]);
  const [quote, setQuote] = useState<{ diamondsNeeded: number; unitsPerDiamond: number; tier: number } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!open || !resourceId || !planetId || parsedAmount <= 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    apiFetch<{ diamondsNeeded: number; unitsPerDiamond: number; tier: number }>(
      '/resources/buy-with-diamonds/quote',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planetId,
          resourceId,
          amount: parsedAmount,
        }),
      },
    )
      .then((data) => {
        if (!cancelled) setQuote(data);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, resourceId, planetId, parsedAmount]);

  if (!open || !resourceId) return null;

  return (
    <div className="resource-inv-overlay" role="dialog" aria-modal="true" aria-labelledby="resource-buy-title">
      <button type="button" className="resource-inv-backdrop" aria-label="Close" onClick={onClose} />
      <div className="resource-inv-panel">
        <div className="resource-inv-head">
          <h2 id="resource-buy-title" className="resource-inv-title">
            Buy {getResourceLabel(resourceId)}
          </h2>
          <button type="button" className="resource-inv-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <section className="resource-inv-section">
          <div className="resource-inv-section-label">Purchase</div>
          <div className="resource-inv-hint">
            {getResourceSymbol(resourceId)} {getResourceLabel(resourceId)}
          </div>
          <label className="resource-buy-input-wrap">
            <span className="resource-inv-sub">Amount</span>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="resource-buy-input"
              disabled={busy}
            />
          </label>
          <div className="resource-inv-hint">Diamonds on account: ◆ {diamondBalance.toLocaleString()}</div>
          <div className="resource-inv-hint">
            {quoteLoading
              ? 'Calculating price…'
              : quote
                ? `Price now: ◆ ${quote.diamondsNeeded.toLocaleString()} (tier ${quote.tier}, ${quote.unitsPerDiamond} units/diamond)`
                : 'Price unavailable'}
          </div>
          <button
            type="button"
            className="resource-buy-confirm-btn"
            disabled={busy || parsedAmount <= 0 || !quote}
            onClick={() => onConfirm(parsedAmount)}
          >
            {busy ? 'Processing…' : 'Buy with diamonds'}
          </button>
        </section>
      </div>
    </div>
  );
}
