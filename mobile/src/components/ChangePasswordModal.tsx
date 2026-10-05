import { refreshPushRegistration } from '../notifications';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  } from 'react-native';
import { Eye, EyeOff, KeyRound } from 'lucide-react-native';
import { api } from '../services/api';
import { setToken } from '../services/http';

import { T, themed } from '../theme/runtime';
/** Смена своего пароля. Другие устройства после смены выходят из аккаунта. */
export default function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setShow(false);
    }
  }, [visible]);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = current.length > 0 && next.length >= 8 && next === confirm && !saving;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.changePassword(current, next);
      if (r.token) {
        await setToken(r.token);
        // Сервер отвязал все телефоны от push — этот привязываем снова.
        refreshPushRegistration();
      }
      onClose();
      Alert.alert('Пароль изменён', 'На других устройствах нужно будет войти заново.');
    } catch (e: any) {
      Alert.alert('Не удалось сменить пароль', e?.message || '');
    } finally {
      setSaving(false);
    }
  };

  const field = (value: string, onChange: (v: string) => void, placeholder: string, error?: string | false) => (
    <>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={T.textMuted}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.iconWrap}>
              <KeyRound size={18} color={T.accent} />
            </View>
            <Text style={styles.title}>Смена пароля</Text>
            <TouchableOpacity onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel="Показать пароли">
              {show ? <EyeOff size={20} color={T.textSecondary} /> : <Eye size={20} color={T.textSecondary} />}
            </TouchableOpacity>
          </View>
          {field(current, setCurrent, 'Текущий пароль')}
          {field(next, setNext, 'Новый пароль (от 8 символов)', tooShort && 'Минимум 8 символов')}
          {field(confirm, setConfirm, 'Повторите новый пароль', mismatch && 'Пароли не совпадают')}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={!canSave} style={[styles.btn, styles.btnPrimary, !canSave && styles.btnDisabled]}>
              {saving ? <ActivityIndicator color={T.onAccent} /> : <Text style={[styles.btnText, styles.btnTextPrimary]}>Сохранить</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { flex: 1, backgroundColor: T.overlay, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: T.card, borderRadius: 20, padding: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: T.accentMuted, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: T.textPrimary },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.background,
    paddingHorizontal: 14,
    fontSize: 16,
    color: T.textPrimary,
    marginTop: 10,
  },
  inputError: { borderColor: T.danger },
  error: { color: T.danger, fontSize: 12, marginTop: 4, marginLeft: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  btn: { minWidth: 100, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: T.accent },
  btnDisabled: { backgroundColor: T.disabled },
  btnText: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  btnTextPrimary: { color: T.onAccent }
}));
