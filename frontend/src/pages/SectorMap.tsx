import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Pencil, X } from "lucide-react";
import { useMe } from "../hooks/useMe";
import { apiFetch } from "../lib/api";
import { CosmicBottomNav } from "../components/cosmic/atoms";
import { RenameEntityDialog } from "../components/RenameEntityDialog";
import { IntegerInput } from "../components/IntegerInput";
import { SectorRenderer } from "../components/pixi/SectorRenderer";
import type {
  SectorPresencePayload,
  SectorPresenceEntity,
  SectorSystemAnchor,
  SectorSystemAnchorTag,
  SectorSystemAnchorsPayload,
} from "@shared/types/multiplayer";
import { SYSTEM_RENAME_DIAMOND_COST } from "@shared/types/entity-rename";
import { useI18n } from "../lib/i18n";
import {
  hasLiveSectorActivity,
  sectorEntityDisplay,
  sectorEntityKey,
  summarizeSectorEntities,
} from "../lib/sectorMap";

const SECTOR_LIVE_REFETCH_INTERVAL_MS = 2_500;
const SECTOR_IDLE_REFETCH_INTERVAL_MS = 10_000;

function parseCoord(raw: string | null, fallback: number): number {
  if (raw === null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Sector-scale multiplayer map — shows anonymized foreign markers and local assets
 * for one sector cube, anchored by Home/discovered/colony/fleet system choices.
 */
export function SectorMapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: meData, isLoading } = useMe();
  const { t } = useI18n();

  const home = meData?.homeSystem;
  const selectedSystemId = searchParams.get("systemId");

  const { data: anchorData } = useQuery({
    queryKey: ["sector-system-anchors"],
    queryFn: () => apiFetch<SectorSystemAnchorsPayload>("/multiplayer/systems"),
    enabled: Boolean(meData?.id && home),
  });
  const anchorSystems = anchorData?.systems ?? [];

  const sector = useMemo(() => {
    const selectedAnchor = anchorSystems.find(
      (anchor) => anchor.systemId === selectedSystemId,
    );
    if (selectedAnchor) {
      return {
        sx: selectedAnchor.sector[0],
        sy: selectedAnchor.sector[1],
        sz: selectedAnchor.sector[2],
      };
    }

    const h = meData?.homeSystem;
    return {
      sx: parseCoord(searchParams.get("sx"), h?.sectorX ?? 0),
      sy: parseCoord(searchParams.get("sy"), h?.sectorY ?? 0),
      sz: parseCoord(searchParams.get("sz"), h?.sectorZ ?? 0),
    };
  }, [anchorSystems, selectedSystemId, searchParams, meData?.homeSystem]);

  const selectedAnchor = useMemo(
    () =>
      anchorSystems.find((anchor) => anchor.systemId === selectedSystemId) ??
      anchorSystems.find(
        (anchor) =>
          anchor.sector[0] === sector.sx &&
          anchor.sector[1] === sector.sy &&
          anchor.sector[2] === sector.sz,
      ),
    [anchorSystems, selectedSystemId, sector.sx, sector.sy, sector.sz],
  );

  const [draftSx, setDraftSx] = useState(sector.sx);
  const [draftSy, setDraftSy] = useState(sector.sy);
  const [draftSz, setDraftSz] = useState(sector.sz);
  const [renameAnchor, setRenameAnchor] = useState<SectorSystemAnchor | null>(null);

  const canRenameAnchor = (anchor: SectorSystemAnchor): boolean =>
    anchor.ownColonyCount > 0 && anchor.foreignColonyCount === 0;

  useEffect(() => {
    setDraftSx(sector.sx);
    setDraftSy(sector.sy);
    setDraftSz(sector.sz);
  }, [sector.sx, sector.sy, sector.sz]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["sector-presence", sector.sx, sector.sy, sector.sz],
    queryFn: () =>
      apiFetch<SectorPresencePayload>(
        `/multiplayer/sectors/${sector.sx}/${sector.sy}/${sector.sz}/presence`,
      ),
    enabled: Boolean(meData?.id && home),
    staleTime: 1_000,
    refetchInterval: (query) =>
      hasLiveSectorActivity(query.state.data)
        ? SECTOR_LIVE_REFETCH_INTERVAL_MS
        : SECTOR_IDLE_REFETCH_INTERVAL_MS,
  });

  const entities = data?.entities ?? [];
  const sectorSummary = useMemo(
    () => summarizeSectorEntities(entities),
    [entities],
  );
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const selectedEntity = useMemo(
    () =>
      entities.find((entity) => sectorEntityKey(entity) === selectedEntityId) ??
      null,
    [entities, selectedEntityId],
  );
  const selectedDisplay = useMemo(
    () => (selectedEntity ? sectorEntityDisplay(selectedEntity, t) : null),
    [selectedEntity, t],
  );
  const statCards = useMemo(
    () => [
      {
        key: "total",
        label: t("sector.summary.total"),
        value: sectorSummary.total,
      },
      {
        key: "self",
        label: t("sector.summary.local"),
        value: sectorSummary.relation.self,
      },
      {
        key: "public",
        label: t("sector.summary.neutral"),
        value: sectorSummary.relation.public,
      },
      {
        key: "foreign",
        label: t("sector.summary.foreign"),
        value: sectorSummary.relation.foreign,
      },
    ],
    [sectorSummary, t],
  );

  useEffect(() => {
    if (!selectedEntityId) return;
    if (!selectedEntity) {
      setSelectedEntityId(null);
    }
  }, [selectedEntity, selectedEntityId]);

  const selectEntity = useCallback((entity: SectorPresenceEntity) => {
    setSelectedEntityId(sectorEntityKey(entity));
  }, []);

  const entityLabel = useCallback(
    (entity: SectorPresenceEntity) => {
      return sectorEntityDisplay(entity, t).title;
    },
    [t],
  );

  const applySector = () => {
    setSearchParams({
      sx: String(draftSx),
      sy: String(draftSy),
      sz: String(draftSz),
    });
  };

  const selectAnchor = (
    systemId: string,
    sectorCoords: [number, number, number],
  ) => {
    setSearchParams({
      systemId,
      sx: String(sectorCoords[0]),
      sy: String(sectorCoords[1]),
      sz: String(sectorCoords[2]),
    });
  };

  const tagLabel = (tag: SectorSystemAnchorTag) => t(`sector.anchor.${tag}`);

  if (isLoading) {
    return (
      <div
        className="cosmic-screen"
        style={
          {
            "--accent": "#5BD7FF",
            display: "grid",
            placeItems: "center",
          } as React.CSSProperties
        }
      >
        <div className="qstrip-bar" style={{ width: 80 }}>
          <div className="qstrip-fill" style={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  if (!home) {
    return (
      <div
        className="cosmic-screen"
        style={
          {
            "--accent": "#5BD7FF",
            display: "grid",
            placeItems: "center",
          } as React.CSSProperties
        }
      >
        <p style={{ color: "var(--text-dim)" }}>{t("sector.noHome")}</p>
        <button
          type="button"
          className="cosmic-cta"
          style={{ marginTop: 12 }}
          onClick={() => navigate("/")}
        >
          {t("common.home")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="cosmic-screen"
      style={
        {
          "--accent": "#5BD7FF",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        } as React.CSSProperties
      }
    >
      <div
        className="sector-map-topbar"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => navigate("/map")}
          style={{
            padding: 8,
            borderRadius: 999,
            background: "rgba(14,20,36,0.85)",
            border: "1px solid var(--line)",
            backdropFilter: "blur(8px)",
            color: "var(--text)",
            pointerEvents: "auto",
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div
          className="sector-map-control-panel"
          style={{
            flex: 1,
            background: "rgba(14,20,36,0.85)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
            backdropFilter: "blur(8px)",
            pointerEvents: "auto",
            maxHeight: 250,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            {t("sector.title")}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-faint)",
              marginTop: 4,
            }}
          >
            {t("sector.subtitle")}
          </div>
          <div className="sector-map-stat-grid" style={{ marginTop: 10 }}>
            {statCards.map((card) => (
              <div
                key={card.key}
                className={`sector-map-stat sector-map-stat--${card.key}`}
              >
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
          </div>
          {anchorSystems.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-dim)",
                  marginBottom: 6,
                }}
              >
                {t("sector.systemSelector")}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  overflowX: "auto",
                  paddingBottom: 2,
                }}
              >
                {anchorSystems.map((anchor) => {
                  const active = selectedAnchor?.systemId === anchor.systemId;
                  const meta = [
                    anchor.colonyCount > 0
                      ? t("sector.anchor.colonyCount", {
                          count: anchor.colonyCount,
                        })
                      : null,
                    anchor.shipCount > 0
                      ? t("sector.anchor.shipCount", {
                          count: anchor.shipCount,
                        })
                      : null,
                  ].filter(Boolean);

                  const renameEnabled = canRenameAnchor(anchor);
                  const renameTitle = renameEnabled
                    ? anchor.renameCount === 0
                      ? `${t('rename.system.title')} · ${t('common.free')}`
                      : `${t('rename.system.title')} · ◆ ${SYSTEM_RENAME_DIAMOND_COST}`
                    : anchor.foreignColonyCount > 0
                      ? t('rename.system.disabled.foreign')
                      : t('rename.system.disabled.noColony');

                  return (
                    <div
                      key={anchor.systemId}
                      style={{
                        position: 'relative',
                        flex: "0 0 160px",
                      }}
                    >
                    <button
                      type="button"
                      onClick={() =>
                        selectAnchor(anchor.systemId, anchor.sector)
                      }
                      style={{
                        width: '100%',
                        textAlign: "left",
                        borderRadius: 8,
                        border: active
                          ? "1px solid var(--accent)"
                          : "1px solid var(--line)",
                        background: active
                          ? "rgba(91,215,255,0.14)"
                          : "rgba(8,12,22,0.74)",
                        color: "var(--text)",
                        padding: "7px 8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          paddingRight: 18,
                        }}
                      >
                        {anchor.title}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--text-faint)",
                          marginTop: 3,
                        }}
                      >
                        {anchor.sector.join(":")}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                          marginTop: 5,
                        }}
                      >
                        {anchor.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              borderRadius: 999,
                              border: "1px solid rgba(148,163,184,0.25)",
                              color:
                                tag === "home"
                                  ? "var(--accent)"
                                  : "var(--text-dim)",
                              fontSize: 8,
                              padding: "1px 5px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tagLabel(tag)}
                          </span>
                        ))}
                      </div>
                      {meta.length > 0 && (
                        <div
                          style={{
                            fontSize: 9,
                            color: "var(--text-dim)",
                            marginTop: 5,
                          }}
                        >
                          {meta.join(" · ")}
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (renameEnabled) setRenameAnchor(anchor);
                      }}
                      disabled={!renameEnabled}
                      aria-label={renameTitle}
                      title={renameTitle}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 6,
                        border: '1px solid rgba(148,163,184,0.25)',
                        background: renameEnabled
                          ? 'rgba(91,215,255,0.12)'
                          : 'rgba(8,12,22,0.6)',
                        color: renameEnabled ? 'var(--accent)' : 'var(--text-faint)',
                        cursor: renameEnabled ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}
          >
            <label style={{ fontSize: 10, color: "var(--text-dim)" }}>
              sx
              <IntegerInput
                allowNegative
                value={draftSx}
                onValueChange={setDraftSx}
                style={{
                  marginLeft: 4,
                  width: 56,
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                  background: "rgba(8,12,22,0.9)",
                  color: "var(--text)",
                  fontSize: 11,
                  padding: "4px 6px",
                }}
              />
            </label>
            <label style={{ fontSize: 10, color: "var(--text-dim)" }}>
              sy
              <IntegerInput
                allowNegative
                value={draftSy}
                onValueChange={setDraftSy}
                style={{
                  marginLeft: 4,
                  width: 56,
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                  background: "rgba(8,12,22,0.9)",
                  color: "var(--text)",
                  fontSize: 11,
                  padding: "4px 6px",
                }}
              />
            </label>
            <label style={{ fontSize: 10, color: "var(--text-dim)" }}>
              sz
              <IntegerInput
                allowNegative
                value={draftSz}
                onValueChange={setDraftSz}
                style={{
                  marginLeft: 4,
                  width: 56,
                  borderRadius: 6,
                  border: "1px solid var(--line)",
                  background: "rgba(8,12,22,0.9)",
                  color: "var(--text)",
                  fontSize: 11,
                  padding: "4px 6px",
                }}
              />
            </label>
            <button
              type="button"
              onClick={applySector}
              style={{
                alignSelf: "flex-end",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "rgba(91,215,255,0.12)",
                color: "var(--accent)",
                fontSize: 11,
                padding: "6px 10px",
              }}
            >
              {t("common.go")}
            </button>
          </div>
        </div>

        <div style={{ width: 40 }} />
      </div>

      <div
        className="sector-map-stage"
        style={{
          flex: "1 1 auto",
          position: "relative",
          minHeight: 0,
          width: "100%",
          height: "calc(100vh - 64px)",
          paddingTop: anchorSystems.length > 0 ? 268 : 168,
          paddingBottom: 144,
          boxSizing: "border-box",
        }}
      >
        {error && (
          <div style={{ padding: "0 16px", color: "#f87171", fontSize: 13 }}>
            {(error as Error).message}
          </div>
        )}
        {isFetching && (
          <div
            style={{
              padding: "8px 16px",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            {t("sector.scanning")}
          </div>
        )}
        <SectorRenderer
          entities={entities}
          emptyLabel={t("sector.noContacts")}
          selectedEntityId={selectedEntityId}
          onEntitySelect={selectEntity}
          getEntityLabel={entityLabel}
        />
      </div>

      <div
        className="sector-map-detail-dock"
        style={{
          position: "absolute",
          bottom: 88,
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "auto",
          width: "min(520px, 92vw)",
        }}
      >
        <div
          className="sector-map-detail-panel"
          style={{
            background: "rgba(8,12,22,0.85)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="sector-map-legend"
            aria-label={t("sector.legend.title")}
          >
            <span className="sector-map-legend-item sector-map-legend-item--self">
              {t("sector.legend.local")}
            </span>
            <span className="sector-map-legend-item sector-map-legend-item--public">
              {t("sector.legend.neutral")}
            </span>
            <span className="sector-map-legend-item sector-map-legend-item--foreign">
              {t("sector.legend.foreign")}
            </span>
          </div>

          {selectedEntity && selectedDisplay ? (
            <section
              className="sector-map-selected"
              aria-label={t("sector.detail.selected")}
            >
              <div className="sector-map-selected-head">
                <div>
                  <div className="sector-map-selected-title">
                    {selectedDisplay.title}
                  </div>
                  {selectedDisplay.subtitle && (
                    <div className="sector-map-selected-subtitle">
                      {selectedDisplay.subtitle}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="sector-map-icon-btn"
                  aria-label={t("common.close")}
                  onClick={() => setSelectedEntityId(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="sector-map-chip-row">
                <span
                  className={`sector-map-chip sector-map-chip--${selectedEntity.relation}`}
                >
                  {selectedDisplay.relationLabel}
                </span>
                <span className="sector-map-chip">
                  {selectedDisplay.typeLabel}
                </span>
                <span className="sector-map-chip">
                  {selectedDisplay.visibilityLabel}
                </span>
              </div>
              <dl className="sector-map-detail-grid">
                <div>
                  <dt>{t("sector.detail.position")}</dt>
                  <dd>{selectedDisplay.positionLabel}</dd>
                </div>
                <div>
                  <dt>{t("sector.detail.hidden")}</dt>
                  <dd>{sectorSummary.hiddenSummary}</dd>
                </div>
              </dl>
              <p className="sector-map-privacy-note">
                {selectedDisplay.privacyNote}
              </p>
            </section>
          ) : (
            <p className="sector-map-empty-detail">
              {t("sector.detail.empty")}
            </p>
          )}
        </div>
      </div>

      <CosmicBottomNav />

      {renameAnchor && (
        <RenameEntityDialog
          kind="system"
          targetId={renameAnchor.systemId}
          currentName={renameAnchor.title}
          renameCount={renameAnchor.renameCount}
          diamondBalance={meData?.diamonds ?? 0}
          paidCost={SYSTEM_RENAME_DIAMOND_COST}
          onClose={() => setRenameAnchor(null)}
        />
      )}
    </div>
  );
}
