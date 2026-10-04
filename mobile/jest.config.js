module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: { '^lucide-react-native$': '<rootDir>/__mocks__/lucide-react-native.js' },
  // Пакеты, которые публикуются как ES-модули, нужно прогонять через Babel.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|lucide-react-native|react-native-svg|react-native-safe-area-context|react-native-screens|@react-native-documents|@react-native-async-storage|socket.io-client|engine.io-client|socket.io-parser|engine.io-parser)/)',
  ],
};
