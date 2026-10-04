/* Моки нативных модулей для тестов (в Jest нет Android/iOS). */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  const api = {
    getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => void store.set(k, v)),
    removeItem: jest.fn(async (k) => void store.delete(k)),
  };
  return { __esModule: true, default: api, ...api };
});
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  exists: jest.fn(async () => false),
  readFile: jest.fn(async () => ''),
  writeFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { allFiles: '*/*' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: () => false,
}));
jest.mock('socket.io-client', () => ({
  io: () => ({ on: jest.fn(), off: jest.fn(), emit: jest.fn(), removeAllListeners: jest.fn(), disconnect: jest.fn(), connected: false }),
}));
global.fetch = jest.fn(async () => ({ ok: false, status: 0, text: async () => '' }));
jest.mock('@react-native-clipboard/clipboard', () => require('@react-native-clipboard/clipboard/jest/clipboard-mock.js'));
jest.mock('react-native-keychain', () => {
  let stored = false;
  return {
    STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
    ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly' },
    setGenericPassword: jest.fn(async (username, password) => { stored = { username, password }; return true; }),
    getGenericPassword: jest.fn(async () => stored),
    resetGenericPassword: jest.fn(async () => { stored = false; return true; }),
  };
});
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: {
    getPhotos: jest.fn(async () => ({ edges: [], page_info: { has_next_page: false } })),
    saveAsset: jest.fn(async () => ({})),
  },
}));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(async () => ({})), launchImageLibrary: jest.fn(async () => ({})) }));
jest.mock('react-native-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Video = React.forwardRef((props, _ref) => React.createElement(View, props));
  return { __esModule: true, default: Video, Video };
});
