import { useEffect, useState } from 'react';
import { ChevronLeft, Gem, Sparkles } from 'lucide-react';
import type { ConfirmStarsCheckoutResponse } from '@shared/types/monetization';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { useConfirmStarsCheckout, useCreateStarsInvoice, useStarsDiamondPacks } from '../hooks/useMonetization';
import { useMe } from '../hooks/useMe';
import { useI18n } from '../lib/i18n';
import { trackFrontendEvent } from '../lib/analytics';
import { useNavigate } from 'react-router-dom';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        openInvoice?: (url: string, callback?: (status: string) => void) => void;
      };
    };
  }
}

const CHECKOUT_CONFIRM_ATTEMPTS = 5;
const CHECKOUT_CONFIRM_DELAY_MS = 1_000;

type CheckoutReference = {
  packId: string;
  checkoutId: string;
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

function checkoutStatusKey(status: string): string {
  return [
    'paid',
    'cancelled',
    'failed',
    'pending',
    'confirming',
    'delivered',
    'pendingDelivery',
    'failedDelivery',
  ].includes(status)
    ? `shop.checkout.${status}`
    : 'shop.checkout.unknown';
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

export function ShopPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: meData } = useMe();
  const packsQuery = useStarsDiamondPacks();
  const invoiceMutation = useCreateStarsInvoice();
  const confirmMutation = useConfirmStarsCheckout();
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const [lastCheckout, setLastCheckout] = useState<CheckoutReference | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmStarsCheckoutResponse | null>(null);

  useEffect(() => {
    packsQuery.data?.packs.forEach((pack) => {
      trackFrontendEvent('stars_diamond_pack_viewed', {
        packDiamonds: pack.diamonds,
        priceStars: pack.priceStars,
        bonusPercentVsPrevious: pack.bonusPercentVsPrevious,
      });
    });
  }, [packsQuery.data]);

  const confirmCheckout = async (checkout: CheckoutReference) => {
    setLastCheckout(checkout);
    setCheckoutStatus('confirming');

    try {
      let latest: ConfirmStarsCheckoutResponse | null = null;
      for (let attempt = 0; attempt < CHECKOUT_CONFIRM_ATTEMPTS; attempt += 1) {
        latest = await confirmMutation.mutateAsync(checkout);
        setConfirmation(latest);

        if (latest.status === 'delivered') {
          setCheckoutStatus('delivered');
          return;
        }

        if (latest.status === 'failed') {
          setCheckoutStatus('failedDelivery');
          return;
        }

        if (attempt < CHECKOUT_CONFIRM_ATTEMPTS - 1) {
          await delay(CHECKOUT_CONFIRM_DELAY_MS);
        }
      }

      setCheckoutStatus(latest?.status === 'failed' ? 'failedDelivery' : 'pendingDelivery');
    } catch {
      setCheckoutStatus('failedDelivery');
    }
  };

  const startCheckout = async (packId: string) => {
    setCheckoutStatus(null);
    setConfirmation(null);

    try {
      const response = await invoiceMutation.mutateAsync(packId);
      const checkout = {
        packId: response.pack.id,
        checkoutId: response.checkoutId,
      };

      setLastCheckout(checkout);
      trackFrontendEvent('stars_checkout_started', {
        packDiamonds: response.pack.diamonds,
        priceStars: response.pack.priceStars,
      });

      const handlesStatus = openInvoiceUrl(response.invoiceUrl, (status) => {
        if (status === 'paid') {
          void confirmCheckout(checkout);
          return;
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

  const checkoutBusy = invoiceMutation.isPending || confirmMutation.isPending;
  const canRetryCheckout = Boolean(
    lastCheckout &&
    (checkoutStatus === 'pendingDelivery' || checkoutStatus === 'failedDelivery') &&
    !checkoutBusy,
  );
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
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 13 }}>
              {t(checkoutStatusKey(checkoutStatus), checkoutStatusParams)}
            </p>
            {canRetryCheckout && (
              <button
                type="button"
                className="rounded-md border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-100"
                style={{ marginTop: 10 }}
                onClick={() => {
                  if (lastCheckout) {
                    void confirmCheckout(lastCheckout);
                  }
                }}
              >
                {t('shop.checkout.retry')}
              </button>
            )}
          </div>
        )}
      </div>
      <CosmicBottomNav />
    </>
  );
}
