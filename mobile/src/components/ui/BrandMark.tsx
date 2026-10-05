import React from 'react';
import { View, Text } from 'react-native';
import { MessagesSquare } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';

/** Фирменный знак Offix: плитка цвета акцента, название и подпись Dixit. */
export default function BrandMark({ size = 72, caption = true }: { size?: number; caption?: boolean }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.3 }]}>
        <MessagesSquare size={size * 0.48} color={T.onAccent} strokeWidth={2} />
      </View>
      <Text style={styles.name}>Offix</Text>
      {caption && <Text style={styles.caption}>коммуникационный шлюз Dixit</Text>}
    </View>
  );
}

const styles = themed(() => ({
  wrap: { alignItems: 'center' },
  tile: {
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  name: { marginTop: 16, fontSize: 30, fontWeight: '800', color: T.textPrimary, letterSpacing: 0.5 },
  caption: { marginTop: 4, fontSize: 10, fontWeight: '600', color: T.textMuted, letterSpacing: 2 },
}));
