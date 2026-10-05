import s from './Spinner.module.css';

export function Spinner({ size = 22, inherit }: { size?: number; inherit?: boolean }) {
  return (
    <span
      className={[s.spinner, inherit && s.inherit].filter(Boolean).join(' ')}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 9)) }}
      role="status"
      aria-label="Загрузка"
    />
  );
}

/** Индикатор загрузки на весь блок. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className={s.page}>
      <Spinner size={30} />
      {label && <span className={s.label}>{label}</span>}
    </div>
  );
}
