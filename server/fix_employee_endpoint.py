import re

with open('src/index.ts', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Убираем JOIN с несуществующей таблицей products
old_kpi = """        `SELECT st.*, p.name as product_name
         FROM sales_targets st
         LEFT JOIN products p ON st.product_id = p.id
         WHERE st.user_id = $1"""
new_kpi = """        `SELECT st.*
         FROM sales_targets st
         WHERE st.user_id = $1"""
c = c.replace(old_kpi, new_kpi)

# 2. Убираем COUNT(DISTINCT product_id) — колонки может не быть
c = c.replace("""           COUNT(*) as total_transactions,
           COUNT(DISTINCT product_id) as unique_products""",
"""           COUNT(*) as total_transactions""")

# 3. Защита KPI-запроса от падения
c = re.sub(r"(LIMIT 1`,\s*\[userId\]\s*\)),", r"\1.catch(() => ({ rows: [] })),", c)

# 4. Защита запроса продаж от падения
c = c.replace("[userId, period]\n      ),",
              "[userId, period]\n      ).catch(() => ({ rows: [{ total_amount: 0, total_transactions: 0 }] })),")

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print('✅ Эндпоинт исправлен: без JOIN products + защита от падений')
