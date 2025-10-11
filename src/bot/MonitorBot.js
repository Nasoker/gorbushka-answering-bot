import { TelegramBot } from './TelegramBot.js';
import { ProductHandler } from '../handlers/productHandler.js';
import input from 'input';

/**
 * Бот для мониторинга сообщений в группе
 */
export class MonitorBot extends TelegramBot {
    constructor(options = {}) {
        super(options);
        this.messageHandler = options.messageHandler || this.defaultMessageHandler.bind(this);
        this.productHandler = new ProductHandler(this);
    }

    /**
     * Обработчик сообщений по умолчанию
     */
    async defaultMessageHandler(event) {
        try {
            const message = event.message;
            await this.getMessageInfo(message);
            
            console.log(`└─ Текст: ${message.text || '[медиа или другой тип сообщения]'}`);

            // Обрабатываем товары в сообщении
            await this.productHandler.handleMessage(event);

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

            // Подписка на сообщения
            this.subscribeToMessages(this.messageHandler);

            this.isRunning = true;
        } catch (error) {
            console.error('❌ Произошла ошибка:', error.message);
            process.exit(1);
        }
    }

    /**
     * Отключение с закрытием БД
     */
    async disconnect() {
        if (this.productHandler) {
            this.productHandler.close();
        }
        await super.disconnect();
    }
}

