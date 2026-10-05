import React, { memo, useRef } from 'react';
import { View, Text, TouchableOpacity, Pressable, Animated, PanResponder, Image, useWindowDimensions } from 'react-native';
import { Check, CheckCheck, Clock, AlertCircle, FileText, CornerUpLeft, Download } from 'lucide-react-native';
import { SERVER_URL } from '../../config';
import PollBubble from '../PollBubble';
import NoteShareBubble from '../NoteShareBubble';
import MediaAlbum from './MediaAlbum';
import { useTheme } from '../../theme/ThemeContext';
import { C, fileBadge, formatSize, formatTime, hashColor, initials, isUnlistened, messagePreview } from './chatUtils';
import UploadProgress from './UploadProgress';
import VoiceBubble from './voice/VoiceBubble';
import VideoNoteBubble from './voice/VideoNoteBubble';

import { T, themed } from '../../theme/runtime';
import { withAlpha } from '../../theme/palettes';
/**
 * Одна строка ленты: служебное сообщение, обычный пузырь или альбом.
 * Пузыри одного отправителя подряд «склеиваются»: имя показывается у
 * первого, аватар и «хвостик» — у последнего (как в Telegram).
 */

export type Row =
  | { type: 'divider'; key: string; label: string }
  | { type: 'message'; key: string; msg: any }
  | { type: 'album'; key: string; msgs: any[] };

interface Props {
  row: Exclude<Row, { type: 'divider' }>;
  mine: boolean;
  showName: boolean;
  showAvatar: boolean; // последний в серии (хвостик + аватар в группе)
  isGroup: boolean;
  senderName: string;
  senderAvatar?: string | null;
  replied?: any | null;
  repliedName?: string;
  peerLastReadId: number;
  currentUserId: number;
  highlighted?: boolean;
  onLongPress: (row: Props['row']) => void;
  onOpenMedia: (msg: any) => void;
  onOpenFile: (msg: any) => void;
  onPressReply: (msg: any) => void;
  onSwipeReply: (msg: any) => void;
  onRetry: (msg: any) => void;
  onCancelUpload?: (msg: any) => void;
  onNoteAccepted: (messageId: number, noteId: number) => void;
  onPressSender?: (userId: number) => void;
  /** Режим выделения (как в Telegram): нажатие отмечает сообщение. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (row: Props['row']) => void;
  onPlayVoice?: (msg: any) => void;
  onSeekVoice?: (msg: any, ratio: number) => void;
  onVideoNoteStarted?: (msg: any) => void;
}

function Ticks({ msg, peerLastReadId, onMedia }: { msg: any; peerLastReadId: number; onMedia?: boolean }) {
  const color = onMedia ? T.onAccent : C.textOutMuted;
  if (msg.status === 'sending') return <Clock size={12} color={color} style={styles.tick} />;
  if (msg.status === 'failed') return <AlertCircle size={13} color="#FECACA" style={styles.tick} />;
  const read = typeof msg.id === 'number' && msg.id <= peerLastReadId;
  return read ? (
    <CheckCheck size={15} color={onMedia ? T.onAccent : C.readTick} style={styles.tick} />
  ) : (
    <Check size={14} color={color} style={styles.tick} />
  );
}

function MessageRow(props: Props) {
  const { row, mine, showName, showAvatar, isGroup, senderName, senderAvatar, replied, repliedName, peerLastReadId, currentUserId } = props;
  const { width: screenW } = useWindowDimensions();
  const { messageFontSize, bubbleRadius } = useTheme();
  const msgs = row.type === 'album' ? row.msgs : [row.msg];
  const main = row.type === 'album' ? row.msgs.find((m) => m.text) || row.msgs[0] : row.msg;
  const showSideAvatar = isGroup && !mine;
  const maxBubble = Math.min(screenW * 0.78, 420) - (showSideAvatar ? 40 : 0);
  const mediaW = Math.min(screenW * 0.72, 320) - (showSideAvatar ? 36 : 0);

  // ===== Свайп влево — ответить =====
  const dx = useRef(new Animated.Value(0)).current;
  const propsRef = useRef(props);
  propsRef.current = props;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !propsRef.current.selecting && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => dx.setValue(Math.max(-80, Math.min(0, g.dx))),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) propsRef.current.onSwipeReply(main);
        Animated.spring(dx, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;

  const fg = mine ? T.myMessageText : C.text;
  const sub = mine ? C.textOutMuted : C.textMuted;
  const isPoll = !!main.poll;
  const isNote = !!main.note_share;
  const isVoice = main.media_kind === 'voice' && !!main.file_url;
  const isVideoNote = main.media_kind === 'video_note' && !!main.file_url;
  const unlistened = isUnlistened(main, currentUserId);
  // Группа документов (несколько файлов одним сообщением, как в Telegram).
  const isDocGroup = row.type === 'album' && msgs.every((m) => m.media_kind === 'file');
  const isVisual =
    !isPoll && !isDocGroup && (row.type === 'album' || main.media_kind === 'photo' || main.media_kind === 'video' || (!main.media_kind && main.thumb_url));
  const isFile = !isPoll && !isVisual && !isVoice && !isVideoNote && !!main.file_url;
  const pollMediaVisual = isPoll && !!main.file_url && (main.media_kind === 'photo' || main.media_kind === 'video');
  const pollMediaFile = isPoll && !!main.file_url && !pollMediaVisual;
  const caption = main.text && !isNote ? main.text : '';
  const mediaOnly = isVisual && !caption && !main.reply_to_message_id && !main.forwarded_from_user_id && !(showName && isGroup && !mine);

  const meta = (onMedia = false) => (
    <View style={[styles.meta, onMedia && styles.metaOnMedia]}>
      {main.edited_at ? <Text style={[styles.metaText, { color: onMedia ? T.onAccent : sub }]}>изм. </Text> : null}
      <Text style={[styles.metaText, { color: onMedia ? T.onAccent : sub }]}>{formatTime(main.created_at)}</Text>
      {mine && <Ticks msg={main} peerLastReadId={peerLastReadId} onMedia={onMedia} />}
    </View>
  );

  // Скругление настраивается («Углы сообщений»); внутренние углы серии и «хвостик» — меньше.
  const R = bubbleRadius;
  const inner = Math.max(4, Math.round(R / 3));
  const corners = {
    borderTopLeftRadius: !mine && !showName ? inner : R,
    borderTopRightRadius: mine && !showName ? inner : R,
    borderBottomLeftRadius: !mine && showAvatar ? Math.min(4, inner) : !mine ? inner : R,
    borderBottomRightRadius: mine && showAvatar ? Math.min(4, inner) : mine ? inner : R,
  };

  const onLong = () => props.onLongPress(row);
  const selecting = !!props.selecting;

  const checkSlot = selecting ? (
    <View style={styles.checkSlot} pointerEvents="none">
      <View style={[styles.check, props.selected && styles.checkOn]}>{props.selected && <Check size={14} color={T.onAccent} strokeWidth={3} />}</View>
    </View>
  ) : null;

  // Кружочек — без пузыря, как в Telegram.
  if (isVideoNote) {
    return (
      <View style={[styles.rowOuter, selecting && styles.rowSelecting, props.highlighted && styles.highlight, props.selected && styles.selectedRow]}>
        {checkSlot}
        <Animated.View
          {...swipe.panHandlers}
          style={[styles.row, selecting && styles.flex, mine ? styles.rowMine : styles.rowOther, { transform: [{ translateX: dx }] }, !showAvatar && styles.rowTight]}
        >
          {showSideAvatar && <View style={styles.avatarSlot} />}
          <VideoNoteBubble
            msg={main}
            mine={mine}
            unlistened={unlistened}
            meta={meta(true)}
            onStarted={(m) => props.onVideoNoteStarted?.(m)}
            onLongPress={onLong}
            onCancel={props.onCancelUpload}
          />
        </Animated.View>
        {selecting && <Pressable style={styles.selectCatcher} onPress={() => props.onToggleSelect?.(row)} onLongPress={() => props.onToggleSelect?.(row)} />}
      </View>
    );
  }

  return (
    <View style={[styles.rowOuter, selecting && styles.rowSelecting, props.highlighted && styles.highlight, props.selected && styles.selectedRow]}>
      {checkSlot}
      <Animated.View style={[styles.swipeIcon, { opacity: dx.interpolate({ inputRange: [-70, -20, 0], outputRange: [1, 0.2, 0] }) }]}>
        <View style={styles.swipeIconCircle}>
          <CornerUpLeft size={16} color={T.onAccent} />
        </View>
      </Animated.View>
      <Animated.View
        {...swipe.panHandlers}
        style={[styles.row, selecting && styles.flex, mine ? styles.rowMine : styles.rowOther, { transform: [{ translateX: dx }] }, !showAvatar && styles.rowTight]}
      >
        {showSideAvatar && (
          <View style={styles.avatarSlot}>
            {showAvatar ? (
              <TouchableOpacity onPress={() => props.onPressSender?.(main.sender_id)} activeOpacity={0.8}>
                {senderAvatar ? (
                  <Image source={{ uri: SERVER_URL + senderAvatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: hashColor(senderName) }]}>
                    <Text style={styles.avatarText}>{initials(senderName)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={onLong}
          delayLongPress={280}
          onPress={main.status === 'failed' ? () => props.onRetry(main) : undefined}
          style={[
            mediaOnly ? styles.mediaOnly : [styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, corners, { maxWidth: maxBubble }],
            (isVisual && !mediaOnly) && { width: mediaW + 6, padding: 3 },
            isPoll && styles.pollBubble,
            isNote && styles.noteBubble,
          ]}
        >
          {showName && isGroup && !mine && (
            <Text style={[styles.sender, { color: hashColor(senderName) }, isVisual && styles.padInMedia]} numberOfLines={1}>
              {senderName}
            </Text>
          )}

          {main.forwarded_from_user_id ? (
            <Text style={[styles.forwarded, { color: mine ? C.textOutMuted : C.accent }, isVisual && styles.padInMedia]} numberOfLines={1}>
              Переслано от {main.forwarded_from_name || 'участника'}
            </Text>
          ) : null}

          {main.reply_to_message_id ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => props.onPressReply(main)}
              style={[styles.quote, mine ? styles.quoteMine : styles.quoteOther, isVisual && styles.quoteInMedia]}
            >
              <Text style={[styles.quoteName, { color: mine ? T.onAccent : C.accent }]} numberOfLines={1}>
                {replied ? repliedName : main.external_reply_chat_id ? 'Сообщение из другого чата' : 'Сообщение'}
              </Text>
              <Text style={[styles.quoteText, { color: sub }]} numberOfLines={1}>
                {replied ? messagePreview(replied) : main.external_reply_chat_id ? 'Нажмите, чтобы открыть' : 'Исходное сообщение удалено'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {isVisual && (
            <MediaAlbum
              items={msgs}
              maxWidth={mediaW}
              roundTop={mediaOnly}
              roundBottom={!caption}
              onPress={props.onOpenMedia}
              onLongPress={onLong}
              overlay={!caption ? meta(true) : null}
              onCancelUpload={props.onCancelUpload}
            />
          )}

          {isVoice && (
            <VoiceBubble
              msg={main}
              mine={mine}
              unlistened={unlistened}
              onPlay={(m) => props.onPlayVoice?.(m)}
              onSeek={(m, r) => props.onSeekVoice?.(m, r)}
              onCancel={props.onCancelUpload}
            />
          )}
          {isVoice && !caption && <View style={styles.metaRoomVoice} />}

          {isFile &&
            msgs.map((f) => (
              <FileRow key={f.client_id || f.id} msg={f} mine={mine} fg={fg} sub={sub} onOpen={props.onOpenFile} onLongPress={onLong} onCancel={props.onCancelUpload} />
            ))}
          {isFile && !caption && <View style={styles.metaRoom} />}

          {pollMediaVisual && (
            <View style={styles.pollMedia}>
              <MediaAlbum items={[main]} maxWidth={Math.min(maxBubble - 28, 300)} maxHeight={260} onPress={props.onOpenMedia} onLongPress={onLong} />
            </View>
          )}
          {pollMediaFile && <FileRow msg={main} mine={mine} fg={fg} sub={sub} onOpen={props.onOpenFile} onLongPress={onLong} />}

          {isPoll && <PollBubble poll={main.poll} myVotes={main.my_votes || []} currentUserId={currentUserId} isMine={mine} />}

          {isNote && (
            <NoteShareBubble
              card={main.note_share}
              mine={mine}
              currentUserId={currentUserId}
              onAccepted={(noteId) => props.onNoteAccepted(main.id, noteId)}
            />
          )}

          {caption && !isPoll ? (
            <Text
              style={[styles.text, { color: fg, fontSize: messageFontSize, lineHeight: Math.round(messageFontSize * 1.32) }, isVisual && styles.captionInMedia]}
              selectable={false}
            >
              {caption}
              <Text style={styles.metaSpacer}>{' '.repeat(mine ? 16 : 11)}</Text>
            </Text>
          ) : null}

          {!(isVisual && !caption) && <View style={[styles.metaAbs, isVisual && { right: 10, bottom: 6 }]}>{meta()}</View>}
          {main.status === 'failed' && <Text style={styles.failed}>Не отправлено · нажмите, чтобы повторить</Text>}
        </TouchableOpacity>
      </Animated.View>
      {/* В режиме выделения вся строка — одна большая кнопка «отметить». */}
      {selecting && <Pressable style={styles.selectCatcher} onPress={() => props.onToggleSelect?.(row)} onLongPress={() => props.onToggleSelect?.(row)} />}
    </View>
  );
}

export default memo(MessageRow);

/** Документ в пузыре: цветной значок с расширением, имя, размер; при отправке — кольцо с отменой. */
function FileRow({
  msg,
  mine,
  fg,
  sub,
  onOpen,
  onLongPress,
  onCancel,
}: {
  msg: any;
  mine: boolean;
  fg: string;
  sub: string;
  onOpen: (m: any) => void;
  onLongPress: () => void;
  onCancel?: (m: any) => void;
}) {
  const badge = fileBadge(msg.file_name);
  const sending = msg.status === 'sending';
  const failed = msg.status === 'failed';
  return (
    <TouchableOpacity onPress={() => onOpen(msg)} onLongPress={onLongPress} activeOpacity={0.75} style={styles.file}>
      <View style={[styles.fileIcon, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : badge.color }]}>
        {sending ? (
          <UploadProgress
            progress={msg.progress}
            size={46}
            background="transparent"
            track="rgba(255,255,255,0.3)"
            onCancel={onCancel ? () => onCancel(msg) : undefined}
          />
        ) : failed ? (
          <AlertCircle size={22} color="#FFFFFF" />
        ) : badge.ext ? (
          <Text style={styles.fileExt}>{badge.ext}</Text>
        ) : (
          <FileText size={20} color="#FFFFFF" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fileName, { color: fg }]} numberOfLines={2}>
          {msg.file_name || 'Файл'}
        </Text>
        <View style={styles.fileMetaRow}>
          {!sending && <Download size={12} color={sub} />}
          <Text style={[styles.fileMeta, { color: sub }]}>
            {sending
              ? `${Math.round((msg.progress || 0) * 100)}% · ${formatSize(msg.file_size) || 'отправка'}`
              : formatSize(msg.file_size) || 'Открыть'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Служебное сообщение по центру ленты. */
export function ServiceRow({ text }: { text: string }) {
  return (
    <View style={styles.serviceWrap}>
      <Text style={styles.serviceText}>{text}</Text>
    </View>
  );
}

export function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.serviceWrap}>
      <Text style={[styles.serviceText, styles.dayText]}>{label}</Text>
    </View>
  );
}

const styles = themed(() => ({
  rowOuter: { paddingHorizontal: 8 },
  rowSelecting: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  highlight: { backgroundColor: withAlpha(T.accent, 0.14) },
  selectedRow: { backgroundColor: withAlpha(T.accent, 0.16) },
  checkSlot: { width: 34, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: T.accent, borderColor: T.accent },
  selectCatcher: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  metaRoomVoice: { height: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 },
  rowTight: { marginTop: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  swipeIcon: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  swipeIconCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarSlot: { width: 36, marginRight: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: T.onAccent, fontSize: 13, fontWeight: '700' },
  bubble: {
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 7,
    minWidth: 76,
    shadowColor: T.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleMine: { backgroundColor: C.bubbleOut },
  bubbleOther: { backgroundColor: C.bubbleIn },
  pollBubble: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 22 },
  mediaOnly: {},
  noteBubble: { paddingBottom: 22 },
  sender: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  padInMedia: { paddingHorizontal: 8, paddingTop: 4 },
  forwarded: { fontSize: 13, fontStyle: 'italic', marginBottom: 3 },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 5 },
  quoteMine: { borderLeftColor: T.card, backgroundColor: 'rgba(255,255,255,0.14)' },
  quoteOther: { borderLeftColor: C.accent, backgroundColor: withAlpha(T.accent, 0.1) },
  quoteInMedia: { marginHorizontal: 5, marginTop: 4 },
  quoteName: { fontSize: 13, fontWeight: '700' },
  quoteText: { fontSize: 13 },
  text: { fontSize: 16, lineHeight: 21 },
  captionInMedia: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4 },
  metaSpacer: { fontSize: 11 },
  metaAbs: { position: 'absolute', right: 9, bottom: 5 },
  meta: { flexDirection: 'row', alignItems: 'center' },
  metaOnMedia: { backgroundColor: T.overlay, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  metaText: { fontSize: 11 },
  tick: { marginLeft: 3 },
  failed: { fontSize: 11, color: '#FECACA', marginTop: 4, textAlign: 'right' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220, paddingVertical: 4 },
  fileIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metaRoom: { height: 12 },
  fileExt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  pollMedia: { marginHorizontal: -6, marginTop: -2, marginBottom: 10, borderRadius: 12, overflow: 'hidden', alignSelf: 'center' },
  fileName: { fontSize: 15, fontWeight: '600' },
  fileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fileMeta: { fontSize: 12 },
  serviceWrap: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 24 },
  serviceText: {
    fontSize: 13,
    color: T.onAccent,
    backgroundColor: 'rgba(40,58,48,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
  },
  dayText: { fontWeight: '600' }
}));
