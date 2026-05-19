import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import io from 'socket.io-client';

const SERVER_URL = 'http://192.168.3.18:5000';
const CHAT_ID = 'general';
const USER_ID = 1;

const socket = io(SERVER_URL);

export default function App() {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/messages/${CHAT_ID}`)
      .then(res => res.json())
      .then(data => {
        setMessages(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Ошибка загрузки истории', err);
        setLoading(false);
      });

    socket.emit('join_chat', CHAT_ID);

    const onNewMessage = (msg: any) => {
      setMessages(prev => [...prev, msg]);
    };
    socket.on('new_message', onNewMessage);

    return () => {
      socket.off('new_message', onNewMessage);
    };
  }, []);

  const sendMessage = () => {
    if (!text.trim()) return;
    socket.emit('send_message', {
      chatId: CHAT_ID,
      senderId: USER_ID,
      text,
    });
    setText('');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        renderItem={({ item }) => (
          <View style={styles.message}>
            <Text style={styles.sender}>User {item.sender_id}:</Text>
            <Text>{item.text}</Text>
            {item.file_url && (
              <Text style={styles.file}>📎 {item.file_name}</Text>
            )}
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение..."
        />
        <Button title="Отправить" onPress={sendMessage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 30 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  message: { padding: 8, borderBottomWidth: 1, borderColor: '#eee' },
  sender: { fontWeight: 'bold' },
  file: { color: 'blue' },
  inputRow: { flexDirection: 'row', padding: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', marginRight: 8, paddingHorizontal: 8 },
});
