import { useQuery } from "@tanstack/react-query";
import type { SystemTacticalStateResponse } from "@shared/types/system-tactical";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "./useAuth";

export function useSystemTacticalState(systemId: string | null | undefined) {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["system-tactical-state", systemId],
    queryFn: () => apiFetch<SystemTacticalStateResponse>(`/systems/${systemId}/tactical-state`),
    enabled: Boolean(token && systemId),
    staleTime: 3 * 1000,
  });
}
