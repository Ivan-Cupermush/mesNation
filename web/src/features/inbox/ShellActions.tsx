import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { displayName } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import Bell from './Bell';
import s from './inbox.module.css';

/**
 * Колокольчик и профиль в шапке раздела на телефоне — как в приложении.
 * На компьютере они в боковом меню, здесь не показываются.
 */
export default function ShellActions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <span className={s.shellActions}>
      <Bell />
      <button type="button" className={s.profileBtn} onClick={() => navigate('/profile')} aria-label="Профиль" title="Профиль">
        <Avatar name={displayName(user)} src={user?.avatar_url} size={40} />
      </button>
    </span>
  );
}
