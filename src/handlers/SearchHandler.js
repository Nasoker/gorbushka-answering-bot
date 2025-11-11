import { getGoogleSheetsService } from '../services/GoogleSheetsService.js';
import { getAimlApiService } from '../services/AimlApiService.js';
import { getLogger } from '../services/LoggerService.js';

/**
 * Обработчик поиска в Google Sheets
 */
export class SearchHandler {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.sheetsService = getGoogleSheetsService(config.googleSheets);
        this.aimlService = getAimlApiService(config.aimlapi);
        this.initialized = false;
        this.logger = getLogger();
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
        const messageId = this.logger.incrementMessageCounter();
        
        try {
            const message = event.message;
            this.logger.info('SearchHandler', 'Получено сообщение', { text: message.text?.substring(0, 50) }, messageId);

            const me = await this.bot.getUser();
            if (message.senderId === me?.id) {
                return;
            }

            if (!message.text || message.text.trim().length === 0) {
                return;
            }

            if (!message.text.includes("17")) {
                return;
            }
            
            const senderId = message.fromId?.userId?.value || message.senderId;
            const userResult = await this.bot.findUserInAllChats(senderId);
            
            if (!userResult) {
                this.logger.warning('SearchHandler', 'Пользователь не найден', { senderId }, messageId);
                // await this.bot.forwardMessageToUser(193853539, message, this.config.group.chatId);
                return;
            }
            
            const sender = userResult.user;
            this.logger.info('SearchHandler', 'Пользователь найден', { username: sender.username || sender.firstName }, messageId);
                        
            if (!sender) {
                return;
            }

            this.logger.info('SearchHandler', 'Отправка в AIML API', null, messageId);
            const response = await this.aimlService.sendMessage(message.text);

            if (response.success && response.products && Array.isArray(response.products)) {
                
                if (response.products.length === 0) {
                    this.logger.warning('SearchHandler', 'AIML вернул пустой массив', null, messageId);
                    return;
                }

                this.logger.info('SearchHandler', 'Поиск цен начат', { productsCount: response.products.length }, messageId);
                
                let productsWithPrices;
                try {
                    productsWithPrices = await this.searchProductsWithPrices(response.products, messageId);
                } catch (error) {
                    // Ошибка при работе с Google Sheets (например, quota exceeded)
                    this.logger.error('SearchHandler', 'Ошибка поиска цен в Google Sheets', { 
                        error: error.message,
                        isQuotaError: error.message?.includes('Quota exceeded')
                    }, messageId);
                    // НЕ отправляем сообщение пользователю при ошибке
                    return;
                }
                
                const productsWithValidPrices = productsWithPrices.products.filter(p => p.price != null);
                this.logger.info('SearchHandler', 'Поиск цен завершен', { foundCount: productsWithValidPrices.length }, messageId);
                
                if (productsWithValidPrices.length === 0) {
                    this.logger.warning('SearchHandler', 'Нет товаров с ценами', null, messageId);
                    return;
                }
                
                const replyMessage = this.formatMessageWithPrices(message.text, productsWithPrices.products);

                if (!replyMessage || replyMessage.trim() === '') {
                    this.logger.warning('SearchHandler', 'Сформированное сообщение пустое', null, messageId);
                    return;
                }

                const delayPerProduct = this.getRandomDelay(5000, 7000);
                const totalDelay = delayPerProduct * productsWithValidPrices.length;
                
                this.logger.info('SearchHandler', 'Ожидание перед отправкой', { delayMs: totalDelay }, messageId);
                await this.delay(totalDelay);
                
                await this.bot.sendPrivateMessage(sender.username, replyMessage);
                this.logger.info('SearchHandler', 'Сообщение отправлено пользователю', { username: sender.username }, messageId);
            } else {
                this.logger.error('SearchHandler', 'Ошибка получения ответа от AIML API', { error: response.error }, messageId);
            }
        } catch (error) {
            this.logger.error('SearchHandler', 'Критическая ошибка', { 
                error: error.message,
                stack: error.stack 
            }, messageId);
        }
    }

    /**
     * Поиск товаров в Google Sheets и получение цен
     * @param {Array} products - Массив объектов {original: "...", normalized: "..."}
     * @param {number} messageId - ID сообщения для логирования
     */
    async searchProductsWithPrices(products, messageId) {
        const result = {
            allFound: true,
            products: [],
            notFound: []
        };

        // Получаем заголовки таблицы (может выбросить ошибку квоты)
        let headers, priceColumnName;
        try {
            headers = await this.sheetsService.getHeaders();
            priceColumnName = headers[1];
        } catch (error) {
            // Пробрасываем ошибку наверх (будет обработана в handleMessage)
            throw error;
        }

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const productObj = typeof product === 'string' 
                ? { original: product, normalized: product }
                : product;

            const originalText = productObj.original;
            const normalizedName = productObj.normalized;

            if (!normalizedName || normalizedName.trim() === '') {
                result.allFound = false;
                result.notFound.push(originalText);
                result.products.push({
                    original: originalText,
                    normalized: normalizedName,
                    price: null,
                    found: false
                });
                continue;
            }

            try {
                const searchResults = await this.sheetsService.searchByText(normalizedName, { 
                    columnIndex: 0,
                    exactMatch: true 
                });

                if (searchResults.length > 0) {
                    const foundProduct = searchResults[0];
                    const priceRaw = foundProduct[priceColumnName] || '';
                    
                    let price = 'нет цены';
                    if (priceRaw && typeof priceRaw === 'string') {
                        const parts = priceRaw.split(';');
                        if (parts.length === 2) {
                            price = parts[1].trim();
                        } else {
                            price = priceRaw;
                        }
                    }
                    
                    result.products.push({
                        original: originalText,
                        normalized: normalizedName,
                        price: price,
                        found: true
                    });
                } else {
                    result.allFound = false;
                    result.notFound.push(originalText);
                    result.products.push({
                        original: originalText,
                        normalized: normalizedName,
                        price: null,
                        found: false
                    });
                }
            } catch (error) {
                // Если это ошибка квоты - пробрасываем наверх
                if (error.message?.includes('Quota exceeded')) {
                    throw error;
                }
                
                // Для других ошибок - логируем и продолжаем
                this.logger.error('SearchHandler', 'Ошибка поиска товара', { 
                    product: normalizedName, 
                    error: error.message 
                }, messageId);
                result.allFound = false;
                result.notFound.push(originalText);
            }
        }

        return result;
    }

    /**
     * Генерирует случайную задержку в указанном диапазоне
     */
    getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Асинхронная задержка
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Форматирование сообщения с ценами, сохраняя исходный порядок строк
     */
    formatMessageWithPrices(originalMessage, productsWithPrices) {
        const lines = originalMessage.split('\n');
        const resultLines = [];

        const productsMap = new Map();
        productsWithPrices.forEach(product => {
            productsMap.set(product.original.trim(), product);
        });

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine === '') {
                resultLines.push('');
                continue;
            }
            
            let product = productsMap.get(trimmedLine);
            
            if (!product) {
                let cleanLine = trimmedLine.replace(/\s+/g, ' ').trim();
                
                if (cleanLine !== trimmedLine) {
                    product = productsMap.get(cleanLine);
                }
            }
            
            if (product && product.found && product.price && product.price !== 'нет цены' && product.price.trim() !== '') {
                resultLines.push(`${trimmedLine} ${product.price}`);
            } else {
                resultLines.push(trimmedLine);
            }
        }

        return resultLines.join('\n');
    }

    /**
     * Получение информации о таблице
     */
    async getTableInfo() {
        try {
            const info = await this.sheetsService.getSpreadsheetInfo();
            return info;
        } catch (error) {
            this.logger.error('SearchHandler', 'Ошибка получения информации о таблице', { error: error.message });
            return null;
        }
    }
}
