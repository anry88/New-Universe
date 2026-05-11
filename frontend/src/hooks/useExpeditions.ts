import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { Expedition } from "@shared/types/expeditions";
import { Ship } from "@shared/types/ships";

export function useLaunchExpedition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      shipId: string;
      targetX: number;
      targetY: number;
      targetZ: number;
      cargoLoaded: number;
      targetPlanetId?: string;
    }) =>
      apiFetch<{ expedition: Expedition; ship: Ship }>("/expeditions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
