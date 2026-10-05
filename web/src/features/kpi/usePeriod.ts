import { useState } from 'react';
import { storage } from '../../lib/storage';
import type { Period } from './types';

const KEY = 'offix.stats.period';

/** Выбранный период запоминается: статистику обычно смотрят за один и тот же срок. */
export function usePeriod() {
  const [period, setPeriod] = useState<Period>(() => {
    const v = storage.get(KEY);
    return v === 'week' || v === 'quarter' ? v : 'month';
  });
  const change = (p: Period) => {
    storage.set(KEY, p);
    setPeriod(p);
  };
  return [period, change] as const;
}
