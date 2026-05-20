import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  MAX_ENTITY_NAME_LENGTH,
  validateEntityName,
  type EntityNameErrorCode,
} from '@shared/format/entityNameValidation';
import type { RenameEntityResponse } from '@shared/types/entity-rename';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';

export type RenameEntityKind = 'planet' | 'system';

interface RenameEntityDialogProps {
  kind: RenameEntityKind;
  /** Target id (planet or system). */
  targetId: string;
  /** Current displayed name (prefill). */
  currentName: string;
  /**
   * Server-side rename counter for the entity. Used to compute and display
   * the cost preview — when this is 0 we show "first rename is free".
   */
  renameCount: number;
  /** Player's current diamond balance for the cost preview. */
  diamondBalance: number;
  /**
   * Standard cost of the second-and-onward rename (20 for planets,
   * 200 for systems). Passed in by the caller from the shared constants
   * so cost source-of-truth stays in shared/.
   */
  paidCost: number;
  onClose: () => void;
}

type ServerErrorCode =
  | EntityNameErrorCode
  | 'not_found'
  | 'not_owned'
  | 'foreign_colony_present'
  | 'no_player_colony'
  | 'insufficient_diamonds';

function errorMessageKey(code: ServerErrorCode): string {
  return `rename.error.${code}`;
}

export function RenameEntityDialog({
  kind,
  targetId,
  currentName,
  renameCount,
  diamondBalance,
  paidCost,
  onClose,
}: RenameEntityDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(currentName);
  const [serverError, setServerError] = useState<ServerErrorCode | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const clientValidation = useMemo(() => validateEntityName(draft), [draft]);
  const isUnchanged = clientValidation.normalized === currentName;
  const cost = renameCount === 0 ? 0 : paidCost;
  const insufficient = cost > diamondBalance;

  const mutation = useMutation({
    mutationFn: async () => {
      const path = kind === 'planet'
        ? `/colonies/${encodeURIComponent(targetId)}/rename`
        : `/systems/${encodeURIComponent(targetId)}/rename`;
      return apiFetch<RenameEntityResponse>(path, {
        method: 'POST',
        body: JSON.stringify({ name: clientValidation.normalized }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['jump-gate-state'] });
      queryClient.invalidateQueries({ queryKey: ['sector-system-anchors'] });
      queryClient.invalidateQueries({ queryKey: ['sector-presence'] });
      onClose();
    },
    onError: (error: Error & { data?: unknown }) => {
      const data = error.data as { code?: ServerErrorCode } | undefined;
      if (data?.code) {
        setServerError(data.code);
      } else {
        setServerError('not_found');
      }
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientValidation.valid) return;
    if (isUnchanged) return;
    if (insufficient) return;
    setServerError(null);
    mutation.mutate();
  };

  const errorCode: ServerErrorCode | null = serverError ?? (clientValidation.valid ? null : clientValidation.error!);
  const showError = draft.trim().length > 0 && errorCode !== null;
  const errorText = errorCode
    ? t(errorMessageKey(errorCode), { max: MAX_ENTITY_NAME_LENGTH })
    : null;

  const submitDisabled =
    !clientValidation.valid ||
    isUnchanged ||
    insufficient ||
    mutation.isPending;

  const title = kind === 'planet' ? t('rename.planet.title') : t('rename.system.title');

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 12, 22, 0.75)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        padding: '16px 16px max(16px, env(safe-area-inset-bottom))',
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: 'min(420px, 100%)',
          background: 'rgba(14,20,36,0.96)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 16,
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('rename.fieldLabel')}</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            maxLength={MAX_ENTITY_NAME_LENGTH}
            onChange={(e) => {
              setServerError(null);
              setDraft(e.target.value);
            }}
            placeholder={t('rename.placeholder')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              padding: '8px 10px',
              borderRadius: 6,
              border: `1px solid ${showError ? '#f87171' : 'var(--line)'}`,
              background: 'rgba(8,12,22,0.9)',
              color: 'var(--text)',
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: showError ? '#f87171' : 'var(--text-faint)',
          }}>
            <span>{showError ? errorText : t('rename.hint', { max: MAX_ENTITY_NAME_LENGTH })}</span>
            <span>{t('rename.charCount', { count: draft.length, max: MAX_ENTITY_NAME_LENGTH })}</span>
          </div>
        </label>

        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          <div>
            {cost === 0
              ? t('rename.firstFree')
              : t('rename.cost', { cost })}
          </div>
          {cost > 0 && (
            <div style={{ color: insufficient ? '#f87171' : 'var(--text-dim)' }}>
              {t('rename.balance', { balance: diamondBalance })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitDisabled}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--accent)',
              background: submitDisabled ? 'rgba(91,215,255,0.06)' : 'rgba(91,215,255,0.18)',
              color: submitDisabled ? 'var(--text-faint)' : 'var(--accent)',
              cursor: submitDisabled ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {mutation.isPending
              ? t('rename.submitting')
              : cost === 0
                ? `${t('rename.submit')} · ${t('common.free')}`
                : `${t('rename.submit')} · ◆ ${cost}`}
          </button>
        </div>
      </form>
    </div>
  );
}
