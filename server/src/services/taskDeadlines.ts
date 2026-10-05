/**
 * Сроки задачи.
 *
 * - Дедлайн выполнения (executor_deadline = hard_deadline) — общий срок задачи:
 *   к нему задача должна быть полностью завершена.
 * - Дедлайн проверки (reviewer_deadline) — промежуточный срок не позже общего:
 *   к нему работа сдана на проверку и проверена наблюдателями.
 *
 * «Текущий срок» зависит от этапа:
 * - новая / в работе (ещё ни разу не сдавали) — сдать на проверку к дедлайну
 *   проверки (если его нет — к общему сроку); после возврата с проверки — общий срок;
 * - на проверке — наблюдатели проверяют к дедлайну проверки; если работу сдали
 *   позже него, проверить нужно до общего срока;
 * - отклонена — исправить к общему сроку.
 */
const FINAL = 'COALESCE(t.executor_deadline, t.hard_deadline)';

export const CURRENT_DEADLINE_SQL = `(CASE
  WHEN t.status_new IN ('new','in_progress') THEN
    CASE WHEN t.review_started_at IS NULL THEN COALESCE(t.reviewer_deadline, ${FINAL}) ELSE ${FINAL} END
  WHEN t.status_new = 'on_review' THEN
    CASE WHEN t.reviewer_deadline IS NOT NULL AND (t.review_started_at IS NULL OR t.reviewer_deadline > t.review_started_at)
         THEN t.reviewer_deadline ELSE ${FINAL} END
  WHEN t.status_new IN ('rejected','overdue') THEN ${FINAL}
  ELSE NULL END)`;

/** Задача просрочена, если текущий срок этапа прошёл. */
export const OVERDUE_SQL = `(${CURRENT_DEADLINE_SQL} < NOW())`;

/** Дедлайн проверки не может быть позже общего срока задачи. */
export function reviewWithinFinal(final: string | Date | null | undefined, review: string | Date | null | undefined): boolean {
  if (!final || !review) return true;
  return new Date(review).getTime() <= new Date(final).getTime();
}

export const REVIEW_AFTER_FINAL_MESSAGE =
  'Дедлайн проверки должен быть не позже дедлайна выполнения: к общему сроку задача уже проверена и закрыта';
