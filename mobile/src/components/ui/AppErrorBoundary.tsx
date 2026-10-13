import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import { RefreshCw, Copy, LifeBuoy } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { showToast } from './toast';
import ToastHost from './ToastHost';

/**
 * Ошибка в коде экрана больше не закрывает приложение: вместо вылета —
 * спокойный экран «Что-то пошло не так» с кнопкой «Продолжить» и текстом
 * ошибки, который можно скопировать и отправить разработчикам.
 * Ошибки вне отрисовки (в обработчиках, таймерах) ловит общий обработчик.
 */

const LAST_ERROR_KEY = 'offix.lastError';
type Listener = (e: Error) => void;
const listeners = new Set<Listener>();

let installed = false;
function installGlobalHandler() {
  if (installed) return;
  installed = true;
  const g: any = globalThis as any;
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    const err = error instanceof Error ? error : new Error(String(error));
    AsyncStorage.setItem(LAST_ERROR_KEY, JSON.stringify({ at: new Date().toISOString(), fatal: !!isFatal, message: err.message, stack: String(err.stack || '').slice(0, 4000) })).catch(
      () => undefined,
    );
    if (isFatal && listeners.size) {
      // Вместо закрытия приложения — экран с ошибкой и «Продолжить».
      listeners.forEach((l) => l(err));
      return;
    }
    if (!isFatal) return; // нефатальные — только запоминаем
    prev?.(error, isFatal);
  });
}

interface State {
  error: Error | null;
}

export default class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  private off: (() => void) | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidMount() {
    installGlobalHandler();
    const l: Listener = (error) => this.setState({ error });
    listeners.add(l);
    this.off = () => listeners.delete(l);
  }

  componentWillUnmount() {
    this.off?.();
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    AsyncStorage.setItem(
      LAST_ERROR_KEY,
      JSON.stringify({ at: new Date().toISOString(), message: error.message, stack: String(error.stack || '').slice(0, 3000), component: String(info.componentStack || '').slice(0, 2000) }),
    ).catch(() => undefined);
  }

  private copy = () => {
    const e = this.state.error;
    Clipboard.setString(`Offix: ${e?.message}\n\n${String(e?.stack || '').slice(0, 3000)}`);
    showToast('Текст ошибки скопирован');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.icon}>
          <LifeBuoy size={36} color={T.accent} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Что-то пошло не так</Text>
        <Text style={styles.text}>Приложение не закрылось — можно продолжить работу. Если повторится, скопируйте текст ошибки и отправьте нам.</Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.code} selectable>
            {error.message || 'Неизвестная ошибка'}
          </Text>
        </ScrollView>
        <TouchableOpacity style={styles.primary} onPress={() => this.setState({ error: null })} activeOpacity={0.85}>
          <RefreshCw size={18} color={T.onAccent} />
          <Text style={styles.primaryText}>Продолжить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={this.copy} activeOpacity={0.7}>
          <Copy size={16} color={T.textSecondary} />
          <Text style={styles.secondaryText}>Скопировать текст ошибки</Text>
        </TouchableOpacity>
        <ToastHost connection={false} />
      </View>
    );
  }
}

const styles = themed(() => ({
  root: { flex: 1, backgroundColor: T.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  icon: { width: 76, height: 76, borderRadius: 24, backgroundColor: T.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: T.textPrimary, textAlign: 'center' },
  text: { fontSize: 14.5, lineHeight: 21, color: T.textSecondary, textAlign: 'center', maxWidth: 360 },
  box: { maxHeight: 120, alignSelf: 'stretch', borderRadius: 14, backgroundColor: T.inputBg, marginTop: 4 },
  code: { fontSize: 12.5, color: T.textSecondary, fontFamily: 'monospace' },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', height: 52, borderRadius: 16, backgroundColor: T.accent, marginTop: 8 },
  primaryText: { color: T.onAccent, fontSize: 16, fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  secondaryText: { color: T.textSecondary, fontSize: 14, fontWeight: '600' },
}));
