import pool from '../db/pool';

/**
 * Проверяет все активные задачи с просроченными дедлайнами
 * и переводит их в статус 'overdue'
 */
export async function checkOverdueTasks(): Promise<{
  updated: number;
  tasks: Array<{ id: number; title: string; deadline: string }>;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Находим все задачи где:
    // 1. Есть hard_deadline
    // 2. Дедлайн прошёл
    // 3. Статус не done/archived/overdue
    const overdueTasks = await client.query(
      `SELECT id, title, hard_deadline, creator_id, status_new
       FROM tasks
       WHERE hard_deadline IS NOT NULL
         AND hard_deadline < NOW()
         AND status_new NOT IN ('done', 'archived', 'overdue')`,
      []
    );

    if (overdueTasks.rows.length === 0) {
      await client.query('COMMIT');
      return { updated: 0, tasks: [] };
    }

    // Обновляем статус на 'overdue'
    const taskIds = overdueTasks.rows.map(r => r.id);
    await client.query(
      `UPDATE tasks 
       SET status_new = 'overdue', updated_at = NOW()
       WHERE id = ANY($1)`,
      [taskIds]
    );

    // Записываем в историю для каждой задачи
    for (const task of overdueTasks.rows) {
      await client.query(
        `INSERT INTO task_status_history 
         (task_id, from_status, to_status, changed_by, comment)
         VALUES ($1, $2, 'overdue', $3, 'Автоматически: дедлайн истёк')`,
        [task.id, task.status_new, task.creator_id]
      );
    }

    await client.query('COMMIT');

    console.log(`⏰ Проверка дедлайнов: обновлено ${overdueTasks.rows.length} задач`);
    return {
      updated: overdueTasks.rows.length,
      tasks: overdueTasks.rows.map(r => ({
        id: r.id,
        title: r.title,
        deadline: r.hard_deadline,
      })),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Ошибка проверки дедлайнов:', e);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Запускает периодическую проверку дедлайнов
 * @param intervalMs - интервал проверки в миллисекундах (по умолчанию 1 час)
 */
export function startDeadlineChecker(intervalMs: number = 60 * 60 * 1000) {
  console.log(`⏰ Запущена периодическая проверка дедлайнов (интервал: ${intervalMs / 1000 / 60} мин)`);
  
  // Первая проверка сразу при запуске
  checkOverdueTasks().catch(e => console.error('Ошибка первичной проверки:', e));

  // Периодическая проверка
  setInterval(() => {
    checkOverdueTasks().catch(e => console.error('Ошибка периодической проверки:', e));
  }, intervalMs);
}
