import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  Animated,
  LayoutChangeEvent,
  GestureResponderEvent,
  StyleSheet,
} from 'react-native';
import Svg, { Path, Defs, Pattern, Circle, Rect } from 'react-native-svg';
import { Plus, Minus, Maximize2, Users } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

import { NODE_WIDTH, NODE_HEIGHT, RoleNode, buildForest, flatten } from './treeLayout';
import { withAlpha } from '../theme/palettes';

import { themed } from '../theme/runtime';
export type { RoleNode };

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

/** Место под кнопкой «+» под нижним рядом узлов. */
const ADD_ZONE = 44;
const ADD_SIZE = 26;

const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

// ========== Компонент ==========
interface Props {
  nodes?: RoleNode[];
  tree?: RoleNode[];
  onNodePress?: (node: RoleNode) => void;
  onAddChildPress?: (node: RoleNode) => void;
  selectedNodeId?: number | null;
}

export default function TreeGraphView({ nodes, tree, onNodePress, onAddChildPress, selectedNodeId }: Props) {
  const { colors } = useTheme();
  const data = useMemo(() => {
    const src = Array.isArray(tree) ? tree : Array.isArray(nodes) ? nodes : [];
    return src.filter((n) => n && typeof n.id === 'number');
  }, [tree, nodes]);

  const forest = useMemo(() => buildForest(data), [data]);
  const allNodes = useMemo(() => forest.flatMap(flatten), [forest]);
  const bounds = useMemo(() => {
    let w = 0;
    let h = 0;
    allNodes.forEach((n) => {
      w = Math.max(w, n.x + NODE_WIDTH);
      h = Math.max(h, n.y + NODE_HEIGHT);
    });
    return { width: w, height: h + ADD_ZONE };
  }, [allNodes]);

  // Связи как в оргструктуре: вертикаль от руководителя, общая «шина»
  // и вертикали к подчинённым, со скруглёнными углами.
  const edges = useMemo(() => {
    const list: { key: string; d: string }[] = [];
    const R = 10;
    allNodes.forEach((ln) => {
      if (!ln.children.length) return;
      const px = ln.x + NODE_WIDTH / 2;
      const py = ln.y + NODE_HEIGHT;
      const my = py + (ln.children[0].y - py) / 2;
      ln.children.forEach((c) => {
        const cx = c.x + NODE_WIDTH / 2;
        const dx = cx - px;
        if (Math.abs(dx) < 1) {
          list.push({ key: `e-${ln.node.id}-${c.node.id}`, d: `M ${px} ${py} V ${c.y}` });
          return;
        }
        const r = Math.min(R, Math.abs(dx) / 2, (c.y - my) / 2);
        const sx = Math.sign(dx);
        list.push({
          key: `e-${ln.node.id}-${c.node.id}`,
          d: `M ${px} ${py} V ${my - r} Q ${px} ${my} ${px + sx * r} ${my} H ${cx - sx * r} Q ${cx} ${my} ${cx} ${my + r} V ${c.y}`,
        });
      });
    });
    return list;
  }, [allNodes]);

  // ---------- Камера ----------
  // Трансформация RN масштабирует вокруг центра холста. Точка холста p
  // видна на экране в T + C + s·(p − C), где T — сдвиг, C — центр холста.
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const cam = useRef({ x: 0, y: 0, s: 1 });
  const center = useRef({ x: 0, y: 0 });
  const containerOrigin = useRef({ x: 0, y: 0 });
  const containerRef = useRef<View>(null);
  const gesture = useRef({ startX: 0, startY: 0, dx0: 0, dy0: 0, pinchDist: 0, pinchScale: 1, fingers: 0 });
  const didFit = useRef(false);

  center.current = { x: bounds.width / 2, y: bounds.height / 2 };

  const apply = useCallback(
    (x: number, y: number, s: number) => {
      cam.current = { x, y, s };
      panX.setValue(x);
      panY.setValue(y);
      scale.setValue(s);
    },
    [panX, panY, scale],
  );

  const animateTo = useCallback(
    (x: number, y: number, s: number) => {
      cam.current = { x, y, s };
      Animated.parallel([
        Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 8 }),
        Animated.spring(panX, { toValue: x, useNativeDriver: true, friction: 8 }),
        Animated.spring(panY, { toValue: y, useNativeDriver: true, friction: 8 }),
      ]).start();
    },
    [panX, panY, scale],
  );

  /** Сдвиг, при котором точка экрана focal остаётся на месте при смене масштаба. */
  const translateForZoom = (focalX: number, focalY: number, s0: number, s1: number, x0: number, y0: number) => {
    const C = center.current;
    const k = s1 / s0;
    return { x: focalX - C.x - k * (focalX - x0 - C.x), y: focalY - C.y - k * (focalY - y0 - C.y) };
  };

  const fitToScreen = useCallback(
    (animate: boolean) => {
      if (!viewport.w || !viewport.h || !bounds.width || !bounds.height) return;
      const pad = 32;
      const s = clampScale(Math.min((viewport.w - pad * 2) / bounds.width, (viewport.h - pad * 2) / bounds.height, 1));
      const x = (viewport.w - bounds.width) / 2;
      const y = (viewport.h - bounds.height) / 2;
      animate ? animateTo(x, y, s) : apply(x, y, s);
    },
    [viewport, bounds, animateTo, apply],
  );

  useEffect(() => {
    if (viewport.w > 0 && bounds.width > 0 && !didFit.current) {
      didFit.current = true;
      fitToScreen(false);
    }
  }, [viewport, bounds, fitToScreen]);

  const zoomBy = (k: number) => {
    const { x, y, s } = cam.current;
    const s1 = clampScale(s * k);
    const t = translateForZoom(viewport.w / 2, viewport.h / 2, s, s1, x, y);
    animateTo(t.x, t.y, s1);
  };

  const local = (e: GestureResponderEvent, i: number) => ({
    x: e.nativeEvent.touches[i].pageX - containerOrigin.current.x,
    y: e.nativeEvent.touches[i].pageY - containerOrigin.current.y,
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4 || g.numberActiveTouches >= 2,
      onPanResponderGrant: (_e, g) => {
        gesture.current = { ...gesture.current, startX: cam.current.x, startY: cam.current.y, dx0: g.dx, dy0: g.dy, pinchDist: 0, fingers: 1 };
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        const gs = gesture.current;
        if (touches.length >= 2) {
          const a = local(e, 0);
          const b = local(e, 1);
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          const focal = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          // Второй палец мог коснуться позже — начинаем щипок с этого момента.
          if (gs.fingers < 2 || gs.pinchDist === 0) {
            gs.fingers = 2;
            gs.pinchDist = dist;
            gs.pinchScale = cam.current.s;
            gs.startX = cam.current.x;
            gs.startY = cam.current.y;
            (gs as any).focal0 = focal;
            return;
          }
          const s1 = clampScale(gs.pinchScale * (dist / gs.pinchDist));
          const f0 = (gs as any).focal0 as { x: number; y: number };
          // Масштаб вокруг исходной точки между пальцами + перенос вслед за пальцами.
          const t = translateForZoom(f0.x, f0.y, gs.pinchScale, s1, gs.startX, gs.startY);
          apply(t.x + (focal.x - f0.x), t.y + (focal.y - f0.y), s1);
        } else {
          if (gs.fingers >= 2) {
            // Один палец убрали — продолжаем панорамирование без скачка.
            gs.fingers = 1;
            gs.pinchDist = 0;
            gs.startX = cam.current.x;
            gs.startY = cam.current.y;
            gs.dx0 = g.dx;
            gs.dy0 = g.dy;
          }
          apply(gs.startX + (g.dx - gs.dx0), gs.startY + (g.dy - gs.dy0), cam.current.s);
        }
      },
      onPanResponderRelease: () => {
        gesture.current.pinchDist = 0;
        gesture.current.fingers = 0;
      },
      onPanResponderTerminate: () => {
        gesture.current.pinchDist = 0;
        gesture.current.fingers = 0;
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
    containerRef.current?.measureInWindow((x, y) => {
      containerOrigin.current = { x, y };
    });
  };

  if (data.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Дерево ролей пока пустое</Text>
      </View>
    );
  }

  const lineColor = withAlpha(colors.textMuted, 0.7);

  return (
    <View
      ref={containerRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      {/* Точечная сетка — подложка «доски», на которой нарисована структура. */}
      <Svg style={styles.grid} pointerEvents="none">
        <Defs>
          <Pattern id="dots" width={22} height={22} patternUnits="userSpaceOnUse">
            <Circle cx={2} cy={2} r={1.2} fill={withAlpha(colors.textMuted, 0.28)} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#dots)" />
      </Svg>

      <Animated.View
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: [{ translateX: panX }, { translateY: panY }, { scale }],
        }}
      >
        <Svg width={bounds.width} height={bounds.height} style={styles.svg} pointerEvents="none">
          {edges.map((e) => (
            <Path key={e.key} d={e.d} stroke={lineColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {allNodes.map(({ node, x, y, children }) => {
          const color = node.color || colors.accent;
          const selected = selectedNodeId === node.id;
          const isRoot = !!node.is_root || node.parent_id == null;
          const userCount = Number(node.users_count) || 0;
          const icon = node.icon && String(node.icon).trim() ? String(node.icon) : '\u{1F464}';
          return (
            <React.Fragment key={node.id}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onNodePress?.(node)}
                accessibilityRole="button"
                accessibilityLabel={`Роль ${node.name}, сотрудников: ${userCount}`}
                style={[
                  styles.nodeCard,
                  { left: x, top: y, backgroundColor: colors.card, shadowColor: colors.shadow, borderColor: isRoot ? color : colors.border },
                  isRoot && styles.rootCard,
                  selected && { borderColor: colors.accent, borderWidth: 2 },
                ]}
              >
                <View style={[styles.nodeAccent, { backgroundColor: color }]} />
                <View style={[styles.nodeIconWrap, { backgroundColor: withAlpha(color.length === 7 ? color : '#888888', 0.16) }]}>
                  <Text style={styles.nodeIcon}>{icon}</Text>
                </View>
                <View style={styles.nodeTextWrap}>
                  <Text style={[styles.nodeName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {node.name}
                  </Text>
                  <View style={styles.nodeMeta}>
                    <Users size={11} color={userCount ? colors.textSecondary : colors.textMuted} strokeWidth={2.2} />
                    <Text style={[styles.nodeMetaText, { color: userCount ? colors.textSecondary : colors.textMuted }]}>
                      {userCount ? `${userCount} чел.` : 'вакансия'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              {onAddChildPress && (
                // «+» под узлом, на линии к подчинённым: добавить роль уровнем ниже.
                <TouchableOpacity
                  onPress={() => onAddChildPress(node)}
                  style={[
                    styles.addBtn,
                    {
                      left: x + NODE_WIDTH / 2 - ADD_SIZE / 2,
                      top: y + NODE_HEIGHT + (children.length ? 6 : 10),
                      backgroundColor: colors.card,
                      borderColor: colors.accent,
                    },
                  ]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={`Добавить роль под «${node.name}»`}
                >
                  <Plus size={14} color={colors.accent} strokeWidth={2.8} />
                </TouchableOpacity>
              )}
            </React.Fragment>
          );
        })}
      </Animated.View>

      <View style={[styles.zoomControls, { backgroundColor: colors.card, shadowColor: colors.shadow, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => zoomBy(1.25)} style={styles.zoomBtn} activeOpacity={0.7} accessibilityLabel="Приблизить">
          <Plus size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={[styles.zoomDivider, { backgroundColor: colors.divider }]} />
        <TouchableOpacity onPress={() => fitToScreen(true)} style={styles.zoomBtn} activeOpacity={0.7} accessibilityLabel="Показать всё дерево">
          <Maximize2 size={18} color={colors.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={[styles.zoomDivider, { backgroundColor: colors.divider }]} />
        <TouchableOpacity onPress={() => zoomBy(0.8)} style={styles.zoomBtn} activeOpacity={0.7} accessibilityLabel="Отдалить">
          <Minus size={20} color={colors.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  container: { flex: 1, overflow: 'hidden' },
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  svg: { position: 'absolute', top: 0, left: 0 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, fontWeight: '500' },
  nodeCard: {
    position: 'absolute',
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 12,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  rootCard: { borderWidth: 1.5 },
  nodeAccent: { width: 4, alignSelf: 'stretch' },
  nodeIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  nodeIcon: { fontSize: 19, lineHeight: 23 },
  nodeTextWrap: { flex: 1 },
  nodeName: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  nodeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nodeMetaText: { fontSize: 11, fontWeight: '600' },
  addBtn: {
    position: 'absolute',
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: ADD_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  zoomBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { width: 1, height: 24 },
}));
