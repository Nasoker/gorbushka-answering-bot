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

            console.log(`🔄 Сообщение от пользователя: ${sender.username} сообщение: ${message.text}`);

            const response = await this.aimlService.sendMessage(message.text);

            if (response.success && response.products && Array.isArray(response.products)) {
                
                if (response.products.length === 0) return

                const productsWithPrices = await this.searchProductsWithPrices(response.products);
                
                // Фильтруем только найденные товары
                const foundProducts = productsWithPrices.products.filter(p => p.found);
                
                if (foundProducts.length > 0) {
                    // Проверяем, есть ли товары с ценами
                    const productsWithValidPrices = foundProducts.filter(p => p.price && p.price !== 'нет цены' && p.price.trim() !== '');
                    console.log(`🔍 Товары с ценами: ${productsWithValidPrices.length}`);
                    if (productsWithValidPrices.length === 0) {
                        console.log(`⚠️ Все найденные товары без цен. Пропускаем ответ.`);
                        return;
                    }
                    
                    // Форматируем сообщение с сохранением исходного порядка
                    const replyMessage = this.formatMessageWithPrices(message.text, productsWithPrices.products);

                    // Вычисляем задержку: 5-7 секунд на каждый товар
                    const delayPerProduct = this.getRandomDelay(5000, 7000); 
                    const totalDelay = delayPerProduct * productsWithValidPrices.length;
                    
                    if (productsWithPrices.notFound.length > 0) {
                        console.log(`⚠️ Не найдены товары: ${productsWithPrices.notFound.join(', ')}`);
                    }
                    console.log(`🔄 Задержка: ${totalDelay} мс для ${productsWithValidPrices.length} товаров. Отправка сообщения для пользователя: ${sender.username}`);
                    
                    await this.delay(totalDelay);
                    await this.bot.sendPrivateMessage(sender.username, replyMessage);
                } else {
                    console.log(`⚠️ Ни один товар не найден в таблице. Пропускаем ответ.`);
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
            
            // Если строка пустая - сохраняем как есть
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
                
                // Убираем префиксы (Куплю, Продаю и т.д.)
                cleanLine = cleanLine.replace(/^(куплю|продаю|ищу|нужен|нужна|нужно)\s+/i, '');
                
                // Убираем различные суффиксы и числа
                cleanLine = cleanLine.replace(/\s*\?\?\?\s*$/, ''); // убираем "???"
                cleanLine = cleanLine.replace(/\s*-\s*\d+\s*шт\s*$/, ''); // убираем "- число шт" в конце
                cleanLine = cleanLine.replace(/\s*-\s*\d+\s*$/, ''); // убираем "- число" в конце
                cleanLine = cleanLine.replace(/\s*-\s*$/, ''); // убираем "-" в конце
                cleanLine = cleanLine.replace(/\s*\.\s*$/, ''); // убираем "." в конце
                
                // Убираем числа в разных позициях (например "white-5" -> "white")
                cleanLine = cleanLine.replace(/-\d+\s*/, ' '); // убираем "-число" в середине
                cleanLine = cleanLine.replace(/\s+\d+\s*$/, ''); // убираем " число" в конце
                
                // Убираем флаги стран и другие эмодзи
                cleanLine = cleanLine.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, ''); // убираем флаги стран
                cleanLine = cleanLine.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // убираем эмодзи лиц
                cleanLine = cleanLine.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // убираем другие эмодзи
                cleanLine = cleanLine.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // убираем транспортные эмодзи
                cleanLine = cleanLine.replace(/[\u{1F700}-\u{1F77F}]/gu, ''); // убираем алхимические эмодзи
                cleanLine = cleanLine.replace(/[\u{1F780}-\u{1F7FF}]/gu, ''); // убираем геометрические эмодзи
                cleanLine = cleanLine.replace(/[\u{1F800}-\u{1F8FF}]/gu, ''); // убираем дополнительные эмодзи
                cleanLine = cleanLine.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // убираем дополнительные символы
                cleanLine = cleanLine.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // убираем шахматные символы
                cleanLine = cleanLine.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // убираем дополнительные символы
                
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
            
            if (product && product.found && product.price) {
                // Товар найден - добавляем цену
                console.log(`✅ Добавляем цену для "${trimmedLine}": "${product.price}"`);
                resultLines.push(`${trimmedLine} ${product.price}`);
            } else {
                // Строка как есть (заголовок, не найденный товар или старая модель)
                if (product) {
                    console.log(`⚠️ Товар найден, но без цены: "${trimmedLine}", found: ${product.found}, price: "${product.price}"`);
                } else {
                    console.log(`ℹ️ Строка не является товаром: "${trimmedLine}"`);
                }
            }
        }

        return resultLines.join('\n');
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
