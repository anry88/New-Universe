import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/types/user";

const MAX_TIMEOUT_MS = 2_147_483_647;
const OVERDUE_SYNC_RECHECK_MS = 2_500;

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function documentIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function getNextMeCompletionMs(user?: User): number | null {
  const candidates: number[] = [];

  user?.planets?.forEach((planet) => {
    planet.buildings?.forEach((building) => {
      if (!building.queueAction) return;
      const ms = timestamp(building.queueCompletesAt);
      if (ms != null) candidates.push(ms);
    });
  });

  user?.research?.forEach((research) => {
    const ms = timestamp(research.completesAt);
    if (ms != null) candidates.push(ms);
  });

  user?.ships?.forEach((ship) => {
    if (ship.status !== "building") return;
    const ms = timestamp(ship.queueCompletesAt);
    if (ms != null) candidates.push(ms);
  });

  user?.expeditions?.forEach((expedition) => {
    if (expedition.status !== "in_flight" && expedition.status !== "returning") return;
    const ms = timestamp(expedition.eta);
    if (ms != null) candidates.push(ms);
  });

  if (!candidates.length) return null;
  return Math.min(...candidates);
}

export function useMeCompletionRefresh(user: User | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(documentIsVisible);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibilityChange = () => setVisible(documentIsVisible());
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!enabled || !visible) return;
    const nextDue = getNextMeCompletionMs(user);
    if (nextDue == null) return;

    const dueInMs = nextDue - Date.now();
    const delay = dueInMs <= 0
      ? OVERDUE_SYNC_RECHECK_MS
      : Math.min(dueInMs + 250, MAX_TIMEOUT_MS);
    const id = window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["ship-queue"] });
    }, delay);
    return () => window.clearTimeout(id);
  }, [enabled, queryClient, user, visible]);
}
