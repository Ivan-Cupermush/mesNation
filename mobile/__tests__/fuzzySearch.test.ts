import { fuzzyMatch, translit, switchLayout, levenshtein, matchRanges, snippetAround } from '../src/utils/fuzzySearch';

describe('fuzzyMatch', () => {
  it('без учёта регистра и ё/е', () => {
    expect(fuzzyMatch('Пётр Сидоров', 'петр').match).toBe(true);
    expect(fuzzyMatch('Пётр Сидоров', 'СИДОР').rank).toBe(0);
  });
  it('транслит в обе стороны', () => {
    expect(fuzzyMatch('Иван Петров', 'ivan').match).toBe(true);
    expect(fuzzyMatch('ivan.petrov', 'иван').match).toBe(true);
  });
  it('неправильная раскладка', () => {
    expect(switchLayout('bdfy')).toBe('иван');
    expect(fuzzyMatch('Иван', 'bdfy').match).toBe(true);
  });
  it('опечатки в длинных словах, но не в коротких', () => {
    expect(fuzzyMatch('Бухгалтерия', 'бугалтерия').match).toBe(true);
    expect(fuzzyMatch('Кот', 'кит').match).toBe(false);
  });
  it('не находит лишнего', () => {
    expect(fuzzyMatch('Анна Смирнова', 'петров').match).toBe(false);
  });
  it('вспомогательные функции', () => {
    expect(translit('Щука')).toBe('schuka');
    expect(levenshtein('кот', 'кит')).toBe(1);
  });
  it('несколько слов — в любом порядке', () => {
    expect(fuzzyMatch('Петров Иван', 'иван петров').match).toBe(true);
    expect(fuzzyMatch('Отдел продаж', 'прод отд').match).toBe(true);
    expect(fuzzyMatch('Отдел продаж', 'прод бух').match).toBe(false);
  });
  it('подсветка: части слов, ё = е, другая раскладка', () => {
    expect(matchRanges('Квартальный отчёт готов', 'отчет')).toEqual([[12, 17]]);
    expect(matchRanges('Привет всем', 'ghbd')).toEqual([[0, 4]]);
    expect(matchRanges('договор и Договор', 'дог')).toEqual([[0, 3], [10, 13]]);
    expect(snippetAround('a '.repeat(100) + 'нужное слово' + ' b'.repeat(100), 'нужн')).toMatch(/^….*нужное слово.*…$/);
  });
});
