-- P2.1-403: localized naming templates — migrate legacy home system/planet labels.
-- Planets: {shortTag}-{index}; systems.name: English "{slug}'s system {shortTag}" from owner nickname.

UPDATE planets AS p
SET name = sub.short_tag || '-' || sub.idx::text
FROM (
  SELECT
    p2.id AS planet_id,
    lower(substring(replace(s2.id::text, '-', '') FROM 1 FOR 4)) AS short_tag,
    row_number() OVER (PARTITION BY p2.system_id ORDER BY p2.id) AS idx
  FROM planets AS p2
  INNER JOIN systems AS s2 ON s2.id = p2.system_id AND s2.is_home = true
) AS sub
WHERE p.id = sub.planet_id;

UPDATE systems AS s
SET name =
  replace(
    COALESCE(NULLIF(trim(u.tg_username), ''), NULLIF(trim(u.tg_first_name), ''), 'captain'),
    '''',
    ''
  )
  || '''s system '
  || lower(substring(replace(s.id::text, '-', '') FROM 1 FOR 4))
FROM users AS u
WHERE u.id = s.owner_id AND s.is_home = true;
