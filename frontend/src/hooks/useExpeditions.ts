import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  Expedition,
  LaunchExpeditionRequest,
} from "@shared/types/expeditions";
import type { Ship } from "@shared/types/ships";

export function useLaunchExpedition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LaunchExpeditionRequest) =>
      apiFetch<{ expedition: Expedition; ship: Ship }>("/expeditions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
