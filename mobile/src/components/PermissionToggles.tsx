import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator, TouchableOpacity, } from 'react-native';
import { T, themed } from '../theme/runtime';
import { api, PermissionItem, PermissionKey } from '../services/api';
import { showError } from './ui/toast';

/** Функции, которые руководитель включает или отключает сотруднику (как на сервере, services/permissions.ts). */
export const PERMISSIONS: { key: PermissionKey; label: string; hint: string }[] = [
  { key: 'sales_reports', label: 'Загрузка отчётов о продажах', hint: 'Ежедневный отчёт из 1С, списки клиентов «Есть повод», сопоставление менеджеров' },
  { key: 'kpi_files', label: 'Загрузка файлов KPI', hint: 'Файл KPI сотрудника: план, факт, бонусы и выплаты' },
  { key: 'kpi_assign', label: 'Назначение KPI вручную', hint: 'Цели сотрудникам и правила их расчёта' },
  { key: 'knowledge_manage', label: 'Управление базой знаний', hint: 'Загрузка, обновление и удаление документов' },
];

const DEFAULT_NOTE = 'По должности функции есть у руководителей (для своего отдела) и директора. Включённая директором — действует на всю компанию.';

function Row({ title, hint, note, value, onChange, disabled, last }: {
  title: string; hint: string; note?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder, disabled && { opacity: 0.55 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: T.border, true: T.accent }}
        thumbColor="#FFFFFF"
        accessibilityLabel={title}
      />
    </View>
  );
}

/**
 * Функции при создании сотрудника: по умолчанию — по должности (byRole),
 * руководитель может включить или отключить. В value — только изменённое вручную.
 */
export function PermissionPicker({ byRole, value, onChange }: {
  byRole: boolean;
  value: Partial<Record<PermissionKey, boolean>>;
  onChange: (v: Partial<Record<PermissionKey, boolean>>) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.card}>
        {PERMISSIONS.map((p, i) => {
          const own = value[p.key];
          return (
            <Row
              key={p.key}
              title={p.label}
              hint={p.hint}
              note={own != null && own !== byRole ? (own ? 'включено вручную' : 'отключено вручную') : undefined}
              value={own ?? byRole}
              last={i === PERMISSIONS.length - 1}
              onChange={(v) => {
                const next = { ...value };
                if (v === byRole) delete next[p.key];
                else next[p.key] = v;
                onChange(next);
              }}
            />
          );
        })}
      </View>
      <Text style={styles.footer}>{DEFAULT_NOTE}</Text>
    </View>
  );
}

/** Функции сотрудника в профиле: руководитель включает и отключает, сотрудник видит свои. */
export function UserPermissions({ userId, editable, flat }: { userId: number; editable: boolean; /** Без своей карточки — внутри другой. */ flat?: boolean }) {
  const [data, setData] = useState<{ items: PermissionItem[]; can_edit: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.getUserPermissions(userId).then(setData).catch(() => setFailed(true));
  }, [userId]);
  useEffect(load, [load]);

  const change = async (p: PermissionItem, v: boolean) => {
    setBusy(true);
    try {
      setData(await api.setUserPermissions(userId, { [p.key]: v === p.default ? null : v }));
    } catch (e: any) {
      showError(e?.message || 'Не удалось изменить функцию', 'Функции');
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <TouchableOpacity style={[styles.card, styles.center]} onPress={load}>
        <Text style={styles.hint}>Не удалось загрузить функции. Нажмите, чтобы повторить.</Text>
      </TouchableOpacity>
    );
  }
  if (!data) return <View style={[styles.card, styles.center]}><ActivityIndicator color={T.accent} /></View>;
  const canEdit = editable && data.can_edit;
  return (
    <View style={{ gap: 6 }}>
      <View style={flat ? undefined : styles.card}>
        {data.items.map((p, i) => (
          <Row
            key={p.key}
            title={p.label}
            hint={p.hint}
            note={p.locked ? 'у директора — все' : p.override == null ? `по должности: ${p.default ? 'есть' : 'нет'}` : p.override ? 'включено вручную' : 'отключено вручную'}
            value={p.enabled}
            // Включить можно только ту функцию, которая есть у самого руководителя.
            disabled={busy || !canEdit || p.locked || (!p.enabled && !p.grantable)}
            last={i === data.items.length - 1}
            onChange={(v) => change(p, v)}
          />
        ))}
      </View>
      {canEdit && <Text style={styles.footer}>{DEFAULT_NOTE}</Text>}
    </View>
  );
}

const styles = themed(() => ({
  card: { backgroundColor: T.card, borderRadius: 18, paddingHorizontal: 16 },
  center: { paddingVertical: 18, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  title: { fontSize: 14.5, fontWeight: '700', color: T.textPrimary },
  hint: { fontSize: 12, color: T.textSecondary, marginTop: 2, lineHeight: 16 },
  note: { fontSize: 11.5, fontWeight: '700', color: T.accent, marginTop: 3 },
  footer: { fontSize: 11.5, color: T.textMuted, lineHeight: 16, paddingHorizontal: 4 },
}));
