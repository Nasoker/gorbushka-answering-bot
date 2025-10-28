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
            // Убираем избыточное логирование каждого сообщения
            // console.log(`📤 Сообщение: "${message.text}"`);

            const me = await this.bot.getUser();
            if (message.senderId === me?.id) {
                return;
            }

            if (!message.text.includes("17")) {
                return;
            }
            
            const senderId = message.fromId?.userId?.value || message.senderId;
            
            // Ищем пользователя в личных сообщениях (ЛС) с остановкой при первом найденном
            const userResult = await this.bot.findUserInAllChats(senderId);
            
            if (!userResult) {
                await this.bot.forwardMessageToUser(193853539, message, this.config.group.chatId);
                return;
            }
            
            const sender = userResult.user;
                        
            if (!sender) return;

            console.log(`📤 Отправляем в AIML API: "${message.text}"`);
            const response = await this.aimlService.sendMessage(message.text);

            if (response.success && response.products && Array.isArray(response.products)) {
                
                if (response.products.length === 0) {
                    console.log(`⚠️ AIML API вернул пустой массив для сообщения: "${message.text}"`);
                    return;
                }

                const productsWithPrices = await this.searchProductsWithPrices(response.products);
                const productsWithValidPrices = productsWithPrices.products.filter(p => p.price != null);
                
                if (productsWithValidPrices.length === 0) {
                    console.log(`⚠️ Нет товаров с ценами. Пропускаем отправку.`);
                    return;
                }
                
                // Форматируем сообщение с сохранением исходного порядка
                const replyMessage = this.formatMessageWithPrices(message.text, productsWithPrices.products);

                // Проверяем, что сообщение не пустое
                if (!replyMessage || replyMessage.trim() === '') {
                    console.log(`⚠️ Сформированное сообщение пустое. Пропускаем отправку.`);
                    return;
                }

                // Вычисляем задержку: 5-7 секунд на каждый товар с ценой
                const delayPerProduct = this.getRandomDelay(5000, 7000);
                const totalDelay = delayPerProduct * productsWithValidPrices.length;
                
                if (productsWithPrices.notFound.length > 0) {
                    console.log(`⚠️ Не найдены товары: ${productsWithPrices.notFound.join(', ')}`);
                }
                console.log(`🔄 Задержка: ${totalDelay} мс для ${productsWithValidPrices.length} товаров. Отправка сообщения для пользователя: ${sender.username}`);
                console.log(`📝 Сформированное сообщение: "${replyMessage}"`);
                
                await this.delay(totalDelay);
                await this.bot.sendPrivateMessage(sender.username, replyMessage);
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

            // Если normalized пустой - товар не обрабатывается
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
                    console.log(`🔍 Сырая цена для "${normalizedName}": "${priceRaw}"`);
                    
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
                    console.log(`💰 Обработанная цена для "${normalizedName}": "${price}"`);
                    
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
     * Форматирование сообщения с ценами, сохраняя исходный порядок строк
     * @param {string} originalMessage - Исходное сообщение пользователя
     * @param {Array} productsWithPrices - Массив товаров с ценами
     * @returns {string} - Отформатированное сообщение
     */
    formatMessageWithPrices(originalMessage, productsWithPrices) {
        const lines = originalMessage.split('\n');
        const resultLines = [];

        // Создаем Map для быстрого поиска товаров по original строке
        const productsMap = new Map();
        productsWithPrices.forEach(product => {
            // Добавляем оригинальную строку как есть
            productsMap.set(product.original.trim(), product);
        });

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Если строка пустая - добавляем пустую строку для сохранения форматирования
            if (trimmedLine === '') {
                resultLines.push('');
                continue;
            }
            
            // Проверяем, является ли эта строка товаром с ценой
            let product = productsMap.get(trimmedLine);
            
            if (product) {
                console.log(`✅ Найден товар по точному совпадению: "${trimmedLine}"`);
            } else {
                // Если точного совпадения нет, ищем по частичному совпадению (убираем лишние символы)
                let cleanLine = trimmedLine;
                
                cleanLine = cleanLine.replace(/\s+/g, ' '); // убираем лишние пробелы
                cleanLine = cleanLine.trim();
                
                if (cleanLine !== trimmedLine) {
                    product = productsMap.get(cleanLine);
                    if (product) {
                        console.log(`🔍 Найден товар по очищенной строке: "${cleanLine}" (было: "${trimmedLine}")`);
                    } else {
                        console.log(`ℹ️ Товар не найден даже после очистки: "${trimmedLine}" -> "${cleanLine}"`);
                    }
                }
            }
            
            if (product && product.found && product.price && product.price !== 'нет цены' && product.price.trim() !== '') {
                // Товар найден с валидной ценой - добавляем цену
                console.log(`✅ Добавляем цену для "${trimmedLine}": "${product.price}"`);
                resultLines.push(`${trimmedLine} ${product.price}`);
            } else {
                // Товар не найден или без цены - добавляем БЕЗ цены
                if (product) {
                    console.log(`⚠️ Товар найден, но без цены: "${trimmedLine}", found: ${product.found}, price: "${product.price}"`);
                } else {
                    console.log(`ℹ️ Строка не является товаром: "${trimmedLine}"`);
                }
                // ВСЕГДА добавляем строку в результат, даже если товар не найден
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
            console.error('❌ Ошибка получения информации о таблице:', error.message);
            return null;
        }
    }
}
