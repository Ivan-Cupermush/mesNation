import { WifiOff } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';

/** Сервер недоступен при запуске: из аккаунта не выходим, предлагаем повторить. */
export default function OfflinePage() {
  const { retry, logout } = useAuth();
  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState
        icon={<WifiOff size={44} />}
        title="Нет связи с сервером"
        text="Проверьте интернет или подключение к рабочей сети. Ваши данные в безопасности — после восстановления связи всё откроется как было."
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button onClick={retry}>Повторить</Button>
            <Button variant="secondary" onClick={logout}>
              Выйти
            </Button>
          </div>
        }
      />
    </div>
  );
}
