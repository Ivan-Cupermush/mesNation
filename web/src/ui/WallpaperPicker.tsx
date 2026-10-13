import { useRef } from 'react';
import { Ban, Check, ImagePlus } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { GRADIENTS, PATTERNS, PATTERN_INTENSITY, imageToWallpaper, wallpaperStyle, type Wallpaper } from '../theme/wallpapers';
import { useFeedback } from './feedback';
import s from './WallpaperPicker.module.css';

const same = (a: Wallpaper, b: Wallpaper) => a.type === b.type && ((a as any).id ?? (a as any).uri) === ((b as any).id ?? (b as any).uri);

/**
 * Выбор фона чатов, как в приложении: плитки — маленький чат на этом фоне,
 * насыщенность узора, затемнение и размытие своего фото.
 */
export function WallpaperPicker({ value, onChange }: { value: Wallpaper; onChange: (wp: Wallpaper) => void }) {
  const { isDark } = useTheme();
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const options: { wp: Wallpaper; label: string }[] = [
    { wp: { type: 'none' }, label: 'Без фона' },
    ...PATTERNS.map((p) => ({ wp: { type: 'pattern', id: p.id } as Wallpaper, label: p.name })),
    ...GRADIENTS.map((g) => ({ wp: { type: 'gradient', id: g.id } as Wallpaper, label: g.name })),
  ];
  if (value.type === 'image') options.push({ wp: value, label: 'Своё фото' });

  const choose = (wp: Wallpaper) => {
    if (wp.type === 'pattern' && value.type === 'pattern' && value.id === wp.id) return;
    onChange(wp);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await imageToWallpaper(file));
    } catch {
      toast.error('Не удалось открыть картинку');
    }
  };

  return (
    <div className={s.wrap}>
      <div className={s.grid}>
        {options.map((o, i) => {
          const active = same(o.wp, value);
          const wp = active ? value : o.wp;
          return (
            <button key={i} type="button" className={s.item} onClick={() => choose(o.wp)} aria-pressed={active} aria-label={`Фон: ${o.label}`}>
              <span className={[s.tile, active && s.tileActive].filter(Boolean).join(' ')} style={wallpaperStyle(wp, isDark)}>
                {o.wp.type === 'none' ? (
                  <Ban size={22} className={s.none} />
                ) : (
                  <span className={s.mini} aria-hidden>
                    <span className={[s.bubble, s.in].join(' ')} />
                    <span className={[s.bubble, s.out].join(' ')} />
                    <span className={[s.bubble, s.in].join(' ')} style={{ width: '45%' }} />
                  </span>
                )}
                {active && (
                  <span className={s.check}>
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={[s.label, active && s.labelActive].filter(Boolean).join(' ')}>{o.label}</span>
            </button>
          );
        })}
        <button type="button" className={s.item} onClick={() => input.current?.click()} aria-label="Своё фото">
          <span className={[s.tile, s.add].join(' ')}>
            <ImagePlus size={24} />
          </span>
          <span className={s.label}>Своё фото</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            pick(f);
          }}
        />
      </div>

      {value.type === 'pattern' && (
        <label className={s.slider}>
          <span>Насыщенность узора</span>
          <input
            type="range"
            min={PATTERN_INTENSITY.min}
            max={PATTERN_INTENSITY.max}
            step={0.01}
            value={value.intensity ?? PATTERN_INTENSITY.default}
            onChange={(e) => onChange({ ...value, intensity: Number(e.target.value) })}
          />
        </label>
      )}
      {value.type === 'image' && (
        <>
          <label className={s.slider}>
            <span>Затемнение</span>
            <input type="range" min={0} max={0.7} step={0.05} value={value.dim ?? (isDark ? 0.4 : 0)} onChange={(e) => onChange({ ...value, dim: Number(e.target.value) })} />
          </label>
          <label className={s.toggle}>
            <input type="checkbox" checked={!!value.blur} onChange={(e) => onChange({ ...value, blur: e.target.checked })} /> Размыть фото
          </label>
        </>
      )}
    </div>
  );
}
