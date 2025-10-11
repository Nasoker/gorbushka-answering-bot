import { ProductParser } from '../utils/productParser.js';
import { getDatabase } from '../utils/database.js';

/**
 * Обработчик для поиска товаров в сообщениях и отправки результатов
 */
export class ProductHandler {
    constructor(bot) {
        this.bot = bot;
        this.db = getDatabase();
    }

    /**
     * Основной обработчик сообщений
     */
    async handleMessage(event) {
        try {
            const message = event.message;

            // Пропускаем сообщения от самого бота
            const me = await this.bot.getUser();
            if (message.senderId === me?.id) {
                return;
            }

            // Парсим товары из сообщения
            const products = ProductParser.parseMessage(message.text);

            if (products.length === 0) {
                return;
            }

            const foundProducts = [];

            for (const product of products) {
                console.log(`📦 Ищу: ${ProductParser.formatForSearch(product)}`);

                // Расширенный поиск по критериям
                const results = this.db.searchProductsAdvanced(product);

                if (results.length > 0) {
                    foundProducts.push({
                        requested: product,
                        found: results
                    });

                    console.log(`✅ Найдено совпадений: ${results.length}`);
                } else {
                    console.log(`❌ Не найдено`);
                }
            }

            // Если найдены товары, отправляем результаты
            if (foundProducts.length > 0) {
                await this.sendProductResults("", foundProducts);
            }

        } catch (error) {
            console.error('❌ Ошибка в ProductHandler:', error.message);
        }
    }

    /**
     * Отправка результатов поиска пользователю
     */
    async sendProductResults(username, foundProducts,) {
        try {
            let responseText = `🔍 По вашему запросу найдены товары:\n\n`;

            for (const { requested, found } of foundProducts) {
                // Заголовок товара
                responseText += `📱 **${this.formatProductName(requested)}**\n`;

                // Результаты поиска (максимум 3 товара)
                for (const product of found) {
                    responseText += `\n• ${product.name} ${product?.country}\n`;
                    responseText += `💰 Цена: ${this.formatPrice(product.price)} ₽\n`;
                    responseText += `\n`;
                }
            }

            // Ограничиваем длину сообщения
            if (responseText.length > 4000) {
                responseText = responseText.substring(0, 3900) + '\n\n... (сообщение обрезано)';
            }

            try {
                await this.bot.sendMessage("nasoker", { message: responseText });
                console.log(`📤 Результаты отправлены пользователю ${username}`);
                return;
            } catch (privateError) {
                console.log(`⚠️ Не удалось отправить личное сообщение: ${privateError.message}`);
            }

        } catch (error) {
            console.error('❌ Ошибка отправки результатов:', error.message);
        }
    }

    /**
     * Форматирование названия товара
     */
    formatProductName(product) {
        let name = product.type;

        if (product.model) {
            name += ` ${product.model}`;
        }

        if (product.variant) {
            name += ` ${product.variant}`;
        }

        if (product.storage) {
            name += ` ${product.storage}`;
        }

        if (product.color) {
            name += ` ${product.color}`;
        }

        return name;
    }

    /**
     * Форматирование цены
     */
    formatPrice(price) {
        if (!price) return 'Не указана';
        return new Intl.NumberFormat('ru-RU').format(price);
    }

    /**
     * Тестирование парсера на примерах
     */
    async testParser() {
        const { EXAMPLE_MESSAGES } = await import('../utils/productParser.js');

        console.log('\n🧪 Тестирование парсера товаров:\n');

        for (const message of EXAMPLE_MESSAGES) {
            console.log(`📝 Сообщение: "${message}"`);

            const products = ProductParser.parseMessage(message);

            if (products.length > 0) {
                console.log(`✅ Найдено товаров: ${products.length}`);

                for (const product of products) {
                    console.log(`   📦 ${this.formatProductName(product)}`);

                    // Тестовый поиск в БД
                    const results = this.db.searchProductsAdvanced(product);
                    console.log(`   🔍 Найдено в БД: ${results.length} совпадений`);
                }
            } else {
                console.log(`❌ Товары не найдены`);
            }

            console.log('');
        }
    }

    /**
     * Получение статистики БД
     */
    getDatabaseStats() {
        return this.db.getStats();
    }

    /**
     * Закрытие соединения с БД
     */
    close() {
        this.db.close();
    }
}
