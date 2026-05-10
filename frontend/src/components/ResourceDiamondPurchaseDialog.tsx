import { useMemo, useState } from 'react';
import { getResourceLabel, getResourceSymbol } from './cosmic/resources';

interface ResourceDiamondPurchaseDialogProps {
  open: boolean;
  resourceId: string | null;
  diamondBalance: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
}

export function ResourceDiamondPurchaseDialog({
  open,
  resourceId,
  diamondBalance,
  busy,
  onClose,
  onConfirm,
}: ResourceDiamondPurchaseDialogProps) {
  const [amount, setAmount] = useState('100');
  const parsedAmount = useMemo(() => Math.max(0, Math.floor(Number(amount))), [amount]);

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
            {getResourceSymbol(resourceId)} {getResourceLabel(resourceId)} · price scales by resource rarity.
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
          <button
            type="button"
            className="resource-buy-confirm-btn"
            disabled={busy || parsedAmount <= 0}
            onClick={() => onConfirm(parsedAmount)}
          >
            {busy ? 'Processing…' : 'Buy with diamonds'}
          </button>
        </section>
      </div>
    </div>
  );
}
