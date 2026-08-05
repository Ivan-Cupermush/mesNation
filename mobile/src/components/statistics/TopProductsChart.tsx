import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface Product {
  product_name: string;
  total_amount: number | string;
  total_quantity: number | string;
  transactions_count: number;
}

const fmt = (v: number | string): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
};

const MEDALS = ['🥇', '🥈', '🥉'];

export const TopProductsChart: React.FC<{ products: Product[] }> = ({ products }) => {
  const { colors } = useTheme();
  const items = products.slice(0, 5);
  const max = Math.max(...items.map(p => Number(p.total_amount) || 0), 1);

  return (
    <View>
      {items.map((p, i) => {
        const val = Number(p.total_amount) || 0;
        const pct = Math.max(6, (val / max) * 100);
        return (
          <View key={i} style={styles.row}>
            <View style={styles.head}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {MEDALS[i] || `${i + 1}.`} {p.product_name}
              </Text>
              <Text style={[styles.amount, { color: colors.accent }]}>{fmt(val)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.divider }]}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
            </View>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {Number(p.total_quantity).toFixed(0)} шт · {p.transactions_count} сделок
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { marginBottom: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  amount: { fontSize: 14, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 5 },
  fill: { height: '100%', borderRadius: 4 },
  meta: { fontSize: 12 },
});
