import { useEffect, useState } from 'react';
import { ChevronLeft, Gem, ShoppingBag, Sparkles } from 'lucide-react';
import { CosmicBackground, CosmicBottomNav } from '../components/cosmic/atoms';
import { useCreateStarsInvoice, useStarsDiamondPacks } from '../hooks/useMonetization';
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

function openInvoiceUrl(url: string, onStatus: (status: string) => void) {
  const openInvoice = window.Telegram?.WebApp?.openInvoice;
  if (typeof openInvoice === 'function') {
    openInvoice(url, onStatus);
    return;
  }

  window.location.href = url;
}

function checkoutStatusKey(status: string): string {
  return ['paid', 'cancelled', 'failed', 'pending'].includes(status)
    ? `shop.checkout.${status}`
    : 'shop.checkout.unknown';
}

export function ShopPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: meData } = useMe();
  const packsQuery = useStarsDiamondPacks();
  const invoiceMutation = useCreateStarsInvoice();
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);

  useEffect(() => {
    packsQuery.data?.packs.forEach((pack) => {
      trackFrontendEvent('stars_diamond_pack_viewed', {
        packDiamonds: pack.diamonds,
        priceStars: pack.priceStars,
        bonusPercentVsPrevious: pack.bonusPercentVsPrevious,
      });
    });
  }, [packsQuery.data]);

  const startCheckout = async (packId: string) => {
    setCheckoutStatus(null);
    const response = await invoiceMutation.mutateAsync(packId);
    trackFrontendEvent('stars_checkout_started', {
      packDiamonds: response.pack.diamonds,
      priceStars: response.pack.priceStars,
    });
    openInvoiceUrl(response.invoiceUrl, (status) => {
      setCheckoutStatus(status);
    });
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
              disabled={invoiceMutation.isPending}
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
                <ShoppingBag size={15} />
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
          <p style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: 13 }}>
            {t(checkoutStatusKey(checkoutStatus))}
          </p>
        )}
      </div>
      <CosmicBottomNav />
    </>
  );
}
