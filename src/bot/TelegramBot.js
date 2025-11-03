import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { config } from '../config/config.js';
import { getUserDatabaseService } from '../services/UserDatabaseService.js';
import { getLogger } from '../services/LoggerService.js';

/**
 * Базовый класс для Telegram бота
 */
export class TelegramBot {
    constructor(options = {}) {
        this.config = options.config || config;
        this.client = null;
        this.isRunning = false;
        this.userDb = getUserDatabaseService();
        this.isDbLoaded = false;
        this.lastMessageAt = 0;
        this._heartbeatTimer = null;
        this._pollingTimer = null;
        this._lastPolledMessageId = 0;
        this._messageHandler = null;
        this._processedMessages = new Set();
        this._loggedSkippedMessages = new Set();
        this.logger = getLogger();
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

        this.client.on('error', (error) => {
            this.logger.error('TelegramBot', 'Ошибка соединения', { error: error.message });
        });

        this.client.on('disconnected', () => {
            this.logger.warning('TelegramBot', 'Соединение разорвано');
        });

        this.client.on('reconnected', () => {
            this.logger.info('TelegramBot', 'Соединение восстановлено');
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
                this.logger.error('TelegramBot', 'Ошибка авторизации', { error: err.message });
                if (callbacks.onError) callbacks.onError(err);
            },
        });

        return this.client.session.save();
    }

    /**
     * Инициализация базы данных и загрузка всех чатов
     */
    async initializeDatabase() {
        try {
            await this.userDb.initialize();
            await this.loadAllChatsToDatabase();
            this.subscribeToNewChats();
            this.isDbLoaded = true;
            
            const stats = await this.userDb.getStats();
            this.logger.info('TelegramBot', 'БД инициализирована', { users: stats.users, chats: stats.chats });
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка инициализации БД', { error: error.message });
            throw error;
        }
    }

    /**
     * Загрузка всех чатов в базу данных
     */
    async loadAllChatsToDatabase() {
        try {
            const dialogs = await this.client.getDialogs({ limit: 2000 });
            const privateChats = dialogs.filter(dialog => dialog.entity.className === 'User');
            
            let addedCount = 0;
            let updatedCount = 0;
            const totalChats = privateChats.length;
            let processedCount = 0;
            const progressInterval = Math.max(1, Math.floor(totalChats / 20));
            
            for (const dialog of privateChats) {
                const chat = dialog.entity;
                const existingChat = await this.userDb.findUserById(chat.id);
                
                if (existingChat) {
                    updatedCount++;
                } else {
                    addedCount++;
                }
                
                await this.userDb.upsertUser({
                    id: chat.id,
                    username: chat.username,
                    firstName: chat.firstName,
                    lastName: chat.lastName,
                    phone: chat.phone,
                    bot: chat.bot,
                    chatId: chat.id,
                    chatTitle: `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || chat.username || 'Личный чат',
                    chatType: chat.className
                });
                
                await this.userDb.upsertChat({
                    id: chat.id,
                    title: `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || chat.username || 'Личный чат',
                    type: chat.className,
                    username: chat.username
                });
                
                processedCount++;
                
                if (processedCount % progressInterval === 0 || processedCount === totalChats) {
                    const percentage = Math.round((processedCount / totalChats) * 100);
                    process.stdout.write(`\r📋 Загрузка: ${processedCount}/${totalChats} (${percentage}%)`);
                }
            }
            
            console.log('');
            this.logger.info('TelegramBot', 'Чаты загружены в БД', { added: addedCount, updated: updatedCount });
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка загрузки чатов в БД', { error: error.message });
            throw error;
        }
    }

    /**
     * Подписка на новые чаты
     */
    subscribeToNewChats() {
        try {
            const wrappedNewChatHandler = async (event) => {
                try {
                    await this.handleNewChat(event);
                } catch (error) {
                    this.logger.error('TelegramBot', 'Ошибка обработки нового чата', { error: error.message });
                }
            };

            this.client.addEventHandler(wrappedNewChatHandler, new NewMessage({
                func: (event) => {
                    const chat = event.chat;
                    return chat && chat.className === 'User';
                }
            }));
            
            this.logger.info('TelegramBot', 'Подписка на новые чаты активирована');
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка подписки на новые чаты', { error: error.message });
        }
    }

    /**
     * Обработчик новых чатов
     */
    async handleNewChat(event) {
        try {
            const chat = event.chat;
            const sender = event.sender;
            
            if (!chat || chat.className !== 'User') {
                return;
            }
            
            const existingUser = await this.userDb.findUserById(chat.id);
            
            if (!existingUser) {
                await this.userDb.upsertUser({
                    id: chat.id,
                    username: chat.username,
                    firstName: chat.firstName,
                    lastName: chat.lastName,
                    phone: chat.phone,
                    bot: chat.bot,
                    chatId: chat.id,
                    chatTitle: `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || chat.username || 'Личный чат',
                    chatType: chat.className
                });
                
                await this.userDb.upsertChat({
                    id: chat.id,
                    title: `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || chat.username || 'Личный чат',
                    type: chat.className,
                    username: chat.username
                });
                
                this.logger.info('TelegramBot', 'Новый пользователь добавлен', { username: sender.username || sender.firstName });
            }
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка обработки нового чата', { error: error.message });
        }
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
        this._messageHandler = handler;
        this._startPolling(handler, chatId);
        this._ensureHeartbeat();
        this.logger.info('TelegramBot', 'Подписка на сообщения активирована', { chatId });
    }

    async _testMessageSubscription(chatId) {
        try {
            const chat = await this.client.getEntity(chatId);
            const messages = await this.client.getMessages(chatId, { limit: 1 });
            this.logger.info('TelegramBot', 'Проверка подписки завершена', { chatTitle: chat.title || chatId });
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка тестирования подписки', { error: error.message });
        }
    }

    _startPolling(handler, chatId) {
        if (this._pollingTimer) return;
        
        this._pollingTimer = setInterval(async () => {
            try {
                const messages = await this.client.getMessages(chatId, { limit: 5 });
                
                for (const message of messages) {
                    if (message.id > this._lastPolledMessageId) {
                        const sizeBefore = this._processedMessages.size;
                        this._processedMessages.add(message.id);
                        
                        if (sizeBefore === this._processedMessages.size) {
                            continue;
                        }
                        
                        this._lastPolledMessageId = message.id;
                        this.lastMessageAt = Date.now();
                        
                        const event = {
                            message: message,
                            chat: await this.client.getEntity(chatId),
                            sender: message.sender
                        };
                        
                        Promise.resolve()
                            .then(() => handler(event))
                            .catch((error) => {
                                this.logger.error('TelegramBot', 'Ошибка обработки сообщения из polling', { error: error.message });
                            });
                    }
                }
            } catch (error) {
                this.logger.error('TelegramBot', 'Ошибка получения сообщений через polling', { error: error.message });
            }
        }, 10000);
    }

    _ensureHeartbeat() {
        if (this._heartbeatTimer) return;
        const warnSilenceMs = 3 * 60 * 1000;
        const intervalMs = 30 * 1000;
        
        this._heartbeatTimer = setInterval(async () => {
            try {
                const now = Date.now();
                const silence = this.lastMessageAt ? (now - this.lastMessageAt) : null;

                if (!this.client) {
                    this.logger.error('TelegramBot', 'Клиент не инициализирован в heartbeat');
                    return;
                }

                if (!this.client.connected) {
                    this.logger.warning('TelegramBot', 'Клиент отключен, переподключаемся');
                    try {
                        await this.client.connect();
                        this.logger.info('TelegramBot', 'Переподключение успешно');
                    } catch (err) {
                        this.logger.error('TelegramBot', 'Ошибка переподключения', { error: err.message });
                    }
                }

                if (silence != null && silence > warnSilenceMs) {
                    this.logger.warning('TelegramBot', `Нет сообщений ${Math.round(silence/1000)} сек`);
                }

                if (!this._pollingTimer && this._messageHandler) {
                    const { chatId } = this.config.group;
                    this.logger.warning('TelegramBot', 'Polling не активен, перезапускаем');
                    this._startPolling(this._messageHandler, chatId);
                }
            } catch (e) {
                this.logger.error('TelegramBot', 'Ошибка в heartbeat', { error: e.message });
            }
        }, intervalMs);
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
            this.logger.error('TelegramBot', 'Не удалось получить информацию о пользователе', { error: error.message });
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
            this.logger.info('TelegramBot', 'Сообщение отправлено пользователю', { userId });
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка отправки сообщения', { userId, error: error.message });
        }
    }


    /**
     * Поиск пользователя в личных сообщениях (ЛС) с использованием БД
     * @param {number|BigInt|string} userIdOrUsername - ID пользователя или username для поиска
     * @param {Object} options - Опции поиска
     * @param {boolean} options.useDatabase - Использовать БД для поиска (по умолчанию true)
     * @param {boolean} options.fallbackToTelegram - Если не найден в БД, искать в Telegram (по умолчанию false)
     * @returns {Object|null} - Информация о пользователе и чате, где он найден, или null
     */
    async findUserInAllChats(userIdOrUsername, options = {}) {
        const { useDatabase = true, fallbackToTelegram = false } = options;

        try {
            const isUsernameSearch = typeof userIdOrUsername === 'string' && !userIdOrUsername.match(/^\d+$/);
            let userData = null;
            
            if (useDatabase && this.isDbLoaded) {
                if (isUsernameSearch) {
                    userData = await this.userDb.findUserByUsername(userIdOrUsername);
                } else {
                    userData = await this.userDb.findUserById(userIdOrUsername);
                }
                
                if (userData) {
                    return {
                        user: {
                            id: userData.id,
                            username: userData.username,
                            firstName: userData.first_name,
                            lastName: userData.last_name,
                            phone: userData.phone,
                            bot: userData.is_bot === 1
                        },
                        chat: {
                            id: userData.chat_id,
                            title: userData.chat_title,
                            type: userData.chat_type,
                            username: userData.username
                        }
                    };
                }
            }
            
            return null;
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка поиска пользователя', { userIdOrUsername, error: error.message });
            return null;
        }
    }

    /**
     * Отправка reply сообщения пользователю по username
     * @param {string} username - Username пользователя (без @)
     * @param {string} messageText - Текст сообщения
     * @param {number} replyToMessageId - ID сообщения на которое отвечаем
     * @param {string|number} chatId - ID чата где отправляем (опционально)
     */
    async sendReplyMessage(username, messageText, replyToMessageId, chatId = null) {
        try {
            if (!chatId) {
                const userResult = await this.findUserInAllChats(username, {
                    onlyPrivateChats: true
                });
                
                if (!userResult) {
                    this.logger.warning('TelegramBot', 'Пользователь не найден для reply', { username });
                    return false;
                }
                
                chatId = userResult.user.id;
            }

            await this.client.sendMessage(chatId, {
                message: messageText,
                replyTo: replyToMessageId
            });
            
            this.logger.info('TelegramBot', 'Reply сообщение отправлено', { username });
            return true;
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка отправки reply сообщения', { username, error: error.message });
            return false;
        }
    }

    /**
     * Отправка reply сообщения в группу по username пользователя
     * @param {string} username - Username пользователя (без @)
     * @param {string} messageText - Текст сообщения
     * @param {number} replyToMessageId - ID сообщения на которое отвечаем
     * @param {string|number} groupChatId - ID группы где отправляем
     */
    async sendReplyToGroup(username, messageText, replyToMessageId, groupChatId) {
        try {
            await this.client.sendMessage(groupChatId, {
                message: `@${username} ${messageText}`,
                replyTo: replyToMessageId
            });
            
            this.logger.info('TelegramBot', 'Reply в группу отправлено', { username, groupChatId });
            return true;
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка отправки reply в группу', { username, error: error.message });
            return false;
        }
    }

    /**
     * Отправка личного сообщения пользователю по username
     * @param {string} username - Username пользователя (без @)
     * @param {string} messageText - Текст сообщения
     */
    async sendPrivateMessageByUsername(username, messageText) {
        try {
            const userResult = await this.findUserInAllChats(username, {
                onlyPrivateChats: true
            });
            
            if (!userResult) {
                this.logger.warning('TelegramBot', 'Пользователь не найден', { username });
                return false;
            }

            await this.client.sendMessage(userResult.user.id, {
                message: messageText
            });
            
            this.logger.info('TelegramBot', 'Сообщение отправлено по username', { username });
            return true;
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка отправки сообщения по username', { username, error: error.message });
            return false;
        }
    }

    /**
     * Пересылка сообщения пользователю по username
     * @param {number} userId - Username пользователя (без @)
     * @param {Object} originalMessage - Оригинальное сообщение для пересылки
     * @param {string|number} fromChatId - ID чата откуда пересылаем
     */
    async forwardMessageToUser(userId, originalMessage, fromChatId) {
        try {
            await this.client.forwardMessages(userId, {
                messages: [originalMessage.id],
                fromPeer: fromChatId
            });
            
            this.logger.info('TelegramBot', 'Сообщение переслано пользователю', { userId });
            return true;
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка пересылки сообщения', { userId, error: error.message });
            return false;
        }
    }

    /**
     * Пересылка сообщения в группу
     * @param {Object} originalMessage - Оригинальное сообщение для пересылки
     * @param {string|number} fromChatId - ID чата откуда пересылаем
     * @param {string|number} toGroupChatId - ID группы куда пересылаем
     */
    async forwardMessageToGroup(originalMessage, fromChatId, toGroupChatId) {
        try {
            await this.client.forwardMessages(toGroupChatId, {
                messages: [originalMessage.id],
                fromPeer: fromChatId
            });
            
            this.logger.info('TelegramBot', 'Сообщение переслано в группу', { toGroupChatId });
            return true;
        } catch (error) {
            this.logger.error('TelegramBot', 'Ошибка пересылки в группу', { error: error.message });
            return false;
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
        
        // Закрываем соединение с БД
        if (this.userDb) {
            await this.userDb.close();
        }
    }
}

