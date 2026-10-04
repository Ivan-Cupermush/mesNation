-- KPI: код использовал колонки, которых не было в базе, из-за чего списки
-- целей и назначение планов падали с ошибкой сервера.
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS is_personal_monthly_target BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_targets_personal_idx ON sales_targets (user_id, is_personal_monthly_target);
