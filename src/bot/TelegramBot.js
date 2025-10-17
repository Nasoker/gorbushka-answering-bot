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
     * Получение информации о сообщении
     */
    async getMessageInfo(message) {
        let chat = null;
        let sender = null;

            // Получение чата
            if (message.peerId) {
                try {
                    chat = await this.client.getEntity(message.peerId);
                } catch (e) {
                    chat = { title: 'Неизвестная группа', id: message.peerId };
                }
            }

            // Получение отправителя
            if (message.senderId) {
                try {
                    sender = await this.client.getEntity(message.senderId);
                } catch (e) {
                    // Игнорируем ошибку
                }
            }

        return { chat, sender };
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

