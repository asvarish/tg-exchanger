# Telegram Bot на NestJS

Telegram бот, построенный с использованием NestJS, nestjs-telegraf и PostgreSQL.

## 🚀 Быстрый старт

### Предварительные требования

- Node.js (версия 16 или выше)
- PostgreSQL
- Telegram Bot Token (получите у [@BotFather](https://t.me/BotFather))

### Установка

1. Клонируйте репозиторий:
```bash
git clone <your-repo-url>
cd tg-bot
```

2. Установите зависимости:
```bash
npm install --legacy-peer-deps
```

3. Настройте переменные окружения:
```bash
cp env.example .env
```

4. Отредактируйте файл `.env`:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=tg_bot
```

5. Создайте базу данных PostgreSQL:
```sql
CREATE DATABASE tg_bot;
```

### Запуск

#### Режим разработки
```bash
npm run start:dev
```

#### Продакшн режим
```bash
npm run build
npm run start:prod
```

## 📁 Структура проекта

```
src/
├── config/           # Конфигурации (база данных, etc.)
│   └── database.config.ts
├── modules/          # Модули приложения
│   └── bot/         # Модуль Telegram бота
│       ├── bot.module.ts
│       ├── bot.service.ts
│       └── bot.update.ts
├── common/           # Общие компоненты
│   └── entities/    # Сущности базы данных
│       └── user.entity.ts
├── app.module.ts    # Главный модуль приложения
└── main.ts          # Точка входа
```

## 🤖 Функциональность бота

### Доступные команды:
- `/start` - Начать работу с ботом
- `/help` - Показать справку

### Обработка сообщений:
- Текстовые сообщения (с базовой логикой распознавания)
- Стикеры
- Расширяемая архитектура для добавления новых типов сообщений

### Базовая логика обработки текста:
- Приветствия ("привет", "hello")
- Вопросы о самочувствии ("как дела", "how are you")
- Благодарности ("спасибо", "thanks")
- Эхо-ответ для остальных сообщений

## 🛠 Разработка

### Добавление новых команд

1. Откройте `src/modules/bot/bot.update.ts`
2. Добавьте новый метод с декоратором `@Command('command_name')`

```typescript
@Command('newcommand')
async newCommand(@Ctx() ctx: any) {
  await ctx.reply('Новая команда!');
}
```

### Добавление обработки новых типов сообщений

```typescript
@On('photo')
async onPhoto(@Ctx() ctx: any) {
  await ctx.reply('Получил фото!');
}
```

### Работа с базой данных

1. Создайте новую сущность в `src/common/entities/`
2. Добавьте её в конфигурацию TypeORM в `src/config/database.config.ts`
3. Используйте Repository для работы с данными

Пример добавления сущности в модуль:
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [BotUpdate, BotService],
  exports: [BotService],
})
export class BotModule {}
```

### Расширение бизнес-логики

Вся бизнес-логика находится в `src/modules/bot/bot.service.ts`. Добавляйте новые методы для обработки различных типов сообщений и команд.

## 📦 Скрипты

- `npm run start:dev` - Запуск в режиме разработки с автоперезагрузкой
- `npm run build` - Сборка проекта
- `npm run start:prod` - Запуск в продакшн режиме
- `npm run test` - Запуск тестов

## 🔧 Конфигурация

### База данных
Настройки подключения к PostgreSQL находятся в `src/config/database.config.ts`:
- Автоматическая синхронизация схемы в режиме разработки
- Логирование SQL запросов в режиме разработки
- Поддержка SSL для продакшн окружения

### Telegram Bot
Токен бота и другие настройки в файле `.env`

### Переменные окружения
- `TELEGRAM_BOT_TOKEN` - Токен вашего Telegram бота
- `DB_HOST` - Хост базы данных PostgreSQL
- `DB_PORT` - Порт базы данных (по умолчанию 5432)
- `DB_USERNAME` - Имя пользователя базы данных
- `DB_PASSWORD` - Пароль базы данных
- `DB_NAME` - Название базы данных
- `NODE_ENV` - Окружение (development/production)
- `PORT` - Порт для HTTP сервера (по умолчанию 3000)

## 🚨 Важные замечания

1. **Безопасность**: Никогда не коммитьте файл `.env` в репозиторий
2. **База данных**: В продакшн режиме отключите `synchronize: true` в конфигурации TypeORM
3. **Токен бота**: Храните токен бота в безопасном месте
4. **Зависимости**: Используйте `--legacy-peer-deps` при установке зависимостей из-за конфликтов версий

## 📝 Лицензия

ISC
