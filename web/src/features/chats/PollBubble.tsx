import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import { api } from '../../lib/http';
import { displayName, plural } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { useUsers } from '../users/queries';
import type { Poll } from './types';
import s from './PollBubble.module.css';

interface Voter {
  option_id: number;
  user_id: number;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  poll: Poll;
  myVotes: number[];
  mine: boolean;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
const votesLabel = (n: number) => `${n} ${plural(n, ['голос', 'голоса', 'голосов'])}`;

/**
 * Опрос в ленте — как в приложении (и Telegram): до голосования кружки
 * (квадраты при нескольких ответах), после — проценты и полосы, отметка
 * своего ответа; викторина подсвечивает верный ответ и показывает пояснение;
 * в публичном опросе — аватарки проголосовавших и окно «Результаты».
 */
export default function PollBubble({ poll, myVotes: initialVotes, mine }: Props) {
  const { toast } = useFeedback();
  const [data, setData] = useState(poll);
  const [myVotes, setMyVotes] = useState(initialVotes);
  const [selection, setSelection] = useState<number[]>([]);
  const [voting, setVoting] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [voters, setVoters] = useState<Voter[] | null>(null);
  const [quizResult, setQuizResult] = useState<{ right: boolean } | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const { data: users } = useUsers(!poll.is_anonymous);

  // Обновления приходят сверху (событие poll_updated).
  useEffect(() => setData(poll), [poll]);
  useEffect(() => setMyVotes(initialVotes), [initialVotes]);

  const usersById = useMemo(() => new Map((users || []).map((u) => [u.id, u])), [users]);
  const voted = myVotes.length > 0;
  const showResults = voted || data.is_closed;
  const total = data.total_votes || 0;

  const vote = async (optionIds: number[]) => {
    if (data.is_closed || voting || !optionIds.length) return;
    setVoting(true);
    try {
      const d = await api.post<{ poll: Poll; my_votes: number[] }>(`/api/polls/${data.id}/vote`, { option_ids: optionIds });
      setData(d.poll);
      setMyVotes(d.my_votes?.length ? d.my_votes : optionIds);
      setSelection([]);
      if (d.poll.is_quiz) {
        const right = d.poll.options.some((o) => o.is_correct && optionIds.includes(o.id));
        if (d.poll.explanation) setQuizResult({ right });
        else toast(right ? 'Верно!' : 'Неверно', right ? 'success' : 'info');
      }
    } catch (e) {
      toast.error(e, 'Не удалось проголосовать');
    } finally {
      setVoting(false);
    }
  };

  const openResults = async () => {
    setResultsOpen(true);
    if (data.is_anonymous) return;
    setVoters(null);
    try {
      setVoters(await api.get<Voter[]>(`/api/polls/${data.id}/voters`));
    } catch {
      setVoters([]);
    }
  };

  const kind = data.is_quiz ? (data.is_anonymous ? 'Анонимная викторина' : 'Викторина') : data.is_anonymous ? 'Анонимный опрос' : 'Публичный опрос';
  const recentVoters = Array.from(new Set(data.options.flatMap((o) => o.voters || []))).slice(0, 3);

  return (
    <div className={[s.wrap, mine ? s.mine : s.theirs].join(' ')} onClick={(e) => e.stopPropagation()}>
      <div className={s.question}>{data.question}</div>
      <div className={s.kindRow}>
        <span className={s.kind}>
          {kind}
          {data.is_closed ? ' · завершён' : ''}
        </span>
        {!data.is_anonymous && recentVoters.length > 0 && (
          <span className={s.stack}>
            {recentVoters.map((id) => {
              const u = usersById.get(id);
              return <Avatar key={id} name={displayName(u)} src={u?.avatar_url} size={18} className={s.stackItem} />;
            })}
          </span>
        )}
        {data.is_quiz && data.explanation && showResults && (
          <button type="button" className={s.bulb} onClick={() => setExplainOpen(true)} aria-label="Пояснение" title="Пояснение">
            <Lightbulb size={17} />
          </button>
        )}
      </div>

      <div className={s.options}>
        {data.options.map((opt) => {
          const percent = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
          const chosen = myVotes.includes(opt.id);
          const selected = selection.includes(opt.id);

          if (!showResults) {
            return (
              <button
                key={opt.id}
                type="button"
                className={s.option}
                disabled={voting}
                onClick={() => {
                  if (data.allows_multiple) setSelection(selected ? selection.filter((x) => x !== opt.id) : [...selection, opt.id]);
                  else vote([opt.id]);
                }}
              >
                <span className={[s.radio, data.allows_multiple && s.square, selected && s.radioOn].filter(Boolean).join(' ')}>
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={s.optionText}>{opt.text}</span>
              </button>
            );
          }

          const correct = data.is_quiz && opt.is_correct;
          const wrongMine = data.is_quiz && chosen && !opt.is_correct;
          return (
            <div key={opt.id} className={s.result}>
              <div className={s.resultTop}>
                <span className={s.percent}>{percent}%</span>
                <span className={s.optionText}>{opt.text}</span>
              </div>
              <div className={s.barRow}>
                <span className={s.markSlot}>
                  {correct ? (
                    <span className={[s.mark, s.markRight].join(' ')}>
                      <Check size={10} strokeWidth={3.5} />
                    </span>
                  ) : wrongMine ? (
                    <span className={[s.mark, s.markWrong].join(' ')}>
                      <X size={10} strokeWidth={3.5} />
                    </span>
                  ) : chosen ? (
                    <span className={[s.mark, s.markMine].join(' ')}>
                      <Check size={10} strokeWidth={3.5} />
                    </span>
                  ) : null}
                </span>
                <span className={s.track}>
                  <span
                    className={[s.bar, correct && s.barRight, wrongMine && s.barWrong].filter(Boolean).join(' ')}
                    style={{ width: `${Math.max(percent, opt.vote_count ? 2 : 0)}%` }}
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.footer}>
        {!showResults && data.allows_multiple ? (
          <button type="button" className={s.footerAction} onClick={() => vote(selection)} disabled={!selection.length || voting}>
            {voting ? <Spinner size={16} inherit /> : 'Голосовать'}
          </button>
        ) : showResults && !data.is_anonymous && total > 0 ? (
          <button type="button" className={s.footerAction} onClick={openResults}>
            Результаты
          </button>
        ) : voting ? (
          <Spinner size={16} inherit />
        ) : (
          <span className={s.footerText}>{total ? votesLabel(total) : data.is_quiz ? 'Пока никто не ответил' : 'Пока нет голосов'}</span>
        )}
      </div>

      {/* Окна — в портале, но события React всплывают к пузырю: гасим их здесь. */}
      <span className={s.isolate} onContextMenu={stop} onTouchStart={stop}>
      {/* Пояснение к викторине — после ответа и по лампочке */}
      <Modal
        open={!!quizResult || explainOpen}
        onClose={() => {
          setQuizResult(null);
          setExplainOpen(false);
        }}
        title={quizResult ? (quizResult.right ? 'Верно!' : 'Неверно') : 'Пояснение'}
        size="sm"
        footer={
          <Button
            onClick={() => {
              setQuizResult(null);
              setExplainOpen(false);
            }}
          >
            Понятно
          </Button>
        }
      >
        <div className={s.explanation}>
          <Lightbulb size={20} className={s.explanationIcon} />
          <span>{data.explanation}</span>
        </div>
      </Modal>

      {/* Результаты публичного опроса */}
      <Modal open={resultsOpen} onClose={() => setResultsOpen(false)} title={data.is_quiz ? 'Результаты викторины' : 'Результаты опроса'} size="md">
        <div className={s.resultsHead}>
          <div className={s.resultsQuestion}>{data.question}</div>
          <div className={s.resultsSub}>{votesLabel(total)}</div>
        </div>
        {voters === null && !data.is_anonymous ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : (
          data.options.map((opt) => {
            const percent = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
            const list = (voters || []).filter((v) => v.option_id === opt.id);
            return (
              <section key={opt.id} className={s.group}>
                <header className={s.groupHeader}>
                  <span className={s.groupTitle}>
                    {opt.text}
                    {data.is_quiz && opt.is_correct ? '  ✓' : ''}
                  </span>
                  <span className={s.groupPercent}>
                    {percent}% · {opt.vote_count}
                  </span>
                </header>
                {data.is_anonymous ? (
                  <div className={s.groupEmpty}>Анонимный опрос — голоса скрыты</div>
                ) : list.length === 0 ? (
                  <div className={s.groupEmpty}>Никто не выбрал</div>
                ) : (
                  list.map((v) => (
                    <div key={`${v.option_id}-${v.user_id}`} className={s.voter}>
                      <Avatar name={displayName(v)} src={v.avatar_url} size={36} />
                      <span className={s.voterName}>{displayName(v)}</span>
                      <span className={s.voterTime}>
                        {new Date(v.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </section>
            );
          })
        )}
      </Modal>
      </span>
    </div>
  );
}
