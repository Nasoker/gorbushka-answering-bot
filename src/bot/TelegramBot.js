import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { config } from '../config/config.js';

/**
 * Базовый класс для Telegram бота
 */
export class TelegramBot {
    constructor(options = {}) {
        this.config = options.config || config;
        this.client = null;
        this.isRunning = false;
    }

    /**
     * Создание клиента Telegram
     */
    createClient() {
        const { apiId, apiHash, sessionString } = this.config.telegram;
        const session = new StringSession(sessionString);

        this.client = new TelegramClient(session, apiId, apiHash, {
            connectionRetries: this.config.client.connectionRetries,
        });

        return this.client;
    }

    /**
     * Авторизация в Telegram
     */
    async authenticate(callbacks = {}) {
        const { phoneNumber } = this.config.telegram;

        await this.client.start({
            phoneNumber: async () => phoneNumber,
            password: callbacks.password || (async () => ''),
            phoneCode: callbacks.phoneCode || (async () => ''),
            onError: (err) => {
                console.error('❌ Ошибка авторизации:', err);
                if (callbacks.onError) callbacks.onError(err);
            },
        });

        return this.client.session.save();
    }

    /**
     * Получение информации о сообщении из события
     * В GramJS sender уже доступен в event
     */
    getMessageInfo(event) {
        const message = event.message;
        const sender = event.sender; // Отправитель уже есть в event
        const chat = event.chat; // Чат тоже есть в event

        return { 
            message,
            chat, 
            sender,
            senderId: message?.senderId
        };
    }

    /**
     * Подписка на новые сообщения
     */
    subscribeToMessages(handler) {
        const { chatId } = this.config.group;

        this.client.addEventHandler(handler, new NewMessage({
            chats: [chatId],
        }));
    }

    /**
     * Получение информации о текущем пользователе
     */
    async getUser() {
        try {
            const me = await this.client.getMe();
            return {
                id: me.id,
                username: me.username,
                firstName: me.firstName,
                lastName: me.lastName,
            };
        } catch (error) {
            console.error('❌ Не удалось получить информацию о пользователе:', error.message);
            return null;
        }
    }

    /**
     * Получение участников чата
     * @param {string|number} chatId - ID чата или username
     * @param {number} limit - Максимальное количество участников (по умолчанию 100)
     */
    async getChatParticipants(chatId, limit = 100) {
        try {
            const participants = await this.client.getParticipants(chatId, { limit });
            return participants;
        } catch (error) {
            console.error('❌ Ошибка получения участников чата:', error.message);
            return [];
        }
    }

    /**
     * Поиск участника чата по ID
     * @param {string|number} chatId - ID чата
     * @param {number|BigInt} userId - ID пользователя для поиска
     */
    async findParticipantById(chatId, userId) {
        try {
            const participants = await this.getChatParticipants(chatId);
            
            // Преобразуем BigInt в строку для надёжного сравнения
            const targetIdStr = userId.toString();
            
            const participant = participants.find(p => {
                // Получаем ID участника, обрабатывая разные форматы
                let pId = p.id;
                
                // Если это объект Integer с value
                if (pId && typeof pId === 'object' && 'value' in pId) {
                    pId = pId.value;
                }
                
                // Преобразуем в строку для сравнения
                const pIdStr = pId.toString();
                
                const match = pIdStr === targetIdStr;
                
                return match;
            });
            
            if (participant) {
                // Извлекаем чистый ID
                let cleanId = participant.id;

                if (cleanId && typeof cleanId === 'object' && 'value' in cleanId) {
                    cleanId = cleanId.value;
                }
                
                return {
                    id: cleanId,
                    username: participant.username,
                    firstName: participant.firstName,
                    lastName: participant.lastName,
                    phone: participant.phone,
                    bot: participant.bot
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Ошибка поиска участника:', error.message);
            return null;
        }
    }

    /**
     * Отправка личного сообщения пользователю (в ЛС, не в чат)
     * @param {number|string|Object} userId - ID пользователя
     * @param {string} messageText - Текст сообщения
     */
    async sendPrivateMessage(userId, messageText) {
        try {
            await this.client.sendMessage(userId, { 
                message: messageText 
            });
        } catch (error) {
            console.error('❌ Ошибка отправки личного сообщения::', error);
        }
    }

    /**
     * Отключение
     */
    async disconnect() {
        if (this.client) {
            await this.client.disconnect();
            this.isRunning = false;
        }
    }

    /**
     * Запуск бота
     */
    async start() {
        throw new Error('Метод start() должен быть реализован в дочернем классе');
    }
}

