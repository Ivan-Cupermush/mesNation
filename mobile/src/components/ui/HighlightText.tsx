import React, { useMemo } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { matchRanges } from '../../utils/fuzzySearch';

/** Части текста, совпавшие с запросом поиска. */
export function highlightParts(text: string, query: string | null | undefined): { s: string; hl: boolean }[] {
  const ranges = query ? matchRanges(text, query) : [];
  if (!ranges.length) return [{ s: text, hl: false }];
  const out: { s: string; hl: boolean }[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) out.push({ s: text.slice(pos, a), hl: false });
    out.push({ s: text.slice(a, b), hl: true });
    pos = b;
  }
  if (pos < text.length) out.push({ s: text.slice(pos), hl: false });
  return out;
}

/** Текст с подсвеченными совпадениями (поиск по чатам и сообщениям). */
export default function HighlightText({
  text,
  query,
  style,
  hlStyle,
  numberOfLines,
}: {
  text: string;
  query?: string | null;
  style?: StyleProp<TextStyle>;
  hlStyle: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const parts = useMemo(() => highlightParts(text, query), [text, query]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        p.hl ? (
          <Text key={i} style={hlStyle}>
            {p.s}
          </Text>
        ) : (
          p.s
        ),
      )}
    </Text>
  );
}
