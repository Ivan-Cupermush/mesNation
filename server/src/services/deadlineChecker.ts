import pool from '../db/pool';

export interface OverdueInfo {
  executor_overdue: Array<{ id: number; title: string; deadline: string; assignee_ids: number[] }>;
  reviewer_overdue: Array<{ id: number; title: string; deadline: string; creator_id: number }>;
}

/**
 * ИНФОРМАЦИОННАЯ проверка дедлайнов
 * НЕ меняет статусы задач — только возвращает список просроченных
 */
export async function checkOverdueTasks(): Promise<OverdueInfo> {
  try {
    // 1. Исполнительские дедлайны: new/in_progress с просроченным executor_deadline
    const executorOverdue = await pool.query(
      `SELECT t.id, t.title, t.executor_deadline as deadline
       FROM tasks t
       WHERE t.executor_deadline IS NOT NULL
         AND t.executor_deadline < NOW()
         AND t.status_new IN ('new', 'in_progress')
       ORDER BY t.executor_deadline ASC`,
      []
    );

    const executorResults = [];
    for (const task of executorOverdue.rows) {
      const assignees = await pool.query(
        'SELECT user_id FROM task_assignees WHERE task_id = $1', [task.id]
      );
      executorResults.push({
        ...task,
        assignee_ids: assignees.rows.map((r: any) => r.user_id),
      });
    }

    // 2. Ревьюерские дедлайны: on_review с просроченным reviewer_deadline
    const reviewerOverdue = await pool.query(
      `SELECT t.id, t.title, t.reviewer_deadline as deadline, t.creator_id
       FROM tasks t
       WHERE t.reviewer_deadline IS NOT NULL
         AND t.reviewer_deadline < NOW()
         AND t.status_new = 'on_review'
       ORDER BY t.reviewer_deadline ASC`,
      []
    );

    const info: OverdueInfo = {
      executor_overdue: executorResults,
      reviewer_overdue: reviewerOverdue.rows,
    };

    const total = executorResults.length + reviewerOverdue.rows.length;
    if (total > 0) {
      console.log(`⏰ Проверка дедлайнов: ${executorResults.length} просрочено исполнителями, ${reviewerOverdue.rows.length} просрочено на проверке`);
    }
    return info;
  } catch (e) {
    console.error('Ошибка проверки дедлайнов:', e);
    throw e;
  }
}

export function startDeadlineChecker(intervalMs: number = 60 * 60 * 1000) {
  console.log(`⏰ Запущена периодическая проверка дедлайнов (интервал: ${intervalMs / 1000 / 60} мин)`);
  checkOverdueTasks().catch(e => console.error('Ошибка первичной проверки:', e));
  setInterval(() => {
    checkOverdueTasks().catch(e => console.error('Ошибка периодической проверки:', e));
  }, intervalMs);
}
