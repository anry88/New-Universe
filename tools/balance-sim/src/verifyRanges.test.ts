import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { simulateScenario } from './simulate.js';
import type { ScenarioFile } from './types.js';
import { verifySummaryAgainstRanges } from './verifyRanges.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

describe('balance-sim scenarios vs expected ranges', () => {
  it('first-week fixtures stay within declared milestone bands', () => {
    const scenarioPath = join(ROOT, 'scenarios', 'first-week.json');
    const rangesPath = join(ROOT, 'expected-ranges.json');
    const file = JSON.parse(readFileSync(scenarioPath, 'utf-8')) as ScenarioFile;
    const ranges = JSON.parse(readFileSync(rangesPath, 'utf-8')) as Record<string, unknown>;

    const summaries = file.scenarios.map((sc) => simulateScenario(sc, file.horizonSec));
    const summaryPayload = {
      generatedAt: new Date().toISOString(),
      horizonSec: file.horizonSec,
      scenarioPath,
      scenarios: summaries,
    };

    const errs = verifySummaryAgainstRanges(summaryPayload as unknown as Record<string, unknown>, ranges);
    expect(errs, errs.join('\n')).toEqual([]);
  });
});
