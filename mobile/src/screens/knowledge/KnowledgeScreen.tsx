import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { api, ChatMessage, SourceChunk } from '../../services/api';

export default function KnowledgeScreen({ navigation }: any) {
  const { colors } = useTheme();

  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadOrCreateSession();
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    }
  }, [currentSessionId]);

  const loadOrCreateSession = async () => {
    try {
      const data = await api.getChatSessions();
      if (Array.isArray(data) && data.length > 0) {
        setCurrentSessionId(data[0].id);
      }
    } catch (e) {
      console.error('Ошибка загрузки сессий:', e);
    }
  };

  const loadMessages = async (sessionId: number) => {
    try {
      const data = await api.getSessionMessages(sessionId);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Ошибка загрузки сообщений:', e);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const message = inputText.trim();
    setInputText('');
    setIsSending(true);
    setIsTyping(true);

    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      session_id: currentSessionId || 0,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await api.sendChatMessage({
        session_id: currentSessionId || undefined,
        message,
      });

      if (!currentSessionId || currentSessionId !== response.session_id) {
        setCurrentSessionId(response.session_id);
      }

      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        response.user_message,
        response.assistant_message,
      ]);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось получить ответ');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setIsSending(false);
      setIsTyping(false);
    }
  };

  const toggleSources = (messageId: number) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleFeedback = async (messageId: number, feedback: 'positive' | 'negative') => {
    try {
      await api.sendMessageFeedback(messageId, feedback);
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, feedback } : m))
      );
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить отзыв');
    }
  };

  useEffect(() => {
    if (Array.isArray(messages) && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isTyping]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const sources = Array.isArray((item as any).source_chunks) ? (item as any).source_chunks : [];
    const isExpanded = expandedSources.has(item.id);

    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAI]}>
        {!isUser && <Text style={styles.avatar}>🤖</Text>}

        <View
          style={[
            styles.messageBubble,
            isUser
              ? [styles.userBubble, { backgroundColor: colors.accent }]
              : [styles.aiBubble, { backgroundColor: colors.surface }],
          ]}
        >
          <Text style={[styles.messageText, { color: isUser ? colors.onAccent : colors.textPrimary }]}>
            {item.content}
          </Text>

          <Text style={[styles.messageTime, { color: isUser ? colors.onAccent + '99' : colors.textMuted }]}>
            {formatTime(item.created_at)}
          </Text>

          {!isUser && sources.length > 0 && (
            <TouchableOpacity onPress={() => toggleSources(item.id)} style={styles.sourcesToggle}>
              <Text style={[styles.sourcesToggleText, { color: colors.accent }]}>
                📚 Источники ({sources.length}) {isExpanded ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          )}

          {!isUser && isExpanded && sources.length > 0 && (
            <View style={styles.sourcesList}>
              {sources.map((source: SourceChunk, idx: number) => (
                <View key={idx} style={[styles.sourceItem, { backgroundColor: colors.background }]}>
                  <Text style={[styles.sourceName, { color: colors.accent }]}>
                    {source.document_name}
                  </Text>
                  <Text style={[styles.sourceContent, { color: colors.textSecondary }]}>
                    {source.content.slice(0, 200)}...
                  </Text>
                  <Text style={[styles.sourceSimilarity, { color: colors.textMuted }]}>
                    Сходство: {(parseFloat(source.similarity) * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!isUser && item.feedback === undefined && (
            <View style={styles.feedbackRow}>
              <TouchableOpacity
                onPress={() => handleFeedback(item.id, 'positive')}
                style={[styles.feedbackButton, item.feedback === 'positive' && { backgroundColor: colors.accent + '33' }]}
              >
                <Text style={styles.feedbackIcon}>👍</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleFeedback(item.id, 'negative')}
                style={[styles.feedbackButton, item.feedback === 'negative' && { backgroundColor: '#ff444433' }]}
              >
                <Text style={styles.feedbackIcon}>👎</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isUser && item.feedback && (
            <Text style={[styles.feedbackLabel, { color: colors.textMuted }]}>
              {item.feedback === 'positive' ? '👍 Полезно' : '👎 Бесполезно'}
            </Text>
          )}
        </View>

        {isUser && <Text style={styles.avatar}>👤</Text>}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={Array.isArray(messages) ? messages : []}
          keyExtractor={item => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🤖</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Привет! Я AI-ассистент компании
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Задайте вопрос — я найду ответ в базе знаний
              </Text>
              <View style={styles.suggestionsContainer}>
                {['Сколько дней отпуска?', 'Как оформить отпуск?', 'Когда платят отпускные?'].map((suggestion, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setInputText(suggestion)}
                    style={[styles.suggestionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.suggestionText, { color: colors.textPrimary }]}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />

        {isTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.avatar}>🤖</Text>
            <View style={[styles.typingBubble, { backgroundColor: colors.surface }]}>
              <View style={styles.typingDots}>
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              </View>
            </View>
          </View>
        )}

        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                color: colors.textPrimary,
                borderColor: colors.border,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Задайте вопрос..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            editable={!isSending}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputText.trim() || isSending}
            style={[
              styles.sendButton,
              {
                backgroundColor: inputText.trim() && !isSending ? colors.accent : colors.border,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[styles.sendButtonText, { color: colors.onAccent }]}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 12,
    paddingBottom: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 6,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAI: {
    justifyContent: 'flex-start',
  },
  avatar: {
    fontSize: 20,
    marginHorizontal: 6,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  sourcesToggle: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  sourcesToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sourcesList: {
    marginTop: 8,
    gap: 6,
  },
  sourceItem: {
    padding: 8,
    borderRadius: 8,
  },
  sourceName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  sourceContent: {
    fontSize: 11,
    lineHeight: 15,
    fontStyle: 'italic',
  },
  sourceSimilarity: {
    fontSize: 10,
    marginTop: 4,
  },
  feedbackRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  feedbackButton: {
    padding: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  feedbackIcon: {
    fontSize: 14,
  },
  feedbackLabel: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  suggestionsContainer: {
    gap: 8,
    width: '100%',
  },
  suggestionChip: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typingBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 22,
    fontWeight: '700',
  },
});
