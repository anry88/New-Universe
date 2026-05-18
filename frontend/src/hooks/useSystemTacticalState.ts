import { useQuery } from "@tanstack/react-query";
import type { SystemTacticalStateResponse } from "@shared/types/system-tactical";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "./useAuth";

const RECENT_COMBAT_WINDOW_MS = 30_000;
const TACTICAL_ACTIVE_REFETCH_INTERVAL_MS = 5_000;
const TACTICAL_IDLE_REFETCH_INTERVAL_MS = 15_000;

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function shouldPollSystemTacticalState(
  data: SystemTacticalStateResponse | undefined,
  now = Date.now(),
): boolean {
  return Boolean(
    data?.fleetContacts.some((contact) => {
      if (contact.status !== "stationed") return true;
      const lastCombat = timestamp(contact.lastCombatTickAt);
      return lastCombat != null && now - lastCombat <= RECENT_COMBAT_WINDOW_MS;
    }),
  );
}

export function systemTacticalRefetchInterval(
  data: SystemTacticalStateResponse | undefined,
): number {
  return shouldPollSystemTacticalState(data)
    ? TACTICAL_ACTIVE_REFETCH_INTERVAL_MS
    : TACTICAL_IDLE_REFETCH_INTERVAL_MS;
}

export function useSystemTacticalState(systemId: string | null | undefined) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["system-tactical-state", systemId],
    queryFn: () =>
      apiFetch<SystemTacticalStateResponse>(
        `/systems/${systemId}/tactical-state`,
      ),
    enabled: Boolean(token && systemId),
    staleTime: 3 * 1000,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : systemTacticalRefetchInterval(query.state.data),
    refetchIntervalInBackground: true,
  });
}
