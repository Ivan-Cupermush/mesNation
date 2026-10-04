import pool from '../db/pool';
import { forbidden, notFound } from '../lib/errors';

/**
 * Модель прав компании.
 *
 * Дерево ролей — это иерархия должностей (ЧУМ). Каждый пользователь привязан
 * ровно к одному узлу через user_role_assignments (единственный источник правды;
 * users.role_id поддерживается синхронно для обратной совместимости).
 *
 * - Директор — пользователь в корневом узле (parent_id IS NULL). Имя узла
 *   значения не имеет: корень можно переименовать без потери прав.
 * - Глубина узла считается по структуре дерева, а не по колонке level,
 *   которая устаревает при переносе узлов.
 * - Ставить задачи можно: себе, всем в своём поддереве и людям на той же
 *   глубине (коллеги одного уровня, даже из других отделов).
 *   Вверх по иерархии — нельзя.
 */

export interface UserNode {
  nodeId: number | null;
  depth: number | null;
  isRoot: boolean;
}

/** Узел пользователя и его глубина от корня. */
export async function getUserNode(userId: number): Promise<UserNode> {
  const { rows } = await pool.query(
    `WITH RECURSIVE path AS (
       SELECT rt.id, rt.parent_id, 0 AS dist
       FROM user_role_assignments ura
       JOIN role_tree rt ON rt.id = ura.role_node_id
       WHERE ura.user_id = $1
       UNION ALL
       SELECT p.id, p.parent_id, path.dist + 1
       FROM role_tree p JOIN path ON p.id = path.parent_id
       WHERE path.dist < 100
     )
     SELECT (SELECT id FROM path WHERE dist = 0) AS node_id,
            MAX(dist) AS depth,
            BOOL_OR(dist = 0 AND parent_id IS NULL) AS is_root
     FROM path`,
    [userId],
  );
  const r = rows[0];
  if (!r || r.node_id == null) return { nodeId: null, depth: null, isRoot: false };
  return { nodeId: r.node_id, depth: Number(r.depth), isRoot: !!r.is_root };
}

export async function isDirector(userId: number): Promise<boolean> {
  return (await getUserNode(userId)).isRoot;
}

/** Id узла поддерева (включая сам узел). */
export async function getSubtreeNodeIds(nodeId: number): Promise<number[]> {
  const { rows } = await pool.query(
    `WITH RECURSIVE sub AS (
       SELECT id, 0 AS d FROM role_tree WHERE id = $1
       UNION ALL
       SELECT rt.id, sub.d + 1 FROM role_tree rt JOIN sub ON rt.parent_id = sub.id WHERE sub.d < 100
     )
     SELECT id FROM sub`,
    [nodeId],
  );
  return rows.map((r) => r.id);
}

/** Id узлов на заданной глубине от корня. */
export async function getNodeIdsAtDepth(depth: number): Promise<number[]> {
  const { rows } = await pool.query(
    `WITH RECURSIVE t AS (
       SELECT id, 0 AS d FROM role_tree WHERE parent_id IS NULL
       UNION ALL
       SELECT rt.id, t.d + 1 FROM role_tree rt JOIN t ON rt.parent_id = t.id WHERE t.d < 100
     )
     SELECT id FROM t WHERE d = $1`,
    [depth],
  );
  return rows.map((r) => r.id);
}

/** Узлы, людям в которых пользователь может ставить задачи. */
export async function getAssignableNodeIds(userId: number): Promise<number[]> {
  const me = await getUserNode(userId);
  if (me.nodeId == null || me.depth == null) return [];
  const [subtree, peers] = await Promise.all([
    getSubtreeNodeIds(me.nodeId),
    getNodeIdsAtDepth(me.depth),
  ]);
  return Array.from(new Set([...subtree, ...peers]));
}

/**
 * Активные пользователи, которым можно ставить задачи (включая себя).
 * Пользователь без узла может ставить задачи только себе.
 */
export async function getAssignableUsers(userId: number) {
  const nodeIds = await getAssignableNodeIds(userId);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url,
            rt.id AS role_node_id, rt.name AS role_name, rt.color AS role_color
     FROM users u
     LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
     LEFT JOIN role_tree rt ON rt.id = ura.role_node_id
     WHERE u.is_active = TRUE AND (u.id = $1 OR ura.role_node_id = ANY($2::int[]))
     ORDER BY (u.id = $1) DESC, rt.name NULLS LAST, COALESCE(u.display_name, u.username)`,
    [userId, nodeIds],
  );
  return rows;
}

/** Проверяет, что всех пользователей из списка можно назначить исполнителями. */
export async function assertCanAssign(userId: number, targetIds: number[]) {
  const allowed = new Set((await getAssignableUsers(userId)).map((u) => u.id));
  const denied = targetIds.filter((id) => !allowed.has(id));
  if (denied.length > 0) {
    throw forbidden('Задачу можно поставить только себе, подчинённым или коллегам своего уровня');
  }
}

/** Является ли target подчинённым manager (строго ниже по дереву). */
export async function isSubordinate(managerId: number, targetId: number): Promise<boolean> {
  if (managerId === targetId) return false;
  const [m, t] = await Promise.all([getUserNode(managerId), getUserNode(targetId)]);
  if (m.nodeId == null || t.nodeId == null) return false;
  if (m.isRoot) return true;
  if (m.nodeId === t.nodeId) return false;
  const sub = await getSubtreeNodeIds(m.nodeId);
  return sub.includes(t.nodeId);
}

/** Есть ли у пользователя подчинённые узлы (руководитель). */
export async function hasSubordinateNodes(userId: number): Promise<boolean> {
  const me = await getUserNode(userId);
  if (me.nodeId == null) return false;
  if (me.isRoot) return true;
  const { rows } = await pool.query('SELECT 1 FROM role_tree WHERE parent_id = $1 LIMIT 1', [me.nodeId]);
  return rows.length > 0;
}

// ===================== ЧАТЫ =====================

export async function isChatMember(chatId: number | string, userId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
     WHERE cm.chat_id = $1 AND cm.user_id = $2 AND c.deleted_at IS NULL`,
    [chatId, userId],
  );
  return rows.length > 0;
}

export async function assertChatMember(chatId: number | string, userId: number) {
  if (!(await isChatMember(chatId, userId))) throw forbidden('Вы не участник этого чата');
}

export type ChatPermission = 'change_info' | 'delete_messages' | 'ban_users' | 'add_users' | 'pin_messages' | 'add_admins';

/**
 * Права в групповом чате. Создатель может всё. Администратор — то, что ему выдали.
 * Обычный участник (так было договорено с заказчиком) может всё, кроме назначения
 * администраторов. Не участник не может ничего.
 */
const MEMBER_PERMISSIONS: ChatPermission[] = ['add_users', 'pin_messages'];

export async function getChatRights(chatId: number, userId: number) {
  const { rows } = await pool.query(
    `SELECT c.created_by, c.type, c.name, c.is_supergroup, cm.user_id AS member, ca.permissions
     FROM chats c
     LEFT JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $2
     LEFT JOIN chat_admins ca ON ca.chat_id = c.id AND ca.user_id = $2
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [chatId, userId],
  );
  if (rows.length === 0) throw notFound('Чат не найден');
  const r = rows[0];
  const isMember = r.member != null;
  const isCreator = r.created_by === userId;
  const isAdmin = Array.isArray(r.permissions);
  const can = (perm: ChatPermission): boolean => {
    if (!isMember) return false;
    if (isCreator) return true;
    if (isAdmin) return (r.permissions as string[]).includes(perm);
    // Обычный участник (как в Telegram по умолчанию): приглашать людей и
    // закреплять сообщения. Исключать, удалять чужие сообщения, менять
    // название/фото/темы и назначать админов — только владелец и админы.
    return MEMBER_PERMISSIONS.includes(perm);
  };
  return {
    isMember,
    isCreator,
    isAdmin,
    type: r.type as string,
    name: r.name as string | null,
    isSupergroup: !!r.is_supergroup,
    createdBy: r.created_by as number,
    can,
  };
}

export async function assertChatPermission(chatId: number, userId: number, perm: ChatPermission, message?: string) {
  const rights = await getChatRights(chatId, userId);
  if (!rights.isMember) throw forbidden('Вы не участник этого чата');
  if (!rights.can(perm)) throw forbidden(message || 'Недостаточно прав в этом чате');
  return rights;
}

// ===================== ЗАДАЧИ =====================

export interface TaskRoles {
  isCreator: boolean;
  isAssignee: boolean;
  isWatcher: boolean;
  /** Руководитель кого-то из участников — видит задачу, но не управляет ей. */
  isSupervisor: boolean;
}

export async function getTaskRoles(taskId: number, userId: number): Promise<TaskRoles & { canView: boolean }> {
  const { rows } = await pool.query(
    `SELECT t.creator_id,
            EXISTS (SELECT 1 FROM task_assignees WHERE task_id = t.id AND user_id = $2) AS is_assignee,
            EXISTS (SELECT 1 FROM task_watchers WHERE task_id = t.id AND user_id = $2) AS is_watcher,
            ARRAY(SELECT user_id FROM task_assignees WHERE task_id = t.id) AS assignee_ids
     FROM tasks t WHERE t.id = $1`,
    [taskId, userId],
  );
  if (rows.length === 0) throw notFound('Задача не найдена');
  const r = rows[0];
  const roles: TaskRoles = {
    isCreator: r.creator_id === userId,
    isAssignee: r.is_assignee,
    isWatcher: r.is_watcher,
    isSupervisor: false,
  };
  if (!roles.isCreator && !roles.isAssignee && !roles.isWatcher) {
    // Директор видит всё, руководитель — задачи своих подчинённых.
    const people: number[] = [r.creator_id, ...r.assignee_ids];
    for (const p of people) {
      if (await isSubordinate(userId, p)) {
        roles.isSupervisor = true;
        break;
      }
    }
  }
  const canView = roles.isCreator || roles.isAssignee || roles.isWatcher || roles.isSupervisor;
  return { ...roles, canView };
}

export async function assertCanViewTask(taskId: number, userId: number) {
  const roles = await getTaskRoles(taskId, userId);
  if (!roles.canView) throw forbidden('Нет доступа к этой задаче');
  return roles;
}
