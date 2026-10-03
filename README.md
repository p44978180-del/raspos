# ТИМ Кампус

[![Android](https://github.com/p44978180-del/raspos/actions/workflows/build-android.yml/badge.svg)](https://github.com/p44978180-del/raspos/actions/workflows/build-android.yml)
[![iOS](https://github.com/p44978180-del/raspos/actions/workflows/ios.yml/badge.svg)](https://github.com/p44978180-del/raspos/actions/workflows/ios.yml)
[![Platform](https://github.com/p44978180-del/raspos/actions/workflows/platform.yml/badge.svg)](https://github.com/p44978180-del/raspos/actions/workflows/platform.yml)

Расписание и личный планировщик для студентов РГАУ-МСХА имени К. А. Тимирязева. Мобильная платформа на Kotlin Multiplatform с офлайн-базой SQLite, нативным ядром Rust и сервером Go.

[Скачать Android APK](https://github.com/p44978180-del/raspos/releases/download/v8.0.0-platform/androidApp-release.apk) · [Android App Bundle](https://github.com/p44978180-del/raspos/releases/download/v8.0.0-platform/androidApp-release.aab) · [Все выпуски](https://github.com/p44978180-del/raspos/releases)

## Возможности

- Каталог групп, поиск, избранное и выбор подгруппы.
- Расписание на день: типы занятий, окна, аудитории, переносы и отмены.
- Сохранённое расписание и виджет Android доступны без сети.
- Личные задачи, заметки и планы; импорт и экспорт резервных копий JSON.
- Синхронизация Connect-RPC и обновления через Centrifugo.
- Гостевой режим по умолчанию; вход старост через Passkeys и Android Credential Manager, защищённое хранение сессии в Android Keystore.
- Схема территории кампуса и маршруты по нанесённым наружным дорожкам.
- Светлая и тёмная темы.

Android-пакеты содержат ARM64 и x86_64, R8 и Baseline Profile. Для iOS доступны исходники Compose и WidgetKit и проверка сборки в CI; установочный пакет iOS не публикуется.

Опубликованный Android-выпуск настроен на временный адрес `plain-sites-matter.loca.lt`. Для постоянной сетевой работы необходимо развернуть сервер на стабильном HTTPS-домене и собрать клиент с его адресом. Сохранённые данные доступны офлайн.

Проект независимый и не является официальным приложением университета.

## Устройство проекта

Вся разработка находится в [platform/](platform/).

| Каталог | Назначение |
|---|---|
| `platform/mobile` | Compose Multiplatform, SQLDelight, Android, iOS и виджеты |
| `platform/rust/timacad-core` | UniFFI, Loro, маршрутизация TMG1 и изоляция мини-приложений |
| `platform/server` | Go, Connect-RPC, PostgreSQL, Passkeys и OpenFGA |
| `platform/proto` | Контракты Protobuf и конфигурация Buf |
| `platform/deploy` | Docker Compose, Caddy, Temporal, NATS, Centrifugo и MinIO |
| `platform/campus` | Исходные данные карты и воспроизводимый импорт |
| `platform/fixtures` | Каталог и расписания для импорта и тестов |
| `platform/testdata` | Проверочные данные протоколов и парсеров |
| `platform/tools` | Обновление официального расписания |
| `platform/miniapps` | Контракты и примеры мини-приложений |

Локальные установочные файлы хранятся в `releases/<версия>/` и не входят в Git. Опубликованные выпуски доступны в GitHub Releases.

## Окружение

- Android: JDK 21, Android SDK 36, Build Tools 36.0.0 и NDK 27.2.12479018.
- Ядро: Rust stable и цели `aarch64-linux-android`, `x86_64-linux-android`.
- Сервер: Go 1.25 и Docker Compose.
- Контракты: Buf; обновление расписания: Node.js 22+.
- iOS: macOS с Xcode; импорт карты: Python 3.

Gradle Wrapper находится в `platform/mobile`. Укажите SDK через `ANDROID_HOME` или `sdk.dir` в локальном `platform/mobile/local.properties`. Установите цели Rust:

```sh
rustup target add aarch64-linux-android x86_64-linux-android
```

## Сервер

Скопируйте `platform/deploy/.env.example` в `.env` в том же каталоге. Заполните учётные данные и секреты уникальными значениями; `.env` исключён из Git.

```sh
cd platform/deploy
docker compose --profile full up -d --build
```

Локальный API доступен через Caddy на `http://127.0.0.1:8088`, проверка состояния — `/healthz`. Данные PostgreSQL и MinIO сохраняются в томах Compose.

Для импорта каталога задайте `DATABASE_URL` с учётными данными из `.env`, адресом `127.0.0.1:55432` и базой `timacad`. Затем из `platform/server` выполните:

```sh
go run ./cmd/importv4 -data ../fixtures/schedule
```

Повторный импорт не дублирует неизменившиеся снимки.

Для публичного развёртывания настройте доверенный HTTPS в Caddy или перед ним, `WEBAUTHN_RP_ID`, разрешённые Android origins и `platform/deploy/well-known/assetlinks.json` с SHA-256 сертификата подписи приложения. Домен RP должен совпадать с доменом API. Скрипт `platform/deploy/configure-passkey-tunnel.ps1 -HttpsUrl https://your-domain.example` проверяет Digital Asset Links и сохраняет настройки RP в локальном `.env`.

## Android

В `platform/mobile/local.properties` настройте подпись: `timacad.storeFile`, `timacad.storePassword`, `timacad.keyAlias`, `timacad.keyPassword`. Храните ключ и пароли вне Git. Для собственного сервера замените адреса в команде:

```sh
cd platform/mobile
./gradlew :shared:jvmTest :androidApp:assembleRelease :androidApp:bundleRelease \
  -Ptimacad.apiUrl=https://your-domain.example \
  -Ptimacad.realtimeUrl=wss://your-domain.example/connection/websocket
```

На Windows используйте `gradlew.bat`. APK находится в `androidApp/build/outputs/apk/release/`, AAB — в `androidApp/build/outputs/bundle/release/`. Gradle собирает нативные библиотеки обеих ABI и включает сохранённые правила AOT из `androidApp/src/main/generated/baselineProfiles`.

Для обновления Baseline Profile используйте отдельное устройство API 33+: соберите и установите `:androidApp:assembleNonMinifiedRelease`, дождитесь загрузки настоящего расписания, отключите сеть и выполните `:androidApp:generateBaselineProfile`. Сохраните сгенерированные правила в Git. Измерение запуска: `:baselineprofile:connectedBenchmarkReleaseAndroidTest`. Подключённые тесты сохраняют установленное приложение и его данные.

## iOS

На macOS:

```sh
cd platform/mobile
./gradlew :iosApp:compileIosApp
cd ../..
bash platform/mobile/ios-extensions/build-widget.sh
```

Эти команды собирают Compose framework и нативный framework с WidgetKit. Для установки собственного iOS-приложения нужны Xcode host, подпись и provisioning.

## Расписание

Источник — [электронный каталог университета](https://eg.timacad.ru/schedule/groups/) и [официальная страница расписания](https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia).

Эталонный снимок содержит 805 групп и 47 068 занятий за 14 сентября–2 ноября 2026 года. У 342 групп электронный источник пуст; для них следует сверяться с PDF института. Снимок не является гарантией покрытия всего семестра.

Обновление каталога запускается вручную из корня проекта:

```sh
node platform/tools/sync-schedule.mjs
```

Обновлятор сохраняет весь прежний снимок при ошибках источника. Кеш загрузок находится во временном каталоге ОС. Файлы расписания публикуются только в `platform/fixtures/schedule/data`.

## Проверки

CI проверяет Android и JVM, iOS и WidgetKit, Rust, сервер и контракты Protobuf. Android-пакеты из CI не подписаны и предназначены для проверки сборки; установочный подписанный APK находится в Releases.

```sh
cd platform/rust/timacad-core
cargo test --locked
cargo build --locked --no-default-features --bin compact-doc --bin personal-fixture
cd ../../server
go test -count=1 -p=1 ./...
cd ../proto
buf lint
buf build
cd ../..
node --test platform/tools/official-source-parser.test.mjs platform/tools/sync-schedule.test.mjs
python -m unittest discover -s platform/campus -p 'test_*.py'
```

Полные серверные интеграционные тесты сейчас запускаются на Windows: они используют embedded PostgreSQL и OpenFGA 1.21.0 из `%USERPROFILE%/.cache/raspos-platform/bin/openfga.exe`. CI устанавливает эту зависимость автоматически.

## Данные карты

© OpenStreetMap contributors. Данные карты и производные распространяются по [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); [атрибуция и условия OpenStreetMap](https://www.openstreetmap.org/copyright) сохраняются в данных и интерфейсе.

Карта использует локальные глифы и граф TMG1 из 5 392 узлов и 6 399 рёбер. Она показывает наружные пути, сохраняет ограничения доступа и не обещает маршруты внутри зданий, безбарьерный доступ или время в пути. Разорванные пути остаются разорванными.

Воспроизводимое обновление пакета без сети:

```sh
python platform/campus/import_osm.py platform/campus/data/campus-source.json --retrieved-on 2026-10-01 --install
```
