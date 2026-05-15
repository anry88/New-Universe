import { getResourceLabel, ResourceIcon } from './cosmic/resources';
import { useI18n } from '../lib/i18n';

export interface InventoryRow {
  resourceId: string;
  amount: number;
  cap: number;
  ratePerHour: number;
}

interface ResourceInventoryDrawerProps {
  open: boolean;
  onClose: () => void;
  planetTitle: string;
  rows: InventoryRow[];
  /** When set, shows account-level premium balance (not planet stock). */
  diamondBalance?: number;
  onResourceClick?: (resourceId: string) => void;
}

/**
 * Full-screen inventory sheet: planet stockpile vs optional global diamonds (account).
 */
export function ResourceInventoryDrawer({
  open,
  onClose,
  planetTitle,
  rows,
  diamondBalance,
  onResourceClick,
}: ResourceInventoryDrawerProps) {
  const { locale, t } = useI18n();
  if (!open) return null;

  const sorted = [...rows].sort((a, b) =>
    getResourceLabel(a.resourceId, locale).localeCompare(getResourceLabel(b.resourceId, locale)),
  );

  return (
    <div
      className="resource-inv-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-inv-title"
      data-testid="resource-inventory-drawer"
    >
      <button type="button" className="resource-inv-backdrop" aria-label={t('common.close')} onClick={onClose} />
      <div className="resource-inv-panel">
        <div className="resource-inv-head">
          <h2 id="resource-inv-title" className="resource-inv-title">
            {t('resources.all')}
          </h2>
          <button type="button" className="resource-inv-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <section className="resource-inv-section">
          <div className="resource-inv-section-label">{t('resources.stockpile')}</div>
          <div className="resource-inv-hint">{planetTitle}</div>
          <ul className="resource-inv-list">
            {sorted.map((r) => {
              const pct = r.cap > 0 ? Math.min(100, Math.round((r.amount / r.cap) * 100)) : 0;
              const clickable = typeof onResourceClick === 'function';
              return (
                <li key={r.resourceId} className={'resource-inv-row' + (clickable ? ' resource-inv-row-clickable' : '')}>
                  <div className="resource-inv-row-top">
                    <div className="resource-inv-row-main">
                      <span className="resource-inv-sym">
                        <ResourceIcon resourceId={r.resourceId} size={22} />
                      </span>
                      <div className="resource-inv-meta">
                        <span className="resource-inv-name">{getResourceLabel(r.resourceId, locale)}</span>
                        <span className="resource-inv-sub">
                          {r.ratePerHour > 0 ? `+${Math.round(r.ratePerHour)}/h` : '—'} · {t('common.cap')}{' '}
                          {Math.floor(r.cap).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="resource-inv-amt">{Math.floor(r.amount).toLocaleString()}</div>
                  </div>
                  <div className="resource-inv-bar">
                    <div className="resource-inv-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  {clickable && (
                    <button
                      type="button"
                      className="resource-inv-buy-btn"
                      onClick={() => onResourceClick?.(r.resourceId)}
                    >
                      {t('resources.buyWithDiamonds')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {diamondBalance !== undefined && (
          <section className="resource-inv-section resource-inv-section--account">
            <div className="resource-inv-section-label">{t('resources.account')}</div>
            <div className="resource-inv-account-row">
              <span className="resource-inv-sym" aria-hidden>
                ◆
              </span>
              <span className="resource-inv-name">{t('resources.diamonds')}</span>
              <span className="resource-inv-amt">{diamondBalance.toLocaleString()}</span>
            </div>
            <p className="resource-inv-footnote">{t('resources.footnote')}</p>
          </section>
        )}
      </div>
    </div>
  );
}
