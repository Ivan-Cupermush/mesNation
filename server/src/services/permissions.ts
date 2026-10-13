import { z } from 'zod';
import pool from '../db/pool';
import { forbidden, badRequest } from '../lib/errors';
import { getSubtreeNodeIds, getUserNode, isSubordinate } from './access';

/**
 * Функции, которые руководитель включает или отключает сотруднику.
 *
 * По умолчанию функция есть у директора (для всей компании) и у руководителей
 * отделов (для своих подчинённых). Руководитель может включить её сотруднику
 * (например, оператору — загрузку отчётов) или отключить. Включённая
 * директором функция действует на всю компанию, руководителем отдела — на его
 * отдел.
 */
export const PERMISSIONS = [
  {
    key: 'sales_reports',
    label: 'Загрузка отчётов о продажах',
    hint: 'Ежедневный отчёт из 1С, списки клиентов «Есть повод», сопоставление менеджеров',
  },
  { key: 'kpi_files', label: 'Загрузка файлов KPI', hint: 'Файл KPI сотрудника: план, факт, бонусы и выплаты' },
  { key: 'kpi_assign', label: 'Назначение KPI вручную', hint: 'Цели сотрудникам и правила их расчёта' },
  { key: 'knowledge_manage', label: 'Управление базой знаний', hint: 'Загрузка, обновление и удаление документов' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as Permission[];

/** { kpi_files: true, sales_reports: null } — включить, отключить, вернуть «по должности» (null). */
export const permissionChangesSchema = z.partialRecord(z.enum(PERMISSION_KEYS as [Permission, ...Permission[]]), z.boolean().nullable());

/** На кого действует функция: всю компанию или перечисленных сотрудников. */
export interface Scope {
  all: boolean;
  ids: Set<number>;
}

const ALL: Scope = { all: true, ids: new Set() };

/** Подчинённые пользователя (директор — все); null — подчинённых нет. */
export async function teamScope(userId: number): Promise<Scope | null> {
  const me = await getUserNode(userId);
  if (me.nodeId == null) return null;
  if (me.isRoot) return ALL;
  const nodes = (await getSubtreeNodeIds(me.nodeId)).filter((id) => id !== me.nodeId);
  if (!nodes.length) return null;
  const { rows } = await pool.query('SELECT user_id FROM user_role_assignments WHERE role_node_id = ANY($1::int[])', [nodes]);
  return { all: false, ids: new Set(rows.map((r) => r.user_id as number)) };
}

export const inScope = (scope: Scope | null, userId: number) => !!scope && (scope.all || scope.ids.has(userId));

async function override(userId: number, permission: Permission) {
  const { rows } = await pool.query('SELECT allowed, granted_by FROM user_permissions WHERE user_id = $1 AND permission = $2', [userId, permission]);
  return (rows[0] as { allowed: boolean; granted_by: number | null } | undefined) ?? null;
}

/** На кого пользователь может применять функцию; null — функции у него нет. */
export async function permissionScope(userId: number, permission: Permission): Promise<Scope | null> {
  const me = await getUserNode(userId);
  if (me.isRoot) return ALL;
  const own = await teamScope(userId);
  const o = await override(userId, permission);
  if (!o) return own;
  if (!o.allowed) return null;
  // Включил директор — на всю компанию, руководитель отдела — на его отдел.
  // Неизвестно, кто включил (запись осиротела), — только своя команда: права
  // на всю компанию не появляются сами собой.
  if (o.granted_by == null) return own ?? { all: false, ids: new Set() };
  if ((await getUserNode(o.granted_by)).isRoot) return ALL;
  const granter = await teamScope(o.granted_by);
  if (!granter) return own;
  return { all: false, ids: new Set([...(own?.ids ?? []), ...granter.ids]) };
}

export async function hasPermission(userId: number, permission: Permission): Promise<boolean> {
  return (await permissionScope(userId, permission)) != null;
}

/** Все функции пользователя: есть ли каждая (для интерфейса). */
export async function effectivePermissions(userId: number): Promise<Record<Permission, boolean>> {
  const out = {} as Record<Permission, boolean>;
  for (const key of PERMISSION_KEYS) out[key] = await hasPermission(userId, key);
  return out;
}

/** Функции сотрудника для экрана настройки: по умолчанию, явно включено/отключено, итог. */
export async function permissionDetails(userId: number) {
  const [team, me, overrides] = await Promise.all([
    teamScope(userId),
    getUserNode(userId),
    pool.query('SELECT permission, allowed FROM user_permissions WHERE user_id = $1', [userId]),
  ]);
  const byKey = new Map(overrides.rows.map((r) => [r.permission as string, r.allowed as boolean]));
  return PERMISSIONS.map((p) => {
    const value = byKey.has(p.key) ? byKey.get(p.key)! : null;
    return {
      key: p.key,
      label: p.label,
      hint: p.hint,
      default: me.isRoot || team != null,
      override: me.isRoot ? null : value,
      enabled: me.isRoot ? true : value ?? team != null,
      locked: me.isRoot,
    };
  });
}

/**
 * Включить/отключить функции сотруднику. Меняет директор (любому) и
 * руководитель (своим подчинённым), включить можно только ту функцию,
 * которая есть у самого руководителя. null — вернуть «по умолчанию».
 */
export async function setPermissions(
  actorId: number,
  targetId: number,
  changes: Partial<Record<Permission, boolean | null>>,
  /** При создании сотрудника: сохранить выбор как есть (подчинённых у него ещё нет, «по должности» — потом). */
  opts: { explicit?: boolean } = {},
) {
  if (actorId === targetId) throw forbidden('Свои функции меняет руководитель');
  const [actor, target] = await Promise.all([getUserNode(actorId), getUserNode(targetId)]);
  if (target.isRoot) throw badRequest('У директора все функции включены');
  if (!actor.isRoot && !(await isSubordinate(actorId, targetId))) throw forbidden('Менять функции можно только своим подчинённым');
  const byDefault = (await teamScope(targetId)) != null;
  for (const [key, raw] of Object.entries(changes) as [Permission, boolean | null][]) {
    if (!PERMISSION_KEYS.includes(key)) throw badRequest(`Неизвестная функция: ${key}`);
    // Совпадает с должностью — храним «по умолчанию»: при переводе на другую должность функция поменяется сама.
    const value = !opts.explicit && raw === byDefault ? null : raw;
    if (value === true && !(await hasPermission(actorId, key))) {
      throw forbidden(`Нельзя включить функцию, которой нет у вас: «${PERMISSIONS.find((p) => p.key === key)!.label}»`);
    }
    if (value === null) {
      await pool.query('DELETE FROM user_permissions WHERE user_id = $1 AND permission = $2', [targetId, key]);
    } else {
      await pool.query(
        `INSERT INTO user_permissions (user_id, permission, allowed, granted_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, permission) DO UPDATE SET allowed = EXCLUDED.allowed, granted_by = EXCLUDED.granted_by, updated_at = NOW()`,
        [targetId, key, value, actorId],
      );
    }
  }
}

const ACTION_TEXT: Record<Permission, string> = {
  sales_reports: 'Загружать отчёты о продажах',
  kpi_files: 'Загружать файл KPI',
  kpi_assign: 'Назначать KPI',
  knowledge_manage: 'Управлять базой знаний',
};

/**
 * Может ли пользователь применить функцию к сотруднику (загрузить ему файл KPI,
 * назначить цель). Себе — только директор: свой KPI сотруднику ставит руководитель.
 */
export async function canApply(actorId: number, targetId: number, permission: Permission): Promise<boolean> {
  const scope = await permissionScope(actorId, permission);
  if (!scope) return false;
  if (actorId === targetId) return (await getUserNode(actorId)).isRoot;
  return inScope(scope, targetId);
}

export async function requireKpiAccess(actorId: number, targetId: number, permission: Permission): Promise<void> {
  if (await canApply(actorId, targetId, permission)) return;
  const scope = await permissionScope(actorId, permission);
  if (!scope) throw forbidden(`${ACTION_TEXT[permission]} вам не разрешено — функцию включает руководитель`);
  if (actorId === targetId) throw forbidden('Свой KPI ставит руководитель');
  throw forbidden(`${ACTION_TEXT[permission]} можно только своим подчинённым`);
}
