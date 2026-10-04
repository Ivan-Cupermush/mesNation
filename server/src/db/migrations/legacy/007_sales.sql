-- Миграция 007: KPI продаж (цели + транзакции + импорты)

-- === ЦЕЛИ ПРОДАЖ ===
-- Общий план отдела или индивидуальный KPI по товару
CREATE TABLE IF NOT EXISTS sales_targets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Признак плана отдела (один на отдел)
    is_department_target BOOLEAN DEFAULT FALSE,
    department_id INT,
    
    -- KPI по конкретному товару
    product_name VARCHAR(255),
    metric_type VARCHAR(50) DEFAULT 'quantity', -- quantity | amount | contracts
    target_value DECIMAL(15,2) NOT NULL,
    current_value DECIMAL(15,2) DEFAULT 0,
    
    -- Период действия KPI
    period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    period_end DATE NOT NULL DEFAULT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'),
    
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- === ТРАНЗАКЦИИ (ФАКТ ПРОДАЖ) ===
CREATE TABLE IF NOT EXISTS sales_transactions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id INT REFERENCES sales_targets(id) ON DELETE SET NULL,
    
    product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(15,2) DEFAULT 1,
    amount DECIMAL(15,2) DEFAULT 0,
    
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    client_name VARCHAR(255),
    notes TEXT,
    
    import_id INT, -- если из импорта Excel
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === ИСТОРИЯ ИМПОРТОВ EXCEL ===
CREATE TABLE IF NOT EXISTS sales_imports (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    file_name VARCHAR(255) NOT NULL,
    file_size INT,
    
    total_rows INT DEFAULT 0,
    imported_rows INT DEFAULT 0,
    skipped_rows INT DEFAULT 0,
    
    total_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending', -- pending | completed | failed
    
    error_log JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- === ИНДЕКСЫ ===
CREATE INDEX IF NOT EXISTS idx_sales_targets_user 
    ON sales_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_targets_dept 
    ON sales_targets(department_id) 
    WHERE is_department_target = TRUE;
CREATE INDEX IF NOT EXISTS idx_sales_targets_period 
    ON sales_targets(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_sales_transactions_user 
    ON sales_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_target 
    ON sales_transactions(target_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_date 
    ON sales_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_import 
    ON sales_transactions(import_id);

CREATE INDEX IF NOT EXISTS idx_sales_imports_user 
    ON sales_imports(user_id);
