ALTER TABLE "users" ADD COLUMN "player_nickname" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "player_nickname_change_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION nu_normalize_player_nickname(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(btrim(coalesce(raw_value, '')), '[[:space:]]+', ' ', 'g')
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION nu_is_valid_player_nickname(raw_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized text := nu_normalize_player_nickname(raw_value);
  compact text := lower(regexp_replace(normalized, '[[:space:]-]+', '', 'g'));
  root text;
  blocked_roots text[] := ARRAY[
    'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'piss', 'asshole',
    'bastard', 'whore', 'slut', 'faggot', 'nigger', 'nigga', 'pussy',
    'twat', 'wank', 'huy', 'huj', 'hui', 'hue', 'xuy', 'xuj', 'xui',
    'xue', 'pizd', 'pisd', 'eba', 'ebl', 'ebn', 'ebu', 'jeba', 'jebl',
    'yeba', 'yebl', 'blyad', 'bljad', 'blya', 'blja', 'suka', 'mudak',
    'pidor', 'pidar', 'pider', 'pizdec', 'pizdez', 'gondon', 'gandon',
    'zalup', 'cyka', 'хуй', 'хуе', 'хуи', 'хуя', 'пизд', 'пид',
    'еба', 'ебл', 'ебн', 'ёба', 'ёбл', 'блят', 'бляд', 'сука',
    'мудак', 'залуп', 'гондон', 'гандон'
  ];
BEGIN
  IF char_length(normalized) < 3 OR char_length(normalized) > 30 THEN
    RETURN false;
  END IF;

  IF normalized !~ '^[A-Za-zА-Яа-яЁё0-9 -]+$' THEN
    RETURN false;
  END IF;

  FOREACH root IN ARRAY blocked_roots LOOP
    IF compact LIKE '%' || root || '%' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION nu_initial_player_nickname(
  user_id uuid,
  tg_username text,
  tg_first_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  username_candidate text := nu_normalize_player_nickname(regexp_replace(coalesce(tg_username, ''), '^@+', ''));
  first_name_candidate text := nu_normalize_player_nickname(tg_first_name);
BEGIN
  IF nu_is_valid_player_nickname(username_candidate) THEN
    RETURN username_candidate;
  END IF;

  IF nu_is_valid_player_nickname(first_name_candidate) THEN
    RETURN first_name_candidate;
  END IF;

  RETURN substr(md5(user_id::text), 1, 6);
END;
$$;--> statement-breakpoint
UPDATE "users"
SET
  "player_nickname" = nu_initial_player_nickname("id", "tg_username", "tg_first_name"),
  "player_nickname_change_count" = 0
WHERE "player_nickname" IS NULL;--> statement-breakpoint
DROP FUNCTION nu_initial_player_nickname(uuid, text, text);--> statement-breakpoint
DROP FUNCTION nu_is_valid_player_nickname(text);--> statement-breakpoint
DROP FUNCTION nu_normalize_player_nickname(text);
