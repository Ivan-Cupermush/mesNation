import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, PanResponder, Animated,
  TouchableOpacity, Dimensions,
} from 'react-native';
import Svg, { Line, Circle, Text as SvgText, G } from 'react-native-svg';

interface TreeNode {
  id: number;
  name: string;
  parent_id: number | null;
  level: number;
  color: string;
  icon: string;
  users_count?: number;
}

interface TreeGraphViewProps {
  nodes: TreeNode[];
  onNodePress?: (node: TreeNode) => void;
  onAddChildPress?: (parentNode: TreeNode) => void;
  selectedNodeId?: number | null;
}

// Компактный canvas (безопасный размер)
const SVG_SIZE = 500;
const NODE_RADIUS = 22;
const H_SPACING = 90;
// УВЕЛИЧИЛИ: было 75, теперь 95 — больше места между уровнями
const V_SPACING = 95;

function calculateLayout(nodes: TreeNode[]) {
  const positions: Record<number, { x: number; y: number }> = {};
  const childrenMap: Record<number, TreeNode[]> = {};

  nodes.forEach(n => {
    const key = n.parent_id ?? -1;
    if (!childrenMap[key]) childrenMap[key] = [];
    childrenMap[key].push(n);
  });

  const root = nodes.find(n => n.parent_id === null);
  if (!root) return positions;

  let nextX = 0;
  const place = (node: TreeNode, depth: number) => {
    const children = childrenMap[node.id] || [];
    if (children.length === 0) {
      positions[node.id] = { x: nextX, y: depth };
      nextX += 1;
    } else {
      children.forEach(c => place(c, depth + 1));
      const xs = children.map(c => positions[c.id].x);
      positions[node.id] = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: depth,
      };
    }
  };
  place(root, 0);

  const allX = Object.values(positions).map(p => p.x);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const totalW = (maxX - minX) * H_SPACING;
  const offsetX = (SVG_SIZE - totalW) / 2 - minX * H_SPACING;
  const offsetY = 60;

  const result: Record<number, { x: number; y: number }> = {};
  Object.keys(positions).forEach(id => {
    const p = positions[Number(id)];
    result[Number(id)] = {
      x: p.x * H_SPACING + offsetX,
      y: p.y * V_SPACING + offsetY,
    };
  });
  return result;
}

export default function TreeGraphView({
  nodes,
  onNodePress,
  onAddChildPress,
  selectedNodeId,
}: TreeGraphViewProps) {
  const screenW = Dimensions.get('window').width;
  const initialScale = screenW / SVG_SIZE;
  const [translateX] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(0));
  const [scale] = useState(new Animated.Value(initialScale));

  const lastTX = useRef(0);
  const lastTY = useRef(0);
  const lastScale = useRef(initialScale);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        translateX.setOffset(lastTX.current);
        translateY.setOffset(lastTY.current);
        translateX.setValue(0);
        translateY.setValue(0);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: translateX, dy: translateY }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, g) => {
        lastTX.current += g.dx;
        lastTY.current += g.dy;
        translateX.flattenOffset();
        translateY.flattenOffset();
      },
    })
  ).current;

  const positions = useMemo(() => calculateLayout(nodes), [nodes]);

  const zoomIn = () => {
    const s = Math.min(lastScale.current * 1.3, 4);
    lastScale.current = s;
    Animated.spring(scale, { toValue: s, useNativeDriver: false }).start();
  };

  const zoomOut = () => {
    const s = Math.max(lastScale.current / 1.3, 0.5);
    lastScale.current = s;
    Animated.spring(scale, { toValue: s, useNativeDriver: false }).start();
  };

  const resetView = () => {
    lastTX.current = 0;
    lastTY.current = 0;
    lastScale.current = initialScale;
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: false }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: false }),
      Animated.spring(scale, { toValue: initialScale, useNativeDriver: false }),
    ]).start();
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.canvas,
          {
            width: SVG_SIZE,
            height: SVG_SIZE,
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
      >
        <Svg width={SVG_SIZE} height={SVG_SIZE} style={styles.svg}>
          {/* Линии */}
          {nodes.map(node => {
            if (node.parent_id === null) return null;
            const pp = positions[node.parent_id];
            const cp = positions[node.id];
            if (!pp || !cp) return null;
            return (
              <Line
                key={`l-${node.id}`}
                x1={pp.x}
                y1={pp.y + NODE_RADIUS}
                x2={cp.x}
                y2={cp.y - NODE_RADIUS}
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Узлы */}
          {nodes.map(node => {
            const pos = positions[node.id];
            if (!pos) return null;
            const sel = selectedNodeId === node.id;
            return (
              <G key={`n-${node.id}`}>
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS}
                  fill={node.color || '#6366F1'}
                  stroke={sel ? '#000' : '#fff'}
                  strokeWidth={sel ? 3 : 2}
                />
                <SvgText
                  x={pos.x}
                  y={pos.y + 5}
                  fontSize="14"
                  textAnchor="middle"
                >
                  {node.icon || '👤'}
                </SvgText>
                <SvgText
                  x={pos.x}
                  y={pos.y + NODE_RADIUS + 12}
                  fontSize="9"
                  fontWeight="600"
                  textAnchor="middle"
                  fill="#1E293B"
                >
                  {node.name}
                </SvgText>
                {node.users_count && node.users_count > 0 && (
                  <G>
                    <Circle
                      cx={pos.x + NODE_RADIUS - 4}
                      cy={pos.y - NODE_RADIUS + 4}
                      r={6}
                      fill="#EF4444"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                    <SvgText
                      x={pos.x + NODE_RADIUS - 4}
                      y={pos.y - NODE_RADIUS + 7}
                      fontSize="7"
                      fontWeight="700"
                      textAnchor="middle"
                      fill="#fff"
                    >
                      {node.users_count}
                    </SvgText>
                  </G>
                )}
                {/* Кнопка "+" — теперь на NODE_RADIUS + 20 (было +28) */}
                {onAddChildPress && (
                  <G>
                    <Circle
                      cx={pos.x}
                      cy={pos.y + NODE_RADIUS + 20}
                      r={8}
                      fill="#10B981"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                    <SvgText
                      x={pos.x}
                      y={pos.y + NODE_RADIUS + 24}
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="middle"
                      fill="#fff"
                    >
                      +
                    </SvgText>
                  </G>
                )}
              </G>
            );
          })}
        </Svg>

        {/* Кликабельные области */}
        {nodes.map(node => {
          const pos = positions[node.id];
          if (!pos) return null;
          return [
            <TouchableOpacity
              key={`tn-${node.id}`}
              onPress={() => onNodePress?.(node)}
              style={{
                position: 'absolute',
                left: pos.x - NODE_RADIUS,
                top: pos.y - NODE_RADIUS,
                width: NODE_RADIUS * 2,
                height: NODE_RADIUS * 2,
              }}
            />,
            onAddChildPress && (
              <TouchableOpacity
                key={`ta-${node.id}`}
                onPress={() => onAddChildPress(node)}
                style={{
                  position: 'absolute',
                  left: pos.x - 14,
                  top: pos.y + NODE_RADIUS + 14,
                  width: 28,
                  height: 28,
                }}
              />
            ),
          ];
        })}
      </Animated.View>

      {/* Зум */}
      <View style={styles.zoomControls}>
        <TouchableOpacity onPress={zoomIn} style={styles.zoomBtn}>
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={resetView} style={styles.zoomBtn}>
          <Text style={styles.zoomBtnText}>⊙</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={zoomOut} style={styles.zoomBtn}>
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#F8FAFC' },
  canvas: { position: 'relative' },
  svg: { position: 'absolute', top: 0, left: 0 },
  zoomControls: {
    position: 'absolute',
    right: 20,
    top: 100,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnText: { fontSize: 24, color: '#1E293B', fontWeight: '300' },
});
