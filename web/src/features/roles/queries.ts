import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/http';

export interface RoleNode {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  level: number;
  color: string | null;
  icon: string | null;
  depth: number | null;
  is_root: boolean;
  users_count: number;
}

export interface RoleUser {
  id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role_node_id: number;
  role_name: string;
}

export const roleKeys = {
  tree: ['role-tree'] as const,
  users: (nodeId: number) => ['role-tree', 'users', nodeId] as const,
};

export function useRoleTree() {
  return useQuery({ queryKey: roleKeys.tree, queryFn: () => api.get<RoleNode[]>('/api/role-tree'), staleTime: 30_000 });
}

export function useRoleUsers(nodeId: number | null) {
  return useQuery({
    queryKey: roleKeys.users(nodeId ?? 0),
    queryFn: () => api.get<RoleUser[]>(`/api/role-tree/${nodeId}/users`, { include_inactive: 'true' }),
    enabled: !!nodeId,
  });
}

export interface TreeItem {
  node: RoleNode;
  depth: number;
  children: TreeItem[];
  /** Сотрудников во всём поддереве (активных). */
  total: number;
}

/** Плоский список узлов → дерево (корень — директор). Узлы-сироты тоже попадают в корень. */
export function buildTree(nodes: RoleNode[]): TreeItem[] {
  const byParent = new Map<number | null, RoleNode[]>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const key = n.parent_id !== null && ids.has(n.parent_id) ? n.parent_id : null;
    const list = byParent.get(key) || [];
    list.push(n);
    byParent.set(key, list);
  }
  const make = (n: RoleNode, depth: number, seen: Set<number>): TreeItem => {
    seen.add(n.id);
    const children = (byParent.get(n.id) || [])
      .filter((c) => !seen.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((c) => make(c, depth + 1, seen));
    return { node: n, depth, children, total: n.users_count + children.reduce((sum, c) => sum + c.total, 0) };
  };
  const seen = new Set<number>();
  return (byParent.get(null) || []).sort((a, b) => Number(b.is_root) - Number(a.is_root)).map((n) => make(n, 0, seen));
}

/** Все id поддерева (включая сам узел) — чтобы не перенести роль внутрь самой себя. */
export function subtreeIds(item: TreeItem): Set<number> {
  const out = new Set<number>();
  const walk = (t: TreeItem) => {
    out.add(t.node.id);
    t.children.forEach(walk);
  };
  walk(item);
  return out;
}

export function findItem(items: TreeItem[], id: number): TreeItem | null {
  for (const it of items) {
    if (it.node.id === id) return it;
    const inner = findItem(it.children, id);
    if (inner) return inner;
  }
  return null;
}
