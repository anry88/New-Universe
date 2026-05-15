import {
  NUCLEAR_PAYLOAD_COOLDOWN_SEC,
  NUCLEAR_PAYLOAD_RESEARCH_GATE,
  NUCLEAR_PAYLOAD_RESOURCE_COST,
} from "@shared/types/combat";
import type { ResearchProgress } from "@shared/types/research";
import { researchBranchLabel } from "@shared/types/research";
import { ResourceAmountList } from "./cosmic/resources";
import { useI18n } from "../lib/i18n";

export interface CombatShipMenuProps {
  research?: ResearchProgress[];
}

export function CombatShipMenu({ research = [] }: CombatShipMenuProps) {
  const { locale, t } = useI18n();
  const currentLevel =
    research.find((row) => row.branch === NUCLEAR_PAYLOAD_RESEARCH_GATE.branch)?.level ?? 0;
  const unlocked = currentLevel >= NUCLEAR_PAYLOAD_RESEARCH_GATE.level;
  const branch = researchBranchLabel(NUCLEAR_PAYLOAD_RESEARCH_GATE.branch, locale);
  const costItems = Object.entries(NUCLEAR_PAYLOAD_RESOURCE_COST).map(([resourceId, amount]) => ({
    resourceId,
    amount,
  }));

  return (
    <section
      className="ship-row"
      data-testid="combat-nuclear-payload-warning"
      style={{
        borderColor: unlocked ? "rgba(91, 215, 255, 0.42)" : "rgba(251, 191, 36, 0.42)",
        background:
          "linear-gradient(135deg, rgba(91, 215, 255, 0.09), rgba(251, 191, 36, 0.07))",
      }}
    >
      <div className="ship-visual">
        <div className="ship-cls">{t("combat.nuclear.tag")}</div>
      </div>
      <div>
        <div className="ship-name">{t("combat.nuclear.title")}</div>
        <div className="ship-loc">
          {unlocked
            ? t("combat.nuclear.unlocked", {
                branch,
                level: NUCLEAR_PAYLOAD_RESEARCH_GATE.level,
              })
            : t("combat.nuclear.locked", {
                branch,
                level: NUCLEAR_PAYLOAD_RESEARCH_GATE.level,
                current: currentLevel,
              })}
        </div>
        <div className="ship-loc">
          {t("combat.nuclear.cost")} <ResourceAmountList items={costItems} locale={locale} />
        </div>
        <div className="ship-loc">
          {t("combat.nuclear.cooldown", {
            time: formatPayloadCooldown(NUCLEAR_PAYLOAD_COOLDOWN_SEC),
          })}
        </div>
        <div className="ship-loc" style={{ color: "var(--text-dim)" }}>
          {t("combat.nuclear.warning")}
        </div>
        <div className="ship-loc" style={{ color: "var(--text-faint)" }}>
          {t("combat.nuclear.restrictions")}
        </div>
      </div>
    </section>
  );
}

function formatPayloadCooldown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
