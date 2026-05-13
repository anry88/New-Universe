import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JumpGateJumpResponse,
  JumpGateRandomJumpRequest,
  JumpGateStateResponse,
} from "@shared/types/jump-gate";
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
