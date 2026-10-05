import { Suspense, type ReactNode } from 'react';
import { PageLoader } from '../ui/Spinner';
import s from './Legacy.module.css';

/**
 * Экран старой версии сайта внутри нового каркаса — временно, пока раздел
 * не переписан на новую основу (функции не пропадают ни на одном шаге).
 */
export function Legacy({ children }: { children: ReactNode }) {
  return (
    <div className={s.legacy}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </div>
  );
}
