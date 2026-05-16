import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock3, Gem, LoaderCircle, Sparkles } from 'lucide-react';
import type { ConfirmStarsCheckoutResponse } from '@shared/types/monetization';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { useConfirmStarsCheckout, useCreateStarsInvoice, useStarsDiamondPacks } from '../hooks/useMonetization';
import { useMe } from '../hooks/useMe';
import { useI18n } from '../lib/i18n';
import { trackFrontendEvent } from '../lib/analytics';
import { useNavigate } from 'react-router-dom';
import {
  CHECKOUT_AUTO_CONFIRM_DELAY_MS,
  CHECKOUT_CONFIRM_ATTEMPTS,
  CHECKOUT_CONFIRM_DELAY_MS,
  ACTIVE_STARS_CHECKOUT_STORAGE_KEY,
  checkoutStatusKey,
  checkoutStatusTone,
  encodeStoredStarsCheckout,
  parseStoredStarsCheckout,
  shouldConfirmInvoiceStatus,
  shouldAutoConfirmCheckout,
  type StarsCheckoutReference,
} from '../lib/stars-checkout';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        openInvoice?: (url: string, callback?: (status: string) => void) => void;
      };
    };
  }
}

type ConfirmCheckoutOptions = {
  attempts?: number;
  keepPendingOnError?: boolean;
  showConfirming?: boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function openInvoiceUrl(url: string, onStatus: (status: string) => void): boolean {
  const openInvoice = window.Telegram?.WebApp?.openInvoice;
  if (typeof openInvoice === 'function') {
    openInvoice(url, onStatus);
    return true;
  }

  window.location.href = url;
  return false;
}

function saveActiveCheckout(checkout: StarsCheckoutReference) {
  window.localStorage.setItem(ACTIVE_STARS_CHECKOUT_STORAGE_KEY, encodeStoredStarsCheckout(checkout));
}

function clearActiveCheckout() {
  window.localStorage.removeItem(ACTIVE_STARS_CHECKOUT_STORAGE_KEY);
}

function readActiveCheckout(): StarsCheckoutReference | null {
  const checkout = parseStoredStarsCheckout(window.localStorage.getItem(ACTIVE_STARS_CHECKOUT_STORAGE_KEY));
  if (!checkout) {
    clearActiveCheckout();
  }
  return checkout;
}

function TelegramStarIcon({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: '50%',
        color: '#fff8d1',
        background: 'linear-gradient(145deg, #fef08a 0%, #fbbf24 45%, #f59e0b 100%)',
        boxShadow: '0 0 0 1px rgba(180, 83, 9, 0.32), inset 0 1px 1px rgba(255, 255, 255, 0.55)',
        fontSize: Math.max(10, Math.round(size * 0.76)),
        lineHeight: 1,
      }}
    >
      ★
    </span>
  );
}

function CheckoutStatusIcon({ status }: { status: string }) {
  const tone = checkoutStatusTone(status);
  if (tone === 'success') return <CheckCircle2 size={20} />;
  if (tone === 'danger') return <AlertTriangle size={20} />;
  if (status === 'confirming' || status === 'pendingDelivery' || status === 'pending') {
    return <LoaderCircle size={20} className="animate-spin" />;
  }
  return <Clock3 size={20} />;
}

function checkoutNoticeStyle(status: string): CSSProperties {
  const tone = checkoutStatusTone(status);
  const palette = {
    info: {
      border: 'rgba(125, 211, 252, 0.38)',
      background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(15, 23, 42, 0.84))',
      color: '#bae6fd',
    },
    success: {
      border: 'rgba(74, 222, 128, 0.46)',
      background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.22), rgba(15, 23, 42, 0.86))',
      color: '#bbf7d0',
    },
    warning: {
      border: 'rgba(251, 191, 36, 0.62)',
      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.26), rgba(15, 23, 42, 0.9))',
      color: '#fde68a',
    },
    danger: {
      border: 'rgba(248, 113, 113, 0.56)',
      background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.22), rgba(15, 23, 42, 0.88))',
      color: '#fecaca',
    },
  }[tone];

  return {
    display: 'grid',
    gridTemplateColumns: '36px minmax(0, 1fr)',
    gap: 12,
    alignItems: 'start',
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    boxShadow: tone === 'warning' ? '0 0 24px rgba(245, 158, 11, 0.18)' : undefined,
  };
}

export function ShopPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: meData } = useMe();
  const packsQuery = useStarsDiamondPacks();
  const invoiceMutation = useCreateStarsInvoice();
  const confirmMutation = useConfirmStarsCheckout();
  const { mutateAsync: confirmStarsCheckout, isPending: checkoutConfirmPending } = confirmMutation;
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const [lastCheckout, setLastCheckout] = useState<StarsCheckoutReference | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmStarsCheckoutResponse | null>(null);
  const [autoConfirmAttempts, setAutoConfirmAttempts] = useState(0);

  useEffect(() => {
    packsQuery.data?.packs.forEach((pack) => {
      trackFrontendEvent('stars_diamond_pack_viewed', {
        packDiamonds: pack.diamonds,
        priceStars: pack.priceStars,
        bonusPercentVsPrevious: pack.bonusPercentVsPrevious,
      });
    });
  }, [packsQuery.data]);

  const confirmCheckout = useCallback(async (checkout: StarsCheckoutReference, options: ConfirmCheckoutOptions = {}) => {
    const attempts = options.attempts ?? CHECKOUT_CONFIRM_ATTEMPTS;
    setLastCheckout(checkout);
    if (options.showConfirming !== false) {
      setCheckoutStatus('confirming');
    }

    try {
      let latest: ConfirmStarsCheckoutResponse | null = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        latest = await confirmStarsCheckout(checkout);
        setConfirmation(latest);

        if (latest.status === 'delivered') {
          clearActiveCheckout();
          setCheckoutStatus('delivered');
          setAutoConfirmAttempts(0);
          return;
        }

        if (latest.status === 'failed') {
          clearActiveCheckout();
          setCheckoutStatus('failedDelivery');
          return;
        }

        if (attempt < attempts - 1) {
          await delay(CHECKOUT_CONFIRM_DELAY_MS);
        }
      }

      setCheckoutStatus(latest?.status === 'failed' ? 'failedDelivery' : 'pendingDelivery');
    } catch {
      setCheckoutStatus(options.keepPendingOnError === false ? 'failedDelivery' : 'pendingDelivery');
    }
  }, [confirmStarsCheckout]);

  useEffect(() => {
    if (lastCheckout || checkoutStatus === 'delivered') return;
    const restoredCheckout = readActiveCheckout();
    if (!restoredCheckout) return;

    setLastCheckout(restoredCheckout);
    setCheckoutStatus('pending');
    setAutoConfirmAttempts(0);
    void confirmCheckout(restoredCheckout, { attempts: 1, keepPendingOnError: true, showConfirming: false });
  }, [checkoutStatus, confirmCheckout, lastCheckout]);

  useEffect(() => {
    if (!shouldAutoConfirmCheckout({
      status: checkoutStatus,
      hasCheckout: Boolean(lastCheckout),
      checkoutBusy: checkoutConfirmPending,
      attempts: autoConfirmAttempts,
    })) {
      return;
    }

    const id = window.setTimeout(() => {
      if (!lastCheckout) return;
      setAutoConfirmAttempts((current) => current + 1);
      void confirmCheckout(lastCheckout, { attempts: 1, keepPendingOnError: true, showConfirming: false });
    }, CHECKOUT_AUTO_CONFIRM_DELAY_MS);

    return () => window.clearTimeout(id);
  }, [autoConfirmAttempts, checkoutConfirmPending, checkoutStatus, confirmCheckout, lastCheckout]);

  const startCheckout = async (packId: string) => {
    setCheckoutStatus(null);
    setConfirmation(null);
    setAutoConfirmAttempts(0);

    try {
      const response = await invoiceMutation.mutateAsync(packId);
      const checkout = {
        packId: response.pack.id,
        checkoutId: response.checkoutId,
      };

      saveActiveCheckout(checkout);
      setLastCheckout(checkout);
      trackFrontendEvent('stars_checkout_started', {
        packDiamonds: response.pack.diamonds,
        priceStars: response.pack.priceStars,
      });

      const handlesStatus = openInvoiceUrl(response.invoiceUrl, (status) => {
        if (shouldConfirmInvoiceStatus(status)) {
          void confirmCheckout(checkout);
          return;
        }

        if (status === 'cancelled' || status === 'failed') {
          clearActiveCheckout();
        }
        setCheckoutStatus(status);
      });

      if (!handlesStatus) {
        setCheckoutStatus('pending');
      }
    } catch {
      setCheckoutStatus(null);
    }
  };

  const checkoutBusy = invoiceMutation.isPending || checkoutConfirmPending;
  const checkoutStatusParams = {
    diamonds: String(confirmation?.pack.diamonds ?? ''),
    balance: String(confirmation?.diamondsRemaining ?? meData?.diamonds ?? 0),
  };

  return (
    <>
      <CosmicBackground accent="#5BD7FF" />
      <div
        style={{
          minHeight: '100vh',
          padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px 104px',
          color: 'var(--text)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            aria-label={t('common.back')}
            onClick={() => navigate(-1)}
            className="rounded-md border border-slate-600/70 bg-slate-950/60 p-2 text-slate-200"
          >
            <ChevronLeft size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t('shop.title')}</h1>
            <p style={{ margin: '3px 0 0', color: 'var(--text-dim)', fontSize: 12 }}>
              {t('shop.balance', { diamonds: String(meData?.diamonds ?? 0) })}
            </p>
          </div>
        </header>

        {packsQuery.isLoading && (
          <div className="cosmic-card" style={{ padding: 16 }}>{t('common.processing')}</div>
        )}

        {packsQuery.error && (
          <div className="cosmic-card" style={{ padding: 16, color: '#fecaca' }}>
            {t('shop.failedLoad')}
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {packsQuery.data?.packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="cosmic-card"
              style={{
                display: 'grid',
                gridTemplateColumns: '44px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                textAlign: 'left',
                borderColor: 'rgba(125, 211, 252, 0.24)',
              }}
              disabled={checkoutBusy}
              onClick={() => void startCheckout(pack.id)}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#e9d5ff',
                  background: 'rgba(91, 215, 255, 0.12)',
                  border: '1px solid rgba(91, 215, 255, 0.24)',
                }}
                aria-hidden
              >
                <Gem size={22} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>
                  {t('shop.packDiamonds', { diamonds: pack.diamonds.toLocaleString() })}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 12 }}>
                  <Sparkles size={13} />
                  {pack.bonusPercentVsPrevious > 0
                    ? t('shop.bonus', { percent: String(pack.bonusPercentVsPrevious) })
                    : t('shop.basePack')}
                </span>
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(244, 184, 74, 0.14)',
                  color: '#fde68a',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <TelegramStarIcon size={16} />
                {pack.priceStars}
              </span>
            </button>
          ))}
        </div>

        {invoiceMutation.error && (
          <p style={{ marginTop: 14, color: '#fecaca', fontSize: 13 }}>
            {invoiceMutation.error instanceof Error ? invoiceMutation.error.message : t('shop.failedInvoice')}
          </p>
        )}
        {checkoutStatus && (
          <div style={checkoutNoticeStyle(checkoutStatus)} role="status" aria-live="polite" data-testid="shop-checkout-status">
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(15, 23, 42, 0.58)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
              }}
              aria-hidden
            >
              <CheckoutStatusIcon status={checkoutStatus} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, color: '#fff7ed', fontSize: 14, fontWeight: 800 }}>
                {t(checkoutStatusKey(checkoutStatus), checkoutStatusParams)}
              </p>
              {(checkoutStatus === 'pending' || checkoutStatus === 'pendingDelivery') && (
                <p style={{ margin: '6px 0 0', color: '#fde68a', fontSize: 12, lineHeight: 1.4 }}>
                  {t('shop.checkout.pendingDeliveryAuto')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <CosmicBottomNav />
    </>
  );
}
