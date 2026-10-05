import React, { useState, useEffect } from 'react';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, ScrollView, Platform, Image, KeyboardAvoidingView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../services/api';
import { publicFileUrl } from '../../services/http';
import { fuzzyMatch } from '../../utils/fuzzySearch';
import TreeGraphView from '../../components/TreeGraphView';
import { ChevronLeft, Move, X, Lock, Search } from 'lucide-react-native';

import { T, themed } from '../../theme/runtime';
import SafeBottom from '../../components/ui/SafeBottom';
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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
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
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  // Режим переноса человека на дереве
  const [moveUser, setMoveUser] = useState<any>(null);
  // Режим переноса роли (вместе с её поддеревом) под другую роль
  const [moveRole, setMoveRole] = useState<any>(null);
  const moving = !!moveUser || !!moveRole;
  const cancelMove = () => {
    setMoveUser(null);
    setMoveRole(null);
  };

  // Менять дерево может только директор; руководители смотрят его без правки.
  const [canEdit, setCanEdit] = useState(true);
  useEffect(() => {
    api.getCurrentUser().then((me) => setCanEdit(!!me?.is_director)).catch(() => undefined);
  }, []);

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
  }, []);

  // Переход из «Сотрудников»: открываем узел этого сотрудника по id узла
  // (раньше узел искался по названию роли и открывался со старым списком узлов).
  const focusNodeId: number | undefined = route.params?.focusNodeId;
  useEffect(() => {
    if (!focusNodeId || nodes.length === 0) return;
    const target = nodes.find((n: any) => n.id === focusNodeId);
    if (target) handleNodePress(target);
    navigation.setParams({ focusNodeId: undefined, focusUserId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId, nodes]);

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

  // === Прямые члены роли — один запрос к серверу ===
  const loadNodeUsers = async (node: any) => {
    setNodeUsers([]);
    setLoadingUsers(true);
    try {
      setNodeUsers(await api.getRoleUsers(node.id));
    } catch (e: any) {
      setNodeUsers([]);
      Alert.alert('Не удалось загрузить сотрудников роли', e?.message || '');
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
    if (moveRole) {
      handleRoleMoveTarget(node);
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
    if (editingNode.is_root || editingNode.parent_id === null) {
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
    if (editingNode?.is_root) {
      Alert.alert('Нельзя', 'Позицию директора нельзя переназначить');
      return;
    }
    setShowEditModal(false);
    setMoveUser(user);
  };

  // === Перенос роли: новая родительская роль ===
  const startMoveRole = () => {
    if (!editingNode || editingNode.is_root) return;
    setShowEditModal(false);
    setMoveRole(editingNode);
  };

  const subtreeIds = (rootId: number) => {
    const ids = new Set<number>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      nodes.forEach((n: any) => {
        if (n.parent_id != null && ids.has(n.parent_id) && !ids.has(n.id)) {
          ids.add(n.id);
          grew = true;
        }
      });
    }
    return ids;
  };

  const handleRoleMoveTarget = (target: any) => {
    if (!moveRole) return;
    if (target.id === moveRole.parent_id) {
      Alert.alert('Уже здесь', `«${moveRole.name}» уже подчиняется «${target.name}»`);
      return;
    }
    if (subtreeIds(moveRole.id).has(target.id)) {
      Alert.alert('Нельзя', 'Роль нельзя перенести внутрь её собственной ветки');
      return;
    }
    Alert.alert('Перенести роль?', `«${moveRole.name}» со всей веткой будет подчиняться «${target.name}»`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Перенести',
        onPress: async () => {
          setSaving(true);
          try {
            await api.updateRoleNode(moveRole.id, { parent_id: target.id });
            setMoveRole(null);
            loadTree();
          } catch (e: any) {
            Alert.alert('Ошибка', e.message || 'Не удалось перенести роль');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  // === Цель переноса: любой узел дерева (вверх/вниз/вбок) ===
  const handleMoveTarget = (node: any) => {
    if (!moveUser) return;
    // 🔒 Директор как цель тоже недоступен
    if (node.is_root) {
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* ===== HEADER ===== */}
      <View style={[styles.header, {
        borderBottomColor: colors.border,
        paddingTop: insets.top + 8,
      }]}>
        <TouchableOpacity onPress={() => (moving ? cancelMove() : navigation.goBack())} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color={T.accent} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ДЕРЕВО РОЛЕЙ</Text>
          <Text style={styles.headerSubtitle}>Структура компании</Text>
        </View>
      </View>

      {/* ===== ПЛАШКА РЕЖИМА ПЕРЕНОСА ===== */}
      {moving && (
        <View style={styles.moveBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.moveBannerTitle} numberOfLines={1}>
              Перенос: {moveUser ? moveUser.display_name || moveUser.username : moveRole?.name}
            </Text>
            <Text style={styles.moveBannerSub}>
              {moveUser ? 'Нажмите новую роль на дереве. Роль директора недоступна' : 'Нажмите роль, которой она будет подчиняться'}
            </Text>
          </View>
          <TouchableOpacity onPress={cancelMove} style={styles.moveCancel} activeOpacity={0.7}>
            <X size={18} color={T.onAccent} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.hint}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {moveUser
            ? 'Выберите роль, в которую перенести сотрудника'
            : moveRole
            ? 'Выберите новую руководящую роль'
            : 'Нажмите на роль — откроются её настройки и сотрудники. «+» под ролью добавляет подчинённую роль.'}
        </Text>
      </View>

      <TreeGraphView
        nodes={nodes}
        onNodePress={handleNodePress}
        onAddChildPress={moving || !canEdit ? undefined : handleAddChild}
        selectedNodeId={moveRole?.id ?? null}
      />

      {/* ===== МОДАЛКА ДОБАВЛЕНИЯ РЕБЁНКА ===== */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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
                      newColor === c && { borderWidth: 3, borderColor: T.textPrimary },
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
            <SafeBottom />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== МОДАЛКА РЕДАКТИРОВАНИЯ УЗЛА + ЛЮДИ РОЛИ ===== */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => { setShowEditModal(false); setMoveUser(null); setUserQuery(''); }}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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
                editable={canEdit}
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
                      editColor === c && { borderWidth: 3, borderColor: T.textPrimary },
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
                ЛЮДИ В РОЛИ ({nodeUsers.length})
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
                  <ActivityIndicator size="small" color={T.accent} />
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
                    onPress={() => canEdit && startMoveUser(user)}
                    disabled={!canEdit}
                    style={[styles.userRow, { backgroundColor: colors.surface }]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.userAvatar, { backgroundColor: user.avatar_url ? T.surfaceActive : hashColor(user.display_name || user.username) }]}>
                      {user.avatar_url ? (
                        <Image source={{ uri: publicFileUrl(user.avatar_url)! }} style={styles.userAvatarImg} />
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
                    {!canEdit ? null : editingNode?.is_root ? (
                      <View style={styles.userLockIcon}>
                        <Lock size={16} color={T.textMuted} strokeWidth={2.2} />
                      </View>
                    ) : (
                      <View style={styles.userEditBtn}>
                        <Move size={16} color={T.accent} strokeWidth={2.2} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}

            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  disabled={saving}
                  style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                >
                  <Text style={{ color: colors.onAccent, fontWeight: '600' }}>
                    {saving ? 'Сохраняем...' : 'Сохранить'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {canEdit && editingNode && !editingNode.is_root && (
              <TouchableOpacity
                onPress={startMoveRole}
                disabled={saving}
                style={[styles.deleteBtn, { backgroundColor: T.accentMuted }]}
              >
                <Text style={{ color: T.accent, fontWeight: '600' }}>Перенести под другую роль</Text>
              </TouchableOpacity>
            )}
            {canEdit && editingNode && !editingNode.is_root && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={saving}
                style={[styles.deleteBtn, { backgroundColor: T.dangerSoft }]}
              >
                <Text style={{ color: T.danger, fontWeight: '600' }}>
                  Удалить роль
                </Text>
              </TouchableOpacity>
            )}
            <SafeBottom />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = themed(() => ({
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
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: T.textPrimary,
    letterSpacing: 0.3,
    lineHeight: 28,
  },
  headerSubtitle: {
        fontSize: 13,
    color: T.textSecondary,
    marginTop: 1,
    fontWeight: '500',
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
    backgroundColor: T.accent,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  moveBannerTitle: { color: T.onAccent, fontSize: 15, fontWeight: '800' },
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
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: T.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  modalOverlay: { flex: 1, backgroundColor: T.overlay, justifyContent: 'flex-end' },
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
  userAvatarText: { color: T.onAccent, fontWeight: '700', fontSize: 16 },
  userName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  userRole: { fontSize: 12 },
  userEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLockIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.inputBg,
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
}));
