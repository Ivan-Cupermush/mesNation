/**
 * Раскладка дерева ролей (чистые функции без React — тестируются отдельно).
 */

export interface RoleNode {
  id: number;
  name: string;
  parent_id: number | null;
  level?: number;
  color?: string;
  icon?: string;
  users_count?: number | string;
  is_root?: boolean;
}

export interface LayoutNode {
  node: RoleNode;
  x: number;
  y: number;
  subtreeWidth: number;
  children: LayoutNode[];
}

export const NODE_WIDTH = 196;
export const NODE_HEIGHT = 68;
const H_GAP = 26;
const V_GAP = 84;
const TREE_GAP = 60;

// ========== Раскладка: дети центрированы под родителем ==========

/**
 * Строит лес: основное дерево от корня (директора) и, если в данных есть
 * узлы без пути к корню, — отдельные деревья справа. Связи рисуются только
 * настоящие (раньше «сироты» подвешивались к корню фальшивыми рёбрами).
 */
export function buildForest(allNodes: RoleNode[]): LayoutNode[] {
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const childrenMap = new Map<number, RoleNode[]>();
  allNodes.forEach((n) => {
    if (n.parent_id != null && byId.has(n.parent_id)) {
      if (!childrenMap.has(n.parent_id)) childrenMap.set(n.parent_id, []);
      childrenMap.get(n.parent_id)!.push(n);
    }
  });
  const visited = new Set<number>();
  const build = (node: RoleNode, depth: number): LayoutNode => {
    visited.add(node.id);
    const kids = (childrenMap.get(node.id) || []).filter((k) => !visited.has(k.id));
    return { node, x: 0, y: depth * (NODE_HEIGHT + V_GAP), subtreeWidth: 0, children: kids.map((k) => build(k, depth + 1)) };
  };

  const roots = allNodes
    .filter((n) => n.parent_id == null || !byId.has(n.parent_id))
    .sort((a, b) => Number(!!b.is_root || b.parent_id == null) - Number(!!a.is_root || a.parent_id == null) || a.id - b.id);
  const forest = roots.map((r) => build(r, 0));
  // Узлы в цикле (не достижимы ни от одного корня) — тоже показываем, а не теряем.
  allNodes.filter((n) => !visited.has(n.id)).forEach((n) => forest.push(build(n, 0)));

  const calcWidth = (ln: LayoutNode): number => {
    const w = ln.children.reduce((s, c, i) => s + calcWidth(c) + (i > 0 ? H_GAP : 0), 0);
    ln.subtreeWidth = Math.max(NODE_WIDTH, w);
    return ln.subtreeWidth;
  };
  const assignX = (ln: LayoutNode, centerX: number) => {
    ln.x = centerX - NODE_WIDTH / 2;
    const total = ln.children.reduce((s, c, i) => s + c.subtreeWidth + (i > 0 ? H_GAP : 0), 0);
    let cursor = centerX - total / 2;
    ln.children.forEach((c) => {
      assignX(c, cursor + c.subtreeWidth / 2);
      cursor += c.subtreeWidth + H_GAP;
    });
  };
  let offset = 0;
  forest.forEach((tree) => {
    calcWidth(tree);
    assignX(tree, offset + tree.subtreeWidth / 2);
    offset += tree.subtreeWidth + TREE_GAP;
  });
  return forest;
}

export function flatten(ln: LayoutNode): LayoutNode[] {
  return [ln, ...ln.children.flatMap(flatten)];
}
