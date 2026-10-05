import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Lock, Mail, User, WifiOff, ChevronLeft } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { request } from '../../lib/http';
import { errorText } from '../../lib/format';
import { BrandMark } from '../../ui/BrandMark';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import s from './AuthPage.module.css';

type Screen = 'loading' | 'offline' | 'welcome' | 'login' | 'setup';

/**
 * Вход — как в приложении: проверяем, создана ли компания; если нет —
 * приветствие и создание компании (первый директор), иначе — вход.
 * Нет связи — понятный экран с «Повторить», а не пустая форма.
 */
export default function AuthPage() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [companyName, setCompanyName] = useState<string | null>(null);

  const check = async () => {
    setScreen('loading');
    try {
      const data = await request<{ hasCompany: boolean }>('/api/auth/has-company', { anonymous: true, timeoutMs: 12_000 });
      if (!data.hasCompany) {
        setScreen('welcome');
        return;
      }
      request<{ company_name: string | null }>('/api/company', { anonymous: true })
        .then((c) => setCompanyName(c.company_name))
        .catch(() => undefined);
      setScreen('login');
    } catch {
      setScreen('offline');
    }
  };

  useEffect(() => {
    check();
  }, []);

  return (
    <div className={s.page}>
      <div className={s.card}>
        {screen === 'loading' && (
          <div className={s.center}>
            <BrandMark />
            <Spinner />
          </div>
        )}
        {screen === 'offline' && (
          <div className={s.center}>
            <div className={s.offlineIcon}>
              <WifiOff size={34} />
            </div>
            <h1 className={s.heading}>Нет связи с сервером</h1>
            <p className={s.muted}>Проверьте интернет или подключение к рабочей сети.</p>
            <div className={s.stack}>
              <Button size="lg" block onClick={check}>
                Повторить
              </Button>
              <Button size="lg" block variant="secondary" onClick={() => setScreen('login')}>
                Всё равно войти
              </Button>
            </div>
          </div>
        )}
        {screen === 'welcome' && (
          <div className={s.center}>
            <BrandMark size={84} />
            <p className={s.muted}>Чаты, задачи, заметки и KPI вашей компании</p>
            <div className={s.stack}>
              <Button size="lg" block icon={<Building2 size={20} />} onClick={() => setScreen('setup')}>
                Создать компанию
              </Button>
              <Button size="lg" block variant="secondary" onClick={() => setScreen('login')}>
                У меня есть аккаунт
              </Button>
            </div>
          </div>
        )}
        {screen === 'login' && <LoginForm companyName={companyName} />}
        {screen === 'setup' && <SetupForm onBack={() => setScreen('welcome')} />}
      </div>
    </div>
  );
}

function LoginForm({ companyName }: { companyName: string | null }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(errorText(err, 'Не удалось войти'));
      setLoading(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <BrandMark size={64} />
      <h1 className={s.heading}>Вход</h1>
      {companyName && <p className={s.company}>{companyName}</p>}
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      <TextField
        icon={<User size={18} />}
        placeholder="Логин или email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoFocus
      />
      <TextField
        icon={<Lock size={18} />}
        type="password"
        placeholder="Пароль"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" size="lg" block loading={loading}>
        Войти
      </Button>
      <p className={s.hint}>Учётную запись создаёт администратор компании. Забыли пароль — обратитесь к руководителю.</p>
    </form>
  );
}

function SetupForm({ onBack }: { onBack: () => void }) {
  const { setupCompany } = useAuth();
  const [form, setForm] = useState({ company_name: '', display_name: '', username: '', email: '', password: '', password2: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) return setError('Укажите название компании');
    if (!form.username.trim() || !form.email.trim()) return setError('Укажите логин и email');
    if (form.password.length < 8) return setError('Пароль должен быть не короче 8 символов');
    if (form.password !== form.password2) return setError('Пароли не совпадают');
    setLoading(true);
    setError(null);
    try {
      await setupCompany({
        company_name: form.company_name.trim(),
        display_name: form.display_name.trim() || undefined,
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      });
    } catch (err) {
      setError(errorText(err, 'Не удалось создать компанию'));
      setLoading(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <button type="button" className={s.back} onClick={onBack}>
        <ChevronLeft size={20} /> Назад
      </button>
      <h1 className={s.heading}>Новая компания</h1>
      <p className={s.muted}>Вы станете директором — корнем дерева ролей. Сотрудников добавите потом в настройках.</p>
      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}
      <TextField label="Название компании" placeholder="Например: ООО Ромашка" value={form.company_name} onChange={set('company_name')} icon={<Building2 size={18} />} autoFocus />
      <TextField label="Ваше имя" placeholder="Иван Петров" value={form.display_name} onChange={set('display_name')} icon={<User size={18} />} autoComplete="name" />
      <TextField label="Логин" placeholder="ivan.petrov" value={form.username} onChange={set('username')} autoCapitalize="none" autoComplete="username" hint="Латиница, цифры, точка, дефис" />
      <TextField label="Email" type="email" placeholder="ivan@company.ru" value={form.email} onChange={set('email')} icon={<Mail size={18} />} autoComplete="email" />
      <TextField label="Пароль" type="password" value={form.password} onChange={set('password')} icon={<Lock size={18} />} autoComplete="new-password" hint="Не короче 8 символов" />
      <TextField label="Повторите пароль" type="password" value={form.password2} onChange={set('password2')} icon={<Lock size={18} />} autoComplete="new-password" />
      <Button type="submit" size="lg" block loading={loading}>
        Создать компанию
      </Button>
    </form>
  );
}
