import { Alert, Platform, ToastAndroid } from 'react-native';

/** Короткое подтверждение действия: на Android — системный тост, на iOS — окно. */
export function showToast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
