import { buildForest } from '../src/components/treeLayout';

const flat = (t: any): any[] => [t, ...t.children.flatMap(flat)];

describe('раскладка дерева ролей', () => {
  const nodes = [
    { id: 1, name: 'Директор', parent_id: null },
    { id: 2, name: 'Продажи', parent_id: 1 },
    { id: 3, name: 'Бухгалтерия', parent_id: 1 },
    { id: 4, name: 'Менеджер', parent_id: 2 },
  ];

  it('одно дерево, родитель по центру над детьми', () => {
    const forest = buildForest(nodes);
    expect(forest).toHaveLength(1);
    const [root] = forest;
    const [a, b] = root.children;
    expect(root.x + 98).toBeCloseTo((a.x + 98 + b.x + 98) / 2);
    expect(a.y).toBeGreaterThan(root.y);
  });

  it('узлы без пути к корню не цепляются к директору фальшивыми рёбрами', () => {
    const forest = buildForest([...nodes, { id: 9, name: 'Сирота', parent_id: 999 }, { id: 10, name: 'Ребёнок сироты', parent_id: 9 }]);
    expect(forest).toHaveLength(2);
    expect(flat(forest[0]).map((n) => n.node.id)).not.toContain(9);
    expect(forest[1].children.map((c: any) => c.node.id)).toEqual([10]);
  });

  it('карточки не пересекаются', () => {
    const all = buildForest(nodes).flatMap(flat);
    for (const a of all) for (const b of all) {
      if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(196);
    }
  });
});
