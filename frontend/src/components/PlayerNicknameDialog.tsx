import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  MAX_ENTITY_NAME_LENGTH,
  MIN_ENTITY_NAME_LENGTH,
  validateEntityName,
  type EntityNameErrorCode,
} from '@shared/format/entityNameValidation';
import {
  PLAYER_NICKNAME_CHANGE_DIAMOND_COST,
  type PlayerNicknameBlockedCode,
  type UpdatePlayerNicknameResponse,
  type UpdatePlayerNicknameSuccess,
} from '@shared/types/player-nickname';
import type { User } from '@shared/types/user';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';

type ServerErrorCode = EntityNameErrorCode | PlayerNicknameBlockedCode;

interface PlayerNicknameDialogProps {
  currentName: string | null | undefined;
  suggestedName?: string | null;
  changeCount: number;
  diamondBalance: number;
  required?: boolean;
  onClose?: () => void;
}

function errorMessageKey(code: ServerErrorCode): string {
  return `nickname.error.${code}`;
}

function isSuccessResponse(
  response: UpdatePlayerNicknameResponse,
): response is UpdatePlayerNicknameSuccess {
  return response.status === 'ok';
}

export function PlayerNicknameDialog({
  currentName,
  suggestedName,
  changeCount,
  diamondBalance,
  required = false,
  onClose,
}: PlayerNicknameDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const initialDraft = currentName || suggestedName || '';
  const [draft, setDraft] = useState(initialDraft);
  const [serverError, setServerError] = useState<ServerErrorCode | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const clientValidation = useMemo(() => validateEntityName(draft), [draft]);
  const hasNickname = Boolean(currentName);
  const isUnchanged = hasNickname && clientValidation.normalized === currentName;
  const cost = hasNickname
    ? changeCount === 0
      ? 0
      : PLAYER_NICKNAME_CHANGE_DIAMOND_COST
    : 0;
  const insufficient = cost > diamondBalance;

  const mutation = useMutation({
    mutationFn: async () =>
      apiFetch<UpdatePlayerNicknameResponse>('/me/nickname', {
        method: 'PATCH',
        body: JSON.stringify({ name: clientValidation.normalized }),
      }),
    onSuccess: (response) => {
      if (!isSuccessResponse(response)) return;
      queryClient.setQueryData<User>(['me'], (old) =>
        old
          ? {
              ...old,
              playerNickname: response.playerNickname,
              playerNicknameChangeCount: response.playerNicknameChangeCount,
              playerNicknameSuggestion: null,
              diamonds: response.diamondsRemaining,
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      onClose?.();
    },
    onError: (error: Error & { data?: unknown }) => {
      const data = error.data as { code?: ServerErrorCode } | undefined;
      setServerError(data?.code ?? 'user_not_found');
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

  const errorCode: ServerErrorCode | null =
    serverError ?? (clientValidation.valid ? null : clientValidation.error!);
  const showError = draft.trim().length > 0 && errorCode !== null;
  const errorText = errorCode
    ? t(errorMessageKey(errorCode), {
        min: MIN_ENTITY_NAME_LENGTH,
        max: MAX_ENTITY_NAME_LENGTH,
      })
    : null;
  const submitDisabled =
    !clientValidation.valid ||
    isUnchanged ||
    insufficient ||
    mutation.isPending;

  const title = required ? t('nickname.requiredTitle') : t('nickname.editTitle');
  const helpText = required
    ? t('nickname.requiredHelp')
    : cost === 0
      ? t('nickname.firstChangeFree')
      : t('nickname.cost', { cost });

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!required) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 12, 22, 0.82)',
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        padding: '16px 16px max(16px, env(safe-area-inset-bottom))',
      }}
    >
      <form
        onClick={(event) => event.stopPropagation()}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h2>
          {!required && (
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
          )}
        </div>

        <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.5 }}>
          {helpText}
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('nickname.fieldLabel')}</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            minLength={MIN_ENTITY_NAME_LENGTH}
            maxLength={MAX_ENTITY_NAME_LENGTH}
            onChange={(event) => {
              setServerError(null);
              setDraft(event.target.value);
            }}
            placeholder={t('nickname.placeholder')}
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
            gap: 12,
            fontSize: 10,
            color: showError ? '#f87171' : 'var(--text-faint)',
          }}>
            <span>
              {showError
                ? errorText
                : t('nickname.hint', {
                    min: MIN_ENTITY_NAME_LENGTH,
                    max: MAX_ENTITY_NAME_LENGTH,
                  })}
            </span>
            <span>{t('nickname.charCount', { count: draft.length, max: MAX_ENTITY_NAME_LENGTH })}</span>
          </div>
        </label>

        {cost > 0 && (
          <div style={{ fontSize: 12, color: insufficient ? '#f87171' : 'var(--text-dim)' }}>
            {t('nickname.balance', { balance: diamondBalance })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {!required && (
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
          )}
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
              ? t('nickname.submitting')
              : required
                ? t('nickname.submit')
                : cost === 0
                ? `${t('nickname.submit')} · ${t('common.free')}`
                : `${t('nickname.submit')} · ◆ ${cost}`}
          </button>
        </div>
      </form>
    </div>
  );
}
