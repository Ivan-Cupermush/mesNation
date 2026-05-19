import React, {useState, useEffect} from 'react';
import {View, Text, Button, StyleSheet} from 'react-native';

const API_URL = 'http://10.0.2.2:5000';

const App = () => {
  const [message, setMessage] = useState('Нажмите кнопку');

  const checkServer = async () => {
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      setMessage(data.message);
    } catch (error) {
      setMessage('Ошибка подключения');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      <Button title="Проверить сервер" onPress={checkServer} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  text: {fontSize: 20, marginBottom: 20},
});

export default App;
