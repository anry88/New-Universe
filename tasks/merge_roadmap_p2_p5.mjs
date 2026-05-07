import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const tasksPath = path.join(root, "tasks.json");
const additionsPath = path.join(root, "roadmap_p2_p5_additions.json");
const csvPath = path.join(root, "tasks.csv");
const roadmapPath = path.join(root, "ROADMAP_P2_P5.md");
const coveragePath = path.join(root, "ROADMAP_COVERAGE_MATRIX.md");

const base = JSON.parse(fs.readFileSync(tasksPath, "utf8"));
const additions = JSON.parse(fs.readFileSync(additionsPath, "utf8"));

const epicById = new Map([...base.epics, ...additions.epics].map((epic) => [epic.id, epic]));

function taskPrompt(task) {
  const acceptance = task.acceptance?.length
    ? task.acceptance.map((item, index) => `  ${index + 1}. ${item}`).join("\n")
    : "  (нет)";
  const files = task.files?.length ? task.files.map((item) => `  - ${item}`).join("\n") : "  - —";
  const deps = task.deps?.length ? task.deps.map((item) => `  - ${item}`).join("\n") : "  (нет)";

  return `[TASK ${task.id}] ${task.title}

ОПИСАНИЕ
${task.description}

ACCEPTANCE CRITERIA
${acceptance}

ФАЙЛЫ ДЛЯ СОЗДАНИЯ/ИЗМЕНЕНИЯ
${files}

ЗАВИСИМОСТИ (должны быть выполнены ранее)
${deps}

КАК ПРОВЕРИТЬ
  ${task.verify || "—"}

ТЕХНИЧЕСКИЕ ЗАМЕТКИ
  ${task.notes || "—"}`;
}

function normalizeTask(task) {
  return {
    ...task,
    acceptance: task.acceptance || [],
    files: task.files || [],
    deps: task.deps || [],
    verify: task.verify || "—",
    notes: task.notes || "—",
    prompt: task.prompt || taskPrompt(task),
  };
}

function appendUnique(existing, incoming) {
  const seen = new Set(existing.map((item) => item.id));
  const result = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }
  return result;
}

const merged = {
  ...base,
  epics: appendUnique(base.epics, additions.epics),
  tasks: appendUnique(base.tasks, additions.tasks.map(normalizeTask)).map(normalizeTask),
};

fs.writeFileSync(tasksPath, `${JSON.stringify(merged, null, 2)}\n`);

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

const csvRows = [
  [
    "id",
    "epic",
    "phase",
    "size",
    "title",
    "description",
    "deps",
    "files",
    "acceptance",
    "verify",
    "notes",
    "labels",
  ],
];

for (const task of merged.tasks) {
  const phase = `P${epicById.get(task.epic)?.phase ?? ""}`;
  csvRows.push([
    task.id,
    task.epic,
    phase,
    task.size,
    task.title,
    task.description,
    task.deps.join(";"),
    task.files.join(";"),
    task.acceptance.join(" | "),
    task.verify,
    task.notes,
    [`epic:${task.epic}`, `phase:${phase}`, `size:${task.size}`].join(";"),
  ]);
}

fs.writeFileSync(csvPath, `${csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);

const newTasks = additions.tasks.map(normalizeTask);
const newEpics = additions.epics;
const tasksByEpic = Map.groupBy(newTasks, (task) => task.epic);

let roadmap = `# New Universe Roadmap P2-P5

Generated from \`roadmap_p2_p5_additions.json\`.

This document exists for future verification. It records why the roadmap was expanded and what each new task is expected to prove before it can be closed.

## Scope

- P2 expands the current MVP into a broader solo game: colonies, cargo, NPC market, research levels 1-3, and balance/regression tooling.
- P3 introduces multiplayer surfaces: shared sector presence, alliances, and player-to-player market foundations.
- P4 prepares production launch: deployment, observability, backups, security, analytics, and monetization readiness.
- P5 defines post-launch live operations: events, content packs, balance loop, and support/admin runbooks.

## New Epics

| Epic | Phase | Title | Tasks |
|---|---:|---|---:|
`;

for (const epic of newEpics) {
  roadmap += `| \`${epic.id}\` | P${epic.phase} | ${epic.title} | ${tasksByEpic.get(epic.id)?.length || 0} |\n`;
}

roadmap += `
## New Tasks

`;

for (const epic of newEpics) {
  const tasks = tasksByEpic.get(epic.id) || [];
  if (!tasks.length) continue;
  roadmap += `### ${epic.id} — ${epic.title}\n\n`;
  for (const task of tasks) {
    roadmap += `#### ${task.id} — ${task.title}\n\n`;
    roadmap += `Size: \`${task.size}\`  \n`;
    roadmap += `Depends on: ${task.deps.length ? task.deps.map((dep) => `\`${dep}\``).join(", ") : "none"}\n\n`;
    roadmap += `${task.description}\n\n`;
    roadmap += `Acceptance:\n`;
    for (const item of task.acceptance) {
      roadmap += `- ${item}\n`;
    }
    roadmap += `\nVerify: ${task.verify}\n\n`;
  }
}

fs.writeFileSync(roadmapPath, roadmap);

const phaseCounts = Map.groupBy(merged.tasks, (task) => `P${epicById.get(task.epic)?.phase ?? "?"}`);
const newPhaseCounts = Map.groupBy(newTasks, (task) => `P${epicById.get(task.epic)?.phase ?? "?"}`);

let coverage = `# Roadmap Coverage Matrix

This document is a checkpoint for future planning reviews. It separates implemented-detail backlog from roadmap backlog so agents do not confuse MVP scope with full-game completion.

## Task Counts

| Phase | Current total tasks | Newly added tasks | Coverage meaning |
|---|---:|---:|---|
`;

const phaseMeaning = {
  P0: "Project setup and local development foundation",
  P1: "First playable solo MVP loop",
  P2: "Solo expansion and balance validation",
  P3: "Multiplayer/social/economy foundations",
  P4: "Production launch readiness",
  P5: "Live operations after launch",
};

for (const phase of ["P0", "P1", "P2", "P3", "P4", "P5"]) {
  coverage += `| ${phase} | ${phaseCounts.get(phase)?.length || 0} | ${newPhaseCounts.get(phase)?.length || 0} | ${phaseMeaning[phase]} |\n`;
}

coverage += `
## Completion Gates

| Gate | Required evidence |
|---|---|
| MVP playable | P0/P1 issues closed, first-day E2E passes, Telegram auth works, resource/building/ship/expedition loop works |
| Phase 2 complete | Colonization E2E passes, market flow passes, research levels 1-3 work, balance simulator and P2 regression suite pass |
| Phase 3 ready | Two-player visibility model is proven, alliance membership works, player market settlement is safe |
| Launch ready | Staging deploy/rollback succeeds, backups restore, monitoring alerts fire, security checklist passes |
| Live ops ready | Event framework works, content validation exists, balance review loop and support runbook are usable |

## Known Gaps After This Expansion

- P3 is still intentionally lighter than P2 and should be broken down again after Phase 2 regression is stable.
- Monetization is kept as readiness/design until analytics and security gates are in place.
- Admin UI is not fully specified yet; P5 support tasks define the runbook first.
- Deep PvP combat is not covered; current roadmap covers multiplayer presence, alliances, and market before combat.
- Full localization pipeline is represented through content-pack validation, but not yet through translator workflow tasks.
`;

fs.writeFileSync(coveragePath, coverage);

console.log(`Merged tasks: ${merged.tasks.length}`);
console.log(`Merged epics: ${merged.epics.length}`);
console.log(`Wrote ${path.relative(process.cwd(), csvPath)}`);
console.log(`Wrote ${path.relative(process.cwd(), roadmapPath)}`);
console.log(`Wrote ${path.relative(process.cwd(), coveragePath)}`);
