import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Класс для работы с базой данных товаров
 */
export class ProductDatabase {
    constructor(dbPath = null) {
        // Путь к БД относительно корня проекта
        const dbFilePath = dbPath || path.join(__dirname, '../../data/bot.db');

        try {
            this.db = new Database(dbFilePath);
            this.db.pragma('journal_mode = WAL'); // Для лучшей производительности
            console.log('✅ Подключение к БД успешно');
        } catch (error) {
            console.error('❌ Ошибка подключения к БД:', error);
            throw error;
        }
    }

    /**
     * Поиск товаров по ключевым словам
     */
    searchProducts(searchTerm) {
        try {
            const normalizedTerm = this.normalizeSearchTerm(searchTerm);
            const searchPattern = `%${normalizedTerm}%`;

            const query = `
        SELECT 
          p.id_product,
          p.subcategory,
          p.chars_group,
          p.total_qty,
          p.price,
          p.country_abbr,
          b.name as brand_name
        FROM products p
        JOIN brands b ON p.id_brand = b.id
        WHERE 
          LOWER(p.subcategory) LIKE LOWER(?) OR
          LOWER(p.chars_group) LIKE LOWER(?) OR
          LOWER(b.name) LIKE LOWER(?)
        ORDER BY p.price ASC
        LIMIT 10
      `;

            const results = this.db.prepare(query).all(searchPattern, searchPattern, searchPattern);

            return results.map(row => ({
                id: row.id_product,
                name: row.chars_group || row.subcategory,
                brand: row.brand_name,
                category: row.subcategory,
                price: row.price,
                quantity: row.total_qty,
                country: row.country_abbr
            }));

        } catch (error) {
            console.error('❌ Ошибка поиска в БД:', error);
            return [];
        }
    }

    /**
     * Поиск товаров по нескольким критериям
     */
    searchProductsAdvanced(criteria) {
        try {
            // Сначала пробуем точный поиск
            let results = this.searchProductsExact(criteria);

            // Если точных совпадений нет, пробуем более гибкий поиск
            if (results.length === 0) {
                results = this.searchProductsFlexible(criteria);
            }

            return results;

        } catch (error) {
            console.error('❌ Ошибка расширенного поиска в БД:', error);
            return [];
        }
    }

    /**
     * Точный поиск товаров
     */
    searchProductsExact(criteria) {
        const conditions = [];
        const params = [];

        // Поиск по модели iPhone
        if (criteria.model && criteria.type === 'iPhone') {
            conditions.push('LOWER(p.subcategory) LIKE LOWER(?)');
            params.push(`%iphone ${criteria.model}%`);
        }

        // Поиск по варианту (Pro, Pro Max)
        if (criteria.variant) {
            const variant = criteria.variant.toLowerCase();
            conditions.push('LOWER(p.subcategory) LIKE LOWER(?)');
            params.push(`%${variant}%`);
        }

        // Поиск по объему памяти
        if (criteria.storage) {
            const storage = criteria.storage.toLowerCase();
            conditions.push('LOWER(p.chars_group) LIKE LOWER(?)');
            params.push(`%${storage}%`);
        }

        // Поиск по цвету
        if (criteria.color) {
            const color = criteria.color.toLowerCase();
            conditions.push('(LOWER(p.chars_group) LIKE LOWER(?) OR LOWER(p.subcategory) LIKE LOWER(?))');
            params.push(`%${color}%`, `%${color}%`);
        }

        if (conditions.length === 0) {
            return [];
        }

        const whereClause = conditions.join(' AND ');

        const query = `
      SELECT 
        p.id_product,
        p.subcategory,
        p.chars_group,
        p.total_qty,
        p.price,
        p.country_abbr,
        b.name as brand_name
      FROM products p
      JOIN brands b ON p.id_brand = b.id
      WHERE ${whereClause}
      ORDER BY p.price ASC
      LIMIT 10
    `;

        const results = this.db.prepare(query).all(...params);

        return results.map(row => ({
            id: row.id_product,
            name: row.chars_group || row.subcategory,
            brand: row.brand_name,
            category: row.subcategory,
            price: row.price,
            quantity: row.total_qty,
            country: row.country_abbr
        }));
    }

    /**
     * Гибкий поиск товаров (если точный не дал результатов)
     */
    searchProductsFlexible(criteria) {
        const searchTerms = [];

        // Собираем поисковые термины
        if (criteria.type) {
            searchTerms.push(criteria.type);
        }

        if (criteria.model && criteria.type === 'iPhone') {
            searchTerms.push(`iPhone ${criteria.model}`);
        }

        if (criteria.variant) {
            searchTerms.push(criteria.variant);
        }

        if (criteria.storage) {
            searchTerms.push(criteria.storage);
        }

        // Ищем по каждому термину отдельно
        const allResults = new Map();

        for (const term of searchTerms) {
            const query = `
        SELECT 
          p.id_product,
          p.subcategory,
          p.chars_group,
          p.total_qty,
          p.price,
          p.country_abbr,
          b.name as brand_name
        FROM products p
        JOIN brands b ON p.id_brand = b.id
        WHERE 
          LOWER(p.subcategory) LIKE LOWER(?) OR
          LOWER(p.chars_group) LIKE LOWER(?)
        ORDER BY p.price ASC
        LIMIT 5
      `;

            const searchPattern = `%${term.toLowerCase()}%`;
            const results = this.db.prepare(query).all(searchPattern, searchPattern);

            // Добавляем результаты без дубликатов
            for (const row of results) {
                const product = {
                    id: row.id_product,
                    name: row.chars_group || row.subcategory,
                    brand: row.brand_name,
                    category: row.subcategory,
                    price: row.price,
                    quantity: row.total_qty,
                    country: row.country_abbr
                };

                if (!allResults.has(product.id)) {
                    allResults.set(product.id, product);
                }
            }
        }

        // Сортируем по цене и возвращаем топ-5
        return Array.from(allResults.values())
            .sort((a, b) => (a.price || 0) - (b.price || 0))
            .slice(0, 5);
    }

    /**
     * Получение информации о товаре по ID
     */
    getProductById(id) {
        try {
            const query = `
        SELECT 
          p.id_product,
          p.subcategory,
          p.chars_group,
          p.total_qty,
          p.price,
          p.country_abbr,
          b.name as brand_name
        FROM products p
        JOIN brands b ON p.id_brand = b.id
        WHERE p.id_product = ?
      `;

            const result = this.db.prepare(query).get(id);

            if (result) {
                return {
                    id: result.id_product,
                    name: result.chars_group || result.subcategory,
                    brand: result.brand_name,
                    category: result.subcategory,
                    price: result.price,
                    quantity: result.total_qty,
                    country: result.country_abbr
                };
            }

            return null;

        } catch (error) {
            console.error('❌ Ошибка получения товара по ID:', error);
            return null;
        }
    }

    /**
     * Нормализация поискового термина
     */
    normalizeSearchTerm(term) {
        return term
            .toLowerCase()
            .replace(/iphone/gi, 'iPhone')
            .replace(/pro max/gi, 'Pro Max')
            .replace(/pro/gi, 'Pro')
            .replace(/airpods/gi, 'AirPods')
            .replace(/macbook/gi, 'MacBook')
            .trim();
    }

    /**
     * Получение статистики БД
     */
    getStats() {
        try {
            const totalProducts = this.db.prepare('SELECT COUNT(*) as count FROM products').get();
            const totalBrands = this.db.prepare('SELECT COUNT(*) as count FROM brands').get();
            const avgPrice = this.db.prepare('SELECT AVG(price) as avg FROM products WHERE price > 0').get();

            return {
                totalProducts: totalProducts.count,
                totalBrands: totalBrands.count,
                averagePrice: Math.round(avgPrice.avg || 0)
            };

        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            return null;
        }
    }

    /**
     * Поиск похожих товаров
     */
    findSimilarProducts(productName, limit = 3) {
        try {
            const query = `
        SELECT 
          p.id_product,
          p.subcategory,
          p.chars_group,
          p.total_qty,
          p.price,
          p.country_abbr,
          b.name as brand_name
        FROM products p
        JOIN brands b ON p.id_brand = b.id
        WHERE 
          LOWER(p.subcategory) LIKE LOWER(?) OR
          LOWER(p.chars_group) LIKE LOWER(?)
        ORDER BY p.price ASC
        LIMIT ?
      `;

            const searchPattern = `%${productName}%`;
            const results = this.db.prepare(query).all(searchPattern, searchPattern, limit);

            return results.map(row => ({
                id: row.id_product,
                name: row.chars_group || row.subcategory,
                brand: row.brand_name,
                category: row.subcategory,
                price: row.price,
                quantity: row.total_qty,
                country: row.country_abbr
            }));

        } catch (error) {
            console.error('❌ Ошибка поиска похожих товаров:', error);
            return [];
        }
    }

    /**
     * Закрытие соединения с БД
     */
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// Экспорт синглтона для использования в приложении
let dbInstance = null;

export function getDatabase() {
    if (!dbInstance) {
        dbInstance = new ProductDatabase();
    }
    return dbInstance;
}
