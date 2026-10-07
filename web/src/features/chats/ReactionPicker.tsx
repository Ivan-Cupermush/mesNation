import { REACTIONS } from './model';
import s from './ReactionPicker.module.css';

/** Полоска реакций над меню сообщения (как в Telegram). Своя реакция выделена. */
export default function ReactionPicker({ current, onPick }: { current?: string | null; onPick: (emoji: string) => void }) {
  return (
    <div className={s.picker} role="toolbar" aria-label="Реакции">
      {REACTIONS.map((e) => (
        <button key={e} type="button" className={[s.item, current === e && s.itemOn].filter(Boolean).join(' ')} onClick={() => onPick(e)} aria-label={`Реакция ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
