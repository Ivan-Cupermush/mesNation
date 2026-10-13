import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, ActivityIndicator, TouchableOpacity, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, Check, Info, Wifi, WifiOff } from 'lucide-react-native';
import { onToast, type ToastItem, type ToastKind } from './toast';
import { onConnectionChange, isSocketConnected } from '../../services/socket';
import { themed } from '../../theme/runtime';

/** Цвет значка: зелёный — получилось, красный — ошибка, синий — к сведению. */
const TONE: Record<ToastKind, string> = {
  success: '#34C759',
  error: '#FF5A5F',
  info: '#5AA9FF',
  offline: '#A1A1AA',
  online: '#34C759',
};

function Icon({ kind }: { kind: ToastKind }) {
  const color = TONE[kind];
  const props = { size: 15, color: '#FFFFFF', strokeWidth: 2.8 };
  return (
    <View style={[styles.icon, { backgroundColor: color }]}>
      {kind === 'success' ? (
        <Check {...props} />
      ) : kind === 'error' ? (
        <AlertCircle {...props} />
      ) : kind === 'offline' ? (
        <WifiOff {...props} strokeWidth={2.4} />
      ) : kind === 'online' ? (
        <Wifi {...props} strokeWidth={2.4} />
      ) : (
        <Info {...props} />
      )}
    </View>
  );
}

/** Одно уведомление: выезжает снизу, само исчезает, по нажатию — сразу. */
function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onDone(item.id));
  }, [anim, item.id, onDone]);

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
    const t = setTimeout(close, item.duration);
    return () => clearTimeout(t);
  }, [anim, close, item.duration]);

  return (
    <Animated.View
      style={[
        styles.toastWrap,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        },
      ]}
    >
      <Pressable onPress={close} style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Icon kind={item.kind} />
        <View style={styles.texts}>
          {item.title ? (
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
          ) : null}
          <Text style={[styles.message, item.title ? styles.messageSub : null]} numberOfLines={4}>
            {item.message}
          </Text>
        </View>
        {item.action ? (
          <TouchableOpacity
            onPress={() => {
              item.action!.onPress();
              close();
            }}
            hitSlop={8}
          >
            <Text style={styles.action}>{item.action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Полоса «Нет связи» сверху: появляется, если соединение с сервером пропало
 * дольше чем на 4 секунды (короткие обрывы не мигают), и сменяется коротким
 * «Связь восстановлена».
 */
function ConnectionPill() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'ok' | 'down' | 'back'>('ok');
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasDown = false;
    let pending = false;
    const update = (connected: boolean) => {
      if (connected) {
        if (timer) clearTimeout(timer);
        pending = false;
        if (wasDown) {
          wasDown = false;
          setState('back');
          timer = setTimeout(() => setState('ok'), 1800);
        } else {
          setState('ok');
        }
        return;
      }
      // Попытки переподключения тоже сообщают «нет связи» — таймер не перезапускаем.
      if (pending || wasDown) return;
      if (timer) clearTimeout(timer);
      pending = true;
      timer = setTimeout(() => {
        pending = false;
        if (!isSocketConnected()) {
          wasDown = true;
          setState('down');
        }
      }, 4000);
    };
    const off = onConnectionChange(update);
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    Animated.spring(anim, { toValue: state === 'ok' ? 0 : 1, useNativeDriver: true, friction: 9 }).start();
  }, [state, anim]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pillWrap,
        {
          top: insets.top + 6,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
        },
      ]}
    >
      <View style={styles.pill}>
        {state === 'back' ? (
          <View style={[styles.dot, { backgroundColor: TONE.online }]} />
        ) : (
          <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
        )}
        <Text style={styles.pillText}>{state === 'back' ? 'Связь восстановлена' : 'Нет связи — переподключаемся…'}</Text>
      </View>
    </Animated.View>
  );
}

/** Корень всплывающих уведомлений: ставится один раз поверх навигации. */
export default function ToastHost({ connection = true }: { connection?: boolean }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);
  const [keyboard, setKeyboard] = useState(0);

  useEffect(
    () =>
      onToast((t) =>
        setItems((prev) => {
          // Такое же уже на экране — не дублируем.
          if (prev.some((p) => p.message === t.message && p.kind === t.kind)) return prev;
          return [...prev.slice(-2), t];
        }),
      ),
    [],
  );

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const done = useCallback((id: number) => setItems((prev) => prev.filter((p) => p.id !== id)), []);

  return (
    <>
      {connection ? <ConnectionPill /> : null}
      <View pointerEvents="box-none" style={[styles.host, { bottom: (keyboard || insets.bottom) + 84 }]}>
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={done} />
        ))}
      </View>
    </>
  );
}

const styles = themed(() => ({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  toastWrap: { width: '100%', maxWidth: 480, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(24,24,27,0.94)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  icon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  title: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
  message: { color: '#FFFFFF', fontSize: 14.5, lineHeight: 19, fontWeight: '600' },
  messageSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, fontWeight: '500', marginTop: 1 },
  action: { color: '#7CC4FF', fontSize: 14, fontWeight: '800' },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(24,24,27,0.92)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },
  spinner: { transform: [{ scale: 0.75 }] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
}));
