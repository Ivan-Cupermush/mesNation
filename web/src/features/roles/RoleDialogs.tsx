import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/Field';
import { RoleTree } from './RoleTree';
import { buildTree, type RoleNode } from './queries';
import s from './RolesPage.module.css';

const COLORS = ['#6366F1', '#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444', '#6B7280'];
const ICONS = ['👑', '👤', '💼', '📊', '💰', '🛠️', '📦', '🚚', '📞', '🎯', '🧾', '🧑‍💻', '🏭', '🛒', '📣', '🧪'];

export interface RoleDraft {
  name: string;
  description: string;
  color: string;
  icon: string;
}

/** Создание и изменение роли: название, описание, значок и цвет. */
export function RoleEditDialog({
  open,
  title,
  initial,
  saveText,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial?: Partial<RoleDraft>;
  saveText: string;
  onClose: () => void;
  onSave: (draft: RoleDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RoleDraft>({ name: '', description: '', color: COLORS[0], icon: '👤' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft({ name: initial?.name ?? '', description: initial?.description ?? '', color: initial?.color || COLORS[0], icon: initial?.icon || '👤' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
      onClose();
    } catch {
      // ошибку показал вызывающий код
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={saving}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={save} loading={saving} disabled={!draft.name.trim()}>
            {saveText}
          </Button>
        </>
      }
    >
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField label="Название" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} placeholder="Например: Менеджер по продажам" autoFocus />
        <TextField label="Описание" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={1000} placeholder="Чем занимается (необязательно)" />
        <div className={s.label}>Значок</div>
        <div className={s.icons}>
          {ICONS.map((i) => (
            <button key={i} type="button" className={[s.iconPick, draft.icon === i && s.iconPickOn].filter(Boolean).join(' ')} onClick={() => setDraft({ ...draft, icon: i })}>
              {i}
            </button>
          ))}
        </div>
        <div className={s.label}>Цвет</div>
        <div className={s.colors}>
          {COLORS.map((c) => (
            <button key={c} type="button" className={s.color} style={{ background: c }} onClick={() => setDraft({ ...draft, color: c })} aria-label={`Цвет ${c}`}>
              {draft.color === c && <Check size={14} strokeWidth={3} />}
            </button>
          ))}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Выбор роли в дереве (куда перенести сотрудника или роль). */
export function RolePickerDialog({
  open,
  title,
  hint,
  nodes,
  disabled,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  hint?: string;
  nodes: RoleNode[];
  disabled?: Set<number>;
  current?: number | null;
  onClose: () => void;
  onPick: (node: RoleNode) => void;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {hint && <p className={s.dialogHint}>{hint}</p>}
      <RoleTree
        items={tree}
        selected={current ?? null}
        disabled={disabled}
        expandAll
        onSelect={(id) => {
          const node = nodes.find((n) => n.id === id);
          if (node) onPick(node);
        }}
      />
    </Modal>
  );
}
