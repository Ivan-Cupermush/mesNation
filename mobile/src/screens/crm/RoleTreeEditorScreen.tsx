import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, ScrollView,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../services/api';
import TreeGraphView from '../../components/TreeGraphView';

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const ICONS = ['👤', '💼', '🎯', '⭐', '🔧', '📊', '💻', '🏆', '🚀', '⚡', '🎨', '📈'];

export default function RoleTreeEditorScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Модалка добавления ребёнка
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState<any>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newIcon, setNewIcon] = useState(ICONS[0]);
  const [saving, setSaving] = useState(false);

  // Модалка редактирования
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLORS[0]);
  const [editIcon, setEditIcon] = useState(ICONS[0]);

  const loadTree = async () => {
    try {
      const data = await api.getRoleTree();
      setNodes(data);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

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

  // === Редактирование узла ===
  const handleNodePress = (node: any) => {
    setEditingNode(node);
    setEditName(node.name);
    setEditColor(node.color || COLORS[0]);
    setEditIcon(node.icon || ICONS[0]);
    setShowEditModal(true);
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
    
    // Корень нельзя удалить
    if (editingNode.name === 'director' || editingNode.parent_id === null) {
      Alert.alert('Нельзя удалить', 'Корень дерева (директор) удалить нельзя');
      return;
    }

    // Проверка пользователей
    if (editingNode.users_count && editingNode.users_count > 0) {
      Alert.alert(
        'Нельзя удалить',
        `К роли "${editingNode.name}" привязано пользователей: ${editingNode.users_count}.\n\nСначала переназначьте их на другую роль.`
      );
      return;
    }

    Alert.alert(
      'Удалить роль?',
      `Роль "${editingNode.name}" будет удалена.\n\nВсе дочерние роли будут перепривязаны к родителю "${nodes.find(n => n.id === editingNode.parent_id)?.name || 'неизвестно'}".\n\nЭто действие нельзя отменить.`,
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

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />
      <View style={[styles.header, {
        borderBottomColor: colors.border,
        paddingTop: (StatusBar.currentHeight || 24) + 8,
      }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Дерево прав
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.hint}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          👆 Нажми на узел — редактировать. Нажми <Text style={{ color: '#10B981', fontWeight: '700' }}>+</Text> — добавить ребёнка.
        </Text>
      </View>

      <TreeGraphView
        nodes={nodes}
        onNodePress={handleNodePress}
        onAddChildPress={handleAddChild}
      />

      {/* ===== МОДАЛКА ДОБАВЛЕНИЯ РЕБЁНКА ===== */}
      <Modal visible={showAddModal} transparent animationType="slide">
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
                {ICONS.map(i => (
                  <TouchableOpacity
                    key={i}
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

      {/* ===== МОДАЛКА РЕДАКТИРОВАНИЯ ===== */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Редактировать роль
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Название</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Название роли"
                placeholderTextColor={colors.textMuted}
                autoFocus
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
                {ICONS.map(i => (
                  <TouchableOpacity
                    key={i}
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

              {/* Информация о пользователях */}
              {editingNode?.users_count > 0 && (
                <View style={[styles.infoBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                  <Text style={{ color: '#92400E', fontSize: 13 }}>
                    ⚠️ К этой роли привязано пользователей: <Text style={{ fontWeight: '700' }}>{editingNode.users_count}</Text>
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

            {/* Кнопка удаления (только для не-корня) */}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  hint: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  infoBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});