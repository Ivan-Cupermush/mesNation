import { Router, Response } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { id, paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { UPLOAD_DIRS, makeUploader, removeFile, urlToDiskPath } from '../lib/uploads';
import { assertCanAssign, assertCanViewTask, getTaskRoles, getUserNode, getSubtreeNodeIds, isDirector } from '../services/access';
import { checkOverdueTasks } from '../services/deadlineChecker';
import { emitToUser } from '../realtime/socket';
import { CURRENT_DEADLINE_SQL, OVERDUE_SQL, REVIEW_AFTER_FINAL_MESSAGE, reviewWithinFinal } from '../services/taskDeadlines';

/**
 * Задачи. Монтируется на /api/tasks (после authenticate).
 *
 * Роли в задаче: создатель (управляет всем), исполнители (берут в работу,
 * сдают на проверку, пишут комментарий исполнителя), наблюдатели (видят
 * задачу, пишут комментарий наблюдателя, отмечают контрольные точки).
 * Руководитель видит задачи своих подчинённых.
 */
const router = Router();

const STATUSES = ['new', 'in_progress', 'on_review', 'done', 'overdue', 'rejected', 'archived'] as const;
const ACTIVE_STATUSES = ['new', 'in_progress', 'on_review', 'rejected', 'overdue'];


/** Полная выборка задачи: участники, наблюдатели, роли текущего пользователя. */
const TASK_SELECT = `
  SELECT t.*,
         ${OVERDUE_SQL} AS is_overdue,
         ${CURRENT_DEADLINE_SQL} AS current_deadline,
         COALESCE(uc.display_name, uc.username) AS creator_name,
         uc.username AS creator_username,
         (t.creator_id = $1) AS is_creator,
         EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = $1) AS is_assignee,
         EXISTS (SELECT 1 FROM task_watchers WHERE task_id = t.id AND user_id = $1) AS is_watcher,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'username', u.username,
                     'display_name', u.display_name, 'avatar_url', u.avatar_url, 'is_active', u.is_active)
                   ORDER BY COALESCE(u.display_name, u.username))
                   FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = t.id), '[]') AS assignees,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'username', u.username,
                     'display_name', u.display_name, 'avatar_url', u.avatar_url, 'is_active', u.is_active)
                   ORDER BY COALESCE(u.display_name, u.username))
                   FROM task_watchers tw JOIN users u ON u.id = tw.user_id WHERE tw.task_id = t.id), '[]') AS watchers,
         (SELECT COUNT(*)::int FROM task_assignees WHERE task_id = t.id) AS assignees_count,
         (SELECT COUNT(*)::int FROM task_watchers WHERE task_id = t.id) AS watchers_count,
         (SELECT COUNT(*)::int FROM task_checkpoints WHERE task_id = t.id AND status = 'pending') AS pending_checkpoints,
         (SELECT COUNT(*)::int FROM task_canvas_posts WHERE task_id = t.id) AS comments_count,
         (SELECT COUNT(*)::int FROM task_files WHERE task_id = t.id) AS files_count
  FROM tasks t
  JOIN users uc ON uc.id = t.creator_id`;

/** Id пользователей, чьи задачи видит руководитель (всё его поддерево, кроме коллег на том же узле). */
async function subordinateUserIds(userId: number): Promise<number[]> {
  const me = await getUserNode(userId);
  if (me.nodeId == null) return [];
  let nodeIds: number[];
  if (me.isRoot) {
    nodeIds = (await pool.query('SELECT id FROM role_tree')).rows.map((r) => r.id);
  } else {
    nodeIds = (await getSubtreeNodeIds(me.nodeId)).filter((n) => n !== me.nodeId);
  }
  const { rows } = await pool.query(
    'SELECT user_id FROM user_role_assignments WHERE role_node_id = ANY($1::int[]) AND user_id <> $2',
    [nodeIds, userId],
  );
  return rows.map((r) => r.user_id);
}

const listQuery = z.object({
  filter: z.enum(['all', 'mine', 'created', 'watching', 'review', 'team']).default('all'),
  status: z.enum([...STATUSES, 'overdue_computed']).optional(),
  importance: z.enum(['green', 'yellow', 'red']).optional(),
  sort_by: z.enum(['deadline', 'priority', 'created']).default('deadline'),
  include_archived: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const q = listQuery.parse(req.query);
  const me = req.userId!;
  const params: unknown[] = [me];
  const where: string[] = [];

  const participant = `(t.creator_id = $1
    OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = $1)
    OR EXISTS (SELECT 1 FROM task_watchers WHERE task_id = t.id AND user_id = $1))`;

  switch (q.filter) {
    case 'mine':
      where.push('EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = $1)');
      break;
    case 'created':
      where.push('t.creator_id = $1');
      break;
    case 'watching':
      where.push('EXISTS (SELECT 1 FROM task_watchers WHERE task_id = t.id AND user_id = $1)');
      break;
    case 'review':
      where.push("t.status_new = 'on_review' AND t.creator_id = $1");
      break;
    case 'team': {
      params.push(await subordinateUserIds(me));
      where.push(`NOT ${participant} AND (t.creator_id = ANY($2::int[])
        OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = ANY($2::int[])))`);
      break;
    }
    default:
      where.push(participant);
  }
  if (q.include_archived !== 'true' && q.status !== 'archived') where.push("t.status_new <> 'archived'");
  if (q.status && q.status !== 'overdue_computed') {
    params.push(q.status);
    where.push(`t.status_new = $${params.length}`);
  }
  if (q.overdue === 'true' || q.status === 'overdue_computed') where.push(OVERDUE_SQL);
  if (q.importance) {
    params.push(q.importance);
    where.push(`t.importance = $${params.length}`);
  }
  const prio = "CASE t.importance WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END";
  // Сортировка по ближайшему сроку текущего этапа (сдать / проверить / закрыть).
  const dl = `COALESCE(${CURRENT_DEADLINE_SQL}, t.executor_deadline, t.hard_deadline)`;
  const order =
    q.sort_by === 'priority'
      ? `${prio}, ${dl} ASC NULLS LAST, t.created_at DESC`
      : q.sort_by === 'created'
        ? 't.created_at DESC'
        : `${dl} ASC NULLS LAST, ${prio}, t.created_at DESC`;

  const { rows } = await pool.query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}`, params);
  res.json(rows);
});

/** Ручная проверка дедлайнов (только директор). */
router.post('/check-deadlines', async (req: AuthRequest, res: Response) => {
  if (!(await isDirector(req.userId!))) throw forbidden('Доступно только директору');
  res.json({ success: true, ...(await checkOverdueTasks()) });
});

async function loadTask(taskId: number, userId: number) {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.id = $2`, [userId, taskId]);
  if (!rows.length) throw notFound('Задача не найдена');
  return rows[0];
}

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const roles = await assertCanViewTask(taskId, req.userId!);
  const [task, checkpoints, canvas, files] = await Promise.all([
    loadTask(taskId, req.userId!),
    pool.query(
      `SELECT c.*, COALESCE(u.display_name, u.username) AS completed_by_name
       FROM task_checkpoints c LEFT JOIN users u ON u.id = c.completed_by
       WHERE c.task_id = $1 ORDER BY c.deadline`,
      [taskId],
    ),
    pool.query(
      `SELECT cp.*, u.username, u.display_name, u.avatar_url FROM task_canvas_posts cp
       JOIN users u ON u.id = cp.author_id WHERE cp.task_id = $1 ORDER BY cp.created_at`,
      [taskId],
    ),
    pool.query(
      `SELECT f.*, COALESCE(u.display_name, u.username) AS uploaded_by_name FROM task_files f
       LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.task_id = $1 ORDER BY f.uploaded_at`,
      [taskId],
    ),
  ]);
  const creator = await pool.query('SELECT id, username, display_name, avatar_url FROM users WHERE id = $1', [task.creator_id]);
  res.json({
    ...task,
    is_supervisor: roles.isSupervisor,
    available_transitions: availableTransitions(task.status_new, roles),
    creator: creator.rows[0],
    checkpoints: checkpoints.rows,
    canvas: canvas.rows,
    files: files.rows,
  });
});

/** Уведомляет участников задачи (список задач на их устройствах обновится). */
async function notifyParticipants(taskId: number, event = 'task_updated') {
  const { rows } = await pool.query(
    `SELECT creator_id AS uid FROM tasks WHERE id = $1
     UNION SELECT user_id FROM task_assignees WHERE task_id = $1
     UNION SELECT user_id FROM task_watchers WHERE task_id = $1`,
    [taskId],
  );
  for (const r of rows) emitToUser(r.uid, event, { task_id: taskId });
}

const isoDate = z.coerce.date({ error: 'Некорректная дата' });

const checkpointInput = z.object({
  title: z.string().trim().min(1, 'Название контрольной точки обязательно').max(255),
  deadline: isoDate,
});

const createSchema = z
  .object({
    title: z.string().trim().min(1, 'Название обязательно').max(255),
    description: z.string().trim().max(10000).optional(),
    importance: z.enum(['green', 'yellow', 'red']).default('yellow'),
    executor_deadline: isoDate.nullish(),
    hard_deadline: isoDate.nullish(),
    reviewer_deadline: isoDate.nullish(),
    assignee_ids: z.array(id).min(1, 'Укажите хотя бы одного исполнителя').max(200),
    watcher_ids: z.array(id).max(200).optional(),
    checkpoints: z.array(checkpointInput).max(50).optional(),
  })
  .refine((v) => reviewWithinFinal(v.executor_deadline ?? v.hard_deadline, v.reviewer_deadline), {
    message: REVIEW_AFTER_FINAL_MESSAGE,
    path: ['reviewer_deadline'],
  });

async function setPeople(client: PoolClient, table: 'task_assignees' | 'task_watchers', taskId: number, ids: number[]) {
  await client.query(`DELETE FROM ${table} WHERE task_id = $1 AND user_id <> ALL($2::int[])`, [taskId, ids]);
  await client.query(
    `INSERT INTO ${table} (task_id, user_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
    [taskId, ids],
  );
}

async function assertActiveUsers(ids: number[]) {
  if (!ids.length) return;
  const { rows } = await pool.query('SELECT id FROM users WHERE id = ANY($1::int[]) AND is_active', [ids]);
  if (rows.length !== new Set(ids).size) throw badRequest('Некоторые пользователи не найдены или деактивированы');
}

router.post('/', validate(createSchema), async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof createSchema>;
  const me = req.userId!;
  const assignees = Array.from(new Set(body.assignee_ids));
  // Создатель и так имеет все права наблюдателя; если наблюдатели не выбраны — он сам.
  const watchers = Array.from(new Set(body.watcher_ids?.length ? body.watcher_ids : [me]));
  await assertCanAssign(me, assignees);
  await assertActiveUsers([...assignees, ...watchers]);
  const deadline = body.executor_deadline ?? body.hard_deadline ?? null;

  const taskId = await withTransaction(async (client) => {
    const task = (
      await client.query(
        `INSERT INTO tasks (title, description, importance, hard_deadline, executor_deadline, reviewer_deadline, creator_id, status_new)
         VALUES ($1, $2, $3, $4, $4, $5, $6, 'new') RETURNING id`,
        [body.title, body.description ?? null, body.importance, deadline, body.reviewer_deadline ?? null, me],
      )
    ).rows[0];
    await setPeople(client, 'task_assignees', task.id, assignees);
    await setPeople(client, 'task_watchers', task.id, watchers);
    for (const cp of body.checkpoints || []) {
      await client.query('INSERT INTO task_checkpoints (task_id, title, deadline) VALUES ($1, $2, $3)', [task.id, cp.title, cp.deadline]);
    }
    await client.query(
      `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment)
       VALUES ($1, NULL, 'new', $2, 'Задача создана')`,
      [task.id, me],
    );
    return task.id;
  });
  await notifyParticipants(taskId, 'task_created');
  res.status(201).json(await loadTask(taskId, me));
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1, 'Название не может быть пустым').max(255),
    description: z.string().trim().max(10000).nullable(),
    importance: z.enum(['green', 'yellow', 'red']),
    executor_deadline: isoDate.nullable(),
    hard_deadline: isoDate.nullable(),
    reviewer_deadline: isoDate.nullable(),
    executor_comment: z.string().max(10000).nullable(),
    watcher_comment: z.string().max(10000).nullable(),
    assignee_ids: z.array(id).min(1, 'Нужен хотя бы один исполнитель').max(200),
    watcher_ids: z.array(id).max(200),
    status_new: z.never({ error: 'Статус меняется через POST /api/tasks/:id/transition' }),
  })
  .partial();

const CREATOR_FIELDS = ['title', 'description', 'importance', 'executor_deadline', 'hard_deadline', 'reviewer_deadline', 'assignee_ids', 'watcher_ids'] as const;

async function updateTask(req: AuthRequest, res: Response) {
  const taskId = paramId(req);
  const me = req.userId!;
  const body = req.body as z.infer<typeof patchSchema>;
  const roles = await assertCanViewTask(taskId, me);
  const current = (
    await pool.query('SELECT status_new, executor_deadline, hard_deadline, reviewer_deadline FROM tasks WHERE id = $1', [taskId])
  ).rows[0];
  if (current.status_new === 'archived') throw badRequest('Задача в архиве. Сначала разархивируйте её.');

  const touchesCreatorFields = CREATOR_FIELDS.some((f) => body[f] !== undefined);
  if (touchesCreatorFields && !roles.isCreator) throw forbidden('Менять параметры задачи может только её создатель');
  if (body.executor_comment !== undefined && !roles.isAssignee && !roles.isCreator) {
    throw forbidden('Комментарий исполнителя пишет исполнитель');
  }
  if (body.watcher_comment !== undefined && !roles.isWatcher && !roles.isCreator) {
    throw forbidden('Комментарий наблюдателя пишет наблюдатель');
  }
  if (body.assignee_ids) {
    await assertCanAssign(me, body.assignee_ids);
    await assertActiveUsers(body.assignee_ids);
  }
  if (body.watcher_ids) await assertActiveUsers(body.watcher_ids);

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  if (body.title !== undefined) set('title', body.title);
  if (body.description !== undefined) set('description', body.description);
  if (body.importance !== undefined) set('importance', body.importance);
  const deadline = body.executor_deadline !== undefined ? body.executor_deadline : body.hard_deadline;
  const nextFinal = deadline !== undefined ? deadline : (current.executor_deadline ?? current.hard_deadline);
  const nextReview = body.reviewer_deadline !== undefined ? body.reviewer_deadline : current.reviewer_deadline;
  if ((deadline !== undefined || body.reviewer_deadline !== undefined) && !reviewWithinFinal(nextFinal, nextReview)) {
    throw badRequest(REVIEW_AFTER_FINAL_MESSAGE);
  }
  if (deadline !== undefined) {
    set('executor_deadline', deadline);
    set('hard_deadline', deadline);
  }
  if (body.reviewer_deadline !== undefined) set('reviewer_deadline', body.reviewer_deadline);
  if (body.executor_comment !== undefined) set('executor_comment', body.executor_comment);
  if (body.watcher_comment !== undefined) set('watcher_comment', body.watcher_comment);

  await withTransaction(async (client) => {
    if (sets.length) {
      values.push(taskId);
      await client.query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    if (body.assignee_ids) await setPeople(client, 'task_assignees', taskId, Array.from(new Set(body.assignee_ids)));
    if (body.watcher_ids) await setPeople(client, 'task_watchers', taskId, Array.from(new Set(body.watcher_ids)));
    if (deadline !== undefined) {
      await client.query(
        `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment)
         VALUES ($1, $2, $2, $3, $4)`,
        [taskId, current.status_new, me, deadline ? `Дедлайн перенесён на ${new Date(deadline).toISOString()}` : 'Дедлайн снят'],
      );
    }
  });
  await notifyParticipants(taskId);
  res.json(await loadTask(taskId, me));
}

router.patch('/:id', validate(patchSchema), updateTask);
// PUT — для совместимости с веб-клиентом.
router.put('/:id', validate(patchSchema), updateTask);

/** Разрешённые переходы статусов и кто их выполняет. */
/**
 * Жизненный цикл задачи. role: кто может сделать переход;
 * 'self' — только если создатель сам себе исполнитель (проверять самому себя незачем).
 */
/** reviewer — наблюдатель или создатель (у создателя всегда права наблюдателя). */
type Transition = { role: 'creator' | 'assignee' | 'reviewer' | 'self'; action: string; comment?: 'required' | 'optional'; style?: 'primary' | 'success' | 'danger' | 'neutral' };
const TRANSITIONS: Record<string, Transition> = {
  'new→in_progress': { role: 'assignee', action: 'Взять в работу', style: 'primary' },
  'new→on_review': { role: 'assignee', action: 'Сразу сдать на проверку', comment: 'optional', style: 'neutral' },
  'in_progress→on_review': { role: 'assignee', action: 'Отправить на проверку', comment: 'optional', style: 'primary' },
  'on_review→in_progress': { role: 'assignee', action: 'Отозвать с проверки', style: 'neutral' },
  'on_review→done': { role: 'reviewer', action: 'Принять задачу', comment: 'optional', style: 'success' },
  'on_review→rejected': { role: 'reviewer', action: 'Отклонить', comment: 'required', style: 'danger' },
  'rejected→in_progress': { role: 'assignee', action: 'Вернуть в работу', style: 'primary' },
  'rejected→on_review': { role: 'assignee', action: 'Отправить на проверку повторно', comment: 'optional', style: 'neutral' },
  'done→in_progress': { role: 'reviewer', action: 'Вернуть на доработку', comment: 'required', style: 'neutral' },
  'done→archived': { role: 'creator', action: 'Архивировать', style: 'neutral' },
  'overdue→in_progress': { role: 'assignee', action: 'Взять в работу', style: 'primary' },
  'overdue→on_review': { role: 'assignee', action: 'Отправить на проверку', comment: 'optional', style: 'neutral' },
  'overdue→archived': { role: 'creator', action: 'Архивировать', style: 'neutral' },
  // Задача самому себе: завершить без проверки.
  'new→done': { role: 'self', action: 'Завершить', style: 'success' },
  'in_progress→done': { role: 'self', action: 'Завершить', style: 'success' },
  'overdue→done': { role: 'self', action: 'Завершить', style: 'success' },
};

type Roles = { isCreator: boolean; isAssignee: boolean; isWatcher?: boolean };

function allowed(t: Transition, roles: Roles) {
  if (t.role === 'self') return roles.isCreator && roles.isAssignee;
  if (t.role === 'reviewer') return roles.isCreator || !!roles.isWatcher;
  return t.role === 'creator' ? roles.isCreator : roles.isAssignee;
}

/** Действия со статусом, доступные пользователю прямо сейчас (для кнопок в приложении). */
function availableTransitions(status: string, roles: Roles) {
  // Себе-задача: «на проверку самому себе» не предлагаем, есть «Завершить».
  const selfTask = roles.isCreator && roles.isAssignee;
  return Object.entries(TRANSITIONS)
    .filter(([key, t]) => key.startsWith(status + '→') && allowed(t, roles))
    .filter(([key]) => !(selfTask && key.endsWith('→on_review')))
    .map(([key, t]) => ({ to: key.split('→')[1], action: t.action, comment: t.comment ?? null, style: t.style ?? 'neutral' }));
}

const transitionSchema = z.object({
  to_status: z.enum(STATUSES),
  comment: z.string().trim().max(5000).optional(),
});

router.post('/:id/transition', validate(transitionSchema), async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const me = req.userId!;
  const { to_status, comment } = req.body as z.infer<typeof transitionSchema>;

  const result = await withTransaction(async (client) => {
    // FOR UPDATE: два одновременных перехода не перезапишут друг друга.
    const task = (await client.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [taskId])).rows[0];
    if (!task) throw notFound('Задача не найдена');
    const roles = await getTaskRoles(taskId, me);
    const key = `${task.status_new}→${to_status}`;
    const t = TRANSITIONS[key];
    if (!t) {
      throw badRequest(`Переход «${task.status_new}» → «${to_status}» невозможен`, {
        allowed_from_current: Object.keys(TRANSITIONS).filter((k) => k.startsWith(task.status_new + '→')).map((k) => k.split('→')[1]),
      });
    }
    if (!allowed(t, roles)) {
      throw forbidden(
        t.role === 'assignee'
          ? `Только исполнитель может: ${t.action}`
          : t.role === 'creator'
            ? `Только создатель может: ${t.action}`
            : t.role === 'reviewer'
              ? `Только наблюдатели и создатель могут: ${t.action}`
              : 'Завершить без проверки можно только свою задачу',
      );
    }
    if (t.comment === 'required' && !comment) throw badRequest(to_status === 'rejected' ? 'При отклонении укажите причину' : 'Укажите комментарий');

    const extra: string[] = [];
    // Дедлайн проверки задаёт создатель заранее (не позже общего срока) — переходы его не трогают.
    if (to_status === 'on_review') extra.push('review_started_at = NOW()');
    if (to_status === 'archived') {
      extra.push('archived_at = NOW()', `archived_as = 'done'`, `archived_by = ${Number(me)}`, `status_before_archive = '${task.status_new}'`);
    }
    await client.query(
      `UPDATE tasks SET status_new = $1, updated_at = NOW()${extra.length ? ', ' + extra.join(', ') : ''} WHERE id = $2`,
      [to_status, taskId],
    );
    await client.query(
      `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment) VALUES ($1, $2, $3, $4, $5)`,
      [taskId, task.status_new, to_status, me, comment || null],
    );
    return { from: task.status_new, action: t.action };
  });
  await notifyParticipants(taskId);
  res.json({
    ...(await loadTask(taskId, me)),
    transition: { from: result.from, to: to_status, action: result.action, changed_by: me, comment: comment || null },
  });
});

/** Разархивация: задача возвращается в статус, в котором была до архива. */
router.post('/:id/unarchive', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const me = req.userId!;
  await withTransaction(async (client) => {
    const task = (await client.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [taskId])).rows[0];
    if (!task) throw notFound('Задача не найдена');
    if (task.creator_id !== me) throw forbidden('Разархивировать задачу может только её создатель');
    if (task.status_new !== 'archived') throw badRequest('Задача не в архиве');
    const back = task.status_before_archive && task.status_before_archive !== 'archived' ? task.status_before_archive : 'in_progress';
    await client.query(
      `UPDATE tasks SET status_new = $1, archived_at = NULL, archived_as = NULL, archived_by = NULL,
              status_before_archive = NULL, updated_at = NOW() WHERE id = $2`,
      [back, taskId],
    );
    await client.query(
      `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment)
       VALUES ($1, 'archived', $2, $3, 'Задача разархивирована')`,
      [taskId, back, me],
    );
  });
  await notifyParticipants(taskId);
  res.json(await loadTask(taskId, me));
});

/**
 * «Удаление» задачи (как в ТЗ): задача уходит в архив с пометкой «удалена»,
 * а не стирается из базы. Её можно разархивировать.
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const me = req.userId!;
  const reason = typeof req.query.reason === 'string' ? req.query.reason.slice(0, 2000) : null;
  await withTransaction(async (client) => {
    const task = (await client.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [taskId])).rows[0];
    if (!task) throw notFound('Задача не найдена');
    if (task.creator_id !== me) throw forbidden('Удалить задачу может только её создатель');
    if (task.status_new === 'archived') throw badRequest('Задача уже в архиве');
    await client.query(
      `UPDATE tasks SET status_new = 'archived', archived_at = NOW(), archived_as = 'deleted', archived_by = $1,
              status_before_archive = status_new, updated_at = NOW() WHERE id = $2`,
      [me, taskId],
    );
    await client.query(
      `INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment)
       VALUES ($1, $2, 'archived', $3, $4)`,
      [taskId, task.status_new, me, reason ? `Задача удалена: ${reason}` : 'Задача удалена'],
    );
  });
  await notifyParticipants(taskId);
  res.json({ success: true, archived_as: 'deleted' });
});

router.get('/:id/history', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  await assertCanViewTask(taskId, req.userId!);
  const { rows } = await pool.query(
    `SELECT h.*, u.display_name AS changed_by_name, u.username AS changed_by_username, u.avatar_url
     FROM task_status_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.task_id = $1 ORDER BY h.created_at ASC, h.id ASC`,
    [taskId],
  );
  res.json(rows);
});

// ---------- Контрольные точки ----------

router.post('/:id/checkpoints', validate(checkpointInput), async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const roles = await assertCanViewTask(taskId, req.userId!);
  if (!roles.isCreator) throw forbidden('Контрольные точки добавляет создатель задачи');
  const { title, deadline } = req.body as z.infer<typeof checkpointInput>;
  const { rows } = await pool.query(
    'INSERT INTO task_checkpoints (task_id, title, deadline) VALUES ($1, $2, $3) RETURNING *',
    [taskId, title, deadline],
  );
  await notifyParticipants(taskId);
  res.status(201).json(rows[0]);
});

const checkpointPatch = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  deadline: isoDate.optional(),
  status: z.enum(['pending', 'completed', 'missed']).optional(),
});

router.patch('/:id/checkpoints/:cpId', validate(checkpointPatch), async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const cpId = paramId(req, 'cpId');
  const roles = await assertCanViewTask(taskId, req.userId!);
  const body = req.body as z.infer<typeof checkpointPatch>;
  if ((body.title || body.deadline) && !roles.isCreator) throw forbidden('Менять контрольную точку может создатель');
  // Отметить результат контрольной точки может создатель или наблюдатель.
  if (body.status && !roles.isCreator && !roles.isWatcher) throw forbidden('Отмечать контрольные точки может создатель или наблюдатель');
  const { rows } = await pool.query(
    `UPDATE task_checkpoints SET title = COALESCE($1, title), deadline = COALESCE($2, deadline),
            status = COALESCE($3, status),
            completed_at = CASE WHEN $3::text = 'completed' THEN NOW() WHEN $3::text IS NULL THEN completed_at ELSE NULL END,
            completed_by = CASE WHEN $3::text = 'completed' THEN $4::int WHEN $3::text IS NULL THEN completed_by ELSE NULL END
     WHERE id = $5 AND task_id = $6 RETURNING *`,
    [body.title ?? null, body.deadline ?? null, body.status ?? null, req.userId, cpId, taskId],
  );
  if (!rows.length) throw notFound('Контрольная точка не найдена');
  await notifyParticipants(taskId);
  res.json(rows[0]);
});

router.delete('/:id/checkpoints/:cpId', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const roles = await assertCanViewTask(taskId, req.userId!);
  if (!roles.isCreator) throw forbidden('Удалять контрольные точки может создатель');
  await pool.query('DELETE FROM task_checkpoints WHERE id = $1 AND task_id = $2', [paramId(req, 'cpId'), taskId]);
  await notifyParticipants(taskId);
  res.json({ success: true });
});

// ---------- Комментарии (доска задачи) ----------

const commentSchema = z.object({
  content: z.string().trim().min(1, 'Комментарий не может быть пустым').max(10000),
  content_type: z.enum(['text', 'checklist', 'image']).default('text'),
});

async function assertCanComment(taskId: number, userId: number) {
  const roles = await assertCanViewTask(taskId, userId);
  if (!roles.isCreator && !roles.isAssignee && !roles.isWatcher) {
    throw forbidden('Комментировать могут создатель, исполнители и наблюдатели');
  }
}

async function addComment(req: AuthRequest, res: Response) {
  const taskId = paramId(req);
  await assertCanComment(taskId, req.userId!);
  const { content, content_type } = req.body as z.infer<typeof commentSchema>;
  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO task_canvas_posts (task_id, author_id, content, content_type) VALUES ($1, $2, $3, $4) RETURNING *
     ) SELECT ins.*, u.username, u.display_name, u.avatar_url FROM ins JOIN users u ON u.id = ins.author_id`,
    [taskId, req.userId, content, content_type],
  );
  await notifyParticipants(taskId);
  res.status(201).json(rows[0]);
}
router.post('/:id/canvas', validate(commentSchema), addComment);
router.post('/:id/comments', validate(commentSchema), addComment);

router.get('/:id/comments', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  await assertCanViewTask(taskId, req.userId!);
  const { rows } = await pool.query(
    `SELECT cp.*, u.username, u.display_name, u.avatar_url, (cp.updated_at > cp.created_at + INTERVAL '1 second') AS is_edited
     FROM task_canvas_posts cp JOIN users u ON u.id = cp.author_id
     WHERE cp.task_id = $1 ORDER BY cp.created_at ASC`,
    [taskId],
  );
  res.json(rows);
});

async function loadOwnComment(req: AuthRequest) {
  const taskId = paramId(req);
  const commentId = paramId(req, 'commentId');
  await assertCanViewTask(taskId, req.userId!);
  const { rows } = await pool.query('SELECT * FROM task_canvas_posts WHERE id = $1 AND task_id = $2', [commentId, taskId]);
  if (!rows.length) throw notFound('Комментарий не найден');
  if (rows[0].author_id !== req.userId) throw forbidden('Изменять можно только свои комментарии');
  return rows[0];
}

router.patch('/:id/comments/:commentId', validate(commentSchema.pick({ content: true })), async (req: AuthRequest, res: Response) => {
  const comment = await loadOwnComment(req);
  const { rows } = await pool.query(
    `WITH upd AS (UPDATE task_canvas_posts SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *)
     SELECT upd.*, u.username, u.display_name, u.avatar_url, TRUE AS is_edited FROM upd JOIN users u ON u.id = upd.author_id`,
    [req.body.content, comment.id],
  );
  await notifyParticipants(comment.task_id);
  res.json(rows[0]);
});

router.delete('/:id/comments/:commentId', async (req: AuthRequest, res: Response) => {
  const comment = await loadOwnComment(req);
  await pool.query('DELETE FROM task_canvas_posts WHERE id = $1', [comment.id]);
  await notifyParticipants(comment.task_id);
  res.json({ success: true });
});

// ---------- Файлы ----------

const taskUpload = makeUploader({ dir: UPLOAD_DIRS.tasks, maxSizeMb: 50 });

router.get('/:id/files', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  await assertCanViewTask(taskId, req.userId!);
  const { rows } = await pool.query(
    `SELECT f.*, COALESCE(u.display_name, u.username) AS uploaded_by_name FROM task_files f
     LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.task_id = $1 ORDER BY f.uploaded_at`,
    [taskId],
  );
  res.json(rows);
});

router.post('/:id/files', taskUpload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не получен');
  try {
    const taskId = paramId(req);
    await assertCanComment(taskId, req.userId!);
    const { rows } = await pool.query(
      `INSERT INTO task_files (task_id, file_url, file_name, file_size, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [taskId, `/uploads/tasks/${file.filename}`, file.originalname, file.size, file.mimetype, req.userId],
    );
    const uploader = await pool.query('SELECT username, display_name, avatar_url FROM users WHERE id = $1', [req.userId]);
    await notifyParticipants(taskId);
    res.status(201).json({ ...rows[0], uploader: uploader.rows[0] });
  } catch (err) {
    removeFile(file.path);
    throw err;
  }
});

router.delete('/:id/files/:fileId', async (req: AuthRequest, res: Response) => {
  const taskId = paramId(req);
  const roles = await assertCanViewTask(taskId, req.userId!);
  const { rows } = await pool.query('SELECT * FROM task_files WHERE id = $1 AND task_id = $2', [paramId(req, 'fileId'), taskId]);
  if (!rows.length) throw notFound('Файл не найден');
  const file = rows[0];
  if (!roles.isCreator && file.uploaded_by !== req.userId) throw forbidden('Удалить файл может его автор или создатель задачи');
  await pool.query('DELETE FROM task_files WHERE id = $1', [file.id]);
  removeFile(urlToDiskPath(file.file_url));
  await notifyParticipants(taskId);
  res.json({ success: true });
});

export default router;
