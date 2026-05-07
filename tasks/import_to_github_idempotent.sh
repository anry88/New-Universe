#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-anry88/New-Universe}"
PROJECT_OWNER="${PROJECT_OWNER:-anry88}"
PROJECT_NUMBER="${PROJECT_NUMBER:-3}"
TASKS_JSON="${TASKS_JSON:-tasks.json}"

command -v gh >/dev/null || { echo "gh CLI не установлен. brew install gh"; exit 1; }
command -v jq >/dev/null || { echo "jq не установлен. brew install jq"; exit 1; }
gh auth status >/dev/null || { echo "Не авторизован: gh auth login"; exit 1; }

if [[ ! -f "$TASKS_JSON" ]]; then
  echo "Не найден $TASKS_JSON"
  exit 1
fi

echo ">> Проверяем доступ к Project #$PROJECT_NUMBER..."
PROJECT_ID="$(gh api graphql \
  -f query='query($login:String!,$num:Int!){user(login:$login){projectV2(number:$num){id}}}' \
  -F login="$PROJECT_OWNER" \
  -F num="$PROJECT_NUMBER" \
  --jq .data.user.projectV2.id)"
echo "PROJECT_ID=$PROJECT_ID"

label_exists() {
  local name="$1"
  gh label list --repo "$REPO" --limit 200 --json name \
    | jq -e --arg name "$name" '.[] | select(.name == $name)' >/dev/null
}

ensure_label() {
  local name="$1"
  local color="$2"
  if label_exists "$name"; then
    return 0
  fi
  gh label create "$name" --repo "$REPO" --color "$color" >/dev/null
}

echo ">> Создаём labels (если ещё нет)..."
while IFS= read -r label; do
  ensure_label "$label" "0F4C81"
done < <(jq -r '.tasks[].epic | "epic:\(.)"' "$TASKS_JSON" | sort -u)

while IFS= read -r phase; do
  ensure_label "phase:P$phase" "0F4C81"
done < <(jq -r '.epics[].phase' "$TASKS_JSON" | sort -nu)

while IFS= read -r size; do
  ensure_label "size:$size" "0F4C81"
done < <(jq -r '.tasks[].size' "$TASKS_JSON" | sort -u)

issue_url_by_title() {
  local title="$1"
  gh issue list --repo "$REPO" --state all --limit 200 --json title,url \
    | jq -r --arg title "$title" '.[] | select(.title == $title) | .url' \
    | head -n 1
}

task_body() {
  local task_json="$1"
  local phase="$2"

  jq -r --arg phase "P$phase" '
    def list($items):
      if ($items | length) == 0 then "(нет)"
      else [range(0; $items | length) as $i | "\($i + 1). \($items[$i])"] | join("\n")
      end;
    def bullets($items):
      if ($items | length) == 0 then "- `—`"
      else $items | map("- `\(.)`") | join("\n")
      end;

    "**ID:** \(.id)\n" +
    "**Epic:** \(.epic)\n" +
    "**Size:** \(.size)\n" +
    "**Phase:** \($phase)\n\n" +
    "## Описание\n" +
    "\(.description)\n\n" +
    "## Acceptance criteria\n" +
    "\(list(.acceptance))\n\n" +
    "## Файлы\n" +
    "\(bullets(.files))\n\n" +
    "## Зависимости\n" +
    "\(bullets(.deps))\n\n" +
    "## Как проверить\n" +
    "\(.verify // "—")\n\n" +
    "## Примечания\n" +
    "\(.notes // "—")"
  ' <<<"$task_json"
}

add_to_project() {
  local url="$1"
  local output

  if output="$(gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$url" 2>&1)"; then
    echo "  project: added"
    return 0
  fi

  if grep -qi "already exists in this project" <<<"$output"; then
    echo "  project: already exists"
    return 0
  fi

  echo "$output" >&2
  return 1
}

created=0
reused=0
added_or_present=0

while IFS= read -r encoded_task; do
  task_json="$(printf '%s' "$encoded_task" | base64 --decode)"
  id="$(jq -r '.id' <<<"$task_json")"
  epic="$(jq -r '.epic' <<<"$task_json")"
  size="$(jq -r '.size' <<<"$task_json")"
  title="$(jq -r '.title' <<<"$task_json")"
  phase="$(jq -r --arg epic "$epic" '.epics[] | select(.id == $epic) | .phase' "$TASKS_JSON")"
  issue_title="[$id] $title"

  echo ">> $id: $issue_title"
  url="$(issue_url_by_title "$issue_title")"

  if [[ -n "$url" ]]; then
    echo "  issue: exists $url"
    reused=$((reused + 1))
  else
    body_file="$(mktemp)"
    task_body "$task_json" "$phase" > "$body_file"
    url="$(gh issue create \
      --repo "$REPO" \
      --title "$issue_title" \
      --label "epic:$epic" \
      --label "phase:P$phase" \
      --label "size:$size" \
      --body-file "$body_file")"
    rm -f "$body_file"
    echo "  issue: created $url"
    created=$((created + 1))
  fi

  add_to_project "$url"
  added_or_present=$((added_or_present + 1))
done < <(jq -r '.tasks[] | @base64' "$TASKS_JSON")

echo ""
echo "=== ГОТОВО ==="
echo "Issues reused: $reused"
echo "Issues created: $created"
echo "Project items added/already present: $added_or_present"
