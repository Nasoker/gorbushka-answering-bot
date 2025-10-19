# 🤖 Gorbushka Answering Bot

Telegram user bot для мониторинга сообщений в группе и поиска информации в Google Таблицах.

## ✨ Возможности

- ✅ Мониторинг сообщений в Telegram группе
- ✅ Автоматический поиск в Google Таблицах
- ✅ Отправка результатов в группу
- ✅ Поддержка поиска по всем колонкам
- ✅ ООП архитектура для легкого расширения

## 🚀 Быстрый старт

### 1. Установка

```bash
npm install
```

### 2. Настройка Telegram

1. Получите API credentials на https://my.telegram.org/apps
2. Скопируйте `.env.example` в `.env`
3. Заполните Telegram настройки в `.env`:

```bash
API_ID=your_api_id
API_HASH=your_api_hash
PHONE_NUMBER=+79123456789
GROUP_CHAT_ID=-4893394100
```

### 3. Настройка Google Sheets

Следуйте инструкции в [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)

Кратко:
1. Создайте проект в Google Cloud Console
2. Включите Google Sheets API
3. Создайте Service Account
4. Скачайте `credentials.json`
5. Поделитесь таблицей с Service Account email
6. Добавьте настройки в `.env`:

```bash
GOOGLE_SHEET_ID=your_spreadsheet_id
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_CREDENTIALS_PATH=./credentials.json
```

### 4. Запуск

```bash
npm start
```

## 📊 Как работает

1. **Пользователь пишет сообщение** в группу
2. **Бот автоматически ищет** текст во всех колонках Google Таблицы
3. **Находит совпадения** и отправляет результаты в группу

### Пример:

**Сообщение:**
```
iPhone 17 Pro
```

**Ответ бота:**
```
🔍 Найдено 2 совпадений:

1. Название: iPhone 17 Pro 256Gb Blue
   Цена: 118900
   В наличии: 5 шт.
   Страна: AE

2. Название: iPhone 17 Pro 512Gb Blue
   Цена: 134900
   В наличии: 3 шт.
   Страна: AE
```

## 📁 Структура проекта

```
gorbushka-answering-bot/
├── src/
│   ├── bot/
│   │   ├── TelegramBot.js      # Базовый класс бота
│   │   └── MonitorBot.js       # Бот мониторинга
│   ├── services/
│   │   └── GoogleSheetsService.js  # Работа с Google Sheets
│   ├── handlers/
│   │   └── SearchHandler.js    # Обработчик поиска
│   └── config/
│       └── config.js           # Конфигурация
├── scripts/
│   ├── auth.js                 # Сохранение сессии
│   └── check.js                # Проверка конфигурации
├── bot.js                      # Точка входа
├── credentials.json            # Google credentials (не коммитится)
├── .env                        # Конфигурация (не коммитится)
└── package.json
```

## ⚙️ Команды

- `npm start` - запуск бота
- `npm run dev` - режим разработки с auto-reload
- `npm run check` - проверка конфигурации

## 🔧 Настройка таблицы

Рекомендуемая структура Google Таблицы:

| Название | Цена | Описание | Категория | Страна |
|----------|------|----------|-----------|--------|
| iPhone 17 Pro | 118900 | Новый | Телефоны | AE |
| AirPods Pro 2 | 15100 | В наличии | Аксессуары | AE |

**Важно:**
- Первая строка - заголовки
- Данные начинаются со второй строки
- Бот ищет по всем колонкам

## 🔍 Возможности поиска

### Простой поиск

Бот ищет текст во всех колонках:

```
Пользователь: AirPods
Бот: [находит все строки с "AirPods"]
```

### Поиск с частичным совпадением

```
Пользователь: iPhone 17
Бот: [находит "iPhone 17 Pro", "iPhone 17 Pro Max", и т.д.]
```

### Регистронезависимый поиск

```
Пользователь: airpods
Бот: [находит "AirPods", "AIRPODS", "airpods"]
```

## 🛠️ Расширение функционала

### Поиск по конкретной колонке

Отредактируйте `src/handlers/SearchHandler.js`:

```javascript
// Поиск только в колонке "Название"
const results = await this.searchInColumn('Название', searchText);
```

### Поиск по нескольким критериям

```javascript
const results = await this.sheetsService.searchByMultipleCriteria({
  'Название': 'iPhone',
  'Категория': 'Телефоны'
});
```

### Создание своего обработчика

```javascript
import { SearchHandler } from './src/handlers/SearchHandler.js';

class MyCustomHandler extends SearchHandler {
  async handleMessage(event) {
    // Ваша логика
    await super.handleMessage(event);
  }
}
```

## 📝 Переменные окружения

```bash
# Telegram
API_ID=12345678
API_HASH=abcdef1234567890
PHONE_NUMBER=+79123456789
GROUP_CHAT_ID=-4893394100
SESSION_STRING=optional_session_string

# Google Sheets
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_CREDENTIALS_PATH=./credentials.json
```

## ⚠️ Важные замечания

1. **Безопасность**:
   - Никогда не публикуйте `.env` и `credentials.json`
   - Service Account должен иметь только права "Viewer"

2. **Ограничения**:
   - Google Sheets API имеет квоты (100 запросов в 100 секунд)
   - Бот показывает максимум 5 результатов на запрос

3. **Производительность**:
   - Для больших таблиц (>1000 строк) рекомендуется кэширование
   - Первый запрос загружает всю таблицу

## 🐛 Решение проблем

### Бот не находит сообщения
- Проверьте `GROUP_CHAT_ID` (должен начинаться с `-`)
- Убедитесь, что вы участник группы

### Не подключается к Google Sheets
- Проверьте путь к `credentials.json`
- Убедитесь, что дали доступ Service Account к таблице
- См. подробную инструкцию в [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md)

### Ничего не находит в таблице
- Проверьте, что первая строка содержит заголовки
- Убедитесь, что `GOOGLE_SHEET_NAME` совпадает с названием листа
- Проверьте, что в таблице есть данные

## 📚 Документация

- [Настройка Google Sheets](./GOOGLE_SHEETS_SETUP.md) - подробная инструкция
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Telegram Client API](https://gram.js.org/)

## 📄 Лицензия

ISC
