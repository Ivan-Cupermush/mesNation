import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import s from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'soft';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[s.btn, s[variant], s[size], block && s.block, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 18} inherit /> : icon}
      {children && <span className={s.label}>{children}</span>}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: number;
  tone?: 'default' | 'accent' | 'danger' | 'soft';
  active?: boolean;
}

/** Кнопка-иконка. label обязателен: это подсказка и текст для экранных дикторов. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 40, tone = 'default', active, className, children, type = 'button', style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={[s.icon, s[`tone_${tone}`], active && s.iconActive, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
});
