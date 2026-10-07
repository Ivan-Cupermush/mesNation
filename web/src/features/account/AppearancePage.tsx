import { Check, CornerDownLeft, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { BUBBLE_RADIUS_RANGE, FONT_RANGE, PALETTES, type ThemePreference } from '../../theme/palettes';
import { Switch } from '../../ui/Field';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { SettingsRow, SettingsSection } from '../../ui/SettingsList';
import s from './account.module.css';

const MODES: { key: ThemePreference; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Светлая', icon: Sun },
  { key: 'dark', label: 'Тёмная', icon: Moon },
  { key: 'system', label: 'Как в системе', icon: Monitor },
];

/**
 * Внешний вид — как в приложении: тема, цвет, размер текста и скругление
 * сообщений (с живым примером), отправка по Enter. Хранится в этом браузере.
 */
export default function AppearancePage() {
  const theme = useTheme();
  return (
    <Page>
      <PageHeader title="Внешний вид" back={true} />
      <PageBody narrow>
        <div className={s.preview} aria-hidden>
          <div className={[s.bubble, s.bubbleIn].join(' ')} style={{ fontSize: theme.messageFontSize, borderRadius: theme.bubbleRadius }}>
            Добрый день! Отчёт за квартал готов?
            <span className={s.bubbleTime}>10:42</span>
          </div>
          <div className={[s.bubble, s.bubbleOut].join(' ')} style={{ fontSize: theme.messageFontSize, borderRadius: theme.bubbleRadius }}>
            Да, отправил на проверку 👍
            <span className={s.bubbleTime}>10:43 ✓✓</span>
          </div>
        </div>

        <SettingsSection title="Тема">
          <div className={s.modes}>
            {MODES.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" className={[s.mode, theme.preference === key && s.modeOn].filter(Boolean).join(' ')} onClick={() => theme.setPreference(key)} aria-pressed={theme.preference === key}>
                <Icon size={22} />
                {label}
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="Цвет">
          <div className={s.palettes}>
            {PALETTES.map((p) => {
              const color = theme.isDark ? p.dark : p.light;
              const on = theme.paletteId === p.id;
              return (
                <button key={p.id} type="button" className={[s.palette, on && s.paletteOn].filter(Boolean).join(' ')} onClick={() => theme.setPalette(p.id)} aria-pressed={on} style={on ? { borderColor: color } : undefined}>
                  <span className={s.swatch} style={{ background: color }}>
                    {on && <Check size={16} strokeWidth={3} />}
                  </span>
                  {p.name}
                </button>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection title="Размер текста сообщений">
          <div className={s.slider}>
            <span style={{ fontSize: 13 }}>A</span>
            <input type="range" min={FONT_RANGE.min} max={FONT_RANGE.max} step={1} value={theme.messageFontSize} onChange={(e) => theme.setMessageFontSize(Number(e.target.value))} aria-label="Размер текста" />
            <span style={{ fontSize: 22 }}>A</span>
            <b>{theme.messageFontSize}</b>
          </div>
        </SettingsSection>

        <SettingsSection title="Углы сообщений">
          <div className={s.slider}>
            <span className={s.cornerSharp} />
            <input type="range" min={BUBBLE_RADIUS_RANGE.min} max={BUBBLE_RADIUS_RANGE.max} step={1} value={theme.bubbleRadius} onChange={(e) => theme.setBubbleRadius(Number(e.target.value))} aria-label="Скругление" />
            <span className={s.cornerRound} />
            <b>{theme.bubbleRadius}</b>
          </div>
        </SettingsSection>

        <SettingsSection title="Чаты" footer="На телефоне Enter всегда переносит строку — отправка кнопкой.">
          <SettingsRow
            icon={<CornerDownLeft size={18} />}
            title="Отправка по Enter"
            hint={theme.sendByEnter ? 'Enter — отправить, Shift+Enter — новая строка' : 'Enter — новая строка, Ctrl+Enter — отправить'}
            right={<Switch checked={theme.sendByEnter} onChange={theme.setSendByEnter} label="Отправка по Enter" />}
          />
        </SettingsSection>
      </PageBody>
    </Page>
  );
}
