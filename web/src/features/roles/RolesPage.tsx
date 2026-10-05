import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, FolderInput, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api } from '../../lib/http';
import { displayName, plural } from '../../lib/format';
import { useMedia } from '../../lib/useMedia';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Modal } from '../../ui/Modal';
import { Page, PageHeader } from '../../ui/Page';
import { PageLoader, Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { userKeys } from '../users/queries';
import { RoleTree } from './RoleTree';
import { RoleEditDialog, RolePickerDialog, type RoleDraft } from './RoleDialogs';
import { buildTree, findItem, roleKeys, subtreeIds, useRoleTree, useRoleUsers, type RoleNode, type RoleUser } from './queries';
import s from './RolesPage.module.css';

/**
 * Дерево ролей — как в приложении: иерархия должностей (от неё зависят
 * права на задачи и видимость), сотрудники каждой роли. Директор
 * добавляет, меняет, переносит и удаляет роли и переводит сотрудников.
 */
export default function RolesPage() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const wide = useMedia('(min-width: 1000px)');
  const [params, setParams] = useSearchParams();
  const { data: nodes, isLoading, error, refetch } = useRoleTree();
  const tree = useMemo(() => buildTree(nodes || []), [nodes]);
  const selectedId = Number(params.get('node')) || null;
  const focusUser = Number(params.get('user')) || null;
  const selected = nodes?.find((n) => n.id === selectedId) ?? null;
  const canEdit = me.is_director;

  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; node: RoleNode } | null>(null);
  const [movingNode, setMovingNode] = useState<RoleNode | null>(null);
  const [movingUser, setMovingUser] = useState<RoleUser | null>(null);

  const select = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('node', String(id));
    else next.delete('node');
    next.delete('user');
    setParams(next, { replace: true });
  };

  // Без выбора на широком экране показываем корень.
  useEffect(() => {
    if (wide && !selectedId && tree[0]) select(tree[0].node.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, selectedId, tree]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: roleKeys.tree });
    qc.invalidateQueries({ queryKey: ['role-tree', 'users'] });
    qc.invalidateQueries({ queryKey: userKeys.all });
    qc.invalidateQueries({ queryKey: ['users', 'assignable'] });
  };

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await fn();
      refresh();
      toast.success(ok);
    } catch (e) {
      toast.error(e, fail);
      throw e;
    }
  };

  const remove = async (node: RoleNode) => {
    if (!(await confirm({ title: `Удалить роль «${node.name}»?`, text: 'Дочерние роли перейдут к вышестоящей. Роль, в которой есть сотрудники, удалить нельзя — сначала переведите их.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await run(() => api.delete(`/api/role-tree/${node.id}`), 'Роль удалена', 'Не удалось удалить роль');
      select(node.parent_id);
    } catch {
      // Ошибку уже показали; роль остаётся выбранной.
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !nodes) return <EmptyState title="Не удалось загрузить дерево ролей" action={<Button onClick={() => refetch()}>Повторить</Button>} />;

  const selectedItem = selected ? findItem(tree, selected.id) : null;
  const detail = selected && selectedItem && (
    <RoleDetail
      node={selected}
      total={selectedItem.total}
      parent={nodes.find((n) => n.id === selected.parent_id) ?? null}
      canEdit={canEdit}
      focusUser={focusUser}
      onAddChild={() => setEditor({ mode: 'create', node: selected })}
      onEdit={() => setEditor({ mode: 'edit', node: selected })}
      onMove={() => setMovingNode(selected)}
      onDelete={() => remove(selected)}
      onMoveUser={setMovingUser}
      onOpenUser={(id) => navigate(`/users/${id}`)}
      onSelect={select}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Дерево ролей"
        subtitle={`${nodes.length} ${plural(nodes.length, ['роль', 'роли', 'ролей'])} · ${tree[0]?.total ?? 0} ${plural(tree[0]?.total ?? 0, ['сотрудник', 'сотрудника', 'сотрудников'])}`}
        back={true}
        actions={
          canEdit ? (
            <Button size="sm" icon={<UserPlus size={16} />} onClick={() => navigate(selected ? `/create-user?node=${selected.id}` : '/create-user')}>
              Сотрудник
            </Button>
          ) : undefined
        }
      />
      <div className={[s.layout, wide && s.split].filter(Boolean).join(' ')}>
        <div className={s.treePane}>
          {!canEdit && <p className={s.readOnly}>Менять дерево может только директор.</p>}
          <RoleTree items={tree} selected={selectedId} onSelect={select} />
        </div>
        {wide && <div className={s.detailPane}>{detail || <EmptyState compact title="Выберите роль" />}</div>}
      </div>

      {!wide && (
        <Modal open={!!detail} onClose={() => select(null)} title={selected?.name} size="md">
          {detail}
        </Modal>
      )}

      <RoleEditDialog
        open={!!editor}
        title={editor?.mode === 'create' ? `Новая роль в «${editor.node.name}»` : 'Изменить роль'}
        saveText={editor?.mode === 'create' ? 'Создать' : 'Сохранить'}
        initial={editor?.mode === 'edit' ? { name: editor.node.name, description: editor.node.description || '', color: editor.node.color || undefined, icon: editor.node.icon || undefined } : undefined}
        onClose={() => setEditor(null)}
        onSave={async (d: RoleDraft) => {
          const body = { name: d.name, description: d.description || null, color: d.color, icon: d.icon };
          if (editor!.mode === 'create') {
            let created: RoleNode | null = null;
            await run(async () => (created = await api.post<RoleNode>('/api/role-tree', { ...body, parent_id: editor!.node.id })), 'Роль создана', 'Не удалось создать роль');
            if (created) select((created as RoleNode).id);
          } else {
            await run(() => api.patch(`/api/role-tree/${editor!.node.id}`, body), 'Роль сохранена', 'Не удалось сохранить роль');
          }
        }}
      />

      <RolePickerDialog
        open={!!movingNode}
        title={`Куда перенести «${movingNode?.name ?? ''}»?`}
        hint="Выберите новую вышестоящую роль. Подчинённые роли переедут вместе с ней."
        nodes={nodes}
        disabled={movingNode ? subtreeIds(findItem(tree, movingNode.id)!) : undefined}
        current={movingNode?.parent_id}
        onClose={() => setMovingNode(null)}
        onPick={async (target) => {
          const node = movingNode!;
          setMovingNode(null);
          if (target.id === node.parent_id) return;
          await run(() => api.patch(`/api/role-tree/${node.id}`, { parent_id: target.id }), `«${node.name}» теперь подчиняется «${target.name}»`, 'Не удалось перенести роль').catch(() => undefined);
        }}
      />

      <RolePickerDialog
        open={!!movingUser}
        title={`Новая роль: ${movingUser ? displayName(movingUser) : ''}`}
        hint="От роли зависит, кому сотрудник может ставить задачи и чьи задачи видит."
        nodes={nodes}
        current={movingUser?.role_node_id}
        onClose={() => setMovingUser(null)}
        onPick={async (target) => {
          const u = movingUser!;
          setMovingUser(null);
          if (target.id === u.role_node_id) return;
          if (!(await confirm({ title: 'Перевести сотрудника?', text: `${displayName(u)} → «${target.name}»`, confirmText: 'Перевести' }))) return;
          await run(() => api.post(`/api/role-tree/users/${u.id}/assign`, { role_node_id: target.id }), `${displayName(u)} теперь в роли «${target.name}»`, 'Не удалось перевести').catch(() => undefined);
        }}
      />
    </Page>
  );
}

function RoleDetail({
  node,
  total,
  parent,
  canEdit,
  focusUser,
  onAddChild,
  onEdit,
  onMove,
  onDelete,
  onMoveUser,
  onOpenUser,
  onSelect,
}: {
  node: RoleNode;
  total: number;
  parent: RoleNode | null;
  canEdit: boolean;
  focusUser: number | null;
  onAddChild: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onMoveUser: (u: RoleUser) => void;
  onOpenUser: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const { data: users, isLoading } = useRoleUsers(node.id);
  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <span className={s.bigIcon} style={{ background: `color-mix(in srgb, ${node.color || '#6366F1'} 16%, transparent)` }}>
          {node.icon || '👤'}
        </span>
        <div className={s.detailTitles}>
          <h2>{node.name}</h2>
          {node.description && <p>{node.description}</p>}
          {parent ? (
            <button type="button" className={s.parent} onClick={() => onSelect(parent.id)}>
              подчиняется: {parent.icon} {parent.name}
            </button>
          ) : (
            <span className={s.parentRoot}>вершина дерева — директор</span>
          )}
        </div>
      </div>

      {canEdit && (
        <div className={s.actions}>
          <Button size="sm" variant="soft" icon={<Plus size={16} />} onClick={onAddChild}>
            Подроль
          </Button>
          <Button size="sm" variant="secondary" icon={<Pencil size={15} />} onClick={onEdit}>
            Изменить
          </Button>
          {!node.is_root && (
            <>
              <Button size="sm" variant="secondary" icon={<FolderInput size={15} />} onClick={onMove}>
                Перенести
              </Button>
              <Button size="sm" variant="secondary" icon={<Trash2 size={15} />} onClick={onDelete}>
                Удалить
              </Button>
            </>
          )}
        </div>
      )}

      <div className={s.usersHead}>
        <Users size={16} />
        <b>Сотрудники роли</b>
        <span className={s.usersCount}>
          {node.users_count}
          {total !== node.users_count && ` · всего в ветке ${total}`}
        </span>
      </div>
      {isLoading ? (
        <div className={s.center}>
          <Spinner />
        </div>
      ) : !users?.length ? (
        <p className={s.empty}>В этой роли пока никого нет.</p>
      ) : (
        <div className={s.users}>
          {users.map((u) => (
            <div key={u.id} className={[s.user, focusUser === u.id && s.userFocus, !u.is_active && s.userInactive].filter(Boolean).join(' ')}>
              <button type="button" className={s.userMain} onClick={() => onOpenUser(u.id)}>
                <Avatar name={displayName(u)} src={u.avatar_url} size={38} />
                <span className={s.userBody}>
                  <b>{displayName(u)}</b>
                  <small>
                    @{u.username}
                    {!u.is_active && ' · деактивирован'}
                  </small>
                </span>
              </button>
              {canEdit && (
                <IconButton label="Перевести в другую роль" size={34} onClick={() => onMoveUser(u)}>
                  <ArrowRightLeft size={16} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
