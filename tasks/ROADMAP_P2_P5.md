# New Universe Roadmap P2-P5

Generated from `roadmap_p2_p5_additions.json`.

This document exists for future verification. It records why the roadmap was expanded and what each new task is expected to prove before it can be closed.

## Scope

- P2 expands the current MVP into a broader solo game: colonies, cargo, research levels 1-3, and balance/regression tooling.
- P2.3 adds the missing navigation bridge from the protected Home System into Common Pool: Jump Gate unlock, random jump, known destinations, and gate-routed scout/colonizer/cargo missions.
- P3 introduces multiplayer surfaces: shared sector presence and alliances.
- P4 prepares production launch: deployment, observability, backups, security, analytics, and monetization readiness.
- P5 defines post-launch live operations: events, content packs, balance loop, and support/admin runbooks.

## New Epics

| Epic | Phase | Title | Tasks |
|---|---:|---|---:|
| `EPIC-P2-COL` | P2 | Phase 2 — Colonization and second planet | 8 |
| `EPIC-P2-RES` | P2 | Phase 2 — Research levels 1-3 | 5 |
| `EPIC-P2-POL` | P2 | Phase 2 — Balance, polish, regression | 4 |
| `EPIC-P2.3-JUMP-GATE` | P2.3 | Phase 2.3 — Jump Gate and Common Pool routing | 9 |
| `EPIC-P3-MAP` | P3 | Phase 3 — Multiplayer common map | 2 |
| `EPIC-P3-ALL` | P3 | Phase 3 — Alliances | 2 |
| `EPIC-P4-DEPLOY` | P4 | Phase 4 — Production deployment | 3 |
| `EPIC-P4-OPS` | P4 | Phase 4 — Operations and observability | 2 |
| `EPIC-P4-SEC` | P4 | Phase 4 — Security and abuse prevention | 2 |
| `EPIC-P4-ANALYTICS` | P4 | Phase 4 — Product analytics | 1 |
| `EPIC-P4-MON` | P4 | Phase 4 — Monetization readiness | 1 |
| `EPIC-P5-LIVE` | P5 | Phase 5 — Live operations | 2 |
| `EPIC-P5-CONTENT` | P5 | Phase 5 — Content pipeline | 1 |
| `EPIC-P5-BALANCE` | P5 | Phase 5 — Balance loop | 1 |
| `EPIC-P5-SUPPORT` | P5 | Phase 5 — Support and admin runbooks | 1 |

## New Tasks

### EPIC-P2-COL — Phase 2 — Colonization and second planet

#### P2-COL-001 — Colonies data model and ownership rules

Size: `M`  
Depends on: `P1-103`, `P1-108`

Add the data model for player colonies outside the home system: colony identity, owner, planet binding, founding timestamp, active/inactive state, and limits per user.

Acceptance:
- A player can own multiple colonies linked to discovered planets
- Home-system planet ownership is still protected from other players
- Database constraints prevent duplicate colonies on the same planet for one owner
- Migration is generated and reversible in local dev

Verify: Run colony model unit tests and inspect the generated migration in Postgres

#### P2-COL-002 — Colonizer deployment flow

Size: `L`  
Depends on: `P2-COL-001`, `P1-170`, `P1-182`

Implement the backend service and API for deploying a colonizer ship on an eligible discovered planet in the common pool.

Acceptance:
- Only colonizer ships can found a colony
- Target planet must be discovered by the player and outside protected foreign home systems
- Ship is consumed or converted according to the GDD rule chosen in implementation notes
- Founding creates a colony and a level 1 command center

Verify: API test: build colonizer, jump to discovered planet, found a colony, verify colony state

#### P2-COL-003 — Colony bootstrap economy

Size: `M`  
Depends on: `P2-COL-002`, `P1-150`, `P1-160`

Define the starting resource, storage, and building state for a newly founded colony so it can become useful without breaking early-game balance.

Acceptance:
- New colony starts with configured minimal storage and command center
- No resource is created unless explicitly defined by bootstrap config
- Bootstrap values are versioned and test-covered
- Colony cannot immediately create infinite resource loops with home planet

Verify: Unit test creates a colony and asserts resource/storage/building state

#### P2-COL-004 — Interplanetary cargo transfer API

Size: `L`  
Depends on: `P2-COL-001`, `P1-151`, `P1-170`

Add API and service logic for sending resources between player-owned planets through cargo ships.

Acceptance:
- Player can transfer resources only between owned colonies/planets
- Cargo capacity and travel time are enforced
- Resources are reserved atomically at departure
- Cancelled/failed transfers cannot duplicate resources

Verify: API test sends cargo from home planet to colony and verifies reserved resources

#### P2-COL-005 — Cargo route worker

Size: `M`  
Depends on: `P2-COL-004`, `P1-221`

Implement a worker that completes cargo transfers, applies delivered resources, and records failures safely.

Acceptance:
- Completed transfer adds cargo to destination exactly once
- Worker is idempotent when run repeatedly
- Late or failed transfers are visible for debugging
- Notifications can be emitted after delivery

Verify: Worker test advances time and verifies one-time delivery

#### P2-COL-006 — Colony management UI

Size: `M`  
Depends on: `P2-COL-004`, `P1-201`

Add frontend screens for viewing colonies, switching active planet, and initiating cargo transfers.

Acceptance:
- Player can see all owned colonies and their core resources
- Player can switch focus between planets
- Cargo transfer dialog shows capacity, ETA, and validation errors
- UI handles empty colony state cleanly

Verify: Manual/UI test: view colony list and start a cargo transfer

#### P2-COL-007 — Colonization constraints and cost balance

Size: `M`  
Depends on: `P2-COL-002`, `P2-RES-003`

Define and enforce costs, cooldowns, max colony count, distance limits, and required tech/building gates for colonization.

Acceptance:
- Colonization rules are declared in a typed config
- Backend validates all gates before founding
- Frontend can display why colonization is blocked
- Balance numbers are documented for future tuning

Verify: Tests cover allowed and blocked colonization attempts

#### P2-COL-008 — Colonization end-to-end scenario

Size: `L`  
Depends on: `P2-COL-006`, `P2-COL-007`

Add an automated scenario covering first colony discovery, colonizer build, colonization, and first cargo transfer.

Acceptance:
- E2E scenario passes against local stack
- Scenario covers at least one blocked colonization attempt
- Scenario verifies no resource duplication during transfer
- Test runtime remains acceptable for CI

Verify: Run backend and frontend colonization E2E tests

### EPIC-P2-RES — Phase 2 — Research levels 1-3

#### P2-RES-001 — Research effects engine

Size: `M`  
Depends on: `P1-106`, `P1-150`

Implement a typed effects engine that applies research bonuses to production, storage, ship speed, sensor range, and build times.

Acceptance:
- Effects are typed and testable
- Multiple research bonuses compose deterministically
- Backend services consume effects through a single API
- No frontend-only bonus calculation is trusted

Verify: Unit tests verify stacked effects for resources and ships

#### P2-RES-002 — Tech catalog levels 1-3

Size: `M`  
Depends on: `P2-RES-001`

Expand the seeded research catalog to levels 1-3 for all planned Phase 2 branches.

Acceptance:
- Each branch has levels 1-3 with cost and duration
- Seeder is idempotent
- Catalog includes ru/en names and descriptions
- Catalog entries reference typed effects

Verify: Seed database and verify expected research count and effects

#### P2-RES-003 — Research unlock gates

Size: `M`  
Depends on: `P2-RES-002`, `P1-160`, `P1-170`

Implement gates that unlock buildings, ships, colonization, and cargo capacity based on completed research.

Acceptance:
- Backend validates unlock gates for gated actions
- Frontend can display missing research requirements
- Research dependencies are stored in catalog config
- Tests cover blocked and allowed actions

Verify: Tests confirm locked ship/building/colonization actions are rejected

#### P2-RES-004 — Research completion worker and effect cache invalidation

Size: `M`  
Depends on: `P2-RES-001`, `P1-221`

Add worker logic for completing research, applying unlock state, and invalidating any cached effect snapshots.

Acceptance:
- Research transitions to completed exactly once
- Effects are available immediately after completion
- Player notification is created if notifications are enabled
- Worker is retry-safe

Verify: Worker test advances research and verifies effects become active

#### P2-RES-005 — Research UI levels 1-3

Size: `M`  
Depends on: `P2-RES-003`, `P1-205`

Upgrade the research UI to show full level 1-3 branches, requirements, effects, and real-time progress.

Acceptance:
- All available research branches and levels are visible
- Locked nodes explain missing requirements
- Completed research shows applied effects
- Starting research updates UI optimistically with safe rollback

Verify: Manual/UI test starts and completes one level 2 research path

### EPIC-P2-POL — Phase 2 — Balance, polish, regression

#### P2-POL-001 — Economy balance simulator

Size: `M`  
Depends on: `P2-COL-007`, `P2-RES-002`

Create a deterministic simulator for first-day and first-week resource, building, ship, research, and colonization progression.

Acceptance:
- Simulator can run without external services
- Outputs key timings and bottleneck resources
- Scenario fixtures cover beginner and optimized paths
- Results are saved as artifacts for comparison

Verify: Run balance simulator and compare generated summary to expected ranges

#### P2-POL-002 — Content and seed consistency audit

Size: `S`  
Depends on: `P2-RES-002`, `P1-104`, `P1-105`

Add a repeatable audit that validates catalog seeds, resource ids, building ids, ship ids, and research ids against GDD-derived expectations.

Acceptance:
- Audit fails on missing or duplicate catalog ids
- Audit verifies every user-facing catalog item has ru/en names
- Audit checks resource tier consistency
- Audit can run in CI

Verify: Run seed audit test suite

#### P2-POL-003 — Phase 2 regression suite

Size: `L`  
Depends on: `P2-COL-008`, `P2-RES-005`

Create a regression suite covering P2 colonization, research, and cargo flows together.

Acceptance:
- Suite covers one full expansion path from research completion to first colony cargo transfer
- Suite validates no resource duplication across colony cargo transfer
- Suite is documented for local and CI execution
- Failures point to the responsible feature area

Verify: Run Phase 2 regression suite locally

#### P2-EPIC-POLISH — [Эпик] Phase 2 balance, polish, and regression gate

Size: `L`  
Depends on: `P2-POL-001`, `P2-POL-002`, `P2-POL-003`

Top-level Phase 2 gate that groups economy simulation, content audit, and regression work required before the roadmap should proceed into detailed Phase 3 execution.

Acceptance:
- P2 balance simulator produces a reviewable first-week report
- Content audit passes against catalog and localization expectations
- Phase 2 regression suite passes locally and is documented
- Known P2 tuning risks are recorded before Phase 3 task breakdown

Verify: Review Phase 2 completion gate evidence in ROADMAP_COVERAGE_MATRIX.md

### EPIC-P2.3-JUMP-GATE — Phase 2.3 — Jump Gate and Common Pool routing

See [`ROADMAP_P2_3_JUMP_GATE.md`](ROADMAP_P2_3_JUMP_GATE.md) for the roll-up evidence plan and product decisions. This epic replaces the old direct jump concept with a private Jump Gate and a repeatable **random jump** action.

#### P2.3-500 — [Эпик] Phase 2.3 — Jump Gate and Common Pool routing

Size: `XL`
Depends on: `P2.2-012`, `P2-COL-008`, `P3-MAP-001`

Roll-up for Jump Gate, random jump, known destinations, gate-routed colonization/cargo, and regression coverage.

Verify: `jq -r '.tasks[].id | select(test("^P2\\.3-5"))' tasks/tasks.json` and `./scripts/ci-verify.sh`; closing PR should carry `run-e2e`.

#### P2.3-501 — Jump Gate data model and unlock state

Size: `M`
Depends on: `P2.1-417`, `P2.1-418`, `P1-182`

Add private Jump Gate state unlocked by completed `jump_drive >= 1`, with shared contracts and visibility protection.

Verify: Backend tests for locked/unlocked state and foreign visibility suppression.

#### P2.3-502 — Random jump service and known destination registry

Size: `L`
Depends on: `P2.3-501`, `P1-142`, `P1-143`, `P1-144`

Replace manual sector targeting with server-authoritative random jump and store opened common systems as known destinations.

Verify: Integration tests for locked denial, random common destination creation, repeat destination jump, and Home System suppression.

#### P2.3-503 — Common-system discovery contracts for Jump Gate destinations

Size: `M`
Depends on: `P2.3-502`, `P3-MAP-001`

Define what jump reveals: the system becomes known, while planets remain behind sensor/recon discovery rules.

Verify: API and visibility tests for known destination vs planet discovery separation.

#### P2.3-504 — Jump Gate expedition routing for scouts and colonizers

Size: `L`
Depends on: `P2.3-503`, `P2-COL-002`, `P2-COL-007`, `P2.2-011`

Route scout/recon and colonizer missions through known gate destinations with server-side ETA/fuel and colonization gates.

Verify: Backend tests for scout routeMode and colonizer through gate; frontend preview checks.

#### P2.3-505 — Jump Gate cargo routing between home and common colonies

Size: `L`
Depends on: `P2.3-504`, `P2-COL-004`, `P2-COL-005`, `P2.2-008`

Allow one-way logistics transfers between owned settlements across Home/Common systems through Jump Gate routes.

Verify: Cargo tests for home -> common colony, common colony -> home, insufficient fuel/cargo, and duplicate worker runs.

#### P2.3-506 — Jump fuel economy and balance integration

Size: `M`
Depends on: `P2.3-502`, `P2.2-003`, `P2.2-012`

Connect jump routes to a coherent fuel economy, preferably a `jump_fuel` resource/recipe, and mirror it in balance tooling.

Verify: Production/jump cost tests, catalog audit, and balance simulator where available.

#### P2.3-507 — Jump Gate frontend surface and destination UX

Size: `L`
Depends on: `P2.3-503`, `P2.3-504`, `P2.3-505`

Add the Home System gate object, random jump action, known destination list, and launch flows for scout/colonizer/cargo.

Verify: Frontend build/tests and manual mobile smoke for locked gate, random jump, destination list, colonizer, and cargo states.

#### P2.3-508 — Jump Gate end-to-end regression scenario

Size: `L`
Depends on: `P2.3-507`, `P2.3-506`

Cover unlock -> random jump -> known destination -> discovery/colonization -> cargo delivery with no Home System leak.

Verify: Focused backend E2E and optional `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` for the closing roll-up.

### EPIC-P3-MAP — Phase 3 — Multiplayer common map

#### P3-MAP-001 — Shared sector presence model

Size: `L`  
Depends on: `P2-COL-008`, `P1-144`

Define how player-owned colonies and fleets become visible in common sectors without exposing protected home-system data.

Acceptance:
- Presence model distinguishes home, colony, fleet, and public sector entities
- Visibility rules are explicit and testable
- Data model supports multiple players in one sector
- No private home-system entity leaks to another player

Verify: Visibility tests with two players in the same sector

#### P3-MAP-002 — Sector map multiplayer UI

Size: `L`  
Depends on: `P3-MAP-001`, `P1-203`

Add a sector map UI layer that can show other player colonies, visible fleets, neutral systems, and local player assets.

Acceptance:
- Map distinguishes local, neutral, and other-player entities
- Entity details respect visibility permissions
- UI remains usable on mobile
- Unknown entities are represented without leaking hidden data

Verify: Manual/UI test with fixture sector containing two players

### EPIC-P3-ALL — Phase 3 — Alliances

#### P3-ALL-001 — Alliance membership model

Size: `L`  
Depends on: `P2-POL-003`

Add alliance creation, membership, roles, invitations, and basic permissions.

Acceptance:
- Player can create an alliance
- Player can invite, accept, leave, and remove members according to role
- Alliance size limit is enforced
- Membership changes are auditable

Verify: API tests cover create, invite, accept, kick, and leave

#### P3-ALL-002 — Alliance bank and permissions

Size: `M`  
Depends on: `P3-ALL-001`, `P1-151`

Add a shared alliance bank with deposit/withdraw permissions and basic transaction logs.

Acceptance:
- Members can deposit allowed resources
- Only permitted roles can withdraw
- All transactions are logged
- Bank actions cannot bypass storage/resource transaction safety

Verify: API tests cover deposit/withdraw permission paths

### EPIC-P4-DEPLOY — Phase 4 — Production deployment

#### P4-DEP-001 — Production environment plan

Size: `L`  
Depends on: `P2-POL-003`

Document and implement the target production topology for backend, frontend, worker, Postgres, Redis, secrets, and domains.

Acceptance:
- Production topology is documented with service responsibilities
- Secrets strategy is documented and excludes repo storage
- Deployment target and rollback approach are chosen
- Open infrastructure costs are estimated

Verify: Production plan review checklist is completed

#### P4-DEP-002 — Deployment pipeline and release workflow

Size: `L`  
Depends on: `P4-DEP-001`, `P0-006`

Create CI/CD workflow for production deploys, migrations, release tagging, and rollback documentation.

Acceptance:
- Deploy pipeline runs from protected branch or manual approval
- Database migrations are handled safely
- Release tag and changelog are generated
- Rollback procedure is documented and tested in staging

Verify: Run staging deployment and rollback drill

#### P4-EPIC-LAUNCH — [Эпик] Production launch readiness

Size: `XL`  
Depends on: `P4-DEP-002`, `P4-OPS-001`, `P4-OPS-002`, `P4-SEC-001`, `P4-ANA-001`, `P4-MON-001`

Top-level launch readiness gate covering production deployment, observability, backups, security hardening, analytics, and monetization policy readiness.

Acceptance:
- Staging deployment and rollback workflow are proven
- Monitoring, alerting, and backup restore drill are complete
- Security and abuse-prevention checklists pass
- Analytics and monetization readiness documents are reviewed

Verify: Complete launch readiness checklist and link all evidence in the issue

### EPIC-P4-OPS — Phase 4 — Operations and observability

#### P4-OPS-001 — Monitoring dashboards and alerts

Size: `M`  
Depends on: `P4-DEP-001`, `P0-007`, `P0-008`

Define metrics, logs, alerts, and dashboards for API health, worker queues, database, Redis, Telegram bot, and user-facing errors.

Acceptance:
- Critical alerts exist for API down, worker stuck, DB unavailable, queue backlog, and high error rate
- Dashboard shows key service health
- Runbook links are attached to alerts
- Alert thresholds are documented

Verify: Trigger test alert and verify runbook path

#### P4-OPS-002 — Backups and restore drill

Size: `M`  
Depends on: `P4-DEP-001`

Implement and document database backup, restore, retention, and verification process.

Acceptance:
- Backup schedule and retention are documented
- Restore process works in staging
- Restore drill captures RPO/RTO
- Secrets and PII handling are documented

Verify: Run staging restore drill from backup artifact

### EPIC-P4-SEC — Phase 4 — Security and abuse prevention

#### P4-SEC-001 — Security hardening and abuse limits

Size: `L`  
Depends on: `P1-120`, `P2-POL-003`

Audit and harden auth, Telegram initData validation, rate limits, request validation, secret handling, and write endpoints.

Acceptance:
- All public mutation endpoints have rate limits and validation
- Telegram auth cannot be replayed outside accepted rules
- Secrets are loaded from production secret storage
- Security checklist is documented and reviewed

Verify: Run security checklist and endpoint validation tests

#### P4-SEC-002 — Economy exploit and anti-cheat review

Size: `M`  
Depends on: `P2-POL-003`

Add tests and review notes for resource duplication, clock abuse, repeated worker execution, and cargo settlement exploits.

Acceptance:
- Known exploit classes have regression tests or documented mitigations
- Worker idempotency is verified for critical paths
- Cargo/resource loops are reviewed
- Risk register is updated with accepted risks

Verify: Run economy exploit regression suite

### EPIC-P4-ANALYTICS — Phase 4 — Product analytics

#### P4-ANA-001 — Product analytics event taxonomy

Size: `M`  
Depends on: `P1-206`, `P2-POL-003`

Define and implement core product analytics events for onboarding, retention, building, ships, research, expeditions, and monetization.

Acceptance:
- Analytics event taxonomy is documented
- Events include stable names and safe properties
- No sensitive Telegram data is sent unnecessarily
- Frontend and backend emit critical events consistently

Verify: Run local analytics sink and verify core events

### EPIC-P4-MON — Phase 4 — Monetization readiness

#### P4-MON-001 — Monetization and Telegram policy readiness

Size: `L`  
Depends on: `P4-ANA-001`, `P4-SEC-001`

Define launch-safe monetization surfaces, Telegram policy constraints, purchase flow boundaries, and non-pay-to-win guardrails.

Acceptance:
- Monetization design is documented and mapped to Telegram requirements
- No paid flow is implemented without policy review
- Economy impact and abuse risks are documented
- Implementation tasks can be created from the approved plan

Verify: Complete monetization readiness review checklist

### EPIC-P5-LIVE — Phase 5 — Live operations

#### P5-LIVE-001 — Live ops calendar and event framework

Size: `M`  
Depends on: `P4-DEP-002`, `P4-ANA-001`

Create the framework for scheduled live events, modifiers, announcements, and rollback/disable switches.

Acceptance:
- Event calendar format is documented
- Events can be enabled/disabled without deployment
- Announcements can be shown in TMA and bot
- Rollback path is documented

Verify: Enable a test event locally and verify UI/banner state

#### P5-EPIC-LIVEOPS — [Эпик] Live operations readiness

Size: `L`  
Depends on: `P5-LIVE-001`, `P5-CONT-001`, `P5-BAL-001`, `P5-SUP-001`

Top-level post-launch operations gate covering events, content packs, balance review, and support/admin runbooks.

Acceptance:
- Live event framework can be enabled and disabled safely
- Content pack validation catches bad content before rollout
- Balance review loop has simulator and telemetry inputs
- Support/admin runbook is usable for incident and player-support scenarios

Verify: Complete live-ops readiness review and link evidence in the issue

### EPIC-P5-CONTENT — Phase 5 — Content pipeline

#### P5-CONT-001 — Content pack pipeline

Size: `M`  
Depends on: `P2-POL-002`, `P5-LIVE-001`

Define how new resources, buildings, ships, research, events, and localized text are added safely after launch.

Acceptance:
- Content pack format is documented
- Validation catches missing localization and invalid ids
- Content can be reviewed before enabling
- Rollback process exists for bad content

Verify: Validate a sample content pack with intentional errors

### EPIC-P5-BALANCE — Phase 5 — Balance loop

#### P5-BAL-001 — Balance review loop and telemetry dashboard

Size: `M`  
Depends on: `P2-POL-001`, `P4-ANA-001`

Create the recurring balance review process using analytics, economy simulator outputs, retention data, and player progression metrics.

Acceptance:
- Balance review checklist exists
- Telemetry dashboard tracks progression bottlenecks
- Simulator scenarios can be compared between balance versions
- Changes produce documented before/after notes

Verify: Run a sample balance review using synthetic telemetry

### EPIC-P5-SUPPORT — Phase 5 — Support and admin runbooks

#### P5-SUP-001 — Support and admin runbook

Size: `M`  
Depends on: `P4-OPS-001`, `P4-SEC-001`

Document support workflows for player lookup, issue triage, refunds/compensation policy, incident response, and safe admin actions.

Acceptance:
- Support runbook covers common player issues
- Admin actions require audit logs or manual log procedure
- Compensation policy is documented
- Incident response path is clear

Verify: Run tabletop incident/support scenario against the runbook
