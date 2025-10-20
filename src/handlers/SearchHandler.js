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
            
            const senderId = message.fromId?.userId?.value || message.senderId;
            const sender = await this.bot.findParticipantById(this.config.group.chatId, senderId);
           
            if (!sender) return;
        } catch (error) {
            console.error('❌ Ошибка в SearchHandler:', error.message);
            console.error('Stack:', error.stack);
        }
    }

    /**
     * Форматирование результатов поиска для отправки пользователю
     */
    formatSearchResults(searchText, results) {
        const maxResults = 5; // Максимум результатов для показа
        const limitedResults = results.slice(0, maxResults);
        
        let message = `🔍 Найдено товаров по запросу "${searchText}": ${results.length}\n\n`;

        limitedResults.forEach((result, index) => {
            message += `${index + 1}. `;
            
            // Выводим все поля из строки, кроме служебных (_rowNumber, _matchedColumn, _matchedValue)
            const entries = Object.entries(result).filter(([key]) => !key.startsWith('_'));
            
            entries.forEach(([key, value], idx) => {
                if (value && value.toString().trim()) {
                    message += `${key}: ${value}`;
                    if (idx < entries.length - 1) {
                        message += '\n   ';
                    }
                }
            });
            
            message += '\n\n';
        });

        if (results.length > maxResults) {
            message += `📋 Показаны первые ${maxResults} из ${results.length} результатов.`;
        }

        return message;
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
            return info;
        } catch (error) {
            console.error('❌ Ошибка получения информации о таблице:', error.message);
            return null;
        }
    }
}
