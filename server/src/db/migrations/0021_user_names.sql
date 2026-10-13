-- Имя и фамилия отдельно, как в Telegram. Раньше было одно поле «Имя и фамилия»,
-- и приветствие брало первое слово: у «Тимуров Тимур» это фамилия.
-- display_name остаётся полным именем для показа и собирается из этих двух полей.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Разбираем уже сохранённые имена (то же правило, что lib/names.ts):
--   «Тимуров Тимур»            → Тимур / Тимуров (фамилия первой узнаётся по окончанию);
--   «Тимуров Тимур Тимурович»  → Тимур Тимурович / Тимуров (ФИО как в документах);
--   «Тимур Тимурович Тимуров»  → Тимур Тимурович / Тимуров;
--   остальное                   → первое слово / остальные.
-- Как имя показывается (display_name), не меняем.
WITH parts AS (
  SELECT id, w, array_length(w, 1) AS n
  FROM (
    SELECT id, regexp_split_to_array(btrim(display_name), '\s+') AS w
    FROM users
    WHERE first_name IS NULL AND btrim(COALESCE(display_name, '')) <> ''
  ) s
),
marks AS (
  SELECT id, w, n,
         (w[1] ~* '(ов|ев|ёв|ова|ева|ёва|ский|цкий|ской|ская|цкая|енко|швили|дзе|ых|их)$' AND char_length(w[1]) >= 4) AS s1,
         (w[2] ~* '(ов|ев|ёв|ова|ева|ёва|ский|цкий|ской|ская|цкая|енко|швили|дзе|ых|их)$' AND char_length(w[2]) >= 4) AS s2,
         (w[2] ~* '(вич|вна|ична|ич|оглы|кызы)$' AND char_length(w[2]) >= 5) AS p2,
         (w[3] ~* '(вич|вна|ична|ич|оглы|кызы)$' AND char_length(w[3]) >= 5) AS p3
  FROM parts
)
UPDATE users u SET
  first_name = LEFT(CASE
    WHEN m.n = 1 THEN m.w[1]
    WHEN m.n = 3 AND m.p3 AND NOT m.p2 THEN m.w[2] || ' ' || m.w[3]
    WHEN m.n = 3 AND m.p2 THEN m.w[1] || ' ' || m.w[2]
    WHEN m.n = 2 AND m.s1 AND NOT m.s2 THEN m.w[2]
    ELSE m.w[1]
  END, 100),
  last_name = LEFT(CASE
    WHEN m.n = 1 THEN ''
    WHEN m.n = 3 AND m.p3 AND NOT m.p2 THEN m.w[1]
    WHEN m.n = 3 AND m.p2 THEN m.w[3]
    WHEN m.n = 2 AND m.s1 AND NOT m.s2 THEN m.w[1]
    ELSE array_to_string(m.w[2:m.n], ' ')
  END, 100)
FROM marks m
WHERE u.id = m.id;
