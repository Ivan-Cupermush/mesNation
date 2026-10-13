import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, SectionList, TextInput, ActivityIndicator } from 'react-native';
import { Check, HandHeart, Search, X } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
import { fuzzyMatch } from '../../utils/fuzzySearch';
import { firstNameOf } from '../../utils/names';
import UserAvatar from '../ui/UserAvatar';
import SafeBottom from '../ui/SafeBottom';
import type { UserInSubtree } from '../../services/api';
import type { TaskKind } from './kind';

type Person = UserInSubtree & { is_active?: boolean };

interface Group {
  key: string;
  title: string;
  hint?: string;
  icon?: string | null;
  color?: string | null;
  data: Person[];
}

const nameOf = (u: Person) => u.display_name || u.username;
const byName = (a: Person, b: Person) => nameOf(a).localeCompare(nameOf(b), 'ru');

/**
 * Группы выбора (как на сайте). Просьба: сначала коллеги вашей должности,
 * дальше — по ролям (коллеги своего уровня, затем подчинённые), в конце —
 * себе. Задача: себе и подчинённые по ролям.
 */
export function groupAssignees(users: Person[], kind: TaskKind, myRole: string | null): Group[] {
  const allowed = users.filter((u) => u.is_active !== false && (kind === 'request' ? u.can_request !== false : u.can_task !== false));
  const self = allowed.filter((u) => u.relation === 'self');
  const same = allowed.filter((u) => u.relation === 'colleague' && u.same_role).sort(byName);
  const rest = allowed.filter((u) => u.relation !== 'self' && !(u.relation === 'colleague' && u.same_role));
  const roles = new Map<string, Group>();
  for (const u of rest) {
    const key = `${u.relation === 'colleague' ? 0 : 1}:${u.role_name || '—'}`;
    if (!roles.has(key)) {
      roles.set(key, {
        key,
        title: u.role_name || 'Без должности',
        hint: u.relation === 'colleague' ? 'коллеги вашего уровня' : 'подчинённые',
        icon: u.role_icon,
        color: u.role_color,
        data: [],
      });
    }
    roles.get(key)!.data.push(u);
  }
  const roleGroups = [...roles.values()].sort((a, b) => a.key.localeCompare(b.key, 'ru')).map((g) => ({ ...g, data: g.data.sort(byName) }));
  const selfGroup: Group[] = self.length ? [{ key: 'self', title: kind === 'request' ? 'Себе — как напоминание' : 'Себе', data: self }] : [];
  const sameGroup: Group[] = same.length
    ? [{ key: 'same', title: myRole ? `Коллеги — ${myRole}` : 'Коллеги вашей должности', hint: 'ваша должность', icon: same[0].role_icon, color: same[0].role_color, data: same }]
    : [];
  return kind === 'request' ? [...sameGroup, ...roleGroups, ...selfGroup] : [...selfGroup, ...roleGroups];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  users: Person[];
  loading?: boolean;
  kind: TaskKind;
  meId: number | null;
  myRole: string | null;
  selected: number[];
  onToggle: (u: Person) => void;
  /** Задача: коллегам — только просьбой. Переключить форму на просьбу. */
  onSwitchToRequest?: () => void;
}

/** Шторка «Кого попросить» / «Исполнители» с группами по ролям и поиском. */
export default function AssigneeSheet({ visible, onClose, users, loading, kind, meId, myRole, selected, onToggle, onSwitchToRequest }: Props) {
  const [query, setQuery] = useState('');
  const request = kind === 'request';
  const tone = request ? T.violet : T.accent;
  const groups = useMemo(() => groupAssignees(users, kind, myRole), [users, kind, myRole]);
  const sections = useMemo(() => {
    const q = query.trim();
    if (!q) return groups;
    const found = groups
      .flatMap((g) => g.data)
      .map((u) => ({ u, r: fuzzyMatch(`${u.display_name || ''} ${u.username} ${u.role_name || ''}`, q) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.u);
    return found.length ? [{ key: 'found', title: 'Найдено', data: found }] : [];
  }, [groups, query]);
  const colleagues = users.filter((u) => u.relation === 'colleague').length;
  const chosen = groups.flatMap((g) => g.data).filter((u) => selected.includes(u.id));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{request ? 'Кого попросить' : 'Исполнители'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.close} accessibilityLabel="Закрыть">
              <X size={22} color={T.textPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>{request ? 'Сначала — коллеги вашей должности, дальше — по ролям.' : 'Задачу можно поставить себе и подчинённым.'}</Text>
          {chosen.length > 0 && (
            <View style={styles.chips}>
              {chosen.map((u) => (
                <TouchableOpacity key={u.id} style={[styles.chip, { backgroundColor: withAlpha(tone, 0.14) }]} onPress={() => onToggle(u)} activeOpacity={0.7}>
                  <UserAvatar name={nameOf(u)} url={u.avatar_url} size={22} />
                  <Text style={[styles.chipText, { color: tone }]}>{firstNameOf(u)}</Text>
                  <X size={13} color={tone} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.search}>
            <Search size={18} color={T.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={request ? 'Кого попросить?' : 'Поиск сотрудников'}
              placeholderTextColor={T.textMuted}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <X size={16} color={T.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
          {loading ? (
            <ActivityIndicator color={tone} style={{ marginVertical: 32 }} />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(u) => String(u.id)}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
              renderSectionHeader={({ section }) => {
                const g = section as Group;
                return (
                  <View style={styles.groupHead}>
                    {g.icon ? <Text style={styles.groupIcon}>{g.icon}</Text> : <View style={[styles.groupDot, { backgroundColor: g.color || tone }]} />}
                    <Text style={styles.groupTitle} numberOfLines={1}>{g.title}</Text>
                    {g.hint ? <Text style={styles.groupHint} numberOfLines={1}>{g.hint}</Text> : null}
                    <View style={styles.groupCount}>
                      <Text style={styles.groupCountText}>{g.data.length}</Text>
                    </View>
                  </View>
                );
              }}
              renderItem={({ item }) => {
                const on = selected.includes(item.id);
                return (
                  <TouchableOpacity onPress={() => onToggle(item)} activeOpacity={0.7} style={[styles.row, on && { backgroundColor: withAlpha(tone, 0.12) }]}>
                    <UserAvatar name={nameOf(item)} url={item.avatar_url} size={42} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {nameOf(item)}
                        {item.id === meId ? ' (вы)' : ''}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1}>{item.role_name || `@${item.username}`}</Text>
                    </View>
                    <View style={[styles.check, on && { backgroundColor: tone, borderColor: tone }]}>
                      {on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>{query ? 'Никого не нашли' : request ? 'Пока некого попросить' : 'Пока некому поставить задачу'}</Text>
              }
              ListFooterComponent={
                !request && !query && colleagues > 0 && onSwitchToRequest ? (
                  <View style={styles.tip}>
                    <View style={styles.tipIcon}>
                      <HandHeart size={18} color={T.violet} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tipTitle}>Нужна помощь коллеги?</Text>
                      <Text style={styles.tipText}>Коллегам своего уровня ставят не задачу, а просьбу — без проверки и важности.</Text>
                    </View>
                    <TouchableOpacity onPress={onSwitchToRequest} style={styles.tipBtn} activeOpacity={0.8}>
                      <Text style={styles.tipBtnText}>Просьба</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          )}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={[styles.done, { backgroundColor: tone }]} activeOpacity={0.85}>
              <Text style={styles.doneText}>Готово{selected.length ? ` (${selected.length})` : ''}</Text>
            </TouchableOpacity>
          </View>
          <SafeBottom />
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  overlay: { flex: 1, backgroundColor: T.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: T.textPrimary },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, color: T.textSecondary, paddingHorizontal: 20, marginTop: 2, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2, paddingRight: 8, height: 28, borderRadius: 14 },
  chipText: { fontSize: 13.5, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, height: 44, borderRadius: 14, backgroundColor: T.inputBg },
  searchInput: { flex: 1, fontSize: 15, color: T.textPrimary, padding: 0 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6, backgroundColor: T.card },
  groupIcon: { fontSize: 15 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: T.textPrimary, flexShrink: 1 },
  groupHint: { fontSize: 12, fontWeight: '600', color: T.textMuted, flexShrink: 1 },
  groupCount: { marginLeft: 'auto', minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 7, backgroundColor: T.inputBg, alignItems: 'center', justifyContent: 'center' },
  groupCountText: { fontSize: 11.5, fontWeight: '700', color: T.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 14 },
  name: { fontSize: 15.5, fontWeight: '700', color: T.textPrimary },
  sub: { fontSize: 12.5, color: T.textMuted, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: T.textMuted, paddingVertical: 32 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: T.violetSoft },
  tipIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { fontSize: 14, fontWeight: '800', color: T.textPrimary },
  tipText: { fontSize: 12.5, lineHeight: 17, color: T.textSecondary, marginTop: 1 },
  tipBtn: { paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: T.violet, alignItems: 'center', justifyContent: 'center' },
  tipBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
  done: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
}));
