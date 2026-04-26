# 📱 CRM Mobile App
Основная ветка. Содержит мобильное приложение на React Native.
## Структура
crm-mobile-app/
├── mobile/                    # React Native (основная разработка)
│   ├── src/
│   │   ├── screens/           # Экраны (Login, Dashboard, Contacts)
│   │   ├── components/        # UI-компоненты (Button, Card, Modal)
│   │   ├── services/          # API-клиент для связи с бэкендом
│   │   ├── navigation/        # React Navigation
│   │   ├── store/             # Состояние (Redux/Zustand)
│   │   ├── hooks/             # Кастомные хуки
│   │   ├── types/             # TypeScript-типы
│   │   └── utils/             # Хелперы
│   ├── android/               # Нативный Android-код
│   ├── ios/                   # Нативный iOS-код
│   ├── package.json           # Зависимости и скрипты
│   └── tsconfig.json          # Конфигурация TypeScript
├── .gitignore
└── README.md
## Описание папок
screens/ — Экраны: авторизация, список контактов, чат, профиль
components/ — UI-элементы: кнопки, поля ввода, аватары
services/ — API-клиент, интерсепторы, обработка ошибок
navigation/ — Stack, Tab, Drawer навигация
store/ — Глобальное состояние: авторизация, тема, данные
hooks/ — useAuth, useDebounce, usePagination
types/ — User, Message, ApiResponse
utils/ — Форматирование дат, валидация
## Быстрый старт
git clone <repo-url> && cd mesNation && git checkout main
cd mobile
npm install
npx react-native run-android
## Связь с бэкендом
Бэкенд в ветке server-base. Адрес API: http://localhost:5000
Апрель 2026
