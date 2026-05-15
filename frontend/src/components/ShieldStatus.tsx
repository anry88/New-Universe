import type { ShieldHooks } from "@shared/types/combat";
import { useI18n } from "../lib/i18n";

interface ShieldStatusProps {
  shields: ShieldHooks | undefined;
}

export function ShieldStatus({ shields }: ShieldStatusProps) {
  const { t } = useI18n();
  if (!shields) return null;

  const currentHp = Math.max(0, Math.round(shields.currentHp ?? shields.capacity));
  const capacity = Math.max(0, Math.round(shields.capacity));
  const pct = capacity > 0 ? Math.max(0, Math.min(100, (currentHp / capacity) * 100)) : 0;
  const isDown = shields.state === "downtime" || currentHp <= 0;

  return (
    <div
      className="shield-status"
      style={{
        marginTop: 6,
        display: "grid",
        gap: 4,
        color: isDown ? "#fca5a5" : "var(--text-dim)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      }}
    >
      <div>
        {t("shields.status", {
          hp: currentHp,
          capacity,
          radius: shields.radius,
          recharge: shields.rechargeRate,
        })}
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 999,
          overflow: "hidden",
          background: "rgba(148, 163, 184, 0.16)",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: isDown ? "#fca5a5" : "#5BD7FF",
            boxShadow: isDown ? "none" : "0 0 8px #5BD7FF",
          }}
        />
      </div>
      {isDown ? (
        <div>{t("shields.downtime", { seconds: shields.downtimeSec })}</div>
      ) : (
        <div>{t("shields.timing", { delay: shields.delayAfterDamageSec })}</div>
      )}
    </div>
  );
}
