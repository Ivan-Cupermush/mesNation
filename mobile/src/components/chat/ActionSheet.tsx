import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from './chatUtils';

import { T, themed } from '../../theme/runtime';
/**
 * Нижнее меню действий (долгое нажатие на сообщение, чат и т.п.).
 * Сверху — короткое превью того, к чему относится меню.
 */

export interface SheetAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  preview?: string;
  actions: SheetAction[];
  onClose: () => void;
}

export default function ActionSheet({ visible, title, preview, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        {(title || preview) && (
          <View style={styles.previewBox}>
            {title ? (
              <Text style={styles.previewTitle} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {preview ? (
              <Text style={styles.previewText} numberOfLines={2}>
                {preview}
              </Text>
            ) : null}
          </View>
        )}
        <ScrollView bounces={false} style={{ maxHeight: 460 }}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => {
                onClose();
                // Даём меню закрыться, прежде чем открывать алерты/модалки.
                setTimeout(a.onPress, 120);
              }}
            >
              <View style={styles.icon}>{a.icon}</View>
              <Text style={[styles.label, a.danger && { color: C.danger }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: T.surfaceActive, marginBottom: 8 },
  previewBox: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: T.inputBg,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  previewTitle: { fontSize: 13, fontWeight: '700', color: C.accent },
  previewText: { fontSize: 14, color: C.text, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, height: 52 },
  icon: { width: 24, alignItems: 'center' },
  label: { fontSize: 16, color: C.text },
}));
