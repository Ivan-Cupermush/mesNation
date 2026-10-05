-- 0013: у дерева ролей ровно один корень — директор.
--
-- Раньше роль могла потерять родителя (старое удаление через внешний ключ
-- ON DELETE SET NULL). Такая роль становилась вторым «корнем»: на дереве
-- она рисовалась отдельно в ряд с директором, а её сотрудники получали
-- права директора (раздел «Настройки», управление деревом).
--
-- Настоящий корень: узел с именем director/«Директор», иначе — с самой
-- большой веткой, иначе — самый ранний. Остальные корни становятся его
-- прямыми подчинёнными; дальше их можно перенести на нужное место в
-- приложении («Перенести под другую роль»).

DO $$
DECLARE
  root_id INT;
BEGIN
  IF (SELECT COUNT(*) FROM role_tree WHERE parent_id IS NULL) > 1 THEN
    SELECT r.id INTO root_id
    FROM role_tree r
    WHERE r.parent_id IS NULL
    ORDER BY
      (LOWER(r.name) IN ('director', 'директор') OR LOWER(COALESCE(r.description, '')) LIKE 'директор%') DESC,
      (
        WITH RECURSIVE sub AS (
          SELECT c.id, 1 AS d FROM role_tree c WHERE c.parent_id = r.id
          UNION ALL
          SELECT c.id, sub.d + 1 FROM role_tree c JOIN sub ON c.parent_id = sub.id WHERE sub.d < 100
        )
        SELECT COUNT(*) FROM sub
      ) DESC,
      r.id
    LIMIT 1;

    UPDATE role_tree SET parent_id = root_id WHERE parent_id IS NULL AND id <> root_id;
  END IF;
END $$;

-- Уровни по фактической структуре.
WITH RECURSIVE t AS (
  SELECT id, 0 AS depth FROM role_tree WHERE parent_id IS NULL
  UNION ALL
  SELECT rt.id, t.depth + 1 FROM role_tree rt JOIN t ON rt.parent_id = t.id WHERE t.depth < 100
)
UPDATE role_tree SET level = t.depth FROM t WHERE role_tree.id = t.id AND role_tree.level IS DISTINCT FROM t.depth;

-- Второй корень больше не появится: база не даст сохранить его.
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_tree_single_root ON role_tree ((parent_id IS NULL)) WHERE parent_id IS NULL;
