import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { api } from '../services/api';

interface Message { id: number; session_id: number; role: 'user' | 'assistant'; content: string; created_at: string; }

const KnowledgeScreen: React.FC = () => {
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    const message = inputText.trim();
    setInputText(''); setIsSending(true); setIsTyping(true);
    const tempUserMsg: Message = { id: Date.now(), session_id: currentSessionId || 0, role: 'user', content: message, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUserMsg]);
    try {
      const response = await api.sendChatMessage({ session_id: currentSessionId || undefined, message });
      if (!currentSessionId || currentSessionId !== response.session_id) setCurrentSessionId(response.session_id);
      setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), response.user_message, response.assistant_message]);
    } catch (e: any) {
      alert('Ошибка: ' + (e.message || 'Не удалось получить ответ'));
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally { setIsSending(false); setIsTyping(false); }
  };

  return (
    <Container>
      <Header>
        <Title><Sparkles size={32} color="#1F7A52" /> База знаний</Title>
        <Subtitle>AI-ассистент компании</Subtitle>
      </Header>
      <MessagesContainer>
        {messages.length === 0 && (
          <EmptyState>
            <BotIcon><Bot size={48} color="#1F7A52" /></BotIcon>
            <EmptyTitle>Привет! Я AI-ассистент компании</EmptyTitle>
            <EmptySubtitle>Задайте вопрос — я найду ответ в базе знаний</EmptySubtitle>
          </EmptyState>
        )}
        {messages.map(msg => (
          <MessageRow key={msg.id} $isUser={msg.role === 'user'}>
            {msg.role !== 'user' && <AvatarAI><Bot size={20} color="#1F7A52" /></AvatarAI>}
            <Bubble $isUser={msg.role === 'user'}>
              <MessageText $isUser={msg.role === 'user'}>{msg.content}</MessageText>
              <Time>{new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Time>
            </Bubble>
            {msg.role === 'user' && <AvatarUser><User size={20} color="#fff" /></AvatarUser>}
          </MessageRow>
        ))}
        {isTyping && (
          <MessageRow $isUser={false}>
            <AvatarAI><Bot size={20} color="#1F7A52" /></AvatarAI>
            <TypingBubble>Печатает...</TypingBubble>
          </MessageRow>
        )}
        <div ref={messagesEndRef} />
      </MessagesContainer>
      <InputContainer>
        <Input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Задайте вопрос..." disabled={isSending} />
        <SendButton onClick={handleSend} disabled={!inputText.trim() || isSending}><Send size={18} color="#fff" /></SendButton>
      </InputContainer>
    </Container>
  );
};

export default KnowledgeScreen;

const Container = styled.div`display: flex; flex-direction: column; height: calc(100vh - 48px); max-width: 960px; margin: 0 auto;`;
const Header = styled.div`padding: 32px 24px 24px; border-bottom: 1px solid #E5E5E5;`;
const Title = styled.h1`font-family: 'Bebas Neue', sans-serif; font-size: 40px; color: #141414; display: flex; align-items: center; gap: 12px; margin: 0;`;
const Subtitle = styled.p`font-size: 14px; color: #6F6F73; margin: 4px 0 0 44px;`;
const MessagesContainer = styled.div`flex: 1; overflow-y: auto; padding: 24px;`;
const EmptyState = styled.div`display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 48px 24px;`;
const BotIcon = styled.div`width: 80px; height: 80px; border-radius: 50%; background: #E8F3EE; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;`;
const EmptyTitle = styled.h2`font-size: 24px; color: #141414; margin: 0 0 8px;`;
const EmptySubtitle = styled.p`font-size: 14px; color: #6F6F73; margin: 0 0 32px;`;
const MessageRow = styled.div<{ $isUser: boolean }>`display: flex; gap: 12px; margin-bottom: 16px; justify-content: ${p => (p.$isUser ? 'flex-end' : 'flex-start')};`;
const AvatarAI = styled.div`width: 40px; height: 40px; border-radius: 50%; background: #E8F3EE; display: flex; align-items: center; justify-content: center; flex-shrink: 0;`;
const AvatarUser = styled.div`width: 40px; height: 40px; border-radius: 50%; background: #3B82F6; display: flex; align-items: center; justify-content: center; flex-shrink: 0;`;
const Bubble = styled.div<{ $isUser: boolean }>`max-width: 70%; padding: 12px 16px; border-radius: ${p => (p.$isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px')}; background: ${p => (p.$isUser ? '#3B82F6' : '#fff')}; border: 1px solid ${p => (p.$isUser ? '#3B82F6' : '#E5E5E5')};`;
const MessageText = styled.p<{ $isUser: boolean }>`font-size: 14px; line-height: 1.5; color: ${p => (p.$isUser ? '#fff' : '#141414')}; margin: 0; white-space: pre-wrap;`;
const Time = styled.p`font-size: 11px; color: #6F6F73; margin: 4px 0 0;`;
const TypingBubble = styled.div`padding: 12px 16px; border-radius: 18px 18px 18px 4px; background: #fff; border: 1px solid #E5E5E5; font-size: 14px; color: #6F6F73; font-style: italic;`;
const InputContainer = styled.div`padding: 16px 24px 24px; border-top: 1px solid #E5E5E5; display: flex; gap: 8px;`;
const Input = styled.textarea`flex: 1; padding: 12px 16px; border: 1px solid #E5E5E5; border-radius: 12px; font-size: 14px; font-family: inherit; resize: none; min-height: 44px; max-height: 120px; background: #fff; color: #141414; &:focus { outline: none; border-color: #1F7A52; }`;
const SendButton = styled.button`width: 44px; height: 44px; border-radius: 12px; background: #1F7A52; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; &:hover { background: #185f40; } &:disabled { background: #E5E5E5; cursor: not-allowed; }`;
