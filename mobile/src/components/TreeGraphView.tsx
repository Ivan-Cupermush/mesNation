import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Plus, Minus, Maximize2, Users } from 'lucide-react-native';

export interface RoleNode {
  id: number;
  name: string;
  parent_id: number | null;
  level?: number;
  color?: string;
  icon?: string;
  users_count?: number;
}

interface LayoutNode {
  node: RoleNode;
  x: number;
  y: number;
  subtreeWidth: number;
  children: LayoutNode[];
}

const NODE_WIDTH = 190;
const NODE_HEIGHT = 68;
const H_GAP = 26;
const V_GAP = 84;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

// ========== Аккуратная раскладка: дети центрированы под родителем ==========
function buildLayout(root: RoleNode, allNodes: RoleNode[]): LayoutNode {
  const childrenMap = new Map<number, RoleNode[]>();
  allNodes.forEach(n => {
    const pid = n.parent_id == null ? -1 : n.parent_id;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(n);
  });
  const visited = new Set<number>();
  const build = (node: RoleNode, depth: number): LayoutNode => {
    visited.add(node.id);
    const kids = (childrenMap.get(node.id) || []).filter(k => !visited.has(k.id));
    const children = kids.map(k => build(k, depth + 1));
    return { node, x: 0, y: depth * (NODE_HEIGHT + V_GAP), subtreeWidth: 0, children };
  };
  const rootLayout = build(root, 0);
  const orphans = allNodes.filter(n => !visited.has(n.id));
  orphans.forEach(o => {
    visited.add(o.id);
    rootLayout.children.push({
      node: o,
      x: 0,
      y: NODE_HEIGHT + V_GAP,
      subtreeWidth: 0,
      children: [],
    });
  });
  const calcWidth = (ln: LayoutNode): number => {
    if (ln.children.length === 0) {
      ln.subtreeWidth = NODE_WIDTH;
      return NODE_WIDTH;
    }
    const w = ln.children.reduce((s, c, i) => s + calcWidth(c) + (i > 0 ? H_GAP : 0), 0);
    ln.subtreeWidth = Math.max(NODE_WIDTH, w);
    return w;
  };
  const assignX = (ln: LayoutNode, centerX: number) => {
    ln.x = centerX - NODE_WIDTH / 2;
    if (ln.children.length === 0) return;
    const total = ln.children.reduce((s, c, i) => s + c.subtreeWidth + (i > 0 ? H_GAP : 0), 0);
    let cursor = centerX - total / 2;
    ln.children.forEach(c => {
      assignX(c, cursor + c.subtreeWidth / 2);
      cursor += c.subtreeWidth + H_GAP;
    });
  };
  calcWidth(rootLayout);
  assignX(rootLayout, rootLayout.subtreeWidth / 2);
  return rootLayout;
}

function flatten(ln: LayoutNode): LayoutNode[] {
  return [ln, ...ln.children.flatMap(flatten)];
}

function getBounds(layout: LayoutNode) {
  const all = flatten(layout);
  let maxX = 0;
  let maxY = 0;
  all.forEach(n => {
    maxX = Math.max(maxX, n.x + NODE_WIDTH);
    maxY = Math.max(maxY, n.y + NODE_HEIGHT);
  });
  return { width: maxX, height: maxY };
}

// ========== Компонент ==========
interface Props {
  nodes?: RoleNode[];
  tree?: RoleNode[];
  onNodePress?: (node: RoleNode) => void;
  onAddChildPress?: (node: RoleNode) => void;
  selectedNodeId?: number | null;
}

export default function TreeGraphView({
  nodes,
  tree,
  onNodePress,
  onAddChildPress,
  selectedNodeId,
}: Props) {
  const data = useMemo(() => {
    const src = Array.isArray(tree) ? tree : Array.isArray(nodes) ? nodes : [];
    return src.filter(n => n && typeof n.id === 'number');
  }, [tree, nodes]);

  const root = useMemo(() => data.find(n => n.parent_id == null), [data]);
  const layout = useMemo(() => (root ? buildLayout(root, data) : null), [root, data]);
  const bounds = useMemo(() => (layout ? getBounds(layout) : { width: 0, height: 0 }), [layout]);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  const curX = useRef(0);
  const curY = useRef(0);
  const curScale = useRef(1);
  const startX = useRef(0);
  const startY = useRef(0);
  const pinchDist = useRef(0);
  const pinchScale = useRef(1);
  const isPinching = useRef(false);
  const didFit = useRef(false);

  useEffect(() => {
    const a = panX.addListener(v => { curX.current = v.value; });
    const b = panY.addListener(v => { curY.current = v.value; });
    const c = scale.addListener(v => { curScale.current = v.value; });
    return () => {
      panX.removeListener(a);
      panY.removeListener(b);
      scale.removeListener(c);
    };
  }, [panX, panY, scale]);

  const fitToScreen = (animate: boolean) => {
    if (!viewport.w || !viewport.h || !bounds.width || !bounds.height) return;
    const pad = 32;
    const s = Math.min((viewport.w - pad * 2) / bounds.width, (viewport.h - pad * 2) / bounds.height, 1);
    const nx = (viewport.w - bounds.width) / 2;
    const ny = (viewport.h - bounds.height) / 2;
    if (animate) {
      Animated.parallel([
        Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 8 }),
        Animated.spring(panX, { toValue: nx, useNativeDriver: true, friction: 8 }),
        Animated.spring(panY, { toValue: ny, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      scale.setValue(s);
      panX.setValue(nx);
      panY.setValue(ny);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4 || g.numberActiveTouches >= 2,
      onPanResponderGrant: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t.length >= 2) {
          isPinching.current = true;
          pinchDist.current = Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY);
          pinchScale.current = curScale.current;
        } else {
          isPinching.current = false;
          startX.current = curX.current;
          startY.current = curY.current;
        }
      },
      onPanResponderMove: (evt, g) => {
        const t = evt.nativeEvent.touches;
        if (t.length >= 2) {
          const d = Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY);
          if (pinchDist.current > 0) {
            const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchScale.current * (d / pinchDist.current)));
            scale.setValue(s);
          }
        } else if (!isPinching.current) {
          panX.setValue(startX.current + g.dx);
          panY.setValue(startY.current + g.dy);
        }
      },
      onPanResponderRelease: () => {
        pinchDist.current = 0;
        isPinching.current = false;
      },
      onPanResponderTerminate: () => {
        pinchDist.current = 0;
        isPinching.current = false;
      },
    }),
  ).current;

  const zoomBy = (k: number) => {
    const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, curScale.current * k));
    Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 8 }).start();
  };

  useEffect(() => {
    if (viewport.w > 0 && bounds.width > 0 && !didFit.current) {
      didFit.current = true;
      fitToScreen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.w, viewport.h, bounds.width, bounds.height]);

  const allNodes = layout ? flatten(layout) : [];

  const edges = useMemo(() => {
    if (!layout) return [];
    const list: { key: string; d: string }[] = [];
    const walk = (ln: LayoutNode) => {
      if (ln.children.length === 0) return;
      const px = ln.x + NODE_WIDTH / 2;
      const py = ln.y + NODE_HEIGHT;
      ln.children.forEach(c => {
        const cx = c.x + NODE_WIDTH / 2;
        const cy = c.y;
        const my = (py + cy) / 2;
        list.push({
          key: `e-${ln.node.id}-${c.node.id}`,
          d: `M ${px} ${py} C ${px} ${my}, ${cx} ${my}, ${cx} ${cy}`,
        });
        walk(c);
      });
    };
    walk(layout);
    return list;
  }, [layout]);

  if (!root || !layout || data.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Дерево ролей пока пустое</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) =>
        setViewport({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.canvas,
          {
            width: bounds.width,
            height: bounds.height,
            transform: [{ translateX: panX }, { translateY: panY }, { scale }],
          },
        ]}
      >
        <Svg width={bounds.width} height={bounds.height} style={styles.svg} pointerEvents="none">
          {edges.map(e => (
            <Path key={e.key} d={e.d} stroke="#CBD5E1" strokeWidth={2} fill="none" strokeLinecap="round" />
          ))}
        </Svg>
        {allNodes.map(ln => {
          const node = ln.node;
          const color = node.color || '#6366F1';
          const selected = selectedNodeId === node.id;
          const userCount = node.users_count || 0;
          const icon = node.icon && String(node.icon).trim() ? String(node.icon) : '\u{1F464}';
          return (
            <TouchableOpacity
              key={node.id}
              activeOpacity={0.85}
              onPress={() => onNodePress?.(node)}
              style={[
                styles.nodeCard,
                { left: ln.x, top: ln.y },
                selected && styles.nodeCardSelected,
              ]}
            >
              <View style={[styles.nodeAccent, { backgroundColor: color }]} />
              <View style={styles.nodeBody}>
                <View style={[styles.nodeIconWrap, { backgroundColor: color + '22' }]}>
                  <Text style={styles.nodeIcon}>{icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nodeName} numberOfLines={1}>{node.name}</Text>
                  {userCount > 0 ? (
                    <View style={styles.usersChip}>
                      <Users size={10} color="#6F6F73" strokeWidth={2.2} />
                      <Text style={styles.usersChipText}>{userCount}</Text>
                    </View>
                  ) : (
                    <Text style={styles.nodeEmpty}>нет людей</Text>
                  )}
                </View>
              </View>
              {onAddChildPress && (
                <TouchableOpacity
                  onPress={() => onAddChildPress(node)}
                  style={styles.addBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Plus size={14} color="#1F7A52" strokeWidth={2.6} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </Animated.View>
      {/* Зум-контролы */}
      <View style={styles.zoomControls}>
        <TouchableOpacity onPress={() => zoomBy(1.25)} style={styles.zoomBtn} activeOpacity={0.7}>
          <Plus size={20} color="#141414" strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity onPress={() => fitToScreen(true)} style={styles.zoomBtn} activeOpacity={0.7}>
          <Maximize2 size={18} color="#141414" strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity onPress={() => zoomBy(0.8)} style={styles.zoomBtn} activeOpacity={0.7}>
          <Minus size={20} color="#141414" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#F6F8FA' },
  canvas: {},
  svg: { position: 'absolute', top: 0, left: 0 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: '#6F6F73', fontWeight: '500' },
  nodeCard: {
    position: 'absolute',
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  nodeCardSelected: { borderWidth: 2, borderColor: '#1F7A52' },
  nodeAccent: { width: 4, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  nodeBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  nodeIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nodeIcon: { fontSize: 18, lineHeight: 22 },
  nodeName: { fontSize: 13, fontWeight: '700', color: '#141414', marginBottom: 3 },
  usersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  usersChipText: { fontSize: 10, fontWeight: '700', color: '#6F6F73' },
  nodeEmpty: { fontSize: 10, color: '#BDBDBD', fontStyle: 'italic' },
  addBtn: {
    position: 'absolute',
    right: -12,
    top: NODE_HEIGHT / 2 - 13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  zoomBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { width: 1, height: 24, backgroundColor: '#F4F4F5' },
});
