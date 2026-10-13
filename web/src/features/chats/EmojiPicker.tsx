import { useEffect, useMemo, useRef, useState } from 'react';
import { Apple, Car, Clock3, Flag, Hand, Heart, Lightbulb, PawPrint, Search, Smile, Volleyball, X } from 'lucide-react';
import { storage } from '../../lib/storage';
import { EMOJI_CATEGORIES, searchEmoji } from './emojiData';
import s from './EmojiPicker.module.css';

/**
 * Панель смайликов — как в Telegram: поиск по словам, недавние, разделы
 * с вкладками; нажатие вставляет эмодзи туда, где стоит курсор.
 */

const RECENT_KEY = 'offix.emoji.recent';
const RECENT_MAX = 32;
const ICONS: Record<string, typeof Smile> = {
  recent: Clock3,
  smileys: Smile,
  people: Hand,
  nature: PawPrint,
  food: Apple,
  activity: Volleyball,
  travel: Car,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

const readRecent = (): string[] => {
  const v = storage.getJSON<string[]>(RECENT_KEY);
  return Array.isArray(v) ? v : [];
};

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [recent] = useState<string[]>(readRecent);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(recent.length ? 'recent' : 'smileys');
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const box = useRef<HTMLDivElement>(null);

  const cats = useMemo(
    () => [...(recent.length ? [{ key: 'recent', label: 'Недавние', emojis: recent }] : []), ...EMOJI_CATEGORIES],
    [recent],
  );
  const results = useMemo(() => searchEmoji(q, 120), [q]);

  // Клик мимо и Esc — закрыть.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (box.current?.contains(t) || t.closest('[data-emoji-toggle]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const pick = (e: string) => {
    onPick(e);
    const next = [e, ...readRecent().filter((x) => x !== e)].slice(0, RECENT_MAX);
    // «Недавние» обновятся при следующем открытии — сетка не прыгает под курсором.
    storage.setJSON(RECENT_KEY, next);
  };

  const jump = (key: string) => {
    setActive(key);
    const el = sections.current[key];
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 4 });
  };

  const onScroll = () => {
    const top = (scroller.current?.scrollTop ?? 0) + 12;
    let cur = cats[0]?.key;
    for (const c of cats) {
      const el = sections.current[c.key];
      if (el && el.offsetTop <= top) cur = c.key;
    }
    if (cur && cur !== active) setActive(cur);
  };

  return (
    <div ref={box} className={s.picker} role="dialog" aria-label="Смайлики" onMouseDown={(e) => e.preventDefault()}>
      <div className={s.search}>
        <Search size={16} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Поиск эмодзи"
          aria-label="Поиск эмодзи"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Очистить">
            <X size={15} />
          </button>
        )}
      </div>

      {q.trim() ? (
        <div className={[s.grid, s.results].join(' ')}>
          {results.length ? (
            results.map((e) => (
              <button key={e} type="button" className={s.cell} onClick={() => pick(e)} title={e}>
                {e}
              </button>
            ))
          ) : (
            <div className={s.empty}>Ничего не нашлось — попробуйте другое слово</div>
          )}
        </div>
      ) : (
        <>
          <div ref={scroller} className={s.scroll} onScroll={onScroll}>
            {cats.map((c) => (
              <section key={c.key} ref={(el) => void (sections.current[c.key] = el)}>
                <div className={s.title}>{c.label}</div>
                <div className={s.grid}>
                  {c.emojis.map((e, i) => (
                    <button key={`${e}-${i}`} type="button" className={s.cell} onClick={() => pick(e)} title={e}>
                      {e}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className={s.tabs}>
            {cats.map((c) => {
              const Icon = ICONS[c.key] || Smile;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={[s.tab, active === c.key && s.tabOn].filter(Boolean).join(' ')}
                  onClick={() => jump(c.key)}
                  title={c.label}
                  aria-label={c.label}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
