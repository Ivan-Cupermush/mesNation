-- 0016: KPI по ежедневным отчётам о продажах.
--
-- Отчёт из 1С («Валовая прибыль»: клиент → менеджер → группы товаров) хранится
-- построчно, чтобы факт KPI можно было пересчитать в любой момент: после нового
-- отчёта, правки списка клиентов «Есть повод» или загрузки файла KPI.

-- Цели KPI: откуда цель, как считается факт и выплата.
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS kpi_kind VARCHAR(20);
-- manual — создана вручную; kpi_file — из файла KPI (повторная загрузка заменяет только их).
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS unit VARCHAR(16);
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS fact_rule JSONB;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS payout_rule JSONB;
-- Правила поправил руководитель — повторная загрузка файла KPI их сохраняет.
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS rules_custom BOOLEAN NOT NULL DEFAULT FALSE;
-- Факт из файла KPI (если отчётов за месяц нет, показывается он).
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS file_fact NUMERIC(15,2);
-- Подробности факта из отчётов: позиции дистрибуции, число точек и т. п.
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS fact_details JSONB;
-- То же по файлу KPI (отметки V/X у позиций) — показывается, пока нет отчётов.
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS file_details JSONB;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS fact_updated_at TIMESTAMPTZ;
ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sales_targets_user_period ON sales_targets (user_id, period_start);

-- Загруженные отчёты. Отчёт всегда в пределах одного месяца (month — его первое число).
CREATE TABLE IF NOT EXISTS sales_reports (
  id SERIAL PRIMARY KEY,
  uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  month DATE NOT NULL,
  total_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_reports_period_check CHECK (period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS idx_sales_reports_month ON sales_reports (month);

-- Строки отчёта: total — итог клиента по менеджеру, group — группа товаров, item — товар.
CREATE TABLE IF NOT EXISTS sales_report_lines (
  id BIGSERIAL PRIMARY KEY,
  report_id INT NOT NULL REFERENCES sales_reports(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  manager_name VARCHAR(255) NOT NULL,
  manager_key VARCHAR(255) NOT NULL,
  client_name VARCHAR(500) NOT NULL,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('total', 'group', 'item')),
  depth SMALLINT NOT NULL DEFAULT 0,
  group_path TEXT NOT NULL DEFAULT '',
  name VARCHAR(500) NOT NULL DEFAULT '',
  quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
  revenue NUMERIC(15,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sales_report_lines_user ON sales_report_lines (user_id, report_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_lines_manager ON sales_report_lines (report_id, manager_key);

-- Списки клиентов: ep — сеть «Есть повод»; akb_merge — задвоенные клиенты
-- (все клиенты с этим названием считаются в АКБ одной точкой).
CREATE TABLE IF NOT EXISTS kpi_client_lists (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('ep', 'akb_merge')),
  pattern VARCHAR(255) NOT NULL,
  pattern_key VARCHAR(255) NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kpi_client_lists_unique UNIQUE (kind, pattern_key)
);

-- Как менеджер записан в отчёте 1С → сотрудник в Offix (когда имя не совпало само).
CREATE TABLE IF NOT EXISTS kpi_name_aliases (
  id SERIAL PRIMARY KEY,
  name_key VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
