import { TelegramBot } from './TelegramBot.js';
import { SearchHandler } from '../handlers/SearchHandler.js';
import input from 'input';

/**
 * Бот для мониторинга сообщений в группе
 */
export class MonitorBot extends TelegramBot {
    constructor(options = {}) {
        super(options);
        this.messageHandler = options.messageHandler || this.defaultMessageHandler.bind(this);
        this.searchHandler = new SearchHandler(this, this.config);
    }

    /**
     * Обработчик сообщений по умолчанию
     */
    async defaultMessageHandler(event) {
        try {
            await this.searchHandler.handleMessage(event);

        } catch (error) {
            console.error('❌ Ошибка обработки сообщения:', error.message);
        }
    }

    /**
     * Запуск бота
     */
    async start() {
        try {
            // Валидация конфигурации
            this.config.validate();

            // Создание клиента
            this.createClient();
            // Авторизация
            const sessionString = await this.authenticate({
                password: async () => await input.text('Введите пароль 2FA (если включен): '),
                phoneCode: async () => await input.text('Введите код из Telegram: '),
            });

            console.log('✅ Успешная авторизация!');

            // Сохранение сессии
            if (!this.config.telegram.sessionString) {
                console.log('\n📝 Сохраните эту строку сессии в переменную SESSION_STRING в .env:');
                console.log(sessionString);
                console.log('\n');
            } else {
                console.log('✅ Используется сохраненная сессия\n');
            }

            // Инициализация Google Sheets
            try {
                await this.searchHandler.initialize();
                const info = await this.searchHandler.getTableInfo();
            } catch (error) {
                console.error('⚠️ Ошибка подключения к Google Sheets:', error.message);
                console.log('ℹ️ Бот продолжит работу без поиска в таблицах\n');
            }

            // Подписка на сообщения
            this.subscribeToMessages(this.messageHandler);

            this.isRunning = true;
        } catch (error) {
            console.error('❌ Произошла ошибка:', error.message);
            process.exit(1);
        }
    }

}

