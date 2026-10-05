/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandlers } from './src/notifications';

// Уведомления при свёрнутом или закрытом приложении: push и кнопки в шторке.
registerBackgroundHandlers();

AppRegistry.registerComponent(appName, () => App);
