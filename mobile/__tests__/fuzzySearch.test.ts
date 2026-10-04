import { fuzzyMatch, translit, switchLayout, levenshtein } from '../src/utils/fuzzySearch';

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
});
