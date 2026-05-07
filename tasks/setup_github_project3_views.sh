#!/usr/bin/env bash
set -euo pipefail

OWNER="${OWNER:-anry88}"
PROJECT_NUMBER="${PROJECT_NUMBER:-3}"

command -v gh >/dev/null || { echo "gh CLI не установлен"; exit 1; }
command -v jq >/dev/null || { echo "jq не установлен"; exit 1; }
gh auth status >/dev/null || { echo "gh не авторизован"; exit 1; }

FIELD_TITLE=344487621
FIELD_STATUS=344487623
FIELD_LINKED_PRS=344487625
FIELD_PHASE=344695499
FIELD_EPIC=344695513
FIELD_SIZE=344695514
FIELD_WORK_TYPE=344695528
FIELD_AREA=344695548
FIELD_PRIORITY=344695589
FIELD_ESTIMATE=344695603
FIELD_VERIFICATION=344695643
FIELD_DEPENDS_ON=344695644

existing_views() {
  gh api graphql \
    -f query='query($login:String!,$num:Int!){user(login:$login){projectV2(number:$num){views(first:50){nodes{name}}}}}' \
    -F login="$OWNER" \
    -F num="$PROJECT_NUMBER" \
    --jq '.data.user.projectV2.views.nodes[].name'
}

view_exists() {
  local name="$1"
  existing_views | grep -Fxq "$name"
}

create_view() {
  local name="$1"
  local layout="$2"
  local filter="$3"

  if view_exists "$name"; then
    echo "  view exists: $name"
    return 0
  fi

  echo "  create view: $name"
  gh api -X POST "users/$OWNER/projectsV2/$PROJECT_NUMBER/views" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2026-03-10' \
    -f name="$name" \
    -f layout="$layout" \
    -f filter="$filter" \
    -F "visible_fields[]=$FIELD_TITLE" \
    -F "visible_fields[]=$FIELD_STATUS" \
    -F "visible_fields[]=$FIELD_PHASE" \
    -F "visible_fields[]=$FIELD_AREA" \
    -F "visible_fields[]=$FIELD_WORK_TYPE" \
    -F "visible_fields[]=$FIELD_PRIORITY" \
    -F "visible_fields[]=$FIELD_ESTIMATE" \
    -F "visible_fields[]=$FIELD_VERIFICATION" \
    -F "visible_fields[]=$FIELD_DEPENDS_ON" \
    -F "visible_fields[]=$FIELD_LINKED_PRS" >/dev/null
}

echo ">> Creating Project #$PROJECT_NUMBER views for $OWNER"

create_view "Execution Board" "board" "phase:P0,P1"
create_view "Phase 0 Setup" "board" "phase:P0"
create_view "Phase 1 Core" "board" "phase:P1"
create_view "Roadmap P2-P5" "table" "phase:P2,P3,P4,P5"
create_view "Phase 2 Expansion" "board" "phase:P2"
create_view "Phase 3 Multiplayer" "board" "phase:P3"
create_view "Launch Readiness" "board" "phase:P4"
create_view "Live Ops" "board" "phase:P5"
create_view "Review" "table" "status:Review"
create_view "Blocked" "table" "status:Blocked"
create_view "Epics" "table" "work-type:Epic"
create_view "Frontend" "board" "area:Frontend"
create_view "Backend/Core" "board" "area:DB,Auth,World,Economy,Buildings,Ships,Expeditions,Bot"
create_view "QA" "board" "area:QA"

echo "=== ГОТОВО ==="
