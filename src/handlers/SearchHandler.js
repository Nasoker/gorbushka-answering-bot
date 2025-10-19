import { getGoogleSheetsService } from '../services/GoogleSheetsService.js';

/**
 * Обработчик поиска в Google Sheets
 */
export class SearchHandler {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.sheetsService = getGoogleSheetsService(config.googleSheets);
        this.initialized = false;
    }

    /**
     * Инициализация сервиса
     */
    async initialize() {
        if (!this.initialized) {
            await this.sheetsService.initialize();
            this.initialized = true;
        }
    }

    /**
     * Обработка сообщения и поиск в таблице
     */
    async handleMessage(event) {
        try {
            const message = event.message;

            // Пропускаем сообщения от самого бота
            const me = await this.bot.getUser();
            if (message.senderId === me?.id) {
                return;
            }

            // Пропускаем пустые сообщения
            if (!message.text || message.text.trim().length === 0) {
                return;
            }
            console.log(message, "message");
        } catch (error) {
            console.error('❌ Ошибка в SearchHandler:', error.message);
        }
    }

    /**
     * Поиск по конкретной колонке
     */
    async searchInColumn(columnName, searchText) {
        try {
            // Получаем заголовки
            const headers = await this.sheetsService.getHeaders();
            const columnIndex = headers.indexOf(columnName);

            if (columnIndex === -1) {
                console.log(`⚠️ Колонка "${columnName}" не найдена`);
                return [];
            }

            return await this.sheetsService.searchByText(searchText, { columnIndex });
        } catch (error) {
            console.error(`❌ Ошибка поиска в колонке ${columnName}:`, error.message);
            return [];
        }
    }

    /**
     * Получение информации о таблице
     */
    async getTableInfo() {
        try {
            const info = await this.sheetsService.getSpreadsheetInfo();
            if (info) {
                console.log(`📊 Таблица: ${info.title}`);
                console.log(`📄 Листов: ${info.sheets.length}`);
                info.sheets.forEach(sheet => {
                    console.log(`   - ${sheet.title} (${sheet.rowCount}x${sheet.columnCount})`);
                });
            }
            return info;
        } catch (error) {
            console.error('❌ Ошибка получения информации о таблице:', error.message);
            return null;
        }
    }
}
