import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JumpGateJumpResponse,
  JumpGateRandomJumpRequest,
  JumpGateStateResponse,
} from "@shared/types/jump-gate";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "./useAuth";

const RECENT_SURFACE_COMBAT_WINDOW_MS = 30_000;
const JUMP_GATE_ACTIVE_REFETCH_INTERVAL_MS = 5_000;
const JUMP_GATE_IDLE_REFETCH_INTERVAL_MS = 15_000;

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function shouldPollJumpGateState(
  data: JumpGateStateResponse | undefined,
  now = Date.now(),
): boolean {
  return Boolean(
    data?.knownDestinations.some((destination) =>
      destination.planets.some((planet) => {
        const lastCombat = timestamp(planet.lastCombatTickAt);
        return (
          lastCombat != null &&
          now - lastCombat <= RECENT_SURFACE_COMBAT_WINDOW_MS
        );
      }),
    ),
  );
}

export function jumpGateRefetchInterval(
  data: JumpGateStateResponse | undefined,
  now = Date.now(),
): number {
  return shouldPollJumpGateState(data, now)
    ? JUMP_GATE_ACTIVE_REFETCH_INTERVAL_MS
    : JUMP_GATE_IDLE_REFETCH_INTERVAL_MS;
}

export function useJumpGateState() {
  const token = useAuthStore((state) => state.token);

  return useQuery({
    queryKey: ["jump-gate-state"],
    queryFn: () => apiFetch<JumpGateStateResponse>("/jump-gate/state"),
    enabled: Boolean(token),
    staleTime: 10 * 1000,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : jumpGateRefetchInterval(query.state.data),
    refetchIntervalInBackground: true,
  });
}

export function useRandomJump() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: JumpGateRandomJumpRequest) =>
      apiFetch<JumpGateJumpResponse>("/jump-gate/random-jump", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jump-gate-state"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
