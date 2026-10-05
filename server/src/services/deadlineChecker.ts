import pool from '../db/pool';
import { logger } from '../lib/logger';
import { CURRENT_DEADLINE_SQL, OVERDUE_SQL } from './taskDeadlines';

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
    // 1. Исполнители не сдали работу к сроку этапа (дедлайн проверки или общий срок).
    const executorOverdue = await pool.query(
      `SELECT t.id, t.title, ${CURRENT_DEADLINE_SQL} AS deadline
       FROM tasks t
       WHERE t.status_new IN ('new', 'in_progress', 'rejected') AND ${OVERDUE_SQL}
       ORDER BY 3 ASC`,
    );

    const executorResults = [];
    for (const task of executorOverdue.rows) {
      const assignees = await pool.query('SELECT user_id FROM task_assignees WHERE task_id = $1', [task.id]);
      executorResults.push({
        ...task,
        assignee_ids: assignees.rows.map((r: any) => r.user_id),
      });
    }

    // 2. Наблюдатели не проверили к сроку.
    const reviewerOverdue = await pool.query(
      `SELECT t.id, t.title, ${CURRENT_DEADLINE_SQL} AS deadline, t.creator_id
       FROM tasks t
       WHERE t.status_new = 'on_review' AND ${OVERDUE_SQL}
       ORDER BY 3 ASC`,
    );

    const info: OverdueInfo = {
      executor_overdue: executorResults,
      reviewer_overdue: reviewerOverdue.rows,
    };

    const total = executorResults.length + reviewerOverdue.rows.length;
    if (total > 0) {
      logger.info(`⏰ Проверка дедлайнов: ${executorResults.length} просрочено исполнителями, ${reviewerOverdue.rows.length} просрочено на проверке`);
    }
    return info;
  } catch (e) {
    logger.error({ err: e }, 'Ошибка проверки дедлайнов');
    throw e;
  }
}

export function startDeadlineChecker(intervalMs: number = 60 * 60 * 1000) {
  logger.info(`⏰ Запущена периодическая проверка дедлайнов (интервал: ${intervalMs / 1000 / 60} мин)`);
  checkOverdueTasks().catch(e => logger.error({ err: e }, 'Ошибка первичной проверки дедлайнов'));
  setInterval(() => {
    checkOverdueTasks().catch(e => logger.error({ err: e }, 'Ошибка периодической проверки дедлайнов'));
  }, intervalMs);
}
