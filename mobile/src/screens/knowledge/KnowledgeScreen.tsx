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
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ChatMessage, SourceChunk } from '../../services/api';
import {
  Bot, User, Send, ThumbsUp, ThumbsDown, BookOpen,
  ChevronDown, ChevronUp, Sparkles, UserRound,
} from 'lucide-react-native';

export default function KnowledgeScreen({ navigation }: any) {
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
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Bot size={18} color="#1F7A52" strokeWidth={2.2} />
          </View>
        )}

        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAI]}>
            {item.content}
          </Text>

          <Text style={[styles.messageTime, isUser ? styles.messageTimeUser : styles.messageTimeAI]}>
            {formatTime(item.created_at)}
          </Text>

          {!isUser && sources.length > 0 && (
            <TouchableOpacity onPress={() => toggleSources(item.id)} style={styles.sourcesToggle}>
              <BookOpen size={14} color="#1F7A52" strokeWidth={2.2} />
              <Text style={styles.sourcesToggleText}>
                Источники ({sources.length})
              </Text>
              {isExpanded
                ? <ChevronUp size={14} color="#1F7A52" strokeWidth={2.2} />
                : <ChevronDown size={14} color="#1F7A52" strokeWidth={2.2} />}
            </TouchableOpacity>
          )}

          {!isUser && isExpanded && sources.length > 0 && (
            <View style={styles.sourcesList}>
              {sources.map((source: SourceChunk, idx: number) => (
                <View key={idx} style={styles.sourceItem}>
                  <Text style={styles.sourceName}>{source.document_name}</Text>
                  <Text style={styles.sourceContent}>
                    {source.content.slice(0, 200)}...
                  </Text>
                  <Text style={styles.sourceSimilarity}>
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
                style={styles.feedbackButton}
              >
                <ThumbsUp size={14} color="#1F7A52" strokeWidth={2.2} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleFeedback(item.id, 'negative')}
                style={styles.feedbackButton}
              >
                <ThumbsDown size={14} color="#DC2626" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          )}

          {!isUser && item.feedback && (
            <View style={styles.feedbackLabelRow}>
              {item.feedback === 'positive'
                ? <ThumbsUp size={12} color="#1F7A52" strokeWidth={2.2} />
                : <ThumbsDown size={12} color="#DC2626" strokeWidth={2.2} />}
              <Text style={styles.feedbackLabel}>
                {item.feedback === 'positive' ? 'Полезно' : 'Бесполезно'}
              </Text>
            </View>
          )}
        </View>

        {isUser && (
          <View style={styles.userAvatar}>
            <User size={18} color="#3B82F6" strokeWidth={2.2} />
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Hero header */}
        <View style={styles.heroHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigTitle}>БАЗА ЗНАНИЙ</Text>
            <View style={styles.subtitleRow}>
              <Sparkles size={14} color="#6F6F73" strokeWidth={2.2} />
              <Text style={styles.bigSubtitle}>AI-ассистент компании</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.getParent()?.navigate('ChatTab', { screen: 'Profile' })}
            activeOpacity={0.7}
          >
            <UserRound size={20} color="#1F7A52" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={flatListRef}
          data={Array.isArray(messages) ? messages : []}
          keyExtractor={item => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Bot size={40} color="#1F7A52" strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>
                Привет! Я AI-ассистент компании
              </Text>
              <Text style={styles.emptySubtitle}>
                Задайте вопрос — я найду ответ в базе знаний
              </Text>
              <View style={styles.suggestionsContainer}>
                {['Сколько дней отпуска?', 'Как оформить отпуск?', 'Когда платят отпускные?'].map((suggestion, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setInputText(suggestion)}
                    activeOpacity={0.8}
                    style={styles.suggestionChip}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />

        {isTyping && (
          <View style={styles.typingRow}>
            <View style={styles.aiAvatar}>
              <Bot size={18} color="#1F7A52" strokeWidth={2.2} />
            </View>
            <View style={styles.typingBubble}>
              <View style={styles.typingDots}>
                <View style={styles.dot} />
                <View style={styles.dot} />
                <View style={styles.dot} />
              </View>
            </View>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputContainer}>
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Задайте вопрос..."
              placeholderTextColor="#BDBDBD"
              multiline
              maxLength={2000}
              editable={!isSending}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || isSending}
              activeOpacity={0.85}
              style={[
                styles.sendButton,
                (!inputText.trim() || isSending) && styles.sendButtonDisabled,
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send size={18} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  chatContainer: { flex: 1 },

  // ===== HERO HEADER =====
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  bigTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40, fontWeight: '900', color: '#141414', letterSpacing: -0.5, lineHeight: 44,
  },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  bigSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 18, fontStyle: 'italic', color: '#6F6F73',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // ===== MESSAGES =====
  messagesList: { padding: 16, paddingBottom: 20 },
  messageRow: { flexDirection: 'row', marginVertical: 6, alignItems: 'flex-end' },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAI: { justifyContent: 'flex-start' },

  aiAvatar: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: '#D1FAE5',
    justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 4,
  },
  userAvatar: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: '#DBEAFE',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8, marginBottom: 4,
  },

  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userBubble: {
    backgroundColor: '#1F7A52',
    borderBottomRightRadius: 6,
    shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  messageText: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  messageTextUser: { color: '#FFFFFF' },
  messageTextAI: { color: '#141414' },
  messageTime: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end', fontWeight: '600' },
  messageTimeUser: { color: 'rgba(255,255,255,0.6)' },
  messageTimeAI: { color: '#BDBDBD' },

  // ===== SOURCES =====
  sourcesToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  sourcesToggleText: { fontSize: 12, fontWeight: '700', color: '#1F7A52' },
  sourcesList: { marginTop: 8, gap: 6 },
  sourceItem: { padding: 10, borderRadius: 12, backgroundColor: '#F9FAFB' },
  sourceName: { fontSize: 12, fontWeight: '700', color: '#1F7A52', marginBottom: 4 },
  sourceContent: { fontSize: 11, lineHeight: 15, fontStyle: 'italic', color: '#6F6F73' },
  sourceSimilarity: { fontSize: 10, marginTop: 4, color: '#BDBDBD', fontWeight: '600' },

  // ===== FEEDBACK =====
  feedbackRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  feedbackButton: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#F9FAFB',
    justifyContent: 'center', alignItems: 'center',
  },
  feedbackLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  feedbackLabel: { fontSize: 11, color: '#6F6F73', fontStyle: 'italic', fontWeight: '600' },

  // ===== EMPTY STATE =====
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 28, backgroundColor: '#D1FAE5',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  emptyTitle: {
    fontSize: 20, fontWeight: '800', marginBottom: 8, textAlign: 'center', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 28, color: '#6F6F73', fontWeight: '500' },
  suggestionsContainer: { gap: 10, width: '100%' },
  suggestionChip: {
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  suggestionText: {
    fontSize: 14, fontWeight: '600', textAlign: 'center', color: '#1F7A52',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== TYPING =====
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  typingBubble: {
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, borderBottomLeftRadius: 6,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  typingDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1F7A52' },

  // ===== INPUT BAR =====
  inputContainer: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 5,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 15,
    maxHeight: 100,
    color: '#141414',
    fontWeight: '500',
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 16, backgroundColor: '#1F7A52',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  sendButtonDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0 },
});