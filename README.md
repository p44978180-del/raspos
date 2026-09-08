# 🌾 РГАУ Расписание

Мобильное приложение для студентов **РГАУ-МСХА имени К.А. Тимирязева** — расписание занятий, карта кампуса, управление домашними заданиями и полезные сервисы.

## ✨ Возможности

- 📅 **Расписание занятий** — автоматический парсинг с [timacad.ru](https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia)
- 🔄 **Ежедневная синхронизация** — GitHub Actions обновляет расписание в 04:00 МСК
- 👩‍🎓 **Кабинет старосты** — загрузка PDF расписания, перенос и отмена пар
- 🗺️ **Карта кампуса** — интерактивный план с SVG-пинами корпусов, общежитий, столовых
- 📱 **PWA** — установка на iOS через «На экран Домой»
- 🤖 **Android APK** — нативная сборка через Capacitor
- 🌙 **Тёмная тема** — с радиальной волновой анимацией переключения
- 🔔 **Звонки** — расписание звонков и текущий статус пары в реальном времени

## 🚀 Быстрый старт

```bash
pnpm install
pnpm dev
```

## 📦 Сборка

```bash
# Веб-сборка
pnpm build

# Android APK
pnpm build:android

# Синхронизация расписания с timacad.ru
pnpm sync:schedule

# Проверка типов
pnpm typecheck

# Тесты
pnpm test
```

## 🏗️ Технологии

- **React 19** + **TypeScript 5.7**
- **Vite 8** — сборщик
- **Tailwind CSS v4** — стилизация
- **Capacitor** — нативная сборка Android
- **GitHub Actions** — CI/CD (деплой на GitHub Pages + сборка APK + ночная синхронизация расписания)

## 📁 Структура проекта

```
src/
├── App.tsx                    # Основное приложение
├── index.css                  # Глобальные стили и Tailwind
├── main.tsx                   # Точка входа React
├── components/
│   ├── BellScheduleSheet.tsx  # Расписание звонков
│   ├── CampusMapPins.tsx      # SVG-пины карты кампуса
│   ├── IosInstallPrompt.tsx   # Баннер установки на iOS
│   └── PdfUploadModal.tsx     # Загрузка PDF расписания
├── utils/
│   └── timacadPdfParser.ts    # Парсер PDF расписания
└── data/
    └── official-schedule.json # Актуальное расписание (42 группы)

scripts/
└── sync-schedule.mjs          # Ночной парсер расписания с timacad.ru

.github/workflows/
├── deploy.yml                 # Деплой на GitHub Pages
├── build-android.yml          # Сборка Android APK
└── daily-sync.yml             # Ежедневный парсинг расписания
```

## 📄 Лицензия

Создано с ❤️ для студентов Тимирязевки.
