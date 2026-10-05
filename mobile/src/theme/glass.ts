import { StyleSheet } from 'react-native';
import { T } from './runtime';
import { withAlpha } from './palettes';

/**
 * «Стекло» как в iOS и новом Telegram: полупрозрачная плашка с тонкой
 * кромкой, парящая над лентой. Без тени на Android: тень сквозь
 * полупрозрачный фон даёт грязное пятно.
 */
export const glass = (alpha = 0.86) => ({
  backgroundColor: withAlpha(T.card, alpha),
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: withAlpha(T.textPrimary, 0.12),
  shadowColor: '#000',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
});
