import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import s from './Field.module.css';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; right?: ReactNode }>(
  function TextField({ label, hint, error, icon, right, className, id, ...rest }, ref) {
    const autoId = useId();
    const inputId = id || autoId;
    return (
      <div className={[s.field, className].filter(Boolean).join(' ')}>
        {label && (
          <label className={s.label} htmlFor={inputId}>
            {label}
          </label>
        )}
        <div className={[s.box, error && s.invalid].filter(Boolean).join(' ')}>
          {icon && <span className={s.icon}>{icon}</span>}
          <input ref={ref} id={inputId} className={s.input} aria-invalid={!!error || undefined} {...rest} />
          {right}
        </div>
        {error ? <div className={s.error}>{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
      </div>
    );
  },
);

/** Многострочное поле, растущее по мере ввода (до maxRows строк). */
export const TextArea = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }>(
  function TextArea({ label, hint, error, className, id, maxRows = 12, value, ...rest }, ref) {
    const autoId = useId();
    const inputId = id || autoId;
    const inner = useRef<HTMLTextAreaElement | null>(null);
    useEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
      el.style.height = `${Math.min(el.scrollHeight + 2, line * maxRows + 24)}px`;
    }, [value, maxRows]);
    return (
      <div className={[s.field, className].filter(Boolean).join(' ')}>
        {label && (
          <label className={s.label} htmlFor={inputId}>
            {label}
          </label>
        )}
        <textarea
          ref={(el) => {
            inner.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          id={inputId}
          className={[s.textarea, error && s.invalid].filter(Boolean).join(' ')}
          aria-invalid={!!error || undefined}
          value={value}
          {...rest}
        />
        {error ? <div className={s.error}>{error}</div> : hint ? <div className={s.hint}>{hint}</div> : null}
      </div>
    );
  },
);

interface SearchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (v: string) => void;
}

export function SearchField({ value, onChange, placeholder = 'Поиск', className, ...rest }: SearchProps) {
  return (
    <div className={[s.search, className].filter(Boolean).join(' ')}>
      <Search size={17} className={s.searchIcon} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && value && (e.stopPropagation(), onChange(''))}
        {...rest}
      />
      {value && (
        <button type="button" className={s.clear} onClick={() => onChange('')} aria-label="Очистить">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[s.switch, checked && s.switchOn].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className={s.knob} />
    </button>
  );
}

export interface ChipOption<T extends string> {
  key: T;
  label: ReactNode;
}

/** Чипы-фильтры как в приложении (Все / Личные / Группы…). Прокручиваются по горизонтали. */
export function Chips<T extends string>({ options, value, onChange, className }: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={[s.chips, className].filter(Boolean).join(' ')} role="tablist">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={[s.chip, value === o.key && s.chipActive].filter(Boolean).join(' ')}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Сегментный переключатель (Неделя / Месяц / Квартал). */
export function Segmented<T extends string>({ options, value, onChange }: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className={s.segmented} role="tablist">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={[s.segment, value === o.key && s.segmentActive].filter(Boolean).join(' ')}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
