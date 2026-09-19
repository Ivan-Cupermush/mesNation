import React, { useState, useEffect } from 'react';
import { useRoute } from '@react-navigation/native';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, ScrollView, Platform, Image,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../services/api';
import { SERVER_URL } from '../../utils';
import { fuzzyMatch } from '../../utils/fuzzySearch';
import TreeGraphView from '../../components/TreeGraphView';
import { ChevronLeft, Move, X, Lock, Search } from 'lucide-react-native';

// ✅ ТЕ ЖЕ списки что были — совместимость со старыми ролями в БД
const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const ICONS = [
  '\u{1F464}', '\u{1F4BC}', '\u{1F3AF}', '\u{2B50}',
  '\u{1F527}', '\u{1F4CA}', '\u{1F4BB}', '\u{1F3C6}',
  '\u{1F680}', '\u{26A1}', '\u{1F3A8}', '\u{1F4C8}',
  '\u{1F6E1}\u{FE0F}', '\u{1F4E6}', '\u{1F511}', '\u{1F91D}',
];

const AVATAR_COLORS = [
  '#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444',
];

const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

export default function RoleTreeEditorScreen({ navigation }: any) {
  const { colors } = useTheme();
  const route = useRoute<any>();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Модалка добавления ребёнка
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [saving, setSaving] = useState(false);

  // Модалка редактирования узла + люди роли
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLORS[0]);
  const [editIcon, setEditIcon] = useState(ICONS[0]);
  const [nodeUsers, setNodeUsers] = useState<any[]>([]);       // прямые члены роли
  const [subtreeCount, setSubtreeCount] = useState(0);         // сколько в подграфе
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  // Режим переноса человека на дереве
  const [moveUser, setMoveUser] = useState<any>(null);

  const loadTree = async () => {
    try {
      const data = await api.getRoleTree();
      setNodes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
    // Автофокус на узле пользователя (из EmployeesScreen)
    const focusUserId = route.params?.focusUserId;
    if (focusUserId) {
      (async () => {
        try {
          const tree = await api.getRoleTree();
          const root = (tree || []).find((n: any) => !n.parent_id);
          if (!root) return;
          const users = await api.getUsersInSubtree(root.id).catch(() => []);
          const u = (users || []).find((x: any) => x.id === focusUserId);
          if (u && u.role_name) {
            const targetNode = (tree || []).find((n: any) => n.name === u.role_name);
            if (targetNode) {
              // Небольшая задержка чтобы tree отрендерилось
              setTimeout(() => {
                handleNodePress(targetNode);
              }, 400);
            }
          }
          // Сбросить params чтобы при возврате не триггерилось снова
          navigation.setParams({ focusUserId: undefined });
        } catch (e) {}
      })();
    }
  }, [route.params?.focusUserId]);

  // === Добавление ребёнка ===
  const handleAddChild = (parentNode: any) => {
    setSelectedParent(parentNode);
    setNewName('');
    setNewColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    setNewIcon(ICONS[Math.floor(Math.random() * ICONS.length)]);
    setShowAddModal(true);
  };

  const handleSaveNew = async () => {
    if (!newName.trim()) {
      Alert.alert('Ошибка', 'Введите название');
      return;
    }
    setSaving(true);
    try {
      await api.createRoleNode({
        name: newName.trim(),
        parent_id: selectedParent.id,
        color: newColor,
        icon: newIcon,
      });
      setShowAddModal(false);
      loadTree();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setSaving(false);
    }
  };

  // === Прямые члены роли: подграф узла МИНУС подграфы детей ===
  const loadNodeUsers = async (node: any) => {
    setNodeUsers([]);
    setSubtreeCount(0);
    setLoadingUsers(true);
    try {
      const children = nodes.filter((n: any) => n.parent_id === node.id);
      const results = await Promise.all([
        api.getUsersInSubtree(node.id),
        ...children.map((c: any) => api.getUsersInSubtree(c.id)),
      ]);
      const sub = Array.isArray(results[0]) ? results[0] : [];
      const kidIds = new Set<number>();
      results.slice(1).forEach((list: any) =>
        (Array.isArray(list) ? list : []).forEach((u: any) => kidIds.add(u.id))
      );
      setSubtreeCount(sub.length);
      setNodeUsers(sub.filter((u: any) => !kidIds.has(u.id)));
    } catch (e) {
      setNodeUsers([]);
      setSubtreeCount(0);
    } finally {
      setLoadingUsers(false);
    }
  };

  // === Нажатие на узел: либо цель переноса, либо редактирование ===
  const handleNodePress = async (node: any) => {
    if (moveUser) {
      handleMoveTarget(node);
      return;
    }
    setEditingNode(node);
    setEditName(node.name);
    setEditColor(node.color || COLORS[0]);
    setEditIcon(node.icon || ICONS[0]);
    setShowEditModal(true);
    loadNodeUsers(node);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert('Ошибка', 'Введите название');
      return;
    }
    setSaving(true);
    try {
      await api.updateRoleNode(editingNode.id, {
        name: editName.trim(),
        color: editColor,
        icon: editIcon,
      });
      setShowEditModal(false);
      loadTree();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setSaving(false);
    }
  };

  // === Удаление узла ===
  const handleDelete = () => {
    if (!editingNode) return;
    if (editingNode.name === 'director' || editingNode.parent_id === null) {
      Alert.alert('Нельзя удалить', 'Корень дерева (директор) удалить нельзя');
      return;
    }
    if (editingNode.users_count && editingNode.users_count > 0) {
      Alert.alert(
        'Нельзя удалить',
        `К роли "${editingNode.name}" привязано пользователей: ${editingNode.users_count}. Сначала переназначьте их на другую роль.`
      );
      return;
    }
    Alert.alert(
      'Удалить роль?',
      `Роль "${editingNode.name}" будет удалена. Все дочерние роли будут перепривязаны к родителю "${nodes.find(n => n.id === editingNode.parent_id)?.name || 'неизвестно'}". Это действие нельзя отменить.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.deleteRoleNode(editingNode.id);
              Alert.alert('Удалено', `Роль "${editingNode.name}" удалена, дети перепривязаны к родителю`);
              setShowEditModal(false);
              loadTree();
            } catch (e: any) {
              Alert.alert('Ошибка', e.message || 'Не удалось удалить роль');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // === Старт переноса человека на дерево ===
  const startMoveUser = (user: any) => {
    // 🔒 Позицию директора нельзя переназначить
    if (editingNode?.name === 'director') {
      Alert.alert('Нельзя', 'Позицию директора нельзя переназначить');
      return;
    }
    setShowEditModal(false);
    setMoveUser(user);
  };

  // === Цель переноса: любой узел дерева (вверх/вниз/вбок) ===
  const handleMoveTarget = (node: any) => {
    if (!moveUser) return;
    // 🔒 Директор как цель тоже недоступен
    if (node.name === 'director') {
      Alert.alert('Нельзя', 'Позицию директора нельзя переназначить');
      return;
    }
    if (editingNode && node.id === editingNode.id) {
      Alert.alert('Та же роль', `${moveUser.display_name || moveUser.username} уже в этой роли`);
      return;
    }
    const userName = moveUser.display_name || moveUser.username;
    Alert.alert(
      'Переназначить роль?',
      `${userName}: "${editingNode?.name || ''}" → "${node.name}"`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Перенести',
          onPress: async () => {
            setSaving(true);
            try {
              await api.assignUserToRole(moveUser.id, node.id);
              setMoveUser(null);
              setEditingNode(null);
              Alert.alert('Готово', `${userName} теперь в роли "${node.name}"`);
              loadTree();
            } catch (e: any) {
              Alert.alert('Ошибка', e.message || 'Не удалось переназначить роль');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* ===== HEADER ===== */}
      <View style={[styles.header, {
        borderBottomColor: colors.border,
        paddingTop: (StatusBar.currentHeight || 24) + 8,
      }]}>
        <TouchableOpacity onPress={() => (moveUser ? setMoveUser(null) : navigation.goBack())} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color="#1F7A52" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ДЕРЕВО РОЛЕЙ</Text>
          <Text style={styles.headerSubtitle}>Иерархия и управление правами</Text>
        </View>
      </View>

      {/* ===== ПЛАШКА РЕЖИМА ПЕРЕНОСА ===== */}
      {moveUser && (
        <View style={styles.moveBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.moveBannerTitle} numberOfLines={1}>
              🔀 Перенос: {moveUser.display_name || moveUser.username}
            </Text>
            <Text style={styles.moveBannerSub}>
              Нажмите новую роль на дереве · позиция директора недоступна
            </Text>
          </View>
          <TouchableOpacity onPress={() => setMoveUser(null)} style={styles.moveCancel} activeOpacity={0.7}>
            <X size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.hint}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {moveUser
            ? '👆 Выберите узел-цель для переноса сотрудника'
            : <>👆 Узел — редактирование и люди. <Text style={{ color: '#10B981', fontWeight: '700' }}>⇄</Text> у человека — перенос на дереве. <Text style={{ color: '#10B981', fontWeight: '700' }}>+</Text> — добавить ребёнка.</>}
        </Text>
      </View>

      <TreeGraphView
        nodes={nodes}
        onNodePress={handleNodePress}
        onAddChildPress={moveUser ? undefined : handleAddChild}
      />

      {/* ===== МОДАЛКА ДОБАВЛЕНИЯ РЕБЁНКА ===== */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Новая роль под "{selectedParent?.name}"
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Название</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={newName}
                onChangeText={setNewName}
                placeholder="Например: Руководитель отдела"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={[styles.label, { color: colors.textSecondary }]}>Цвет</Text>
              <View style={styles.colorRow}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setNewColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      newColor === c && { borderWidth: 3, borderColor: '#000' },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Иконка</Text>
              <View style={styles.iconRow}>
                {ICONS.map((i, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setNewIcon(i)}
                    style={[
                      styles.iconCircle,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      newIcon === i && { borderWidth: 3, borderColor: colors.accent },
                    ]}
                  >
                    <Text style={{ fontSize: 22 }}>{i}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNew}
                disabled={saving}
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={{ color: colors.onAccent, fontWeight: '600' }}>
                  {saving ? 'Создаём...' : 'Создать'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== МОДАЛКА РЕДАКТИРОВАНИЯ УЗЛА + ЛЮДИ РОЛИ ===== */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => { setShowEditModal(false); setMoveUser(null); setUserQuery(''); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 0, flex: 1 }]} numberOfLines={1}>
                Роль: {editingNode?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ padding: 4 }}>
                <X size={22} color={colors.textPrimary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Название</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Название роли"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { color: colors.textSecondary }]}>Цвет</Text>
              <View style={styles.colorRow}>
                {COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setEditColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      editColor === c && { borderWidth: 3, borderColor: '#000' },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Иконка</Text>
              <View style={styles.iconRow}>
                {ICONS.map((i, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setEditIcon(i)}
                    style={[
                      styles.iconCircle,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      editIcon === i && { borderWidth: 3, borderColor: colors.accent },
                    ]}
                  >
                    <Text style={{ fontSize: 22 }}>{i}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ===== ЛЮДИ: прямые члены роли + счётчик подграфа ===== */}
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                ЛЮДИ В РОЛИ ({nodeUsers.length}) · В ПОДГРАФЕ ({subtreeCount})
              </Text>
              {nodeUsers.length > 0 && (
                <View style={[styles.userSearchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Search size={14} color={colors.textMuted} strokeWidth={2} />
                  <TextInput
                    style={[styles.userSearchInput, { color: colors.textPrimary }]}
                    value={userQuery}
                    onChangeText={setUserQuery}
                    placeholder="Поиск"
                    placeholderTextColor={colors.textMuted}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {!!userQuery && (
                    <TouchableOpacity onPress={() => setUserQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <X size={14} color={colors.textMuted} strokeWidth={2.4} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {loadingUsers ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#1F7A52" />
                </View>
              ) : nodeUsers.length === 0 ? (
                <View style={[styles.emptyUsersBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    В этой роли пока никого нет
                  </Text>
                </View>
              ) : (
                nodeUsers
                  .filter((u: any) => {
                    const q = userQuery.trim();
                    if (!q) return true;
                    return (
                      fuzzyMatch(u.display_name || u.username || '', q).match ||
                      fuzzyMatch(u.role_name || '', q).match ||
                      fuzzyMatch(u.username || '', q).match
                    );
                  })
                  .map((user: any) => (
                  <TouchableOpacity
                    key={user.id}
                    onPress={() => startMoveUser(user)}
                    style={[styles.userRow, { backgroundColor: colors.surface }]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.userAvatar, { backgroundColor: user.avatar_url ? '#ECECE8' : hashColor(user.display_name || user.username) }]}>
                      {user.avatar_url ? (
                        <Image source={{ uri: SERVER_URL + user.avatar_url }} style={styles.userAvatarImg} />
                      ) : (
                        <Text style={styles.userAvatarText}>
                          {(user.display_name || user.username || '?').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {user.display_name || user.username}
                      </Text>
                      <Text style={[styles.userRole, { color: colors.textSecondary }]} numberOfLines={1}>
                        {user.role_name || 'Без роли'}
                      </Text>
                    </View>
                    {editingNode?.name === 'director' ? (
                      <View style={styles.userLockIcon}>
                        <Lock size={16} color="#9CA3AF" strokeWidth={2.2} />
                      </View>
                    ) : (
                      <View style={styles.userEditBtn}>
                        <Move size={16} color="#1F7A52" strokeWidth={2.2} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}

              {editingNode?.users_count > 0 && (
                <View style={[styles.infoBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                  <Text style={{ color: '#92400E', fontSize: 13 }}>
                    ⚠️ В подграфе этой роли людей: <Text style={{ fontWeight: '700' }}>{editingNode.users_count}</Text>
                  </Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={saving}
                style={[styles.modalBtn, { backgroundColor: colors.accent }]}
              >
                <Text style={{ color: colors.onAccent, fontWeight: '600' }}>
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </Text>
              </TouchableOpacity>
            </View>
            {editingNode && editingNode.parent_id !== null && editingNode.name !== 'director' && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={saving}
                style={[styles.deleteBtn, { backgroundColor: '#FEE2E2' }]}
              >
                <Text style={{ color: '#DC2626', fontWeight: '600' }}>
                  🗑 Удалить роль
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 0.3,
    lineHeight: 28,
  },
  headerSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 13,
    fontStyle: 'italic',
    color: '#6F6F73',
    marginTop: 1,
  },
  // ===== Плашка переноса =====
  moveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#1F7A52',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  moveBannerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  moveBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  moveCancel: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { padding: 14, borderRadius: 10, borderWidth: 1, fontSize: 16 },
  colorRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  colorCircle: { width: 40, height: 40, borderRadius: 20 },
  iconRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  infoBox: { padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 16 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  deleteBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  // ===== Люди в роли =====
  emptyUsersBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  userAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  userAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  userName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  userRole: { fontSize: 12 },
  userEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLockIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  userSearchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    padding: 0,
  },
});
