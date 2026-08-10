import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  ChevronLeft, Check, Type, Flag, CalendarDays, Clock, Users, Eye,
  Paperclip, Plus, X, ChevronRight, Loader2,
} from 'lucide-react';
import { api, getSubtreeUsers, getUsers } from '../services/api';
import { theme } from '../styles/theme';

interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
}

const hslAvatar = (id: number) => `hsl(${(id * 47) % 360}, 60%, 65%)`;

const formatDate = (d: Date | null) => {
  if (!d) return null;
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const toInputValue = (d: Date | null) => {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PRIORITY_OPTIONS = [
  { key: 'green', label: 'Низкий', color: '#1F7A52', bg: '#D1FAE5' },
  { key: 'yellow', label: 'Средний', color: '#B45309', bg: '#FEF3C7' },
  { key: 'red', label: 'Высокий', color: '#B91C1C', bg: '#FEE2E2' },
] as const;

const CreateTaskScreen: React.FC = () => {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [importance, setImportance] = useState<'green' | 'yellow' | 'red'>('yellow');
  const [executorDeadline, setExecutorDeadline] = useState<Date | null>(null);
  const [reviewerDeadline, setReviewerDeadline] = useState<Date | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<User[]>([]);
  const [selectedWatchers, setSelectedWatchers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showAssigneesModal, setShowAssigneesModal] = useState(false);
  const [showWatchersModal, setShowWatchersModal] = useState(false);
  const [showExecutorPicker, setShowExecutorPicker] = useState(false);
  const [showReviewerPicker, setShowReviewerPicker] = useState(false);

  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  const loadUsers = useCallback(async () => {
    try {
      let users = await getSubtreeUsers();
      if (!users || users.length === 0) {
        const all = await getUsers();
        const me = await api.getCurrentUser().catch(() => null);
        users = (all || []).filter((u: any) => u.id !== me?.id);
      }
      setAvailableUsers(users || []);
    } catch (e) {
      console.log('Ошибка загрузки пользователей:', e);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async () => {
    if (!title.trim()) { setError('Введите название задачи'); return; }
    if (selectedAssignees.length === 0) { setError('Выберите хотя бы одного исполнителя'); return; }

    setLoading(true);
    setError('');
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        importance,
        assignee_ids: selectedAssignees.map(u => u.id),
      };
      if (selectedWatchers.length > 0) payload.watcher_ids = selectedWatchers.map(u => u.id);
      if (executorDeadline) payload.executor_deadline = executorDeadline.toISOString();
      if (reviewerDeadline) payload.reviewer_deadline = reviewerDeadline.toISOString();

      await api.createTask(payload);
      navigate('/tasks');
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Не удалось создать задачу');
      setLoading(false);
    }
  };

  const toggleUser = (user: User, list: User[], setList: (v: User[]) => void) => {
    if (list.find(u => u.id === user.id)) {
      setList(list.filter(u => u.id !== user.id));
    } else {
      setList([...list, user]);
    }
  };

  const renderUsersModal = (
    visible: boolean,
    onClose: () => void,
    selected: User[],
    setSelected: (v: User[]) => void,
    modalTitle: string,
  ) => visible && (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{modalTitle}</ModalTitle>
          <ModalCloseBtn onClick={onClose}><X size={22} strokeWidth={2} /></ModalCloseBtn>
        </ModalHeader>
        <ModalList>
          {availableUsers.map(item => {
            const isSelected = selected.some(u => u.id === item.id);
            return (
              <UserRow key={item.id} $selected={isSelected} onClick={() => toggleUser(item, selected, setSelected)}>
                <UserAvatar style={{ backgroundColor: hslAvatar(item.id) }}>
                  {(item.display_name || item.username).slice(0, 2).toUpperCase()}
                </UserAvatar>
                <UserName>{item.display_name || item.username}</UserName>
                {isSelected && (
                  <CheckCircle><Check size={16} color="#FFFFFF" strokeWidth={2.5} /></CheckCircle>
                )}
              </UserRow>
            );
          })}
          {availableUsers.length === 0 && (
            <EmptyUsers>Нет доступных пользователей</EmptyUsers>
          )}
        </ModalList>
        <ModalFooter>
          <ModalDoneBtn onClick={onClose}>Готово ({selected.length})</ModalDoneBtn>
        </ModalFooter>
      </ModalContent>
    </ModalOverlay>
  );

  const renderDatePicker = (
    visible: boolean,
    onClose: () => void,
    value: Date | null,
    onSave: (d: Date) => void,
    pickerTitle: string,
  ) => visible && (
    <ModalOverlay onClick={onClose}>
      <PickerContent onClick={e => e.stopPropagation()}>
        <ModalTitle style={{ marginBottom: 16 }}>{pickerTitle}</ModalTitle>
        <DateTimeInput
          type="datetime-local"
          defaultValue={toInputValue(value)}
          min={toInputValue(new Date())}
          id="dt-picker"
        />
        <PickerBtns>
          <PickerCancel onClick={onClose}>Отмена</PickerCancel>
          <PickerSave onClick={() => {
            const el = document.getElementById('dt-picker') as HTMLInputElement;
            if (el && el.value) onSave(new Date(el.value));
            onClose();
          }}>Сохранить</PickerSave>
        </PickerBtns>
      </PickerContent>
    </ModalOverlay>
  );

  return (
    <Container>
      {/* ===== HEADER ===== */}
      <Header>
        <HeaderBackBtn onClick={() => navigate('/tasks')}>
          <ChevronLeft size={24} strokeWidth={2} />
        </HeaderBackBtn>
        <HeaderTitleWrap>
          <HeaderTitle>СОЗДАТЬ ЗАДАЧУ</HeaderTitle>
        </HeaderTitleWrap>
        <HeaderCreateBtn
          $disabled={loading || !title.trim()}
          onClick={handleCreate}
        >
          {loading ? (
            <Loader2 size={20} color="#FFFFFF" style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
          )}
        </HeaderCreateBtn>
      </Header>

      <ScrollContent>
        {error && <ErrorBox>⚠ {error}</ErrorBox>}

        {/* ===== КАРТОЧКА 1: Основная информация ===== */}
        <Card>
          <CardHeader>
            <CardIconWrap><Type size={18} color="#1F7A52" strokeWidth={2} /></CardIconWrap>
            <CardTitle>Основная информация</CardTitle>
          </CardHeader>

          <FieldLabel>Название</FieldLabel>
          <TextInput
            placeholder="Например: Подготовить квартальный отчёт"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <Divider />

          <FieldLabel>Описание</FieldLabel>
          <TextArea
            placeholder="Детали задачи, ожидаемый результат..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </Card>

        {/* ===== КАРТОЧКА 2: Приоритет ===== */}
        <Card>
          <CardHeader>
            <CardIconWrap><Flag size={18} color="#1F7A52" strokeWidth={2} /></CardIconWrap>
            <CardTitle>Приоритет</CardTitle>
          </CardHeader>

          <PriorityRow>
            {PRIORITY_OPTIONS.map(p => {
              const active = importance === p.key;
              return (
                <PriorityBtn
                  key={p.key}
                  $active={active}
                  $color={p.color}
                  $bg={p.bg}
                  onClick={() => setImportance(p.key)}
                >
                  <PriorityDot style={{ backgroundColor: p.color, opacity: active ? 1 : 0.4 }} />
                  <PriorityLabel style={{ color: active ? p.color : '#6F6F73' }}>
                    {p.label}
                  </PriorityLabel>
                </PriorityBtn>
              );
            })}
          </PriorityRow>
        </Card>

        {/* ===== КАРТОЧКА 3: Сроки ===== */}
        <Card>
          <CardHeader>
            <CardIconWrap><Clock size={18} color="#1F7A52" strokeWidth={2} /></CardIconWrap>
            <CardTitle>Сроки</CardTitle>
          </CardHeader>

          <FieldLabel>Дедлайн выполнения</FieldLabel>
          <DateRow onClick={() => setShowExecutorPicker(true)}>
            <CalendarDays size={18} color="#6F6F73" strokeWidth={2} />
            <DateText $placeholder={!executorDeadline}>
              {formatDate(executorDeadline) || 'Не выбран'}
            </DateText>
            {executorDeadline && (
              <ClearDate onClick={e => { e.stopPropagation(); setExecutorDeadline(null); }}>
                <X size={16} color="#BDBDBD" strokeWidth={2} />
              </ClearDate>
            )}
          </DateRow>

          <Divider />

          <FieldLabel>Дедлайн проверки</FieldLabel>
          <DateRow onClick={() => setShowReviewerPicker(true)}>
            <CalendarDays size={18} color="#6F6F73" strokeWidth={2} />
            <DateText $placeholder={!reviewerDeadline}>
              {formatDate(reviewerDeadline) || 'Не выбран'}
            </DateText>
            {reviewerDeadline && (
              <ClearDate onClick={e => { e.stopPropagation(); setReviewerDeadline(null); }}>
                <X size={16} color="#BDBDBD" strokeWidth={2} />
              </ClearDate>
            )}
          </DateRow>
          <FieldHint>Если не указан — будет рассчитан автоматически при переходе на проверку</FieldHint>
        </Card>

        {/* ===== КАРТОЧКА 4: Участники ===== */}
        <Card>
          <CardHeader>
            <CardIconWrap><Users size={18} color="#1F7A52" strokeWidth={2} /></CardIconWrap>
            <CardTitle>Участники</CardTitle>
          </CardHeader>

          <ParticipantsRow onClick={() => setShowAssigneesModal(true)}>
            <ParticipantsLabel>Исполнители <Required>*</Required></ParticipantsLabel>
            <ParticipantsRight>
              {selectedAssignees.length > 0 ? (
                <AvatarsStack>
                  {selectedAssignees.slice(0, 3).map((u, idx) => (
                    <MiniAvatar
                      key={u.id}
                      style={{
                        backgroundColor: hslAvatar(u.id),
                        marginLeft: idx > 0 ? -8 : 0,
                        zIndex: 10 - idx,
                      }}
                    >
                      {(u.display_name || u.username).slice(0, 2).toUpperCase()}
                    </MiniAvatar>
                  ))}
                  {selectedAssignees.length > 3 && (
                    <MiniAvatar style={{ backgroundColor: '#ECECE8', marginLeft: -8 }}>
                      <MiniAvatarMore>+{selectedAssignees.length - 3}</MiniAvatarMore>
                    </MiniAvatar>
                  )}
                </AvatarsStack>
              ) : (
                <ParticipantsEmpty>Выбрать...</ParticipantsEmpty>
              )}
              <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
            </ParticipantsRight>
          </ParticipantsRow>

          <Divider />

          <ParticipantsRow onClick={() => setShowWatchersModal(true)}>
            <WatchersLabelWrap>
              <Eye size={14} color="#6F6F73" strokeWidth={2} />
              <ParticipantsLabel>Наблюдатели</ParticipantsLabel>
            </WatchersLabelWrap>
            <ParticipantsRight>
              {selectedWatchers.length > 0 ? (
                <ParticipantsCount>{selectedWatchers.length}</ParticipantsCount>
              ) : (
                <ParticipantsEmpty>Добавить...</ParticipantsEmpty>
              )}
              <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
            </ParticipantsRight>
          </ParticipantsRow>
        </Card>

        {/* ===== КАРТОЧКА 5: Файлы ===== */}
        <Card>
          <CardHeader>
            <CardIconWrap><Paperclip size={18} color="#1F7A52" strokeWidth={2} /></CardIconWrap>
            <CardTitle>Файлы</CardTitle>
          </CardHeader>

          <AddFileBtn>
            <Plus size={18} color="#1F7A52" strokeWidth={2.5} />
            <AddFileText>Прикрепить документ</AddFileText>
          </AddFileBtn>
          <FieldHint>PDF, DOCX, изображения — до 20 МБ</FieldHint>
        </Card>

        <div style={{ height: 40 }} />
      </ScrollContent>

      {/* ===== МОДАЛКИ ===== */}
      {renderUsersModal(showAssigneesModal, () => setShowAssigneesModal(false), selectedAssignees, setSelectedAssignees, 'Исполнители')}
      {renderUsersModal(showWatchersModal, () => setShowWatchersModal(false), selectedWatchers, setSelectedWatchers, 'Наблюдатели')}
      {renderDatePicker(showExecutorPicker, () => setShowExecutorPicker(false), executorDeadline, d => setExecutorDeadline(d), 'Дедлайн выполнения')}
      {renderDatePicker(showReviewerPicker, () => setShowReviewerPicker(false), reviewerDeadline, d => setReviewerDeadline(d), 'Дедлайн проверки')}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};

export default CreateTaskScreen;

// ===== STYLED (один в один с мобильной) =====
const Container = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 0 20px 40px;
`;

const Header = styled.div`
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  padding: 12px 0;
  background: ${theme.colors.background};
  border-bottom: 1px solid #ECECE8;
  margin: 0 -20px 20px;
  padding-left: 16px;
  padding-right: 16px;
`;

const HeaderBackBtn = styled.button`
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px;
  color: #141414;
  &:hover { background: #F3F4F6; }
`;

const HeaderTitleWrap = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
`;

const HeaderTitle = styled.h1`
  font-family: ${theme.fonts.display};
  font-size: 24px;
  font-weight: 900;
  color: #141414;
  letter-spacing: 1px;
`;

const HeaderCreateBtn = styled.button<{ $disabled: boolean }>`
  width: 40px; height: 40px;
  border-radius: 12px;
  background: ${p => (p.$disabled ? '#BDBDBD' : '#1F7A52')};
  display: flex; align-items: center; justify-content: center;
  box-shadow: ${p => (p.$disabled ? 'none' : theme.shadows.button)};
  cursor: ${p => (p.$disabled ? 'not-allowed' : 'pointer')};
`;

const ScrollContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const ErrorBox = styled.div`
  background: ${theme.colors.dangerLight};
  color: #991B1B;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
`;

const Card = styled.div`
  background: #FFFFFF;
  border-radius: 22px;
  padding: 20px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
`;

const CardIconWrap = styled.div`
  width: 32px; height: 32px;
  border-radius: 10px;
  background: #ECFDF5;
  display: flex; align-items: center; justify-content: center;
`;

const CardTitle = styled.div`
  font-size: 17px;
  font-weight: 700;
  color: #141414;
  flex: 1;
`;

const FieldLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #6F6F73;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
`;

const FieldHint = styled.div`
  font-size: 12px;
  color: #BDBDBD;
  font-style: italic;
`;

const Divider = styled.div`
  height: 1px;
  background: #ECECE8;
  margin: 4px 0;
`;

const TextInput = styled.input`
  width: 100%;
  font-size: 16px;
  color: #141414;
  font-weight: 500;
  padding: 8px 0;
  min-height: 36px;
  background: none;
  &::placeholder { color: #BDBDBD; }
`;

const TextArea = styled.textarea`
  width: 100%;
  font-size: 16px;
  color: #141414;
  font-weight: 500;
  padding: 8px 0;
  min-height: 80px;
  resize: vertical;
  background: none;
  &::placeholder { color: #BDBDBD; }
`;

const PriorityRow = styled.div`
  display: flex;
  gap: 10px;
`;

const PriorityBtn = styled.button<{ $active: boolean; $color: string; $bg: string }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  border: 1.5px solid ${p => (p.$active ? p.$color : '#ECECE8')};
  background: ${p => (p.$active ? p.$bg : '#FFFFFF')};
  transition: all 0.2s;
`;

const PriorityDot = styled.div`
  width: 8px; height: 8px;
  border-radius: 4px;
`;

const PriorityLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
`;

const DateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  cursor: pointer;
`;

const DateText = styled.div<{ $placeholder: boolean }>`
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: ${p => (p.$placeholder ? '#BDBDBD' : '#141414')};
`;

const ClearDate = styled.div`
  padding: 4px;
  cursor: pointer;
`;

const ParticipantsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  cursor: pointer;
`;

const ParticipantsLabel = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: #141414;
`;

const Required = styled.span`
  color: #DC2626;
`;

const WatchersLabelWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const ParticipantsRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ParticipantsEmpty = styled.span`
  font-size: 14px;
  color: #BDBDBD;
  font-style: italic;
`;

const ParticipantsCount = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #1F7A52;
`;

const AvatarsStack = styled.div`
  display: flex;
  align-items: center;
`;

const MiniAvatar = styled.div`
  width: 28px; height: 28px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #FFFFFF;
  font-size: 9px;
  font-weight: 700;
  color: #FFFFFF;
`;

const MiniAvatarMore = styled.span`
  font-size: 9px;
  font-weight: 600;
  color: #6F6F73;
`;

const AddFileBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #ECFDF5;
  border-radius: 14px;
  border: 1.5px dashed #D1FAE5;
  &:hover { background: #D1FAE5; }
`;

const AddFileText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #1F7A52;
`;

// ===== MODALS =====
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.2s;
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

const ModalContent = styled.div`
  background: #FFFFFF;
  border-top-left-radius: 28px;
  border-top-right-radius: 28px;
  width: 100%;
  max-width: 520px;
  max-height: 80%;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s;
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #ECECE8;
`;

const ModalTitle = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: #141414;
`;

const ModalCloseBtn = styled.button`
  padding: 6px;
  color: #141414;
`;

const ModalList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const UserRow = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: ${p => (p.$selected ? '#ECFDF5' : '#FAFAF8')};
  border: 1px solid ${p => (p.$selected ? '#1F7A52' : 'transparent')};
  cursor: pointer;
  transition: all 0.15s;
`;

const UserAvatar = styled.div`
  width: 40px; height: 40px;
  border-radius: 20px;
  display: flex; align-items: center; justify-content: center;
  color: #FFFFFF;
  font-weight: 700;
  font-size: 13px;
`;

const UserName = styled.div`
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #141414;
`;

const CheckCircle = styled.div`
  width: 24px; height: 24px;
  border-radius: 12px;
  background: #1F7A52;
  display: flex; align-items: center; justify-content: center;
`;

const EmptyUsers = styled.div`
  text-align: center;
  font-size: 13px;
  color: #6F6F73;
  padding: 24px 0;
`;

const ModalFooter = styled.div`
  padding: 16px;
  border-top: 1px solid #ECECE8;
`;

const ModalDoneBtn = styled.button`
  width: 100%;
  background: #1F7A52;
  padding: 14px;
  border-radius: 16px;
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 700;
  &:hover { background: #155A3B; }
`;

// ===== DATE PICKER =====
const PickerContent = styled.div`
  background: #FFFFFF;
  border-top-left-radius: 28px;
  border-top-right-radius: 28px;
  width: 100%;
  max-width: 420px;
  padding: 24px;
  animation: slideUp 0.25s;
`;

const DateTimeInput = styled.input`
  width: 100%;
  font-size: 16px;
  font-weight: 600;
  color: #141414;
  background: ${theme.colors.background};
  border: 1px solid #ECECE8;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
  &:focus { border-color: #1F7A52; }
`;

const PickerBtns = styled.div`
  display: flex;
  gap: 10px;
`;

const PickerCancel = styled.button`
  flex: 1;
  padding: 14px;
  border-radius: 16px;
  background: #F3F4F6;
  color: #6F6F73;
  font-size: 15px;
  font-weight: 700;
  &:hover { background: #ECECE8; }
`;

const PickerSave = styled.button`
  flex: 1;
  padding: 14px;
  border-radius: 16px;
  background: #1F7A52;
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 700;
  &:hover { background: #155A3B; }
`;
