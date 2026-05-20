INSERT INTO "player_activity_daily" (
  "user_id",
  "activity_date",
  "first_seen_at",
  "last_seen_at",
  "play_seconds",
  "session_count"
)
SELECT
  "id",
  "created_at"::date,
  "created_at",
  "created_at",
  0,
  1
FROM "users"
ON CONFLICT ("user_id", "activity_date") DO NOTHING;
