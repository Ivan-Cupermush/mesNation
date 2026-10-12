import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import type { PermissionItem, PermissionKey } from '../../lib/types';
import { Button } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { SwitchList, SwitchRow } from '../../ui/SwitchRow';
import { useFeedback } from '../../ui/feedback';
import { userKeys } from './queries';
import s from './Permissions.module.css';

/** Функции, которые руководитель включает или отключает сотруднику (как на сервере, services/permissions.ts). */
export const PERMISSIONS: { key: PermissionKey; label: string; hint: string }[] = [
  { key: 'sales_reports', label: 'Загрузка отчётов о продажах', hint: 'Ежедневный отчёт из 1С, списки клиентов «Есть повод», сопоставление менеджеров' },
  { key: 'kpi_files', label: 'Загрузка файлов KPI', hint: 'Файл KPI сотрудника: план, факт, бонусы и выплаты' },
  { key: 'kpi_assign', label: 'Назначение KPI вручную', hint: 'Цели сотрудникам и правила их расчёта' },
  { key: 'knowledge_manage', label: 'Управление базой знаний', hint: 'Загрузка, обновление и удаление документов' },
];

const DEFAULT_NOTE = 'По должности функции есть у руководителей (для своего отдела) и директора. Включённая директором — действует на всю компанию.';

/**
 * Функции при создании сотрудника: по умолчанию — по должности (byRole), руководитель
 * может включить или отключить. В value — только то, что изменено вручную.
 */
export function PermissionPicker({
  byRole,
  value,
  onChange,
}: {
  byRole: boolean;
  value: Partial<Record<PermissionKey, boolean>>;
  onChange: (v: Partial<Record<PermissionKey, boolean>>) => void;
}) {
  return (
    <div className={s.block}>
      <span className={s.title}>Функции</span>
      <SwitchList>
        {PERMISSIONS.map((p) => {
          const own = value[p.key];
          const enabled = own ?? byRole;
          return (
            <SwitchRow
              key={p.key}
              title={p.label}
              hint={p.hint}
              note={own != null && own !== byRole ? (own ? 'включено вручную' : 'отключено вручную') : undefined}
              checked={enabled}
              onChange={(v) => {
                const next = { ...value };
                if (v === byRole) delete next[p.key];
                else next[p.key] = v;
                onChange(next);
              }}
            />
          );
        })}
      </SwitchList>
      <span className={s.hint}>{DEFAULT_NOTE}</span>
    </div>
  );
}

interface PermissionsResponse {
  items: PermissionItem[];
  can_edit: boolean;
}

/** Функции сотрудника в профиле: руководитель включает и отключает, сотрудник видит свои. */
export function UserPermissions({ userId, editable }: { userId: number; editable: boolean }) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const key = [...userKeys.one(userId), 'permissions'];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => api.get<PermissionsResponse>(`/api/users/${userId}/permissions`) });

  const change = async (perm: PermissionKey, value: boolean | null) => {
    try {
      const r = await api.put<PermissionsResponse>(`/api/users/${userId}/permissions`, { permissions: { [perm]: value } });
      qc.setQueryData(key, r);
      qc.invalidateQueries({ queryKey: userKeys.one(userId) });
    } catch (e) {
      toast.error(e, 'Не удалось изменить функцию');
    }
  };

  if (isLoading) {
    return (
      <div className={s.loading}>
        <Spinner size={22} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className={s.loading}>
        <Button size="sm" variant="soft" onClick={() => refetch()}>
          Повторить
        </Button>
      </div>
    );
  }
  const canEdit = editable && data.can_edit;
  return (
    <div className={s.block}>
      <SwitchList>
        {data.items.map((p) => (
          <SwitchRow
            key={p.key}
            title={p.label}
            hint={p.hint}
            note={p.locked ? 'у директора — все' : p.override == null ? `по должности: ${p.default ? 'есть' : 'нет'}` : p.override ? 'включено вручную' : 'отключено вручную'}
            checked={p.enabled}
            // Включить можно только ту функцию, которая есть у самого руководителя.
            disabled={!canEdit || p.locked || (!p.enabled && !p.grantable)}
            onChange={(v) => change(p.key, v === p.default ? null : v)}
          />
        ))}
      </SwitchList>
      {canEdit && <span className={s.hint}>{DEFAULT_NOTE}</span>}
    </div>
  );
}
