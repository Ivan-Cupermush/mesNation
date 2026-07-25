import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../services/api';
import TreeGraphView from '../../components/TreeGraphView';

export default function CreateUserRoleScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

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

  const handleNodePress = (node: any) => {
    setSelectedNode(node);
    setUsername('');
    setEmail('');
    setDisplayName('');
    setPassword('');
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!username.trim() || !email.trim() || !password) {
      Alert.alert('Ошибка', 'Заполните логин, email и пароль');
      return;
    }
    setSaving(true);
    try {
      await api.createUser({
        username: username.trim(),
        email: email.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
        role_node_id: selectedNode.id,
      });
      Alert.alert('✅ Создано', `Пользователь "${username}" добавлен с ролью "${selectedNode.name}"`);
      setShowForm(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setSaving(false);
    }
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
          Новый пользователь
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.hint}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          👆 Нажми на роль в графе, чтобы назначить её новому пользователю
        </Text>
      </View>

      <TreeGraphView
        nodes={nodes}
        onNodePress={handleNodePress}
        selectedNodeId={selectedNode?.id}
      />

      {/* Форма создания */}
      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Новый пользователь
            </Text>

            <View style={[styles.roleBadge, { backgroundColor: selectedNode?.color || '#6366F1' }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                {selectedNode?.icon} {selectedNode?.name}
              </Text>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Логин *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={username}
              onChangeText={setUsername}
              placeholder="ivan"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoFocus
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Отображаемое имя</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Иван Иванов"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Email *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={email}
              onChangeText={setEmail}
              placeholder="ivan@test.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Пароль *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setShowForm(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});