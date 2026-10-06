import { useMemo } from 'react';
import { displayName } from '../../lib/format';
import { Modal } from '../../ui/Modal';
import { UserPicker, type PickableUser } from '../users/UserPicker';
import { useUsers } from '../users/queries';
import { useSubordinates } from './queries';
import s from './kpi.module.css';

/** Выбор сотрудника из своей команды (поддерево ролей руководителя). */
export function TeamPicker({ open, title = 'Сотрудник', onClose, onPick }: { open: boolean; title?: string; onClose: () => void; onPick: (u: { id: number; name: string }) => void }) {
  const team = useSubordinates('month', open);
  const all = useUsers(open);
  // В списке команды нет аватаров и цветов ролей — берём их из общего списка сотрудников.
  const users: PickableUser[] = useMemo(() => {
    const byId = new Map((all.data || []).map((u) => [u.id, u]));
    return (team.data || []).map(
      (m) => byId.get(m.user_id) ?? { id: m.user_id, username: m.username, display_name: m.display_name, avatar_url: null, role_name: m.role_name },
    );
  }, [team.data, all.data]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" flush>
      {team.data && team.data.length === 0 ? (
        <p className={s.pickerEmpty}>В вашей ветке дерева ролей нет сотрудников.</p>
      ) : (
        <UserPicker users={users} loading={team.isLoading} onPick={(u) => onPick({ id: u.id, name: displayName(u) })} autoFocus />
      )}
    </Modal>
  );
}
