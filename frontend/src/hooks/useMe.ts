import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { User } from "@shared/types/user";
import { useAuthStore } from "./useAuth";

const MAX_TIMEOUT_MS = 2_147_483_647;
const OVERDUE_SYNC_RECHECK_MS = 2_500;

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function nextCompletionMs(user?: User): number | null {
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

export function useMe() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ user: User }>("/me").then((res) => res.user),
    enabled: !!token,
    staleTime: 10 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!token) return;
    const nextDue = nextCompletionMs(query.data);
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
  }, [query.data, queryClient, token]);

  return query;
}
