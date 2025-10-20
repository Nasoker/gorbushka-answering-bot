import dotenv from 'dotenv';

// Загрузка переменных окружения
dotenv.config();

/**
 * Конфигурация приложения
 */
export const config = {
    // Telegram API
    telegram: {
        apiId: parseInt(process.env.API_ID),
        apiHash: process.env.API_HASH,
        phoneNumber: process.env.PHONE_NUMBER,
        sessionString: process.env.SESSION_STRING || '',
    },

    // Настройки группы
    group: {
        chatId: process.env.GROUP_CHAT_ID,
    },

    // Настройки админа
    admin: {
        userId: process.env.ADMIN_ID || null,
    },

    // Google Sheets
    googleSheets: {
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
        sheetGid: process.env.GOOGLE_SHEET_GID, // ID листа (например: 1815081042)
        sheetName: process.env.GOOGLE_SHEET_NAME, // Опционально: имя листа
    },

    // AIML API
    aimlapi: {
        apiKey: process.env.AIMLAPI_KEY,
        baseUrl: 'https://api.aimlapi.com/v1',
    },

    // Опции клиента
    client: {
        connectionRetries: 5,
    },

    // Пути к файлам
    paths: {
        logs: './logs',
        data: './data',
        backups: './backups',
    },

    // Проверка наличия обязательных переменных
    validate() {
        const { apiId, apiHash, phoneNumber } = this.telegram;
        const { chatId } = this.group;

        if (!apiId || !apiHash || !phoneNumber || !chatId) {
            throw new Error(
                'Не все обязательные переменные окружения установлены! Проверьте .env файл.'
            );
        }

        return true;
    },
};

