import { monthGrid, dayKey, CAL_ROWS } from '../src/components/NotesCalendar';

describe('сетка календаря заметок', () => {
  it('всегда 6 недель, неделя с понедельника', () => {
    const rows = monthGrid(new Date(2026, 9, 1)); // октябрь 2026, 1-е — четверг
    expect(rows).toHaveLength(CAL_ROWS);
    rows.forEach((r) => expect(r).toHaveLength(7));
    expect(rows[0][0].getDay()).toBe(1);
    expect(dayKey(rows[0][0])).toBe('2026-09-28');
    expect(dayKey(rows[0][3])).toBe('2026-10-01');
  });

  it('месяц, начинающийся с понедельника, не теряет первую неделю', () => {
    const rows = monthGrid(new Date(2026, 5, 1)); // 1 июня 2026 — понедельник
    expect(dayKey(rows[0][0])).toBe('2026-06-01');
    expect(dayKey(rows[5][6])).toBe('2026-07-12');
  });
});
