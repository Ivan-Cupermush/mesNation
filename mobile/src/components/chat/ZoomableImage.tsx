import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, View, Text, ActivityIndicator, GestureResponderEvent } from 'react-native';

import { themed } from '../../theme/runtime';
/**
 * Картинка с жестами как в галерее Telegram:
 * - щипок — масштаб (до 4×) вокруг точки между пальцами;
 * - двойной тап — приблизить / вернуть;
 * - перетаскивание увеличенной картинки;
 * - без увеличения вертикальный свайп закрывает просмотр (onDismiss),
 *   одиночный тап прячет/показывает панели (onTap).
 */

interface Props {
  width: number;
  height: number;
  uri: string | null;
  previewUri?: string | null;
  /** Декодировать в полном разрешении (для текущего фото — чётко при зуме). */
  hiRes?: boolean;
  headers?: Record<string, string>;
  imageWidth?: number | null;
  imageHeight?: number | null;
  onTap?: () => void;
  onZoomChange?: (zoomed: boolean) => void;
  onDismissProgress?: (dy: number) => void;
  onDismiss?: () => void;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 260;

const dist = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};
const center = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
};

export default function ZoomableImage(props: Props) {
  const { width, height, uri, previewUri, headers, imageWidth, imageHeight, hiRes } = props;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Очень большие снимки (> 24 Мп) целиком не декодируем — Android не нарисует такой bitmap.
  const canHiRes = !!hiRes && (!imageWidth || !imageHeight || imageWidth * imageHeight <= 24e6);
  // Смена режима декодирования перезагружает картинку — на это время снова показываем превью.
  useEffect(() => {
    setLoaded(false);
  }, [canHiRes, uri]);

  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // Текущее состояние трансформации (Animated.Value читать синхронно нельзя).
  const st = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({ startDist: 0, startScale: 1, startX: 0, startY: 0, focal: { x: 0, y: 0 }, pinching: false, moved: false });
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Размер картинки на экране при масштабе 1 (вписана в экран).
  const ratio = imageWidth && imageHeight ? imageWidth / imageHeight : width / height;
  const fitW = ratio > width / height ? width : height * ratio;
  const fitH = ratio > width / height ? width / ratio : height;

  const clamp = (s: number, x: number, y: number) => {
    const maxX = Math.max(0, (fitW * s - width) / 2);
    const maxY = Math.max(0, (fitH * s - height) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const apply = (s: number, x: number, y: number, animated = false) => {
    st.current = { scale: s, x, y };
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 8 }),
        Animated.spring(tx, { toValue: x, useNativeDriver: true, friction: 8 }),
        Animated.spring(ty, { toValue: y, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      scale.setValue(s);
      tx.setValue(x);
      ty.setValue(y);
    }
    propsRef.current.onZoomChange?.(s > 1.01);
  };

  const zoomAt = (s: number, fx: number, fy: number) => {
    // Точка под пальцем остаётся на месте.
    const cx = fx - width / 2;
    const cy = fy - height / 2;
    const k = s / st.current.scale;
    const x = cx - (cx - st.current.x) * k;
    const y = cy - (cy - st.current.y) * k;
    const c = clamp(s, x, y);
    return c;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (e, g) =>
        e.nativeEvent.touches.length === 2 || st.current.scale > 1.01 || (Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5),
      // Пока картинка увеличена, горизонтальную прокрутку галереи не отдаём.
      onPanResponderTerminationRequest: () => st.current.scale <= 1.01 && !gesture.current.pinching,
      onPanResponderGrant: (e) => {
        gesture.current.moved = false;
        gesture.current.startX = st.current.x;
        gesture.current.startY = st.current.y;
        gesture.current.startScale = st.current.scale;
        if (e.nativeEvent.touches.length === 2) {
          gesture.current.pinching = true;
          gesture.current.startDist = dist(e);
          gesture.current.focal = center(e);
        }
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) gesture.current.moved = true;
        if (e.nativeEvent.touches.length === 2) {
          if (!gesture.current.pinching) {
            // Второй палец коснулся позже — начинаем щипок от текущего состояния.
            gesture.current.pinching = true;
            gesture.current.startDist = dist(e);
            gesture.current.focal = center(e);
            gesture.current.startScale = st.current.scale;
          }
          const s = Math.min(MAX_SCALE * 1.2, Math.max(0.8, (gesture.current.startScale * dist(e)) / gesture.current.startDist));
          const f = gesture.current.focal;
          const { x, y } = zoomAt(s, f.x, f.y);
          apply(s, x, y);
          return;
        }
        if (gesture.current.pinching) return;
        if (st.current.scale > 1.01) {
          const { x, y } = clamp(st.current.scale, gesture.current.startX + g.dx, gesture.current.startY + g.dy);
          st.current.x = x;
          st.current.y = y;
          tx.setValue(x);
          ty.setValue(y);
        } else {
          ty.setValue(g.dy);
          propsRef.current.onDismissProgress?.(g.dy);
        }
      },
      onPanResponderRelease: (e, g) => {
        const wasPinching = gesture.current.pinching;
        gesture.current.pinching = false;
        if (wasPinching) {
          const s = Math.min(MAX_SCALE, Math.max(1, st.current.scale));
          const c = s <= 1.01 ? { x: 0, y: 0 } : clamp(s, st.current.x, st.current.y);
          apply(s <= 1.01 ? 1 : s, c.x, c.y, true);
          return;
        }
        if (st.current.scale <= 1.01) {
          if (Math.abs(g.dy) > 120 || Math.abs(g.vy) > 1.2) {
            propsRef.current.onDismiss?.();
            return;
          }
          Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
          propsRef.current.onDismissProgress?.(0);
        }
        if (!gesture.current.moved) {
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            if (tapTimer.current) clearTimeout(tapTimer.current);
            if (st.current.scale > 1.01) apply(1, 0, 0, true);
            else {
              const { pageX, pageY } = e.nativeEvent;
              const { x, y } = zoomAt(2.5, pageX, pageY);
              apply(2.5, x, y, true);
            }
          } else {
            lastTap.current = now;
            tapTimer.current = setTimeout(() => propsRef.current.onTap?.(), DOUBLE_TAP_MS);
          }
        }
      },
      onPanResponderTerminate: () => {
        gesture.current.pinching = false;
        if (st.current.scale <= 1.01) {
          Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
          propsRef.current.onDismissProgress?.(0);
        }
      },
    }),
  ).current;

  return (
    <View style={{ width, height }} {...responder.panHandlers}>
      <Animated.View
        style={[
          styles.center,
          { width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
        ]}
      >
        {previewUri && !loaded ? (
          // Превью с сервера (до 1280 px) — показываем чётким, пока грузится оригинал.
          <Image source={{ uri: previewUri }} style={{ width: fitW, height: fitH, position: 'absolute' }} resizeMode="contain" fadeDuration={0} />
        ) : null}
        {uri ? (
          <Image
            source={{ uri, headers }}
            style={{ width: fitW, height: fitH }}
            resizeMode="contain"
            resizeMethod={canHiRes ? 'scale' : 'auto'}
            fadeDuration={0}
            onLoad={() => {
              setLoaded(true);
              setFailed(false);
            }}
            onError={() => setFailed(true)}
          />
        ) : null}
        {!loaded && !failed && (
          <View style={styles.spinner} pointerEvents="none">
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
        {failed && !loaded && (
          <View style={styles.spinner} pointerEvents="none">
            <Text style={styles.error}>Не удалось загрузить оригинал</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = themed(() => ({
  center: { alignItems: 'center', justifyContent: 'center' },
  spinner: { position: 'absolute', left: 0, right: 0, bottom: '12%', alignItems: 'center' },
  error: { color: 'rgba(255,255,255,0.85)', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
}));
