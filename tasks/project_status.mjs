#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const OWNER = process.env.PROJECT_OWNER || process.env.OWNER || 'anry88';
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || '3', 10);
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

function ghApi(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-F', `${key}=${value}`);
  }
  const output = gh(args);
  return output ? JSON.parse(output) : {};
}

function projectAccessHint() {
  return [
    `Cannot access GitHub Project #${PROJECT_NUMBER} for owner ${OWNER}.`,
    'Check if PROJECT_TOKEN is valid and has repo, project, and read:org scopes.',
  ].join(' ');
}

function usage() {
  console.error(`Usage:
  node tasks/project_status.mjs task <TASK_ID> [--status <Status>] [--verification <Verification>] [--comment <text>]
  node tasks/project_status.mjs start <TASK_ID> [--branch <branch-name>]
  node tasks/project_status.mjs sync-ready
  node tasks/project_status.mjs issue --number <ISSUE_NUMBER> --action <closed>
  node tasks/project_status.mjs pr --number <PR_NUMBER> --action <opened|reopened|ready_for_review|converted_to_draft|closed|synchronize> [--merged true|false]`);
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

const PROJECT_FIELDS_QUERY = `
query($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    ... on User { projectV2(number: $number) { ...ProjectFields } }
    ... on Organization { projectV2(number: $number) { ...ProjectFields } }
  }
}

fragment ProjectFields on ProjectV2 {
  id
  fields(first: 50) {
    nodes {
      ... on ProjectV2SingleSelectField { id name options { id name } }
    }
  }
}`;

const PROJECT_ITEMS_QUERY = `
query($owner: String!, $number: Int!, $after: String) {
  repositoryOwner(login: $owner) {
    ... on User { projectV2(number: $number) { items(first: 100, after: $after) { ...ProjectItems } } }
    ... on Organization { projectV2(number: $number) { items(first: 100, after: $after) { ...ProjectItems } } }
  }
}

fragment ProjectItems on ProjectV2ItemConnection {
  nodes {
    id
    content { ... on Issue { title number } ... on PullRequest { title number } }
    fieldValues(first: 20) {
      nodes {
        ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
      }
    }
  }
  pageInfo {
    hasNextPage
    endCursor
  }
}`;

function mapProjectItem(item) {
  const statusValue = (item.fieldValues?.nodes || []).find((v) => v.field?.name === 'Status');
  const verificationValue = (item.fieldValues?.nodes || []).find((v) => v.field?.name === 'Verification');
  return {
    id: item.id,
    title: item.content?.title || '',
    number: item.content?.number,
    status: statusValue?.name,
    verification: verificationValue?.name,
  };
}

function loadAllProjectItems() {
  const items = [];
  let after = null;
  while (true) {
    const data = ghApi(PROJECT_ITEMS_QUERY, { owner: OWNER, number: PROJECT_NUMBER, after });
    const connection = data.data?.repositoryOwner?.projectV2?.items;
    if (!connection) break;
    for (const item of connection.nodes || []) {
      items.push(mapProjectItem(item));
    }
    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo?.endCursor || null;
  }
  return items;
}

function loadProject() {
  try {
    const data = ghApi(PROJECT_FIELDS_QUERY, { owner: OWNER, number: PROJECT_NUMBER });
    const project = data.data?.repositoryOwner?.projectV2;
    
    if (!project) {
      throw new Error(`Project #${PROJECT_NUMBER} not found for owner ${OWNER}`);
    }

    const fields = project.fields.nodes.filter(f => f.id);
    const items = loadAllProjectItems();

    return { projectId: project.id, fields, items };
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${projectAccessHint()}\n\nUnderlying error:\n${details}`);
  }
}

function fieldByName(fields, name) {
  const field = fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`Project field not found: ${name}`);
  return field;
}

function optionByName(field, name) {
  const option = (field.options || []).find((candidate) => candidate.name === name);
  if (!option) throw new Error(`Project option not found: ${field.name}=${name}`);
  return option;
}

function taskPrefix(taskId) {
  return `[${taskId}]`;
}

function itemForTask(items, taskId) {
  return items.find((item) => (item.title || '').startsWith(taskPrefix(taskId)));
}

function setSingleSelect(project, item, fieldName, optionName) {
  const field = fieldByName(project.fields, fieldName);
  const option = optionByName(field, optionName);
  gh([
    'project', 'item-edit', '--id', item.id, '--project-id', project.projectId,
    '--field-id', field.id, '--single-select-option-id', option.id,
  ]);
}

function commentIssue(issueNumber, body) {
  if (!issueNumber || !body) return;
  try {
    gh(['issue', 'comment', String(issueNumber), '--repo', REPO, '--body', body]);
  } catch (e) {
    console.warn(`Failed to comment on issue #${issueNumber}: ${e.message}`);
  }
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
  if (flags.comment) commentIssue(item.number, flags.comment);

  console.log(`${taskId}: ${status || item.status}${verification ? ` / ${verification}` : ''}`);
}

function startTask(taskId, flags) {
  const branch = flags.branch || run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  updateTask(taskId, {
    status: 'In Progress',
    verification: 'Not run',
    comment: `Started in branch ${branch}.`,
  });
}

function loadTasks() {
  return JSON.parse(fs.readFileSync(TASKS_JSON, 'utf8')).tasks || [];
}

function loadTaskIdSet() {
  return new Set(loadTasks().map((task) => task.id));
}

function isBacklogLike(status) {
  return status == null || status === '' || status === 'Backlog';
}

/** Maps task id (from issue title prefix `[id]`) to CLOSED | OPEN. Paginates repo issues. */
function loadIssueStateByTaskId() {
  const map = new Map();
  let page = 1;
  while (page <= 100) {
    const output = gh([
      'issue', 'list', '--repo', REPO, '--state', 'all', '--limit', '100',
      '--json', 'title,state', '--page', String(page),
    ]);
    const rows = JSON.parse(output);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const match = /^\[(?<id>[^\]]+)\]/.exec(row.title || '');
      if (!match?.groups?.id) continue;
      const id = match.groups.id;
      if (row.state === 'CLOSED') {
        map.set(id, 'CLOSED');
      } else if (!map.has(id)) {
        map.set(id, row.state);
      }
    }
    page += 1;
  }
  return map;
}

/** True if dependency is done on the Project board or the GitHub issue is closed (source of truth). */
function dependencyResolved(depId, itemByTask, issueStateByTaskId) {
  const depItem = itemByTask.get(depId);
  if (depItem?.status === 'Done') return true;
  return issueStateByTaskId.get(depId) === 'CLOSED';
}

function syncReady() {
  const project = loadProject();
  const tasks = loadTasks();
  const issueStateByTaskId = loadIssueStateByTaskId();
  const itemByTask = new Map();
  for (const item of project.items) {
    const match = /^\[(?<id>[^\]]+)\]/.exec(item.title || '');
    if (match?.groups?.id) itemByTask.set(match.groups.id, item);
  }

  let promoted = 0;
  for (const task of tasks) {
    const item = itemByTask.get(task.id);
    if (!item || !isBacklogLike(item.status)) continue;

    const deps = task.deps || [];
    const depsSatisfied =
      deps.length === 0
        ? true
        : deps.every((depId) => dependencyResolved(depId, itemByTask, issueStateByTaskId));
    if (!depsSatisfied) continue;

    setSingleSelect(project, item, 'Status', 'Ready');
    promoted += 1;
    console.log(`${task.id}: ${item.status ?? '∅'} -> Ready`);
  }
  console.log(`Promoted to Ready: ${promoted}`);
}

function updateFromIssue(flags) {
  const number = flags.number;
  const action = flags.action;
  if (!number || !action) usage();

  if (action !== 'closed') {
    console.log(`Issue #${number}: action ${action} ignored`);
    return;
  }

  const output = gh(['issue', 'view', String(number), '--repo', REPO, '--json', 'title,body,url']);
  const issue = JSON.parse(output);
  const knownTaskIds = loadTaskIdSet();
  const ids = extractTaskIds(issue.title, issue.body).filter((id) => knownTaskIds.has(id));

  if (ids.length === 0) {
    console.log(`Issue #${number}: no task ids found`);
    return;
  }

  for (const taskId of ids) {
    updateTask(taskId, {
      status: 'Done',
      verification: 'Accepted',
      comment: `Issue closed: ${issue.url}`,
    });
  }

  syncReady();
}

function extractTaskIds(...parts) {
  const found = new Set();
  const re = /\bP[0-9]+(?:\.[0-9]+)?(?:-[A-Z0-9]+)+\b/g;
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
    try {
      const output = gh(['issue', 'view', String(issueNumber), '--repo', REPO, '--json', 'title']);
      return JSON.parse(output).title;
    } catch (e) {
      return '';
    }
  });
}

function updateFromPr(flags) {
  const number = flags.number;
  const action = flags.action;
  if (!number || !action) usage();

  const output = gh(['pr', 'view', String(number), '--repo', REPO, '--json', 'title,body,headRefName,url,isDraft,mergedAt,state,closingIssuesReferences']);
  const pr = JSON.parse(output);

  const knownTaskIds = loadTaskIdSet();
  const closingTitles = (pr.closingIssuesReferences || []).map((issue) => issue.title).join('\n');
  const linkedIssueTitles = issueTitles(referencedIssueNumbers(pr.body)).join('\n');
  const ids = extractTaskIds(pr.title, pr.headRefName, closingTitles, linkedIssueTitles).filter((id) => knownTaskIds.has(id));

  const merged = action === 'closed' && (flags.merged === 'true' || !!pr.mergedAt);

  if (action === 'closed' && !merged) {
    console.log(`PR #${number}: closed without merge; project status unchanged`);
    return;
  }

  if (ids.length === 0) {
    console.log(`PR #${number}: no task ids found`);
    if (merged) {
      console.log(`PR #${number}: sync-ready after merge (PR had no linked task ids in title/body/branch)`);
      syncReady();
    }
    return;
  }

  let status;
  let verification;
  if (merged) {
    status = 'Done';
    verification = 'Accepted';
  } else if (action === 'converted_to_draft') {
    status = 'In Progress';
  } else {
    status = pr.isDraft ? 'In Progress' : 'Review';
  }

  const comment = status === 'Review' ? `PR opened for review: ${pr.url}` : status === 'Done' ? `PR merged: ${pr.url}` : undefined;

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
  } else if (command === 'start') {
    if (!maybeTaskId) usage();
    startTask(maybeTaskId, parseFlags(rest));
  } else if (command === 'sync-ready') {
    syncReady();
  } else if (command === 'issue') {
    updateFromIssue(parseFlags([maybeTaskId, ...rest].filter(Boolean)));
  } else if (command === 'pr') {
    updateFromPr(parseFlags([maybeTaskId, ...rest].filter(Boolean)));
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
