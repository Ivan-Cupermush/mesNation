import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  ChevronLeft, Flag, CalendarDays, Clock, User, Users,
  MessageCircle, FileText, Trash2, Pencil, History, PlayCircle,
  CheckCircle2, XCircle, Archive, AlertCircle, ChevronRight, Plus,
  Sparkles, Eye, Send, Download, File as FileIcon,
  FileVideo, FileAudio, FileSpreadsheet, FileArchive, ImageIcon,
} from 'lucide-react';
import {
  api, getTask, getTaskHistory, getTaskComments, transitionTask,
  addCanvasPost, updateTaskComment, deleteTaskComment,
  uploadTaskFile, deleteTaskFile,
} from '../services/api';
import type { TaskHistoryItem, TaskCanvasPost } from '../services/api';
import { SERVER_URL } from '../utils';
import { theme } from '../styles/theme';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  new: { label: 'Новая', bg: '#F3F4F6', text: '#6B7280', icon: Sparkles },
  in_progress: { label: 'В работе', bg: '#1F7A52', text: '#FFFFFF', icon: PlayCircle },
  on_review: { label: 'На проверке', bg: '#FEF3C7', text: '#92400E', icon: Eye },
  done: { label: 'Выполнена', bg: '#D1FAE5', text: '#065F46', icon: CheckCircle2 },
  rejected: { label: 'Отклонена', bg: '#7F1D1D', text: '#FFFFFF', icon: XCircle },
  archived: { label: 'В архиве', bg: '#F3F4F6', text: '#9CA3AF', icon: Archive },
  overdue: { label: 'Просрочена', bg: '#7F1D1D', text: '#FFFFFF', icon: AlertCircle },
};

const IMPORTANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  green: { label: 'Низкий приоритет', color: '#065F46', bg: '#D1FAE5' },
  yellow: { label: 'Средний приоритет', color: '#92400E', bg: '#FEF3C7' },
  red: { label: 'Высокий приоритет', color: '#B91C1C', bg: '#FEE2E2' },
};

const getAvatarColor = (id: number) => `hsl(${(id * 47) % 360}, 60%, 65%)`;
const getInitials = (name: string) => (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const getFileIcon = (mime: string | null) => {
  if (!mime) return FileIcon;
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.startsWith('video/')) return FileVideo;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileSpreadsheet;
  if (mime.includes('zip') || mime.includes('rar')) return FileArchive;
  if (mime.includes('pdf') || mime.includes('document')) return FileText;
  return FileIcon;
};

const getFileIconBg = (mime: string | null) => {
  if (!mime) return '#F3F4F6';
  if (mime.startsWith('image/')) return '#DBEAFE';
  if (mime.startsWith('video/')) return '#FCE7F3';
  if (mime.startsWith('audio/')) return '#E0E7FF';
  if (mime.includes('spreadsheet')) return '#D1FAE5';
  if (mime.includes('pdf')) return '#FEE2E2';
  return '#F3F4F6';
};

const TaskDetailScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const taskId = parseInt(id || '0');

  const [task, setTask] = useState<any>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [comments, setComments] = useState<TaskCanvasPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [transitioning, setTransitioning] = useState(false);

  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showAssigneesModal, setShowAssigneesModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const taskData = await getTask(taskId);
      setTask(taskData);

      try { const h = await getTaskHistory(taskId); setHistory(h); } catch { setHistory([]); }
      try { const c = await getTaskComments(taskId); setComments(c); } catch { setComments([]); }
      try { const u = await api.getCurrentUser(); setCurrentUser(u); } catch { setCurrentUser(null); }
    } catch (e: any) {
      alert('Ошибка загрузки: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (taskId) loadData(); }, [taskId]);

  if (loading) return (
    <Container>
      <LoadingWrap><Loader /><LoadingText>Загрузка задачи...</LoadingText></LoadingWrap>
    </Container>
  );

  if (!task) return (
    <Container>
      <Header>
        <BackBtn onClick={() => navigate('/tasks')}><ChevronLeft size={24} strokeWidth={2} /></BackBtn>
        <div style={{ flex: 1, textAlign: 'center' }}>ЗАДАЧА</div>
      </Header>
      <LoadingWrap><LoadingText>Задача не найдена</LoadingText></LoadingWrap>
    </Container>
  );

  const isCreator = task.creator_id === currentUser?.id;
  const isAssignee = task.assignees?.some((a: any) => a.id === currentUser?.id) || false;
  const status = STATUS_CONFIG[task.status_new] || STATUS_CONFIG.new;
  const importance = IMPORTANCE_CONFIG[task.importance] || IMPORTANCE_CONFIG.yellow;
  const StatusIcon = status.icon;

  const handleTransition = async (toStatus: string, comment?: string) => {
    setTransitioning(true);
    try {
      await transitionTask(taskId, toStatus, comment);
      loadData();
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setTransitioning(false);
    }
  };

  const handleTake = () => {
    if (window.confirm('Взять в работу? Задача будет переведена в статус «В работе»')) {
      handleTransition('in_progress');
    }
  };

  const handleSendToReview = () => {
    if (window.confirm('Отправить на проверку? Создатель получит уведомление.')) {
      handleTransition('on_review');
    }
  };

  const handleAccept = () => {
    if (window.confirm('Принять задачу? Задача будет помечена как выполненная.')) {
      handleTransition('done');
    }
  };

  const submitReject = async () => {
    if (!rejectComment.trim()) { alert('Укажите причину отклонения'); return; }
    setTransitioning(true);
    try {
      await transitionTask(taskId, 'rejected', rejectComment.trim());
      setShowRejectModal(false);
      setRejectComment('');
      loadData();
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setTransitioning(false);
    }
  };

  const handleReturnToWork = () => {
    if (window.confirm('Вернуть на доработку? Задача вернётся в статус «В работе»')) {
      handleTransition('in_progress');
    }
  };

  const handleArchive = () => {
    if (window.confirm('Архивировать задачу?')) {
      handleTransition('archived');
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      await addCanvasPost(taskId, newComment.trim());
      setNewComment('');
      loadData();
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setSendingComment(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingText.trim() || editingCommentId === null) return;
    try {
      await updateTaskComment(taskId, editingCommentId, editingText.trim());
      setEditingCommentId(null);
      setEditingText('');
      loadData();
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteComment = (commentId: number) => {
    if (!window.confirm('Удалить комментарий? Это действие нельзя отменить.')) return;
    deleteTaskComment(taskId, commentId).then(loadData).catch(e =>
      alert('Ошибка: ' + (e.response?.data?.error || e.message))
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      await uploadTaskFile(taskId, file);
      loadData();
    } catch (e: any) {
      alert('Ошибка: ' + (e.response?.data?.error || e.message));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = (fileId: number) => {
    if (!window.confirm('Удалить файл?')) return;
    deleteTaskFile(taskId, fileId).then(loadData).catch(e =>
      alert('Ошибка: ' + (e.response?.data?.error || e.message))
    );
  };

  const renderActions = () => {
    if (task.status_new === 'archived') {
      return (
        <ArchiveCard>
          <ArchiveIconWrap><Archive size={22} color="#6F6F73" strokeWidth={2} /></ArchiveIconWrap>
          <div>
            <ArchiveTitle>Задача в архиве</ArchiveTitle>
            <ArchiveSubtitle>Эта задача была заархивирована</ArchiveSubtitle>
          </div>
        </ArchiveCard>
      );
    }

    if (task.status_new === 'new' && isAssignee) {
      return <ActionPrimary onClick={handleTake} disabled={transitioning}><PlayCircle size={20} strokeWidth={2.2} /> Взять в работу</ActionPrimary>;
    }
    if (task.status_new === 'in_progress' && isAssignee) {
      return <ActionPrimary onClick={handleSendToReview} disabled={transitioning}><CheckCircle2 size={20} strokeWidth={2.2} /> Отправить на проверку</ActionPrimary>;
    }
    if (task.status_new === 'on_review' && isCreator) {
      return (
        <DualActions>
          <ActionHalfAccept onClick={handleAccept} disabled={transitioning}><CheckCircle2 size={20} strokeWidth={2.2} /> Принять</ActionHalfAccept>
          <ActionHalfReject onClick={() => setShowRejectModal(true)} disabled={transitioning}><XCircle size={20} strokeWidth={2.2} /> Отклонить</ActionHalfReject>
        </DualActions>
      );
    }
    if (task.status_new === 'rejected' && isAssignee) {
      return <ActionPrimary onClick={handleReturnToWork} disabled={transitioning}><PlayCircle size={20} strokeWidth={2.2} /> Вернуть на доработку</ActionPrimary>;
    }
    if (task.status_new === 'done' && isCreator) {
      return <ActionGhost onClick={handleArchive} disabled={transitioning}><Archive size={20} strokeWidth={2} /> Архивировать</ActionGhost>;
    }
    return (
      <NoActionsBox>
        <NoActionsText>Нет доступных действий для этой задачи</NoActionsText>
      </NoActionsBox>
    );
  };

  return (
    <Container>
      <Header>
        <BackBtn onClick={() => navigate('/tasks')}><ChevronLeft size={24} strokeWidth={2} /></BackBtn>
        <HeaderCenter><HeaderLabel>ЗАДАЧА</HeaderLabel></HeaderCenter>
        <div style={{ width: 40 }} />
      </Header>

      <ScrollContent>
        {/* ===== HERO CARD ===== */}
        <HeroCard>
          <HeroBadges>
            <StatusBadge style={{ backgroundColor: status.bg }}>
              <StatusIcon size={13} color={status.text} strokeWidth={2.4} />
              <StatusBadgeText style={{ color: status.text }}>{status.label}</StatusBadgeText>
            </StatusBadge>
            <ImportanceBadge style={{ backgroundColor: importance.bg }}>
              <Flag size={13} color={importance.color} strokeWidth={2.4} />
              <ImportanceBadgeText style={{ color: importance.color }}>{importance.label}</ImportanceBadgeText>
            </ImportanceBadge>
          </HeroBadges>
          <HeroTitle>{task.title}</HeroTitle>
          {task.description ? (
            <HeroDescription>{task.description}</HeroDescription>
          ) : (
            <HeroDescriptionMuted>Описание отсутствует</HeroDescriptionMuted>
          )}
        </HeroCard>

        {/* ===== INFO GRID 2×2 ===== */}
        <InfoGrid>
          <InfoCard>
            <InfoIconWrap><CalendarDays size={18} color="#1F7A52" strokeWidth={2} /></InfoIconWrap>
            <InfoLabel>Дедлайн</InfoLabel>
            <InfoValue>{formatDate(task.hard_deadline || task.executor_deadline) || '—'}</InfoValue>
          </InfoCard>
          <InfoCard>
            <InfoIconWrap><Users size={18} color="#1F7A52" strokeWidth={2} /></InfoIconWrap>
            <InfoLabel>Исполнители ({(task.assignees || []).length})</InfoLabel>
            <InfoValueRow onClick={() => setShowAssigneesModal(true)} style={{ cursor: 'pointer' }}>
              <AssigneesAvatars>
                {(task.assignees || []).slice(0, 3).map((a: any, idx: number) => (
                  <MiniAvatar key={a.id} style={{ backgroundColor: getAvatarColor(a.id), marginLeft: idx > 0 ? -8 : 0 }}>
                    {getInitials(a.display_name || a.username)}
                  </MiniAvatar>
                ))}
                {(task.assignees || []).length > 3 && (
                  <MiniAvatar style={{ backgroundColor: '#ECECE8', marginLeft: -8 }}>
                    +{(task.assignees || []).length - 3}
                  </MiniAvatar>
                )}
              </AssigneesAvatars>
              <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
            </InfoValueRow>
          </InfoCard>
          <InfoCard>
            <InfoIconWrap><User size={18} color="#1F7A52" strokeWidth={2} /></InfoIconWrap>
            <InfoLabel>Создатель</InfoLabel>
            <InfoValue>{task.creator?.display_name || task.creator?.username || '—'}</InfoValue>
          </InfoCard>
          <InfoCard>
            <InfoIconWrap><Eye size={18} color="#1F7A52" strokeWidth={2} /></InfoIconWrap>
            <InfoLabel>Наблюдатели</InfoLabel>
            <InfoValue>{(task.watchers || []).length > 0 ? `${(task.watchers || []).length} чел.` : <InfoValueMuted>Нет</InfoValueMuted>}</InfoValue>
          </InfoCard>
        </InfoGrid>

        {/* ===== REVIEW DEADLINE ===== */}
        {task.status_new === 'on_review' && task.reviewer_deadline && (
          <ReviewDeadlineCard>
            <Clock size={20} color="#92400E" strokeWidth={2} />
            <div>
              <ReviewDeadlineLabel>Дедлайн проверки</ReviewDeadlineLabel>
              <ReviewDeadlineValue>{formatDateTime(task.reviewer_deadline)}</ReviewDeadlineValue>
            </div>
          </ReviewDeadlineCard>
        )}

        {/* ===== ACTIONS ===== */}
        <Section>
          {renderActions()}
        </Section>

        {/* ===== FILES ===== */}
        <Section>
          <SectionHeader>
            <SectionTitle>ФАЙЛЫ</SectionTitle>
            <SectionBadge><SectionBadgeText>{(task.files || []).length}</SectionBadgeText></SectionBadge>
          </SectionHeader>

          {(task.files || []).map((f: any) => {
            const FileIco = getFileIcon(f.mime_type);
            const bg = getFileIconBg(f.mime_type);
            return (
              <FileCard key={f.id}>
                <FileIconWrap style={{ backgroundColor: bg }}>
                  <FileIco size={22} color="#141414" strokeWidth={1.8} />
                </FileIconWrap>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FileName>{f.file_name}</FileName>
                  <FileMeta>
                    {f.file_size ? `${(f.file_size / 1024).toFixed(1)} КБ` : '—'}
                    {f.mime_type && ` · ${f.mime_type.split('/')[1] || ''}`}
                  </FileMeta>
                </div>
                <a href={`${SERVER_URL}${f.file_url}`} target="_blank" rel="noreferrer" style={{ padding: 8 }}>
                  <Download size={18} color="#1F7A52" strokeWidth={2} />
                </a>
                <FileDeleteBtn onClick={() => handleDeleteFile(f.id)}>
                  <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                </FileDeleteBtn>
              </FileCard>
            );
          })}

          <AttachBtn onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
            {uploadingFile ? <Loader /> : <><Plus size={18} color="#1F7A52" strokeWidth={2.5} /> Прикрепить файл</>}
          </AttachBtn>
          <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />
        </Section>

        {/* ===== TIMELINE ===== */}
        <Section>
          <SectionHeader>
            <SectionTitle>ИСТОРИЯ</SectionTitle>
            <SectionBadge><SectionBadgeText>{history.length}</SectionBadgeText></SectionBadge>
          </SectionHeader>

          {history.length === 0 ? (
            <EmptyCard>
              <History size={28} color="#BDBDBD" strokeWidth={1.5} />
              <EmptyTitle>История пуста</EmptyTitle>
              <EmptySubtitle>Здесь будут все изменения статуса</EmptySubtitle>
            </EmptyCard>
          ) : (
            <Timeline>
              {history.map((h, idx) => {
                const fromSt = STATUS_CONFIG[h.from_status || ''] || null;
                const toSt = STATUS_CONFIG[h.to_status] || STATUS_CONFIG.new;
                const ToIcon = toSt.icon;
                const FromIcon = fromSt?.icon;
                return (
                  <TimelineItem key={h.id}>
                    <TimelineLeft>
                      <TimelineDot style={{ backgroundColor: toSt.bg }}>
                        <ToIcon size={16} color={toSt.text} strokeWidth={2.4} />
                      </TimelineDot>
                      {idx < history.length - 1 && <TimelineLine />}
                    </TimelineLeft>
                    <TimelineContent>
                      <TimelineHeader>
                        <TimelineAvatarWrap>
                          <TimelineAvatar style={{ backgroundColor: getAvatarColor(h.changed_by) }}>
                            {getInitials(h.changed_by_name)}
                          </TimelineAvatar>
                          <TimelineUser>{h.changed_by_name || h.changed_by_username}</TimelineUser>
                        </TimelineAvatarWrap>
                        <TimelineDate>{formatDateTime(h.created_at)}</TimelineDate>
                      </TimelineHeader>
                      <TimelineTransition>
                        {fromSt && FromIcon && (
                          <TimelineStatusPill style={{ backgroundColor: fromSt.bg }}>
                            <FromIcon size={11} color={fromSt.text} strokeWidth={2.4} />
                            <TimelineStatusText style={{ color: fromSt.text }}>{fromSt.label}</TimelineStatusText>
                          </TimelineStatusPill>
                        )}
                        <span style={{ color: '#BDBDBD', fontSize: 12 }}>→</span>
                        <TimelineStatusPill style={{ backgroundColor: toSt.bg }}>
                          <ToIcon size={11} color={toSt.text} strokeWidth={2.4} />
                          <TimelineStatusText style={{ color: toSt.text }}>{toSt.label}</TimelineStatusText>
                        </TimelineStatusPill>
                      </TimelineTransition>
                      {h.comment && (
                        <TimelineComment>
                          <MessageCircle size={14} color="#6F6F73" strokeWidth={2} />
                          <TimelineCommentText>{h.comment}</TimelineCommentText>
                        </TimelineComment>
                      )}
                    </TimelineContent>
                  </TimelineItem>
                );
              })}
            </Timeline>
          )}
        </Section>

        {/* ===== COMMENTS ===== */}
        <Section>
          <SectionHeader>
            <SectionTitle>ОБСУЖДЕНИЕ</SectionTitle>
            <SectionBadge><SectionBadgeText>{comments.length}</SectionBadgeText></SectionBadge>
          </SectionHeader>

          {comments.length === 0 ? (
            <EmptyCard>
              <MessageCircle size={28} color="#BDBDBD" strokeWidth={1.5} />
              <EmptyTitle>Пока нет комментариев</EmptyTitle>
              <EmptySubtitle>Начните обсуждение задачи</EmptySubtitle>
            </EmptyCard>
          ) : (
            comments.map(c => {
              const isOwn = c.author_id === currentUser?.id;
              const isCommentCreator = c.author_id === task.creator_id;
              const isCommentAssignee = task.assignees?.some((a: any) => a.id === c.author_id);
              let roleColor = '#6B7280', roleLabel = '', roleBg = '#F3F4F6';
              if (isCommentCreator) { roleColor = '#1F7A52'; roleLabel = 'Создатель'; roleBg = '#ECFDF5'; }
              else if (isCommentAssignee) { roleColor = '#3B82F6'; roleLabel = 'Исполнитель'; roleBg = '#DBEAFE'; }

              return (
                <CommentCard key={c.id}>
                  <CommentHeader>
                    <CommentAvatar style={{ backgroundColor: getAvatarColor(c.author_id) }}>
                      {getInitials(c.display_name)}
                    </CommentAvatar>
                    <div style={{ flex: 1 }}>
                      <CommentNameRow>
                        <CommentAuthor>{c.display_name}</CommentAuthor>
                        {roleLabel && (
                          <RoleBadge style={{ backgroundColor: roleBg }}>
                            <RoleBadgeText style={{ color: roleColor }}>{roleLabel}</RoleBadgeText>
                          </RoleBadge>
                        )}
                      </CommentNameRow>
                      <CommentDate>{formatDateTime(c.created_at)}{c.is_edited ? ' (ред.)' : ''}</CommentDate>
                    </div>
                    {isOwn && editingCommentId !== c.id && (
                      <CommentMenu>
                        <CommentMenuBtn onClick={() => { setEditingCommentId(c.id); setEditingText(c.content); }}>
                          <Pencil size={14} color="#6F6F73" strokeWidth={2} />
                        </CommentMenuBtn>
                        <CommentMenuBtn onClick={() => handleDeleteComment(c.id)}>
                          <Trash2 size={14} color="#DC2626" strokeWidth={2} />
                        </CommentMenuBtn>
                      </CommentMenu>
                    )}
                  </CommentHeader>

                  {editingCommentId === c.id ? (
                    <EditWrap>
                      <EditInput value={editingText} onChange={e => setEditingText(e.target.value)} />
                      <EditButtons>
                        <EditBtnCancel onClick={() => { setEditingCommentId(null); setEditingText(''); }}>Отмена</EditBtnCancel>
                        <EditBtnSave onClick={handleSaveEdit}>Сохранить</EditBtnSave>
                      </EditButtons>
                    </EditWrap>
                  ) : (
                    <CommentText>{c.content}</CommentText>
                  )}
                </CommentCard>
              );
            })
          )}
        </Section>

        <div style={{ height: 80 }} />
      </ScrollContent>

      {/* ===== INPUT BAR ===== */}
      <InputBar>
        <CommentInput
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Напишите комментарий..."
          maxLength={2000}
        />
        <SendBtn
          $enabled={!!newComment.trim() && !sendingComment}
          onClick={handleSendComment}
          disabled={!newComment.trim() || sendingComment}
        >
          {sendingComment ? <Loader size={18} color="#fff" /> : <Send size={18} color="#fff" strokeWidth={2.5} />}
        </SendBtn>
      </InputBar>

      {/* ===== MODAL: Assignees ===== */}
      {showAssigneesModal && (
        <ModalOverlay onClick={() => setShowAssigneesModal(false)}>
          <ModalSheet onClick={e => e.stopPropagation()}>
            <ModalHandle />
            <ModalSheetTitle>ИСПОЛНИТЕЛИ</ModalSheetTitle>
            <ModalList>
              {(task.assignees || []).map((a: any) => (
                <AssigneeRow key={a.id} onClick={() => { setShowAssigneesModal(false); navigate(`/profile/${a.id}`); }}>
                  <AssigneeAvatar style={{ backgroundColor: getAvatarColor(a.id) }}>
                    {getInitials(a.display_name)}
                  </AssigneeAvatar>
                  <div style={{ flex: 1 }}>
                    <AssigneeName>{a.display_name || a.username}</AssigneeName>
                    <AssigneeUsername>@{a.username}</AssigneeUsername>
                  </div>
                  <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
                </AssigneeRow>
              ))}
            </ModalList>
          </ModalSheet>
        </ModalOverlay>
      )}

      {/* ===== MODAL: Reject ===== */}
      {showRejectModal && (
        <ModalOverlay onClick={() => setShowRejectModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHandle />
            <ModalHeader>
              <XCircle size={24} color="#DC2626" strokeWidth={2} />
              <ModalTitle>Отклонить задачу</ModalTitle>
            </ModalHeader>
            <ModalSubtitle>Укажите причину отклонения. Исполнитель увидит этот комментарий.</ModalSubtitle>
            <RejectInput
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="Например: Не соответствует ТЗ, нужно переделать..."
              autoFocus
            />
            <ModalButtons>
              <ModalBtnCancel onClick={() => { setShowRejectModal(false); setRejectComment(''); }}>Отмена</ModalBtnCancel>
              <ModalBtnReject
                $enabled={!!rejectComment.trim() && !transitioning}
                onClick={submitReject}
                disabled={!rejectComment.trim() || transitioning}
              >
                {transitioning ? 'Отклоняем...' : 'Отклонить'}
              </ModalBtnReject>
            </ModalButtons>
          </ModalContent>
        </ModalOverlay>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Container>
  );
};

export default TaskDetailScreen;

// ===== STYLED =====
const Container = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 0 20px;
`;

const Header = styled.div`
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0;
  background: ${theme.colors.background};
  border-bottom: 1px solid #ECECE8;
`;

const BackBtn = styled.button`
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px; color: #141414;
  &:hover { background: #F3F4F6; }
`;

const HeaderCenter = styled.div`display: flex; align-items: center; justify-content: center; flex: 1;`;

const HeaderLabel = styled.div`
  font-family: ${theme.fonts.display};
  font-size: 20px; font-weight: 900;
  color: #141414; letter-spacing: 1.5px;
`;

const LoadingWrap = styled.div`
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 80px 0;
`;

const LoadingText = styled.div`font-size: 14px; color: #6F6F73; margin-top: 12px; font-weight: 500;`;

const Loader = styled.div<{ size?: number }>`
  width: ${p => p.size || 40}px;
  height: ${p => p.size || 40}px;
  border: 3px solid #F3F4F6;
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
`;

const ScrollContent = styled.div`
  display: flex; flex-direction: column; gap: 20px;
  padding: 20px 0 40px;
`;

const HeroCard = styled.div`
  background: #FFFFFF;
  border-radius: 22px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.04);
  display: flex; flex-direction: column; gap: 16px;
`;

const HeroBadges = styled.div`
  display: flex; gap: 8px; flex-wrap: wrap;
`;

const StatusBadge = styled.div`
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 999px;
`;

const StatusBadgeText = styled.span`font-size: 12px; font-weight: 600;`;

const ImportanceBadge = styled.div`
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 999px;
`;

const ImportanceBadgeText = styled.span`font-size: 12px; font-weight: 600;`;

const HeroTitle = styled.h1`
  font-family: ${theme.fonts.display};
  font-size: 40px; font-weight: 900;
  color: #141414; letter-spacing: -0.5px; line-height: 44px;
  margin: 0;
`;

const HeroDescription = styled.div`font-size: 15px; color: #141414; line-height: 22px; font-weight: 500;`;
const HeroDescriptionMuted = styled.div`font-size: 14px; color: #BDBDBD; font-style: italic;`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
`;

const InfoCard = styled.div`
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
  display: flex; flex-direction: column; gap: 10px;
`;

const InfoIconWrap = styled.div`
  width: 36px; height: 36px;
  border-radius: 10px;
  background: #ECFDF5;
  display: flex; align-items: center; justify-content: center;
`;

const InfoLabel = styled.div`
  font-size: 11px; font-weight: 600;
  color: #6F6F73;
  text-transform: uppercase; letter-spacing: 0.5px;
`;

const InfoValue = styled.div`font-size: 14px; font-weight: 700; color: #141414;`;
const InfoValueRow = styled.div`display: flex; align-items: center;`;
const InfoValueMuted = styled.span`font-size: 14px; color: #BDBDBD; font-weight: 600;`;

const AssigneesAvatars = styled.div`display: flex; align-items: center;`;

const MiniAvatar = styled.div`
  width: 28px; height: 28px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #FFFFFF;
  font-size: 9px; font-weight: 700; color: #FFFFFF;
`;

const ReviewDeadlineCard = styled.div`
  display: flex; align-items: center; gap: 12px;
  padding: 14px;
  background: #FEF3C7;
  border-radius: 16px;
  border: 1px solid #FDE68A;
`;

const ReviewDeadlineLabel = styled.div`
  font-size: 11px; font-weight: 600;
  color: #92400E;
  text-transform: uppercase; letter-spacing: 0.5px;
`;

const ReviewDeadlineValue = styled.div`font-size: 13px; font-weight: 700; color: #92400E; margin-top: 2px;`;

const Section = styled.div`display: flex; flex-direction: column; gap: 12px;`;

const SectionHeader = styled.div`display: flex; align-items: center; gap: 8px;`;

const SectionTitle = styled.div`
  font-family: ${theme.fonts.display};
  font-size: 22px; font-weight: 900;
  color: #141414; letter-spacing: 1px;
`;

const SectionBadge = styled.div`
  background: #ECECE8;
  padding: 2px 8px;
  border-radius: 999px;
`;

const SectionBadgeText = styled.span`font-size: 11px; font-weight: 700; color: #6F6F73;`;

const EmptyCard = styled.div`
  background: #FFFFFF;
  border-radius: 18px;
  padding: 32px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
`;

const EmptyTitle = styled.div`font-size: 14px; font-weight: 600; color: #141414; margin-top: 4px;`;
const EmptySubtitle = styled.div`font-size: 12px; color: #6F6F73; text-align: center;`;

// ===== ACTIONS =====
const ActionPrimary = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: #1F7A52;
  padding: 16px;
  border-radius: 18px;
  color: #FFFFFF;
  font-size: 15px; font-weight: 700;
  box-shadow: 0 4px 12px rgba(31,122,82,0.2);
  &:hover { background: #155A3B; }
  &:disabled { background: #BDBDBD; cursor: not-allowed; }
`;

const DualActions = styled.div`display: flex; gap: 10px;`;

const ActionHalfAccept = styled.button`
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #1F7A52;
  padding: 16px; border-radius: 18px;
  color: #FFFFFF; font-size: 14px; font-weight: 700;
  &:hover { background: #155A3B; }
  &:disabled { background: #BDBDBD; cursor: not-allowed; }
`;

const ActionHalfReject = styled.button`
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #7F1D1D;
  padding: 16px; border-radius: 18px;
  color: #FFFFFF; font-size: 14px; font-weight: 700;
  &:hover { background: #991B1B; }
  &:disabled { background: #BDBDBD; cursor: not-allowed; }
`;

const ActionGhost = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: #FFFFFF;
  padding: 16px; border-radius: 18px;
  border: 1px solid #ECECE8;
  color: #6F6F73;
  font-size: 15px; font-weight: 600;
  &:hover { background: #FAFAF8; }
  &:disabled { cursor: not-allowed; }
`;

const NoActionsBox = styled.div`
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: #FFFFFF;
  border-radius: 18px;
  border: 1px solid #ECECE8;
`;

const NoActionsText = styled.div`
  font-size: 13px; color: #BDBDBD; font-weight: 500; text-align: center; flex: 1;
`;

const ArchiveCard = styled.div`
  display: flex; align-items: center; gap: 14px;
  background: #FFFFFF;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid #ECECE8;
`;

const ArchiveIconWrap = styled.div`
  width: 44px; height: 44px;
  border-radius: 12px;
  background: #F3F4F6;
  display: flex; align-items: center; justify-content: center;
`;

const ArchiveTitle = styled.div`font-size: 15px; font-weight: 700; color: #141414; margin-bottom: 2px;`;
const ArchiveSubtitle = styled.div`font-size: 12px; color: #6F6F73; font-weight: 500;`;

// ===== FILES =====
const FileCard = styled.div`
  display: flex; align-items: center; gap: 14px;
  background: #FFFFFF;
  border-radius: 18px;
  padding: 14px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
`;

const FileIconWrap = styled.div`
  width: 48px; height: 48px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
`;

const FileName = styled.div`font-size: 14px; font-weight: 600; color: #141414; margin-bottom: 2px;`;
const FileMeta = styled.div`font-size: 12px; color: #6F6F73; font-weight: 500;`;
const FileDeleteBtn = styled.button`padding: 8px; &:hover { background: #FEE2E2; border-radius: 8px; }`;

const AttachBtn = styled.button`
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px;
  border-radius: 16px;
  background: #ECFDF5;
  border: 1.5px dashed #D1FAE5;
  color: #1F7A52;
  font-size: 14px; font-weight: 600;
  &:hover { background: #D1FAE5; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// ===== TIMELINE =====
const Timeline = styled.div`display: flex; flex-direction: column;`;

const TimelineItem = styled.div`display: flex; gap: 12px;`;

const TimelineLeft = styled.div`width: 32px; display: flex; flex-direction: column; align-items: center;`;

const TimelineDot = styled.div`
  width: 32px; height: 32px;
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
`;

const TimelineLine = styled.div`
  width: 2px; flex: 1;
  background: #ECECE8;
  margin: 4px 0;
  min-height: 20px;
`;

const TimelineContent = styled.div`
  flex: 1;
  background: #FFFFFF;
  border-radius: 16px;
  padding: 14px;
  margin-bottom: 12px;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
`;

const TimelineHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center;
`;

const TimelineAvatarWrap = styled.div`display: flex; align-items: center; gap: 8px;`;

const TimelineAvatar = styled.div`
  width: 24px; height: 24px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; color: #FFFFFF;
`;

const TimelineUser = styled.span`font-size: 13px; font-weight: 600; color: #141414;`;
const TimelineDate = styled.span`font-size: 11px; color: #6F6F73; font-weight: 500;`;

const TimelineTransition = styled.div`
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
`;

const TimelineStatusPill = styled.div`
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
`;

const TimelineStatusText = styled.span`font-size: 11px; font-weight: 600;`;

const TimelineComment = styled.div`
  display: flex; gap: 8px;
  padding: 10px;
  background: #FAFAF8;
  border-radius: 10px;
`;

const TimelineCommentText = styled.div`
  font-size: 13px; color: #141414;
  line-height: 18px; flex: 1; font-weight: 500;
`;

// ===== COMMENTS =====
const CommentCard = styled.div`
  background: #FFFFFF;
  border-radius: 18px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
  margin-bottom: 10px;
`;

const CommentHeader = styled.div`
  display: flex; gap: 10px; align-items: flex-start;
`;

const CommentAvatar = styled.div`
  width: 36px; height: 36px;
  border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #FFFFFF;
  flex-shrink: 0;
`;

const CommentNameRow = styled.div`
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
`;

const CommentAuthor = styled.span`font-size: 14px; font-weight: 700; color: #141414;`;

const RoleBadge = styled.div`
  padding: 2px 8px;
  border-radius: 999px;
`;

const RoleBadgeText = styled.span`font-size: 10px; font-weight: 600;`;

const CommentDate = styled.div`font-size: 11px; color: #6F6F73; margin-top: 2px; font-weight: 500;`;

const CommentMenu = styled.div`display: flex; gap: 4px;`;

const CommentMenuBtn = styled.button`
  width: 28px; height: 28px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: #F3F4F6; }
`;

const CommentText = styled.div`
  font-size: 14px; color: #141414;
  line-height: 20px; font-weight: 500;
  padding-left: 46px;
`;

const EditWrap = styled.div`display: flex; flex-direction: column; gap: 8px; padding-left: 46px;`;

const EditInput = styled.textarea`
  padding: 12px;
  border-radius: 12px;
  background: #FAFAF8;
  border: 1px solid #ECECE8;
  font-size: 14px;
  min-height: 80px;
  color: #141414;
  resize: vertical;
`;

const EditButtons = styled.div`display: flex; gap: 8px; justify-content: flex-end;`;

const EditBtnCancel = styled.button`
  padding: 8px 16px;
  border-radius: 10px;
  background: #F3F4F6;
  font-size: 13px; font-weight: 600; color: #6F6F73;
  &:hover { background: #ECECE8; }
`;

const EditBtnSave = styled.button`
  padding: 8px 16px;
  border-radius: 10px;
  background: #1F7A52;
  font-size: 13px; font-weight: 600; color: #FFFFFF;
  &:hover { background: #155A3B; }
`;

// ===== INPUT BAR =====
const InputBar = styled.div`
  position: sticky; bottom: 0;
  display: flex; align-items: flex-end; gap: 8px;
  padding: 12px 0;
  background: ${theme.colors.background};
  border-top: 1px solid #ECECE8;
  margin: 0 -20px;
  padding-left: 20px;
  padding-right: 20px;
`;

const CommentInput = styled.textarea`
  flex: 1;
  background: #FAFAF8;
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 14px;
  color: #141414;
  max-height: 100px;
  border: 1px solid #ECECE8;
  font-weight: 500;
  resize: none;
  min-height: 44px;
  &::placeholder { color: #BDBDBD; }
`;

const SendBtn = styled.button<{ $enabled: boolean }>`
  width: 44px; height: 44px;
  border-radius: 22px;
  background: ${p => (p.$enabled ? '#1F7A52' : '#ECECE8')};
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  &:disabled { cursor: not-allowed; }
`;

// ===== MODALS =====
const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: flex-end; justify-content: center;
  z-index: 200;
  animation: fadeIn 0.2s;
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

const ModalSheet = styled.div`
  background: #FFFFFF;
  border-top-left-radius: 28px;
  border-top-right-radius: 28px;
  padding: 20px;
  padding-bottom: 32px;
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex; flex-direction: column;
  animation: slideUp 0.25s;
  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
`;

const ModalHandle = styled.div`
  width: 40px; height: 4px;
  background: #ECECE8;
  border-radius: 2px;
  align-self: center;
  margin-bottom: 12px;
`;

const ModalSheetTitle = styled.div`
  font-family: ${theme.fonts.display};
  font-size: 22px; font-weight: 900;
  color: #141414; letter-spacing: 1px;
  margin-bottom: 12px;
`;

const ModalList = styled.div`
  overflow-y: auto;
  max-height: 420px;
`;

const AssigneeRow = styled.div`
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #F4F4F5;
  cursor: pointer;
  &:hover { background: #FAFAF8; }
`;

const AssigneeAvatar = styled.div`
  width: 44px; height: 44px;
  border-radius: 22px;
  display: flex; align-items: center; justify-content: center;
  color: #FFFFFF; font-weight: 700; font-size: 14px;
`;

const AssigneeName = styled.div`font-size: 15px; font-weight: 700; color: #141414;`;
const AssigneeUsername = styled.div`font-size: 12px; color: #6F6F73; margin-top: 1px;`;

const ModalContent = styled.div`
  background: #FFFFFF;
  border-top-left-radius: 28px;
  border-top-right-radius: 28px;
  padding: 24px;
  padding-bottom: 32px;
  width: 100%;
  max-width: 520px;
  display: flex; flex-direction: column; gap: 16px;
  animation: slideUp 0.25s;
`;

const ModalHeader = styled.div`
  display: flex; align-items: center; gap: 12px;
`;

const ModalTitle = styled.div`
  font-family: ${theme.fonts.display};
  font-size: 26px; font-weight: 900;
  color: #141414; letter-spacing: 0.5px;
`;

const ModalSubtitle = styled.div`
  font-size: 13px; color: #6F6F73;
  line-height: 18px; font-weight: 500;
`;

const RejectInput = styled.textarea`
  padding: 14px;
  border-radius: 14px;
  background: #FAFAF8;
  border: 1px solid #ECECE8;
  font-size: 14px;
  min-height: 100px;
  color: #141414;
  font-weight: 500;
  resize: vertical;
  &::placeholder { color: #BDBDBD; }
`;

const ModalButtons = styled.div`display: flex; gap: 10px;`;

const ModalBtnCancel = styled.button`
  flex: 1;
  padding: 16px;
  border-radius: 16px;
  background: #F3F4F6;
  font-size: 15px; font-weight: 600; color: #141414;
  &:hover { background: #ECECE8; }
`;

const ModalBtnReject = styled.button<{ $enabled: boolean }>`
  flex: 1;
  padding: 16px;
  border-radius: 16px;
  background: ${p => (p.$enabled ? '#7F1D1D' : '#ECECE8')};
  color: #FFFFFF;
  font-size: 15px; font-weight: 700;
  &:hover { background: ${p => (p.$enabled ? '#991B1B' : '#ECECE8')}; }
  &:disabled { cursor: not-allowed; }
`;
