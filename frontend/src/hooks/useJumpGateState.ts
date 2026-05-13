import { useQuery } from "@tanstack/react-query";
import type { JumpGateStateResponse } from "@shared/types/jump-gate";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "./useAuth";

export function useJumpGateState() {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["jump-gate-state"],
    queryFn: () => apiFetch<JumpGateStateResponse>("/jump-gate/state"),
    enabled: Boolean(token),
    staleTime: 10 * 1000,
  });
}
