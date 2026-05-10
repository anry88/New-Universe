#!/usr/bin/env bash
set -euo pipefail

OWNER="${OWNER:-anry88}"
PROJECT_NUMBER="${PROJECT_NUMBER:-3}"
REPO="${REPO:-anry88/New-Universe}"
TASKS_JSON="${TASKS_JSON:-tasks/tasks.json}"

command -v gh >/dev/null || { echo "gh CLI не установлен"; exit 1; }
command -v jq >/dev/null || { echo "jq не установлен"; exit 1; }
gh auth status >/dev/null || { echo "gh не авторизован"; exit 1; }

if [[ ! -f "$TASKS_JSON" ]]; then
  echo "Не найден $TASKS_JSON"
  exit 1
fi

FIELDS_FILE="$(mktemp)"
ITEMS_FILE="$(mktemp)"
ISSUES_FILE="$(mktemp)"
trap 'rm -f "$FIELDS_FILE" "$ITEMS_FILE" "$ISSUES_FILE"' EXIT

refresh_fields() {
  gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json > "$FIELDS_FILE"
}

refresh_items() {
  # Must cover all project items (GitHub default limit is small); otherwise tasks later in the list never match.
  gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit 2000 --format json > "$ITEMS_FILE"
}

field_id() {
  local name="$1"
  jq -r --arg name "$name" '.fields[] | select(.name == $name) | .id' "$FIELDS_FILE" | head -n 1
}

option_id() {
  local field="$1"
  local option="$2"
  jq -r --arg field "$field" --arg option "$option" \
    '.fields[] | select(.name == $field) | .options[]? | select(.name == $option) | .id' \
    "$FIELDS_FILE" | head -n 1
}

ensure_single_select_field() {
  local name="$1"
  local options="$2"

  if [[ -n "$(field_id "$name")" ]]; then
    echo "  field exists: $name"
    update_single_select_field_options "$name" "$options"
    return 0
  fi

  echo "  create field: $name"
  gh project field-create "$PROJECT_NUMBER" \
    --owner "$OWNER" \
    --name "$name" \
    --data-type SINGLE_SELECT \
    --single-select-options "$options" \
    --format json >/dev/null
  refresh_fields
  update_single_select_field_options "$name" "$options"
}

ensure_number_field() {
  local name="$1"

  if [[ -n "$(field_id "$name")" ]]; then
    echo "  field exists: $name"
    return 0
  fi

  echo "  create field: $name"
  gh project field-create "$PROJECT_NUMBER" \
    --owner "$OWNER" \
    --name "$name" \
    --data-type NUMBER \
    --format json >/dev/null
  refresh_fields
}

ensure_text_field() {
  local name="$1"

  if [[ -n "$(field_id "$name")" ]]; then
    echo "  field exists: $name"
    return 0
  fi

  echo "  create field: $name"
  gh project field-create "$PROJECT_NUMBER" \
    --owner "$OWNER" \
    --name "$name" \
    --data-type TEXT \
    --format json >/dev/null
  refresh_fields
}

update_status_options() {
  local status_id
  status_id="$(field_id "Status")"

  if [[ -z "$status_id" ]]; then
    echo "Не найдено поле Status"
    exit 1
  fi

  local backlog_id ready_id in_progress_id review_id blocked_id done_id
  backlog_id="$(option_id "Status" "Backlog")"
  if [[ -z "$backlog_id" ]]; then
    backlog_id="$(option_id "Status" "Todo")"
  fi
  ready_id="$(option_id "Status" "Ready")"
  in_progress_id="$(option_id "Status" "In Progress")"
  review_id="$(option_id "Status" "Review")"
  blocked_id="$(option_id "Status" "Blocked")"
  done_id="$(option_id "Status" "Done")"

  local input_file
  input_file="$(mktemp)"
  jq -n \
    --arg fieldId "$status_id" \
    --arg backlogId "$backlog_id" \
    --arg readyId "$ready_id" \
    --arg inProgressId "$in_progress_id" \
    --arg reviewId "$review_id" \
    --arg blockedId "$blocked_id" \
    --arg doneId "$done_id" \
    'def option($id; $name; $color; $description):
      {name: $name, color: $color, description: $description}
      + (if $id == "" then {} else {id: $id} end);
    {
      query: "mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }",
      variables: {
        input: {
          fieldId: $fieldId,
          singleSelectOptions: [
            option($backlogId; "Backlog"; "GRAY"; "Not ready to start yet"),
            option($readyId; "Ready"; "GREEN"; "Dependencies are satisfied"),
            option($inProgressId; "In Progress"; "YELLOW"; "Actively being implemented"),
            option($reviewId; "Review"; "PURPLE"; "PR opened or awaiting validation"),
            option($blockedId; "Blocked"; "RED"; "Blocked by dependency, secret, environment, or decision"),
            option($doneId; "Done"; "BLUE"; "Accepted and complete")
          ]
        }
      }
    }' > "$input_file"

  echo "  update field: Status options"
  gh api graphql --input "$input_file" >/dev/null
  rm -f "$input_file"
  refresh_fields
}

update_single_select_field_options() {
  local name="$1"
  local options="$2"
  local field
  field="$(field_id "$name")"

  if [[ -z "$field" ]]; then
    echo "Не найдено поле $name"
    exit 1
  fi

  local existing input_file
  existing="$(jq -c --arg name "$name" '.fields[] | select(.name == $name) | (.options // [])' "$FIELDS_FILE")"
  input_file="$(mktemp)"

  jq -n \
    --arg fieldId "$field" \
    --arg options "$options" \
    --argjson existing "$existing" \
    'def color($name):
      if $name == "Now" then "RED"
      elif $name == "High" then "ORANGE"
      elif $name == "Medium" then "YELLOW"
      elif $name == "Low" then "GRAY"
      elif $name == "Accepted" or $name == "CI pass" or $name == "Local pass" then "GREEN"
      elif $name == "Blocked" then "RED"
      elif ($name | startswith("P")) then "BLUE"
      elif ($name | startswith("EPIC-P0")) then "BLUE"
      elif ($name | startswith("EPIC-P1")) then "PURPLE"
      elif ($name | startswith("EPIC-P2")) then "GREEN"
      elif ($name | startswith("EPIC-P3")) then "YELLOW"
      elif ($name | startswith("EPIC-P4")) then "ORANGE"
      elif ($name | startswith("EPIC-P5")) then "PINK"
      else "GRAY" end;
    def existing_id($name):
      [$existing[]? | select(.name == $name) | .id][0];
    {
      query: "mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }",
      variables: {
        input: {
          fieldId: $fieldId,
          singleSelectOptions: (
            $options
            | split(",")
            | map(gsub("^\\s+|\\s+$"; ""))
            | map(select(length > 0))
            | map(. as $name | {name: $name, color: color($name), description: ""} + (existing_id($name) as $id | if $id == null then {} else {id: $id} end))
          )
        }
      }
    }' > "$input_file"

  echo "  update field: $name options"
  gh api graphql --input "$input_file" >/dev/null
  rm -f "$input_file"
  refresh_fields
}

phase_for_task() {
  local epic="$1"
  jq -r --arg epic "$epic" '.epics[] | select(.id == $epic) | "P\(.phase)"' "$TASKS_JSON"
}

area_for_epic() {
  case "$1" in
    EPIC-P0-INFRA) echo "Infra" ;;
    EPIC-P1-DB) echo "DB" ;;
    EPIC-P1-AUTH) echo "Auth" ;;
    EPIC-P1-WORLD) echo "World" ;;
    EPIC-P1-RES) echo "Economy" ;;
    EPIC-P1-BLD) echo "Buildings" ;;
    EPIC-P1-SHP) echo "Ships" ;;
    EPIC-P1-EXP) echo "Expeditions" ;;
    EPIC-P1-FE) echo "Frontend" ;;
    EPIC-P1-BOT) echo "Bot" ;;
    EPIC-P1-QA) echo "QA" ;;
    EPIC-P1.1-FIX) echo "Frontend" ;;
    EPIC-P2.1-GAMEPLAY) echo "World" ;;
    EPIC-P2-OUT) echo "Phase 2 Outline" ;;
    EPIC-P2-COL) echo "Colonization" ;;
    EPIC-P2-MKT) echo "Market" ;;
    EPIC-P2-RES) echo "Research" ;;
    EPIC-P2-POL) echo "Balance" ;;
    EPIC-P3-OUT) echo "Phase 3 Outline" ;;
    EPIC-P3-MAP) echo "Multiplayer Map" ;;
    EPIC-P3-ALL) echo "Alliances" ;;
    EPIC-P3-MKT) echo "Player Market" ;;
    EPIC-P4-DEPLOY) echo "Production" ;;
    EPIC-P4-OPS) echo "Ops" ;;
    EPIC-P4-SEC) echo "Security" ;;
    EPIC-P4-ANALYTICS) echo "Analytics" ;;
    EPIC-P4-MON) echo "Monetization" ;;
    EPIC-P5-LIVE) echo "Live Ops" ;;
    EPIC-P5-CONTENT) echo "Content" ;;
    EPIC-P5-BALANCE) echo "Balance" ;;
    EPIC-P5-SUPPORT) echo "Support" ;;
    *) echo "Unknown" ;;
  esac
}

work_type_for_task() {
  local id="$1"
  local epic="$2"
  local title="$3"

  if [[ "$id" == *"EPIC"* || "$title" == *"[Эпик]"* ]]; then
    echo "Epic"
  elif [[ "$title" == Worker:* || "$title" == *"Worker:"* ]]; then
    echo "Worker"
  elif [[ "$epic" == "EPIC-P0-INFRA" ]]; then
    echo "Infra"
  elif [[ "$epic" == "EPIC-P1-DB" ]]; then
    echo "Schema"
  elif [[ "$epic" == "EPIC-P1-FE" ]]; then
    echo "UI"
  elif [[ "$epic" == "EPIC-P1-QA" ]]; then
    echo "Test"
  elif [[ "$epic" == "EPIC-P1-BOT" ]]; then
    echo "Bot"
  elif [[ "$epic" == "EPIC-P4-DEPLOY" ]]; then
    echo "Deploy"
  elif [[ "$epic" == "EPIC-P4-OPS" ]]; then
    echo "Ops"
  elif [[ "$epic" == "EPIC-P4-SEC" ]]; then
    echo "Security"
  elif [[ "$epic" == "EPIC-P4-ANALYTICS" ]]; then
    echo "Analytics"
  elif [[ "$epic" == "EPIC-P4-MON" ]]; then
    echo "Monetization"
  elif [[ "$epic" == "EPIC-P5-LIVE" ]]; then
    echo "Live Ops"
  elif [[ "$epic" == "EPIC-P5-CONTENT" ]]; then
    echo "Content"
  elif [[ "$epic" == "EPIC-P5-BALANCE" ]]; then
    echo "Balance"
  elif [[ "$epic" == "EPIC-P5-SUPPORT" ]]; then
    echo "Support"
  elif [[ "$title" == POST* || "$title" == GET* || "$title" == *"POST /"* || "$title" == *"GET /"* ]]; then
    echo "API"
  else
    echo "Feature"
  fi
}

priority_for_phase() {
  case "$1" in
    P0) echo "Now" ;;
    P1) echo "High" ;;
    P2) echo "Medium" ;;
    P3) echo "Low" ;;
    P4) echo "Medium" ;;
    P5) echo "Low" ;;
    *) echo "Medium" ;;
  esac
}

estimate_for_size() {
  case "$1" in
    S) echo "1" ;;
    M) echo "3" ;;
    L) echo "5" ;;
    XL) echo "8" ;;
    *) echo "3" ;;
  esac
}

item_id_for_task() {
  local task_id="$1"
  jq -r --arg prefix "[$task_id]" \
    '.items[] | select(.title | startswith($prefix)) | .id' \
    "$ITEMS_FILE" | head -n 1
}

current_status_for_task() {
  local task_id="$1"
  jq -r --arg prefix "[$task_id]" \
    '.items[] | select(.title | startswith($prefix)) | .status // empty' \
    "$ITEMS_FILE" | head -n 1
}

current_verification_for_task() {
  local task_id="$1"
  jq -r --arg prefix "[$task_id]" \
    '.items[] | select(.title | startswith($prefix)) | .verification // empty' \
    "$ITEMS_FILE" | head -n 1
}

# CLOSED / OPEN / empty (нет совпадающего issue в выборке `gh issue list`)
issue_state_for_task() {
  local task_id="$1"
  [[ -s "$ISSUES_FILE" ]] || { echo ""; return; }
  jq -r --arg prefix "[$task_id]" '
    [.[] | select(.title | startswith($prefix)) | .state] | first // empty
  ' "$ISSUES_FILE"
}

# Как sync-ready в project_status.mjs: каждая зависимость закрыта на GitHub или в статусе Done на доске.
deps_all_done_for_ready() {
  local task_json="$1"
  local dep_id
  while IFS= read -r dep_id; do
    [[ -z "$dep_id" ]] && continue
    local ist st
    ist="$(issue_state_for_task "$dep_id")"
    st="$(current_status_for_task "$dep_id")"
    if [[ "$ist" == "CLOSED" ]] || [[ "$st" == "Done" ]]; then
      continue
    fi
    return 1
  done < <(jq -r '.deps[]?' <<<"$task_json")
  return 0
}

status_backlog_or_ready_from_deps() {
  local task_json="$1"
  local deps_len="$2"
  status="Backlog"
  verification="Not run"
  if [[ "$deps_len" == "0" ]] || deps_all_done_for_ready "$task_json"; then
    status="Ready"
  fi
}

must_option_id() {
  local field="$1"
  local option="$2"
  local id
  id="$(option_id "$field" "$option")"
  if [[ -z "$id" ]]; then
    echo "Не найдена option '$option' в поле '$field'" >&2
    exit 1
  fi
  echo "$id"
}

update_item_fields() {
  local item_id="$1"
  local status="$2"
  local phase="$3"
  local epic="$4"
  local size="$5"
  local work_type="$6"
  local area="$7"
  local priority="$8"
  local estimate="$9"
  local verification="${10}"
  local depends_on="${11}"

  local input_file
  input_file="$(mktemp)"

  jq -n \
    --arg project "$PROJECT_ID" \
    --arg item "$item_id" \
    --arg statusField "$STATUS_FIELD_ID" \
    --arg status "$(must_option_id "Status" "$status")" \
    --arg phaseField "$PHASE_FIELD_ID" \
    --arg phase "$(must_option_id "Phase" "$phase")" \
    --arg epicField "$EPIC_FIELD_ID" \
    --arg epic "$(must_option_id "Epic" "$epic")" \
    --arg sizeField "$SIZE_FIELD_ID" \
    --arg size "$(must_option_id "Size" "$size")" \
    --arg workTypeField "$WORK_TYPE_FIELD_ID" \
    --arg workType "$(must_option_id "Work Type" "$work_type")" \
    --arg areaField "$AREA_FIELD_ID" \
    --arg area "$(must_option_id "Area" "$area")" \
    --arg priorityField "$PRIORITY_FIELD_ID" \
    --arg priority "$(must_option_id "Priority" "$priority")" \
    --arg estimateField "$ESTIMATE_FIELD_ID" \
    --argjson estimate "$estimate" \
    --arg verificationField "$VERIFICATION_FIELD_ID" \
    --arg verification "$(must_option_id "Verification" "$verification")" \
    --arg dependsField "$DEPENDS_ON_FIELD_ID" \
    --arg depends "$depends_on" \
    '{
      query: "mutation($project: ID!, $item: ID!, $statusField: ID!, $status: String!, $phaseField: ID!, $phase: String!, $epicField: ID!, $epic: String!, $sizeField: ID!, $size: String!, $workTypeField: ID!, $workType: String!, $areaField: ID!, $area: String!, $priorityField: ID!, $priority: String!, $estimateField: ID!, $estimate: Float!, $verificationField: ID!, $verification: String!, $dependsField: ID!, $depends: String!) { status: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $statusField, value: {singleSelectOptionId: $status}}) { projectV2Item { id } } phase: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $phaseField, value: {singleSelectOptionId: $phase}}) { projectV2Item { id } } epic: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $epicField, value: {singleSelectOptionId: $epic}}) { projectV2Item { id } } size: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $sizeField, value: {singleSelectOptionId: $size}}) { projectV2Item { id } } workType: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $workTypeField, value: {singleSelectOptionId: $workType}}) { projectV2Item { id } } area: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $areaField, value: {singleSelectOptionId: $area}}) { projectV2Item { id } } priority: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $priorityField, value: {singleSelectOptionId: $priority}}) { projectV2Item { id } } estimate: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $estimateField, value: {number: $estimate}}) { projectV2Item { id } } verification: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $verificationField, value: {singleSelectOptionId: $verification}}) { projectV2Item { id } } dependsOn: updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $dependsField, value: {text: $depends}}) { projectV2Item { id } } }",
      variables: {
        project: $project,
        item: $item,
        statusField: $statusField,
        status: $status,
        phaseField: $phaseField,
        phase: $phase,
        epicField: $epicField,
        epic: $epic,
        sizeField: $sizeField,
        size: $size,
        workTypeField: $workTypeField,
        workType: $workType,
        areaField: $areaField,
        area: $area,
        priorityField: $priorityField,
        priority: $priority,
        estimateField: $estimateField,
        estimate: $estimate,
        verificationField: $verificationField,
        verification: $verification,
        dependsField: $dependsField,
        depends: $depends
      }
    }' > "$input_file"

  gh api graphql --input "$input_file" >/dev/null
  rm -f "$input_file"
}

echo ">> Project #$PROJECT_NUMBER / owner $OWNER"
PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq .id)"
echo "PROJECT_ID=$PROJECT_ID"

echo ">> Refresh fields"
refresh_fields

# SETUP_ITEMS_ONLY=1 — только перезапись карточек из tasks.json (без мутаций опций полей проекта).
# Нужен при исчерпании GraphQL rate limit после полного прогона.
if [[ "${SETUP_ITEMS_ONLY:-}" != "1" ]]; then
  echo ">> Update Status options"
  update_status_options

  echo ">> Ensure custom fields"
  PHASE_OPTIONS="$(jq -r '[.epics[].phase] | unique | map("P\(.)") | join(",")' "$TASKS_JSON")"
  EPIC_OPTIONS="$(jq -r '[.epics[].id] | join(",")' "$TASKS_JSON")"
  ensure_single_select_field "Phase" "$PHASE_OPTIONS"
  ensure_single_select_field "Epic" "$EPIC_OPTIONS"
  ensure_single_select_field "Size" "S,M,L,XL"
  ensure_single_select_field "Work Type" "Epic,Infra,Schema,API,Worker,UI,Test,Bot,Docs,Feature,Chore,Spike,Deploy,Ops,Security,Analytics,Monetization,Live Ops,Content,Balance,Support"
  ensure_single_select_field "Area" "Infra,DB,Auth,World,Economy,Buildings,Ships,Expeditions,Frontend,Bot,QA,Phase 2 Outline,Colonization,Market,Research,Balance,Phase 3 Outline,Multiplayer Map,Alliances,Player Market,Production,Ops,Security,Analytics,Monetization,Live Ops,Content,Support,Unknown"
  ensure_single_select_field "Priority" "Now,High,Medium,Low"
  ensure_number_field "Estimate"
  ensure_single_select_field "Verification" "Not run,Local pass,CI pass,Manual needed,Accepted,Blocked"
  ensure_text_field "Depends On"
fi
refresh_fields

STATUS_FIELD_ID="$(field_id "Status")"
PHASE_FIELD_ID="$(field_id "Phase")"
EPIC_FIELD_ID="$(field_id "Epic")"
SIZE_FIELD_ID="$(field_id "Size")"
WORK_TYPE_FIELD_ID="$(field_id "Work Type")"
AREA_FIELD_ID="$(field_id "Area")"
PRIORITY_FIELD_ID="$(field_id "Priority")"
ESTIMATE_FIELD_ID="$(field_id "Estimate")"
VERIFICATION_FIELD_ID="$(field_id "Verification")"
DEPENDS_ON_FIELD_ID="$(field_id "Depends On")"

if [[ "${SETUP_ITEMS_ONLY:-}" != "1" ]]; then
echo ">> Update Project description/readme"
PROJECT_README='## Operating Model

Use this project as the execution board for New Universe tasks.

Recommended views to create in the GitHub UI:

- Execution Board: group by `Status`, filter `Phase:P0,P1,P1.1`
- Phase 0 Setup: filter `Phase:P0`
- Phase 1 Core: filter `Phase:P1`
- Phase 1.1 Post-fixes: filter `Phase:P1.1`
- Roadmap P0-P5: table, filter `Phase:P0,P1,P1.1,P2,P2.1,P3,P4,P5`
- Roadmap P2-P5: table, filter `Phase:P2,P2.1,P3,P4,P5`
- Phase 2 Expansion: filter `Phase:P2,P2.1`
- Phase 2.1 Gameplay: filter `Phase:P2.1`
- Phase 3 Multiplayer: filter `Phase:P3`
- Launch Readiness: filter `Phase:P4`
- Live Ops: filter `Phase:P5`
- Review: filter `Status:Review`
- Blocked: filter `Status:Blocked`
- Epics: filter `Work Type:Epic`
- Frontend: filter `Area:Frontend`
- Backend/Core: filter `Area:DB,Auth,World,Economy,Buildings,Ships,Expeditions,Bot`
- QA: filter `Area:QA`

Status policy:

- `Backlog`: dependency or planning is not ready yet
- `Ready`: dependencies are satisfied and an agent can start
- `In Progress`: implementation branch is active
- `Review`: PR is open or waiting for validation
- `Blocked`: dependency, secret, environment, or decision is missing
- `Done`: PR merged, verification accepted, issue closed

PR policy:

- Use task branches like `task/P1-141-home-system`
- PR title starts with the task ID
- Use `Closes #issue` only for complete work; use `Refs #issue` for partial work
- Close issues and mark `Done` only after verification and confirmation'
gh project edit "$PROJECT_NUMBER" \
  --owner "$OWNER" \
  --description "Execution board for New Universe MVP tasks and agent PR workflow" \
  --readme "$PROJECT_README" \
  --format json >/dev/null
fi

echo ">> Refresh items"
refresh_items

echo ">> Fetch GitHub issue states ($REPO)"
if ! gh issue list --repo "$REPO" --state all --limit 2000 --json number,title,state >"$ISSUES_FILE" 2>/dev/null; then
  echo "  warning: gh issue list failed; Status falls back to board snapshot + deps only" >&2
  printf '%s\n' '[]' >"$ISSUES_FILE"
fi

updated=0
missing=0

while IFS= read -r encoded_task; do
  task_json="$(printf '%s' "$encoded_task" | base64 --decode)"
  task_id="$(jq -r '.id' <<<"$task_json")"
  epic="$(jq -r '.epic' <<<"$task_json")"
  size="$(jq -r '.size' <<<"$task_json")"
  title="$(jq -r '.title' <<<"$task_json")"
  deps_len="$(jq -r '.deps | length' <<<"$task_json")"
  deps="$(jq -r '.deps | join(", ")' <<<"$task_json")"

  item_id="$(item_id_for_task "$task_id")"
  if [[ -z "$item_id" ]]; then
    echo "  missing project item for $task_id"
    missing=$((missing + 1))
    continue
  fi

  phase="$(phase_for_task "$epic")"
  area="$(area_for_epic "$epic")"
  work_type="$(work_type_for_task "$task_id" "$epic" "$title")"
  priority="$(priority_for_phase "$phase")"
  estimate="$(estimate_for_size "$size")"

  cur_status="$(current_status_for_task "$task_id")"
  cur_verification="$(current_verification_for_task "$task_id")"
  issue_state="$(issue_state_for_task "$task_id")"

  # Закрытый issue — источник правды для Done (чинит регресс после sync только по deps/борду).
  if [[ "$issue_state" == "CLOSED" ]]; then
    status="Done"
    verification="Accepted"
  elif [[ "$issue_state" == "OPEN" ]]; then
    case "$cur_status" in
      Review|"In Progress"|Blocked)
        status="$cur_status"
        verification="${cur_verification:-Not run}"
        ;;
      *)
        status_backlog_or_ready_from_deps "$task_json" "$deps_len"
        ;;
    esac
  else
    case "$cur_status" in
      Done|Review|"In Progress"|Blocked)
        status="$cur_status"
        verification="${cur_verification:-Not run}"
        ;;
      *)
        status_backlog_or_ready_from_deps "$task_json" "$deps_len"
        ;;
    esac
  fi

  echo "  $task_id -> $status / $phase / $area / $work_type / $priority / $estimate"
  update_item_fields "$item_id" "$status" "$phase" "$epic" "$size" "$work_type" "$area" "$priority" "$estimate" "$verification" "$deps"
  updated=$((updated + 1))
done < <(jq -r '.tasks[] | @base64' "$TASKS_JSON")

echo ""
echo "=== ГОТОВО ==="
echo "Updated items: $updated"
echo "Missing items: $missing"
