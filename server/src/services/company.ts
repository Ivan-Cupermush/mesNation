import pool from '../db/pool';

export async function getCompanyName(): Promise<string | null> {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'company_name'");
  return rows[0]?.value ?? null;
}

export async function setCompanyName(name: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('company_name', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [name],
  );
}
