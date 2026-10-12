import { useMemo } from 'react';
import { displayName } from '../../lib/format';
import type { PermissionKey } from '../../lib/types';
import { Modal } from '../../ui/Modal';
import { UserPicker, type PickableUser } from '../users/UserPicker';
import { useKpiPeople } from './queries';
import s from './kpi.module.css';

/**
 * Выбор сотрудника, которому можно применить функцию (загрузить файл KPI,
 * назначить KPI): руководителю — его команда, директору и тем, кому функцию
 * включил директор, — все.
 */
export function TeamPicker({
  open,
  title = 'Сотрудник',
  permission = 'kpi_assign',
  onClose,
  onPick,
}: {
  open: boolean;
  title?: string;
  permission?: PermissionKey;
  onClose: () => void;
  onPick: (u: { id: number; name: string }) => void;
}) {
  const people = useKpiPeople(permission, open);
  const users: PickableUser[] = useMemo(
    () =>
      (people.data || []).map((m) => ({
        id: m.user_id,
        username: m.username,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        role_name: m.role_name,
        role_color: m.role_color,
      })),
    [people.data],
  );
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" flush>
      {people.data && people.data.length === 0 ? (
        <p className={s.pickerEmpty}>Нет сотрудников, которым вы можете это сделать.</p>
      ) : (
        <UserPicker users={users} loading={people.isLoading} onPick={(u) => onPick({ id: u.id, name: displayName(u) })} autoFocus />
      )}
    </Modal>
  );
}
