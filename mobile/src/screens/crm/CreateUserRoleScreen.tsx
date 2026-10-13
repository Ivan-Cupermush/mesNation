import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, PermissionKey } from '../../services/api';
import TreeGraphView from '../../components/TreeGraphView';
import { PermissionPicker } from '../../components/PermissionToggles';

import { T, themed } from '../../theme/runtime';
import SafeBottom from '../../components/ui/SafeBottom';
export default function CreateUserRoleScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [saving, setSaving] = useState(false);
  // По должности функции есть у руководителей — у кого в дереве есть подчинённые роли.
  const byRole = !!selectedNode && nodes.some((n) => n.parent_id === selectedNode.id);

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
    setFirstName('');
    setLastName('');
    setPassword('');
    setPermissions({});
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!firstName.trim() || !username.trim() || !email.trim() || !password) {
      Alert.alert('Ошибка', 'Заполните имя, логин, email и пароль');
      return;
    }
    setSaving(true);
    try {
      await api.createUser({
        username: username.trim(),
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role_node_id: selectedNode.id,
        ...(Object.keys(permissions).length ? { permissions } : {}),
      });
      Alert.alert('Сотрудник добавлен', `«${username}» — роль «${selectedNode.name}»`);
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
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <StatusBar
        barStyle={colors.statusBar}
        backgroundColor="transparent" translucent
      />
      <View style={[styles.header, {
        borderBottomColor: colors.border,
        paddingTop: insets.top + 8,
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
          Выберите на дереве роль для нового сотрудника
        </Text>
      </View>

      <TreeGraphView
        nodes={nodes}
        onNodePress={handleNodePress}
        selectedNodeId={selectedNode?.id}
      />

      {/* Форма создания */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)} statusBarTranslucent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Новый пользователь
            </Text>

            <View style={[styles.roleBadge, { backgroundColor: selectedNode?.color || T.violet }]}>
              <Text style={{ color: T.onAccent, fontWeight: '600' }}>
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

            <View style={styles.nameRow}>
              <View style={styles.nameCol}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Имя *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Иван"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  maxLength={100}
                />
              </View>
              <View style={styles.nameCol}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Фамилия</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Петров"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  maxLength={100}
                />
              </View>
            </View>

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

            <Text style={[styles.label, { color: colors.textSecondary }]}>Функции</Text>
            <PermissionPicker byRole={byRole} value={permissions} onChange={setPermissions} />
            </ScrollView>

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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  hint: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: T.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: T.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '92%',
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
  nameRow: { flexDirection: 'row', gap: 10 },
  nameCol: { flex: 1 },
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
}));