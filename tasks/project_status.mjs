#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const OWNER = process.env.PROJECT_OWNER || process.env.OWNER || 'anry88';
const PROJECT_NUMBER = process.env.PROJECT_NUMBER || '3';
const REPO = process.env.REPO || 'anry88/New-Universe';
const TASKS_JSON = process.env.TASKS_JSON || 'tasks/tasks.json';

const VALID_STATUSES = new Set(['Backlog', 'Ready', 'In Progress', 'Review', 'Blocked', 'Done']);
const VALID_VERIFICATIONS = new Set(['Not run', 'Local pass', 'CI pass', 'Manual needed', 'Accepted', 'Blocked']);

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return typeof output === 'string' ? output.trim() : '';
}

function gh(args, options = {}) {
  return run('gh', args, options);
}

function readJson(command, args) {
  const output = run(command, args);
  return output ? JSON.parse(output) : {};
}

function ghJson(args) {
  return readJson('gh', args);
}

function projectAccessHint() {
  return [
    `Cannot read GitHub Project #${PROJECT_NUMBER} for owner ${OWNER}.`,
    'In GitHub Actions, set repository secret PROJECT_TOKEN to a classic personal access token owned by a user who can access the Project, with repo, project, and read:org scopes.',
    'Do not rely on GITHUB_TOKEN or a fine-grained token for this user-owned Project v2 automation.',
  ].join(' ');
}

function usage() {
  console.error(`Usage:
  node tasks/project_status.mjs task <TASK_ID> [--status <Status>] [--verification <Verification>] [--comment <text>]
  node tasks/project_status.mjs sync-ready
  node tasks/project_status.mjs pr --number <PR_NUMBER> --action <opened|reopened|ready_for_review|converted_to_draft|closed|synchronize> [--merged true|false]

Environment:
  PROJECT_OWNER=${OWNER}
  PROJECT_NUMBER=${PROJECT_NUMBER}
  REPO=${REPO}`);
  process.exit(2);
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) usage();
    const key = arg.slice(2);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) usage();
    flags[key] = value;
    i += 1;
  }
  return flags;
}

function loadProject() {
  try {
    const project = ghJson(['project', 'view', PROJECT_NUMBER, '--owner', OWNER, '--format', 'json']);
    const fields = ghJson(['project', 'field-list', PROJECT_NUMBER, '--owner', OWNER, '--format', 'json']).fields || [];
    const items = ghJson(['project', 'item-list', PROJECT_NUMBER, '--owner', OWNER, '--limit', '200', '--format', 'json']).items || [];
    return { projectId: project.id, fields, items };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${projectAccessHint()}\n\nUnderlying error:\n${details}`);
  }
}

function fieldByName(fields, name) {
  const field = fields.find((candidate) => candidate.name === name);
  if (!field) {
    throw new Error(`Project field not found: ${name}`);
  }
  return field;
}

function optionByName(field, name) {
  const option = (field.options || []).find((candidate) => candidate.name === name);
  if (!option) {
    throw new Error(`Project option not found: ${field.name}=${name}`);
  }
  return option;
}

function taskPrefix(taskId) {
  return `[${taskId}]`;
}

function itemForTask(items, taskId) {
  return items.find((item) => (item.title || '').startsWith(taskPrefix(taskId)));
}

function issueNumberForItem(item) {
  return item?.content?.number;
}

function setSingleSelect(project, item, fieldName, optionName) {
  const field = fieldByName(project.fields, fieldName);
  const option = optionByName(field, optionName);
  gh([
    'project',
    'item-edit',
    '--id',
    item.id,
    '--project-id',
    project.projectId,
    '--field-id',
    field.id,
    '--single-select-option-id',
    option.id,
  ]);
}

function commentIssue(issueNumber, body) {
  if (!issueNumber || !body) return;
  gh(['issue', 'comment', String(issueNumber), '--repo', REPO, '--body', body], { stdio: 'inherit' });
}

function updateTask(taskId, flags) {
  const status = flags.status;
  const verification = flags.verification;
  if (!status && !verification && !flags.comment) usage();
  if (status && !VALID_STATUSES.has(status)) throw new Error(`Invalid status: ${status}`);
  if (verification && !VALID_VERIFICATIONS.has(verification)) throw new Error(`Invalid verification: ${verification}`);

  const project = loadProject();
  const item = itemForTask(project.items, taskId);
  if (!item) throw new Error(`Project item not found for ${taskId}`);

  if (status && item.status !== status) setSingleSelect(project, item, 'Status', status);
  if (verification && item.verification !== verification) setSingleSelect(project, item, 'Verification', verification);
  if (flags.comment) commentIssue(issueNumberForItem(item), flags.comment);

  console.log(`${taskId}: ${status || item.status}${verification ? ` / ${verification}` : ''}`);
}

function loadTasks() {
  return JSON.parse(fs.readFileSync(TASKS_JSON, 'utf8')).tasks || [];
}

function syncReady() {
  const project = loadProject();
  const tasks = loadTasks();
  const itemByTask = new Map();
  for (const item of project.items) {
    const match = /^\[(?<id>[^\]]+)\]/.exec(item.title || '');
    if (match?.groups?.id) itemByTask.set(match.groups.id, item);
  }

  let promoted = 0;
  for (const task of tasks) {
    const item = itemByTask.get(task.id);
    if (!item || item.status !== 'Backlog') continue;

    const deps = task.deps || [];
    const ready = deps.length > 0 && deps.every((depId) => itemByTask.get(depId)?.status === 'Done');
    if (!ready) continue;

    setSingleSelect(project, item, 'Status', 'Ready');
    promoted += 1;
    console.log(`${task.id}: Backlog -> Ready`);
  }

  console.log(`Promoted to Ready: ${promoted}`);
}

function extractTaskIds(...parts) {
  const found = new Set();
  const re = /\bP[0-9](?:-[A-Z0-9]+)+\b/g;
  for (const part of parts.filter(Boolean)) {
    for (const match of part.matchAll(re)) found.add(match[0]);
  }
  return [...found].sort();
}

function referencedIssueNumbers(body) {
  const found = new Set();
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|references?)\s+#(?<number>\d+)\b/gi;
  for (const match of (body || '').matchAll(re)) {
    if (match.groups?.number) found.add(match.groups.number);
  }
  return [...found].sort((left, right) => Number(left) - Number(right));
}

function issueTitles(issueNumbers) {
  return issueNumbers.map((issueNumber) => {
    const issue = ghJson(['issue', 'view', issueNumber, '--repo', REPO, '--json', 'title']);
    return issue.title;
  });
}

function updateFromPr(flags) {
  const number = flags.number;
  const action = flags.action;
  if (!number || !action) usage();

  const pr = ghJson([
    'pr',
    'view',
    number,
    '--repo',
    REPO,
    '--json',
    'title,body,headRefName,url,isDraft,mergedAt,state,closingIssuesReferences',
  ]);

  const closingTitles = (pr.closingIssuesReferences || []).map((issue) => issue.title).join('\n');
  const linkedIssueTitles = issueTitles(referencedIssueNumbers(pr.body)).join('\n');
  const ids = extractTaskIds(pr.title, pr.headRefName, closingTitles, linkedIssueTitles);
  if (ids.length === 0) {
    console.log(`PR #${number}: no task ids found`);
    return;
  }

  let status;
  let verification;
  if (action === 'closed') {
    if (flags.merged !== 'true' && !pr.mergedAt) {
      console.log(`PR #${number}: closed without merge; project status unchanged`);
      return;
    }
    status = 'Done';
    verification = 'Accepted';
  } else if (action === 'converted_to_draft') {
    status = 'In Progress';
  } else {
    status = pr.isDraft ? 'In Progress' : 'Review';
  }

  const comment =
    status === 'Review'
      ? `PR opened for review: ${pr.url}`
      : status === 'Done'
        ? `PR merged: ${pr.url}`
        : undefined;

  for (const taskId of ids) {
    updateTask(taskId, { status, verification, comment });
  }

  if (status === 'Done') syncReady();
}

const [command, maybeTaskId, ...rest] = process.argv.slice(2);

try {
  if (command === 'task') {
    if (!maybeTaskId) usage();
    updateTask(maybeTaskId, parseFlags(rest));
  } else if (command === 'sync-ready') {
    syncReady();
  } else if (command === 'pr') {
    updateFromPr(parseFlags([maybeTaskId, ...rest].filter(Boolean)));
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
