import { getGoogleSheetsService } from '../services/GoogleSheetsService.js';
import { getAimlApiService } from '../services/AimlApiService.js';

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

            const response = await this.aimlService.sendMessage(message.text);

            if (response.success && response.products && Array.isArray(response.products)) {
                
                if (response.products.length === 0) {
                    return;
                }

                const productsWithPrices = await this.searchProductsWithPrices(response.products);
                
                if (productsWithPrices.allFound) {
                    const messageHeader = this.extractMessageHeader(message.text, productsWithPrices.products);
                    const productsText = this.formatProductsWithPrices(productsWithPrices.products);
                    const replyMessage = messageHeader ? `${messageHeader}\n\n${productsText}` : productsText;

                    // Вычисляем задержку: 60-90 секунд на каждый товар
                    const delayPerProduct = this.getRandomDelay(60000, 90000); 
                    const totalDelay = delayPerProduct * productsWithPrices.products.length;
                    
                    await this.delay(totalDelay);
                    await this.bot.sendPrivateMessage(sender.username, replyMessage);
                } else {
                    console.log(`⚠️ Не все товары найдены в таблице. Пропускаем ответ.`);
                }
            } else {
                console.error(`❌ Ошибка получения ответа от AIML API: ${response.error}`);
            }

        } catch (error) {
            console.error('❌ Ошибка в SearchHandler:', error);
        }
    }

    /**
     * Поиск товаров в Google Sheets и получение цен
     * @param {Array} products - Массив объектов {original: "...", normalized: "..."}
     */
    async searchProductsWithPrices(products) {
        const result = {
            allFound: true,
            products: [],
            notFound: []
        };

        // Получаем заголовки один раз для всех товаров
        const headers = await this.sheetsService.getHeaders();
        const priceColumnName = headers[1]; // Столбец B (индекс 1) - цена

        for (const product of products) {
            // Если передана строка, конвертируем в объект для обратной совместимости
            const productObj = typeof product === 'string' 
                ? { original: product, normalized: product }
                : product;

            const originalText = productObj.original;
            const normalizedName = productObj.normalized;

            try {
                // Ищем точное совпадение в столбце A по normalized названию
                const searchResults = await this.sheetsService.searchByText(normalizedName, { 
                    columnIndex: 0,
                    exactMatch: true 
                });

                if (searchResults.length > 0) {
                    // Товар найден - берем первый результат
                    const foundProduct = searchResults[0];
                    
                    // Получаем значение цены из столбца B
                    const priceRaw = foundProduct[priceColumnName] || '';
                    
                    // Парсим формат "1;сумма" - берем только сумму после точки с запятой
                    let price = 'нет цены';
                    if (priceRaw && typeof priceRaw === 'string') {
                        const parts = priceRaw.split(';');
                        if (parts.length === 2) {
                            price = parts[1].trim(); // Берем сумму после ";"
                        } else {
                            price = priceRaw; // Если формат другой, возвращаем как есть
                        }
                    }
                    
                    result.products.push({
                        original: originalText,      // Оригинальная строка пользователя
                        normalized: normalizedName,  // Нормализованное название
                        price: price,
                        found: true
                    });
                } else {
                    // Товар не найден
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
                console.error(`❌ Ошибка поиска товара "${normalizedName}":`, error.message);
                result.allFound = false;
                result.notFound.push(originalText);
            }
        }

        return result;
    }

    /**
     * Генерирует случайную задержку в указанном диапазоне
     * @param {number} min - Минимальная задержка в миллисекундах
     * @param {number} max - Максимальная задержка в миллисекундах
     * @returns {number} - Случайная задержка
     */
    getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Асинхронная задержка
     * @param {number} ms - Задержка в миллисекундах
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Извлекает "заголовок" сообщения (например "Куплю")
     * Берет все что идет до первого упоминания товара
     */
    extractMessageHeader(messageText, products) {
        if (!products || products.length === 0) {
            return '';
        }

        // Ищем первое вхождение любого товара в сообщении
        let firstProductIndex = -1;
        for (const product of products) {
            const index = messageText.indexOf(product.original);
            if (index !== -1 && (firstProductIndex === -1 || index < firstProductIndex)) {
                firstProductIndex = index;
            }
        }

        if (firstProductIndex === -1) {
            return '';
        }

        // Берем все что до первого товара и убираем лишние пробелы/переносы в конце
        const header = messageText.substring(0, firstProductIndex).trim();
        return header;
    }

    /**
     * Форматирование товаров с ценами для отправки в чат
     * Использует оригинальную строку из сообщения + цену
     */
    formatProductsWithPrices(products) {
        const lines = products.map(product => {
            if (product.found && product.price) {
                // Используем оригинальную строку пользователя + добавляем цену
                return `${product.original} - ${product.price}`;
            }
            return product.original || product.name;
        });

        return lines.join('\n');
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
