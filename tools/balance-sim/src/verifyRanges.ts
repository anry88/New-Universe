export function verifySummaryAgainstRanges(
  summaryPayload: Record<string, unknown>,
  ranges: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const scenarios = ranges.scenarios as Record<string, unknown>[] | undefined;
  if (!scenarios?.length) return ['Expected ranges file missing scenarios[]'];

  for (const block of scenarios) {
    const id = block.id as string;
    const milestoneRanges = block.milestoneRanges as Record<string, [number | null, number | null]> | undefined;
    if (!milestoneRanges) continue;

    const sim = summaryPayload.scenarios as Record<string, unknown>[] | undefined;
    const match = sim?.find((s) => (s as { scenarioId: string }).scenarioId === id);
    if (!match) {
      errors.push(`No simulated scenario id "${id}"`);
      continue;
    }
    const milestones = (match as { milestones: Record<string, number | null> }).milestones;

    for (const [key, pair] of Object.entries(milestoneRanges)) {
      const val = milestones[key] ?? null;
      const [min, max] = pair;
      if (min !== null && max !== null) {
        if (val === null) {
          errors.push(`${id}: milestone ${key} was null but expected range [${min}, ${max}]`);
          continue;
        }
        if (val < min || val > max) {
          errors.push(`${id}: milestone ${key}=${val} outside [${min}, ${max}]`);
        }
      }
    }
  }
  return errors;
}
