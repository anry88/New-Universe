#!/usr/bin/env node
/**
 * Синхронизирует с GitHub Project поля карточек, привязанных к задачам из tasks/tasks.json:
 * - **Phase** — по epic → phase из epics[]
 * - **Status** — только если у карточки статус ещё не задан: как в setup_github_project3_structure.sh
 *   (`deps.length === 0` → Ready, иначе Backlog)
 *
 * Запускать после import_to_github_idempotent.sh, если новые issue попали в проект без полей.
 *
 * Requires: gh CLI, доступ к Project (как у project_status.mjs).
 *
 * Usage:
 *   node tasks/sync_project_phases_from_tasks.mjs
 *   TASKS_JSON=tasks/tasks.json OWNER=anry88 PROJECT_NUMBER=3 node tasks/sync_project_phases_from_tasks.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OWNER = process.env.OWNER || process.env.PROJECT_OWNER || 'anry88';
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || '3', 10);
const TASKS_JSON = path.resolve(process.cwd(), process.env.TASKS_JSON || 'tasks/tasks.json');

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function loadTasksJson() {
  const raw = fs.readFileSync(TASKS_JSON, 'utf8');
  return JSON.parse(raw);
}

function phaseLabelForEpic(epicId, epics) {
  const epic = epics.find((e) => e.id === epicId);
  if (!epic) throw new Error(`Epic not found in tasks.json: ${epicId}`);
  return `P${epic.phase}`;
}

/** Как в setup_github_project3_structure.sh при первичном заведении item */
function initialStatusFromDeps(deps) {
  const list = deps || [];
  return list.length === 0 ? 'Ready' : 'Backlog';
}

function statusIsUnset(status) {
  return status == null || status === '';
}

function projectId() {
  const j = JSON.parse(
    gh(['project', 'list', '--owner', OWNER, '--format', 'json', '--limit', '50']),
  );
  const p = j.projects?.find((x) => x.number === PROJECT_NUMBER);
  if (!p?.id) throw new Error(`Project #${PROJECT_NUMBER} not found for ${OWNER}`);
  return p.id;
}

function singleSelectFieldMeta(fieldName) {
  const j = JSON.parse(gh(['project', 'field-list', String(PROJECT_NUMBER), '--owner', OWNER, '--format', 'json']));
  const field = j.fields?.find((f) => f.name === fieldName);
  if (!field?.id) throw new Error(`Field not found on project: ${fieldName}`);
  const options = {};
  for (const opt of field.options || []) {
    options[opt.name] = opt.id;
  }
  return { fieldId: field.id, options };
}

function loadAllItems() {
  const raw = gh([
    'project',
    'item-list',
    String(PROJECT_NUMBER),
    '--owner',
    OWNER,
    '--limit',
    '2000',
    '--format',
    'json',
  ]);
  const chunk = JSON.parse(raw);
  return chunk.items || [];
}

function taskIdFromTitle(title) {
  const m = /^\[([^\]]+)\]/.exec(title || '');
  return m ? m[1] : null;
}

function itemEdit(projectId, itemId, fieldId, optionId) {
  gh([
    'project',
    'item-edit',
    '--id',
    itemId,
    '--project-id',
    projectId,
    '--field-id',
    fieldId,
    '--single-select-option-id',
    optionId,
  ]);
}

function main() {
  const data = loadTasksJson();
  const epics = data.epics || [];
  const tasks = data.tasks || [];

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const taskPhase = new Map();
  for (const t of tasks) {
    const epic = t.epic;
    if (!epic) continue;
    taskPhase.set(t.id, phaseLabelForEpic(epic, epics));
  }

  const proj = projectId();
  const { fieldId: phaseFieldId, options: phaseOptions } = singleSelectFieldMeta('Phase');
  const { fieldId: statusFieldId, options: statusOptions } = singleSelectFieldMeta('Status');

  const items = loadAllItems();
  let phaseUpdated = 0;
  let statusUpdated = 0;
  let skipped = 0;
  let missingPhaseOpt = 0;
  let missingStatusOpt = 0;

  for (const row of items) {
    const title = row.title || row.content?.title;
    const tid = taskIdFromTitle(title);
    if (!tid || !taskById.has(tid)) {
      skipped += 1;
      continue;
    }

    const task = taskById.get(tid);

    const wantPhase = taskPhase.get(tid);
    if (wantPhase) {
      const currentPhase = row.phase ?? null;
      if (currentPhase !== wantPhase) {
        const optId = phaseOptions[wantPhase];
        if (!optId) {
          console.warn(
            `No Phase option "${wantPhase}" — run tasks/setup_github_project3_structure.sh. Task ${tid}`,
          );
          missingPhaseOpt += 1;
        } else {
          itemEdit(proj, row.id, phaseFieldId, optId);
          console.log(`${tid}: Phase ${currentPhase ?? '∅'} → ${wantPhase}`);
          phaseUpdated += 1;
        }
      }
    }

    const st = row.status;
    if (statusIsUnset(st)) {
      const wantStatus = initialStatusFromDeps(task.deps);
      const sid = statusOptions[wantStatus];
      if (!sid) {
        console.warn(`No Status option "${wantStatus}" in Project. Task ${tid}`);
        missingStatusOpt += 1;
      } else {
        itemEdit(proj, row.id, statusFieldId, sid);
        console.log(`${tid}: Status ∅ → ${wantStatus} (deps: ${(task.deps || []).length})`);
        statusUpdated += 1;
      }
    }
  }

  console.log(
    `\nDone. Phase updated: ${phaseUpdated}, Status filled: ${statusUpdated}, skipped rows: ${skipped}, missing Phase opt: ${missingPhaseOpt}, missing Status opt: ${missingStatusOpt}`,
  );
}

main();
