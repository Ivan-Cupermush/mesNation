-- Миграция 008: Переделка архитектуры KPI продаж
-- Концепция: у каждого менеджера свой личный план на месяц

-- 1. Переименовать поле
ALTER TABLE sales_targets 
RENAME COLUMN is_department_target TO is_personal_monthly_target;

-- 2. Удалить department_id (больше не нужен)
ALTER TABLE sales_targets 
DROP COLUMN IF EXISTS department_id;

-- 3. Добавить поле created_by (кто назначил план — руководитель)
ALTER TABLE sales_targets 
ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL;

-- 4. Добавить индекс для быстрого поиска активного плана
CREATE INDEX IF NOT EXISTS idx_sales_targets_personal_monthly 
ON sales_targets(user_id, is_personal_monthly_target) 
WHERE is_personal_monthly_target = TRUE;

-- 5. Обновить существующие данные (если есть)
UPDATE sales_targets 
SET is_personal_monthly_target = TRUE 
WHERE is_personal_monthly_target = FALSE 
  AND product_name IS NULL;

-- 6. Показать результат
SELECT id, user_id, is_personal_monthly_target, product_name, 
       target_value, current_value 
FROM sales_targets 
ORDER BY id;
