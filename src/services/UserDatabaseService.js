import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

/**
 * Сервис для работы с базой данных пользователей
 */
export class UserDatabaseService {
    constructor(dbPath = './data/users.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.isInitialized = false;
        
        // Создаем директорию для БД если её нет
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    /**
     * Инициализация базы данных
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Создаем подключение к БД
            this.db = new sqlite3.Database(this.dbPath);
            
            // Промисы для работы с БД
            this.dbRun = promisify(this.db.run.bind(this.db));
            this.dbGet = promisify(this.db.get.bind(this.db));
            this.dbAll = promisify(this.db.all.bind(this.db));

            // Создаем таблицу пользователей
            await this.createTables();
            
            this.isInitialized = true;
            console.log('✅ База данных пользователей инициализирована');
        } catch (error) {
            console.error('❌ Ошибка инициализации базы данных:', error.message);
            throw error;
        }
    }

    /**
     * Создание таблиц
     */
    async createTables() {
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                phone TEXT,
                is_bot BOOLEAN DEFAULT 0,
                chat_id TEXT,
                chat_title TEXT,
                chat_type TEXT,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createChatsTable = `
            CREATE TABLE IF NOT EXISTS chats (
                chat_id TEXT PRIMARY KEY,
                chat_title TEXT,
                chat_type TEXT,
                username TEXT,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await this.dbRun(createUsersTable);
        await this.dbRun(createChatsTable);
        
        // Создаем индексы для быстрого поиска
        await this.dbRun('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
        await this.dbRun('CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id)');
        await this.dbRun('CREATE INDEX IF NOT EXISTS idx_chats_username ON chats(username)');
    }

    /**
     * Добавление или обновление пользователя
     * @param {Object} userData - Данные пользователя
     */
    async upsertUser(userData) {
        try {
            const {
                id,
                username,
                firstName,
                lastName,
                phone,
                bot,
                chatId,
                chatTitle,
                chatType
            } = userData;

            const query = `
                INSERT OR REPLACE INTO users 
                (id, username, first_name, last_name, phone, is_bot, chat_id, chat_title, chat_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            await this.dbRun(query, [
                id.toString(), // Преобразуем ID в строку для поддержки BigInt
                username || null,
                firstName || null,
                lastName || null,
                phone || null,
                bot ? 1 : 0,
                chatId.toString(), // Преобразуем chatId в строку
                chatTitle || null,
                chatType || null
            ]);
            return true;
        } catch (error) {
            console.error('❌ Ошибка добавления пользователя в БД:', error.message);
            return false;
        }
    }

    /**
     * Добавление или обновление чата
     * @param {Object} chatData - Данные чата
     */
    async upsertChat(chatData) {
        try {
            const {
                id,
                title,
                type,
                username
            } = chatData;

            const query = `
                INSERT OR REPLACE INTO chats 
                (chat_id, chat_title, chat_type, username, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            await this.dbRun(query, [
                id.toString(), // Преобразуем ID в строку для поддержки BigInt
                title || null,
                type || null,
                username || null
            ]);

            return true;
        } catch (error) {
            console.error('❌ Ошибка добавления чата в БД:', error.message);
            return false;
        }
    }

    /**
     * Поиск пользователя по ID
     * @param {number|string} userId - ID пользователя
     * @returns {Object|null} - Данные пользователя
     */
    async findUserById(userId) {
        try {
            const query = 'SELECT * FROM users WHERE id = ?';
            const user = await this.dbGet(query, [userId.toString()]); // Преобразуем в строку
            return user;
        } catch (error) {
            console.error('❌ Ошибка поиска пользователя по ID:', error.message);
            return null;
        }
    }

    /**
     * Поиск пользователя по username
     * @param {string} username - Username пользователя
     * @returns {Object|null} - Данные пользователя
     */
    async findUserByUsername(username) {
        try {
            const query = 'SELECT * FROM users WHERE username = ?';
            const user = await this.dbGet(query, [username.toLowerCase()]);
            return user;
        } catch (error) {
            console.error('❌ Ошибка поиска пользователя по username:', error.message);
            return null;
        }
    }

    /**
     * Получение всех пользователей
     * @returns {Array} - Массив пользователей
     */
    async getAllUsers() {
        try {
            const query = 'SELECT * FROM users ORDER BY updated_at DESC';
            const users = await this.dbAll(query);
            return users;
        } catch (error) {
            console.error('❌ Ошибка получения всех пользователей:', error.message);
            return [];
        }
    }

    /**
     * Получение всех чатов
     * @returns {Array} - Массив чатов
     */
    async getAllChats() {
        try {
            const query = 'SELECT * FROM chats ORDER BY updated_at DESC';
            const chats = await this.dbAll(query);
            return chats;
        } catch (error) {
            console.error('❌ Ошибка получения всех чатов:', error.message);
            return [];
        }
    }

    /**
     * Получение статистики
     * @returns {Object} - Статистика БД
     */
    async getStats() {
        try {
            const userCount = await this.dbGet('SELECT COUNT(*) as count FROM users');
            const chatCount = await this.dbGet('SELECT COUNT(*) as count FROM chats');
            
            return {
                users: userCount.count,
                chats: chatCount.count
            };
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error.message);
            return { users: 0, chats: 0 };
        }
    }

    /**
     * Очистка старых записей (старше 30 дней)
     */
    async cleanupOldRecords() {
        try {
            const query = `
                DELETE FROM users 
                WHERE updated_at < datetime('now', '-30 days')
            `;
            
            const result = await this.dbRun(query);
            console.log(`🗑️ Очищено ${result.changes} старых записей пользователей`);
            return result.changes;
        } catch (error) {
            console.error('❌ Ошибка очистки старых записей:', error.message);
            return 0;
        }
    }

    /**
     * Закрытие соединения с БД
     */
    async close() {
        if (this.db) {
            await new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.db = null;
            this.isInitialized = false;
            console.log('📋 Соединение с БД закрыто');
        }
    }
}

// Создаем единственный экземпляр сервиса
let userDbService = null;

/**
 * Получение экземпляра сервиса БД
 * @param {string} dbPath - Путь к файлу БД
 * @returns {UserDatabaseService} - Экземпляр сервиса
 */
export function getUserDatabaseService(dbPath = './data/users.db') {
    if (!userDbService) {
        userDbService = new UserDatabaseService(dbPath);
    }
    return userDbService;
}
