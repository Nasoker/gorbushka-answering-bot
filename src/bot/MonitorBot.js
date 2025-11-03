import { TelegramBot } from './TelegramBot.js';
import { SearchHandler } from '../handlers/SearchHandler.js';
import { ApiServer } from '../services/ApiServer.js';
import { getLogger } from '../services/LoggerService.js';
import input from 'input';

/**
 * Бот для мониторинга сообщений в группе
 */
export class MonitorBot extends TelegramBot {
    constructor(options = {}) {
        super(options);
        this.logger = getLogger();
        this.messageHandler = options.messageHandler || this.defaultMessageHandler.bind(this);
        this.searchHandler = new SearchHandler(this, this.config);
        this.apiServer = new ApiServer({ port: 3001 });
    }

    /**
     * Обработчик сообщений по умолчанию
     */
    async defaultMessageHandler(event) {
        try {
            // Проверяем, включена ли обработка
            const stateManager = this.apiServer.getStateManager();
            
            if (!stateManager.isEnabled()) {
                // Обработка выключена - пропускаем сообщение
                return;
            }

            await this.searchHandler.handleMessage(event);
        } catch (error) {
            this.logger.error('MonitorBot', 'Ошибка обработки сообщения', { error: error.message });
        }
    }

    /**
     * Запуск бота
     */
    async start() {
        try {
            this.config.validate();
            
            // Запуск API сервера
            await this.apiServer.start();
            
            this.createClient();
            
            const sessionString = await this.authenticate({
                password: async () => await input.text('Введите пароль 2FA (если включен): '),
                phoneCode: async () => await input.text('Введите код из Telegram: '),
            });

            this.logger.info('MonitorBot', 'Успешная авторизация');

            if (!this.config.telegram.sessionString) {
                console.log('\n📝 Сохраните эту строку сессии в переменную SESSION_STRING в .env:');
                console.log(sessionString);
                console.log('\n');
            }

            // Инициализация базы данных
            try {
                await this.initializeDatabase();
            } catch (error) {
                this.logger.warning('MonitorBot', 'Ошибка инициализации БД, продолжаем без БД', { error: error.message });
            }

            // Инициализация Google Sheets
            try {
                await this.searchHandler.initialize();
                await this.searchHandler.getTableInfo();
            } catch (error) {
                this.logger.warning('MonitorBot', 'Ошибка подключения к Google Sheets, продолжаем без таблиц', { error: error.message });
            }

            this.subscribeToMessages(this.messageHandler);
            this.isRunning = true;
            
            this.logger.info('MonitorBot', 'Бот запущен и готов к работе');
        } catch (error) {
            this.logger.error('MonitorBot', 'Критическая ошибка при запуске', { error: error.message });
            process.exit(1);
        }
    }

    /**
     * Остановка бота
     */
    async disconnect() {
        this.logger.info('MonitorBot', 'Остановка бота');
        
        // Остановка API сервера
        if (this.apiServer) {
            await this.apiServer.stop();
        }
        
        // Отключение от Telegram
        await super.disconnect();
    }

}

