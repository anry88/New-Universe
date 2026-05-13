import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { simulateScenario } from './simulate.js';
import type { ScenarioFile } from './types.js';
import { verifySummaryAgainstRanges } from './verifyRanges.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadScenarioFile(path: string): ScenarioFile {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as ScenarioFile;
}

function isoStamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
}

function loadExpectedRanges(path: string): Record<string, unknown> {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');
  const scenarioPath =
    args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'scenarios', 'first-week.json');

  const file = loadScenarioFile(scenarioPath);
  const stamp = isoStamp();
  const outDir = join(ROOT, 'artifacts', `run-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const summaries = file.scenarios.map((sc) => simulateScenario(sc, file.horizonSec));

  const summaryPayload = {
    generatedAt: new Date().toISOString(),
    horizonSec: file.horizonSec,
    scenarioPath,
    scenarios: summaries,
  };

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summaryPayload, null, 2), 'utf-8');

  for (const s of summaries) {
    writeFileSync(
      join(outDir, `detail-${s.scenarioId}.json`),
      JSON.stringify(s, null, 2),
      'utf-8',
    );
  }

  writeFileSync(join(outDir, 'latest-pointer.txt'), basename(outDir), 'utf-8');

  // Convenience symlink-style marker at artifacts/latest-summary.json
  writeFileSync(join(ROOT, 'artifacts', 'latest-summary.json'), JSON.stringify(summaryPayload, null, 2), 'utf-8');

  console.log(`Balance sim wrote ${summaries.length} scenarios to ${outDir}`);

  if (verify) {
    const rangesPath = join(ROOT, 'expected-ranges.json');
    const ranges = loadExpectedRanges(rangesPath);
    const errs = verifySummaryAgainstRanges(summaryPayload as unknown as Record<string, unknown>, ranges);
    if (errs.length) {
      console.error('Verification failed:');
      for (const e of errs) console.error(` - ${e}`);
      process.exitCode = 1;
    } else {
      console.log('Verification passed (milestones within expected ranges).');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
