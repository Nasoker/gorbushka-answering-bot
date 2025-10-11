/**
 * Парсер товаров из сообщений пользователей
 */

// Словарь цветов (английский -> русский)
const COLOR_MAPPING = {
    // Основные цвета
    'black': 'черный',
    'white': 'белый',
    'blue': 'синий',
    'red': 'красный',
    'green': 'зеленый',
    'yellow': 'желтый',
    'orange': 'оранжевый',
    'purple': 'фиолетовый',
    'pink': 'розовый',
    'gray': 'серый',
    'grey': 'серый',

    // Специфичные цвета Apple
    'starlight': 'звездный свет',
    'midnight': 'полночь',
    'pacific blue': 'тихоокеанский синий',
    'gold': 'золотой',
    'silver': 'серебряный',
    'rose gold': 'розовое золото',
    'space gray': 'космический серый',
    'space grey': 'космический серый',
    'natural titanium': 'натуральный титан',
    'blue titanium': 'синий титан',
    'white titanium': 'белый титан',
    'black titanium': 'черный титан',

    // AirPods цвета
    'magic mouse': 'магическая мышь',
    'magic keyboard': 'магическая клавиатура'
};

// Словарь объемов памяти
const STORAGE_MAPPING = {
    '128': '128GB',
    '256': '256GB',
    '512': '512GB',
    '1024': '1TB',
    '2048': '2TB',
    '128gb': '128GB',
    '256gb': '256GB',
    '512gb': '512GB',
    '1tb': '1TB',
    '2tb': '2TB',
    '128гб': '128GB',
    '256гб': '256GB',
    '512гб': '512GB',
    '1тб': '1TB',
    '2тб': '2TB'
};

export class ProductParser {
    /**
     * Парсинг сообщения на предмет товаров
     */
    static parseMessage(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const products = [];
        const normalizedText = this.normalizeText(text);

        // Ищем iPhone
        products.push(...this.parseIPhone(normalizedText));

        // Ищем AirPods
        products.push(...this.parseAirPods(normalizedText));

        // Ищем MacBook
        products.push(...this.parseMacBook(normalizedText));

        // Ищем аксессуары
        products.push(...this.parseAccessories(normalizedText));

        return this.deduplicateProducts(products);
    }

    /**
     * Нормализация текста
     */
    static normalizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Убираем знаки препинания
            .replace(/\s+/g, ' ')     // Убираем лишние пробелы
            .trim();
    }

    /**
     * Парсинг iPhone
     */
    static parseIPhone(text) {
        const products = [];

        // Полное название iPhone
        let match;
        const iphoneRegex = /iphone\s+(\d+)(?:\s+(pro(?:\s+max)?))?(?:\s+(\d+(?:gb|tb|гб|тб)))?(?:\s+([a-zA-Zа-яё\s]+))?/gi;

        while ((match = iphoneRegex.exec(text)) !== null) {
            const model = match[1];
            const variant = match[2] || '';
            const storage = this.normalizeStorage(match[3]);
            const color = this.normalizeColor(match[4]);

            products.push({
                type: 'iPhone',
                model: model,
                variant: variant.trim(),
                storage: storage,
                color: color,
                simType: this.extractSimType(text),
                original: match[0]
            });
        }

        // Сокращенное название (только цифры)
        const shortRegex = /(?:^|\s)(\d+)(?:\s+(pro(?:\s+max)?|про(?:\s+мах)?))?(?:\s+(\d+(?:gb|tb|гб|тб)))?(?:\s+([a-zA-Zа-яё\s]+))?(?:\s|$)/gi;

        while ((match = shortRegex.exec(text)) !== null) {
            const model = match[1];

            // Проверяем, что это iPhone (версии 12+)
            if (parseInt(model) >= 12) {
                const variant = match[2] || '';
                const storage = this.normalizeStorage(match[3]);
                const color = this.normalizeColor(match[4]);

                products.push({
                    type: 'iPhone',
                    model: model,
                    variant: this.translateVariant(variant),
                    storage: storage,
                    color: color,
                    simType: this.extractSimType(text),
                    original: match[0].trim()
                });
            }
        }

        return products;
    }

    /**
     * Парсинг AirPods
     */
    static parseAirPods(text) {
        const products = [];
        const regex = /airpods\s+(pro\s+)?(\d+)?/gi;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const variant = match[1] ? 'Pro' : '';
            const generation = match[2] || '';

            products.push({
                type: 'AirPods',
                variant: variant + (generation ? ` ${generation}` : ''),
                original: match[0]
            });
        }

        return products;
    }

    /**
     * Парсинг MacBook
     */
    static parseMacBook(text) {
        const products = [];
        const regex = /macbook\s+(air|pro)?(?:\s+(\d+))?(?:\s+(m\d+))?(?:\s+(\d+))?(?:\s+(\d+(?:gb|tb|гб|тб)))?(?:\s+([a-zA-Zа-яё\s]+))?/gi;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const variant = match[1] || '';
            const size = match[2] || '';
            const chip = match[3] || '';
            const ram = match[4] || '';
            const storage = this.normalizeStorage(match[5]);
            const color = this.normalizeColor(match[6]);

            products.push({
                type: 'MacBook',
                variant: variant,
                size: size,
                chip: chip,
                ram: ram,
                storage: storage,
                color: color,
                original: match[0]
            });
        }

        return products;
    }

    /**
     * Парсинг аксессуаров
     */
    static parseAccessories(text) {
        const products = [];
        const regex = /(чехол|case)\s+([a-zA-Z\s]+)\s+(iphone\s+(\d+)(?:\s+(pro(?:\s+max)?))?)/gi;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const accessoryType = match[1];
            const brand = match[2].trim();
            const model = match[4];
            const variant = match[5] || '';

            products.push({
                type: 'Accessory',
                accessoryType: accessoryType,
                brand: brand,
                model: model,
                variant: variant,
                original: match[0]
            });
        }

        return products;
    }

    /**
     * Нормализация цвета
     */
    static normalizeColor(color) {
        if (!color) return null;

        const cleanColor = color.trim().toLowerCase();

        // Если уже на русском, возвращаем как есть
        if (/[а-яё]/.test(cleanColor)) {
            return cleanColor;
        }

        // Ищем в словаре переводов
        for (const [eng, rus] of Object.entries(COLOR_MAPPING)) {
            if (cleanColor.includes(eng)) {
                return rus;
            }
        }

        return cleanColor;
    }

    /**
     * Нормализация объема памяти
     */
    static normalizeStorage(storage) {
        if (!storage) return null;

        const cleanStorage = storage.trim().toLowerCase();
        return STORAGE_MAPPING[cleanStorage] || storage.toUpperCase();
    }

    /**
     * Перевод вариантов с русского на английский
     */
    static translateVariant(variant) {
        const translations = {
            'про': 'Pro',
            'про мах': 'Pro Max',
            'про max': 'Pro Max',
            'мах': 'Max'
        };

        return translations[variant.toLowerCase()] || variant;
    }

    /**
     * Извлечение типа SIM карты
     */
    static extractSimType(text) {
        if (/sim\s*\+\s*esim|sim\s*\+esim|sim\+esim/i.test(text)) {
            return 'sim+esim';
        } else if (/esim/i.test(text)) {
            return 'esim';
        } else if (/\d+\s*sim|sim/i.test(text)) {
            return 'sim';
        }
        return null;
    }

    /**
     * Удаление дубликатов товаров
     */
    static deduplicateProducts(products) {
        const seen = new Set();
        return products.filter(product => {
            const key = JSON.stringify({
                type: product.type,
                model: product.model,
                variant: product.variant,
                storage: product.storage,
                color: product.color
            });

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
    }

    /**
     * Форматирование товара для поиска в БД
     */
    static formatForSearch(product) {
        const searchTerms = [];

        // Основной тип товара
        searchTerms.push(product.type);

        // Модель
        if (product.model) {
            searchTerms.push(product.model);
        }

        // Вариант
        if (product.variant) {
            searchTerms.push(product.variant);
        }

        // Объем памяти
        if (product.storage) {
            searchTerms.push(product.storage);
        }

        // Цвет
        if (product.color) {
            searchTerms.push(product.color);
        }

        return searchTerms.join(' ');
    }
}

// Примеры использования для тестирования
export const EXAMPLE_MESSAGES = [
    "15 256GB Black 1 сим",
    "17 pro max 512 blue 1 sim",
    "AirPods Pro 2",
    "iPhone 17 Pro Max 1tb Orange sim + eSIM",
    "Куплю 17 про 256 белый",
    "Чехол Pitaka Aramid ProGuard iPhone 17 Pro OVER THE HORIZON",
    "17 pro 512 blue 1-sim",
    "Куплю 17 про мах 2тб синий sim+esim"
];
