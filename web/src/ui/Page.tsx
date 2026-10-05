import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import s from './Page.module.css';

interface HeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Куда вести «Назад». true — на шаг назад в истории. */
  back?: string | true;
  actions?: ReactNode;
  /** Крупный заголовок раздела (как «ЧАТЫ» в приложении) или компактный для вложенных экранов. */
  large?: boolean;
  children?: ReactNode;
}

/** Шапка экрана: заголовок, подзаголовок, «назад» и кнопки справа. */
export function PageHeader({ title, subtitle, back, actions, large, children }: HeaderProps) {
  const navigate = useNavigate();
  const goBack = () => {
    if (back === true) {
      if (window.history.length > 1) navigate(-1);
      else navigate('/');
    } else if (back) navigate(back);
  };
  return (
    <header className={[s.header, large && s.large].filter(Boolean).join(' ')}>
      <div className={s.row}>
        {back && (
          <button type="button" className={s.back} onClick={goBack} aria-label="Назад">
            <ChevronLeft size={24} />
          </button>
        )}
        <div className={s.titles}>
          <h1 className={large ? `${s.title} display-title` : s.titleCompact}>{title}</h1>
          {subtitle && <div className={s.subtitle}>{subtitle}</div>}
        </div>
        {actions && <div className={s.actions}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Прокручиваемое содержимое экрана с ограничением ширины на больших мониторах. */
export function PageBody({ children, narrow, className }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return (
    <div className={[s.body, className].filter(Boolean).join(' ')}>
      <div className={[s.inner, narrow && s.narrow].filter(Boolean).join(' ')}>{children}</div>
    </div>
  );
}

/** Экран целиком: шапка + прокручиваемое тело. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.page, className].filter(Boolean).join(' ')}>{children}</div>;
}

/** Карточка-секция (как группы настроек в приложении). */
export function Card({ children, title, className, padded = true }: { children: ReactNode; title?: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={[s.cardWrap, className].filter(Boolean).join(' ')}>
      {title && <h2 className={s.cardTitle}>{title}</h2>}
      <div className={[s.card, padded && s.padded].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}
