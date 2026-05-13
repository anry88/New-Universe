import type {
  PresenceEntityRelation,
  PresenceEntityType,
  SectorPresenceEntity,
} from '@shared/types/multiplayer';

type TranslateParams = Record<string, string | number>;
type TranslateFn = (key: string, params?: TranslateParams) => string;

export interface SectorEntitySummary {
  total: number;
  hiddenSummary: number;
  relation: Record<PresenceEntityRelation, number>;
  type: Record<PresenceEntityType, number>;
}

export interface SectorEntityDisplay {
  title: string;
  subtitle?: string;
  relationLabel: string;
  typeLabel: string;
  visibilityLabel: string;
  privacyNote: string;
  positionLabel: string;
  isUnknown: boolean;
}

function emptySectorSummary(): SectorEntitySummary {
  return {
    total: 0,
    hiddenSummary: 0,
    relation: {
      self: 0,
      foreign: 0,
      public: 0,
    },
    type: {
      home: 0,
      colony: 0,
      fleet: 0,
      public_sector: 0,
    },
  };
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.abs(value % 1) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
}

export function summarizeSectorEntities(entities: SectorPresenceEntity[]): SectorEntitySummary {
  const summary = emptySectorSummary();

  for (const entity of entities) {
    summary.total += 1;
    summary.relation[entity.relation] += 1;
    summary.type[entity.entityType] += 1;
    if (isUnknownSectorEntity(entity)) {
      summary.hiddenSummary += 1;
    }
  }

  return summary;
}

export function sectorEntityKey(entity: SectorPresenceEntity): string {
  return [
    entity.kind,
    entity.relation,
    entity.entityType,
    entity.systemId,
    entity.planetId ?? '',
    entity.shipId ?? '',
    String(entity.worldPosition.x),
    String(entity.worldPosition.y),
    String(entity.worldPosition.z),
  ].join('|');
}

export function sectorEntityTypeLabelKey(type: PresenceEntityType): string {
  return `sector.type.${type}`;
}

export function sectorEntityRelationLabelKey(relation: PresenceEntityRelation): string {
  return `sector.relation.${relation}`;
}

export function isUnknownSectorEntity(entity: SectorPresenceEntity): boolean {
  return entity.relation === 'foreign' && entity.visibility === 'summary';
}

export function sectorEntityDisplay(entity: SectorPresenceEntity, t: TranslateFn): SectorEntityDisplay {
  const isUnknown = isUnknownSectorEntity(entity);
  const title = isUnknown ? unknownTitle(entity.entityType, t) : entity.title;
  const subtitle = isUnknown
    ? entity.subtitle
      ? t('sector.entity.foreignSource', { source: entity.subtitle })
      : t('sector.entity.foreignSourceUnknown')
    : entity.subtitle;

  return {
    title,
    subtitle,
    relationLabel: t(sectorEntityRelationLabelKey(entity.relation)),
    typeLabel: t(sectorEntityTypeLabelKey(entity.entityType)),
    visibilityLabel: t(
      entity.visibility === 'full' ? 'sector.visibility.full' : 'sector.visibility.summary',
    ),
    privacyNote: privacyNote(entity, t),
    positionLabel: `${formatCoordinate(entity.worldPosition.x)} / ${formatCoordinate(
      entity.worldPosition.y,
    )} / ${formatCoordinate(entity.worldPosition.z)}`,
    isUnknown,
  };
}

function unknownTitle(entityType: PresenceEntityType, t: TranslateFn): string {
  if (entityType === 'colony') return t('sector.entity.unknownColony');
  if (entityType === 'fleet') return t('sector.entity.unknownFleet');
  return t('sector.entity.unknownContact');
}

function privacyNote(entity: SectorPresenceEntity, t: TranslateFn): string {
  if (entity.visibility === 'full') return t('sector.visibility.fullNote');
  if (entity.relation === 'public') return t('sector.visibility.publicNote');
  return t('sector.visibility.summaryNote');
}
