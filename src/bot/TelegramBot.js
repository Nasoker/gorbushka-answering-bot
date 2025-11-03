import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { config } from '../config/config.js';
import { getUserDatabaseService } from '../services/UserDatabaseService.js';

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
        this._messageHandler = null; // Сохраняем handler для перезапуска polling
        this._processedMessages = new Set(); // Для дедупликации сообщений
        this._loggedSkippedMessages = new Set(); // Для предотвращения спама в консоли
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

        // Обработчик ошибок соединения
        this.client.on('error', (error) => {
            console.error(`❌ [TelegramBot] Ошибка соединения:`, error.message);
            console.error(`❌ [TelegramBot] Stack trace:`, error.stack);
        });

        // Обработчик разрыва соединения
        this.client.on('disconnected', () => {
            console.log(`⚠️ [TelegramBot] Соединение разорвано`);
        });

        // Обработчик переподключения
        this.client.on('reconnected', () => {
            console.log(`✅ [TelegramBot] Соединение восстановлено`);
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
     * Инициализация базы данных и загрузка всех чатов
     */
    async initializeDatabase() {
        try {
            console.log('🔄 Инициализация базы данных...');
            
            // Инициализируем БД
            await this.userDb.initialize();
            
            // Загружаем все чаты в БД
            await this.loadAllChatsToDatabase();
            
            // Подписываемся на новые чаты
            this.subscribeToNewChats();
            
            this.isDbLoaded = true;
            console.log('✅ База данных инициализирована и загружена');
            
            // Показываем статистику
            const stats = await this.userDb.getStats();
            console.log(`📊 Статистика БД: ${stats.users} пользователей, ${stats.chats} чатов`);
            
        } catch (error) {
            console.error('❌ Ошибка инициализации базы данных:', error.message);
            throw error;
        }
    }

    /**
     * Загрузка всех чатов в базу данных
     */
    async loadAllChatsToDatabase() {
        try {
            console.log('📋 Загружаем все чаты в базу данных...');
            
            // Получаем все чаты
            const dialogs = await this.client.getDialogs({ limit: 2000 });
            
            // Фильтруем только личные чаты
            const privateChats = dialogs.filter(dialog => dialog.entity.className === 'User');
            
            let addedCount = 0;
            let updatedCount = 0;
            const totalChats = privateChats.length;
            let processedCount = 0;
            
            // Показываем прогресс каждые 50 пользователей
            const progressInterval = Math.max(1, Math.floor(totalChats / 20));
            
            for (const dialog of privateChats) {
                const chat = dialog.entity;
                
                // Проверяем, есть ли уже такой чат в БД
                const existingChat = await this.userDb.findUserById(chat.id);
                
                if (existingChat) {
                    updatedCount++;
                } else {
                    addedCount++;
                }
                
                // Добавляем/обновляем пользователя
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
                
                // Добавляем/обновляем чат
                await this.userDb.upsertChat({
                    id: chat.id,
                    title: `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || chat.username || 'Личный чат',
                    type: chat.className,
                    username: chat.username
                });
                
                processedCount++;
                
                // Показываем прогресс
                if (processedCount % progressInterval === 0 || processedCount === totalChats) {
                    const percentage = Math.round((processedCount / totalChats) * 100);
                    process.stdout.write(`\r📋 Загрузка: ${processedCount}/${totalChats} (${percentage}%)`);
                }
            }
            
            // Переходим на новую строку после прогресс-бара
            console.log('');
            
            console.log(`✅ Загрузка завершена: ${addedCount} новых, ${updatedCount} обновленных`);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки чатов в БД:', error.message);
            throw error;
        }
    }

    /**
     * Подписка на новые чаты
     */
    subscribeToNewChats() {
        try {
            // Создаем обертку для обработчика новых чатов с логированием ошибок
            const wrappedNewChatHandler = async (event) => {
                try {
                    console.log(`🆕 [TelegramBot] Обнаружен новый чат`);
                    await this.handleNewChat(event);
                    console.log(`✅ [TelegramBot] Новый чат обработан успешно`);
                } catch (error) {
                    console.error(`❌ [TelegramBot] Ошибка при обработке нового чата:`, error.message);
                    console.error(`❌ [TelegramBot] Stack trace:`, error.stack);
                    console.error(`❌ [TelegramBot] Event details:`, {
                        chatId: event.chat?.id,
                        chatType: event.chat?.className,
                        senderId: event.sender?.id
                    });
                }
            };

            // Подписываемся на все новые сообщения для обнаружения новых чатов
            this.client.addEventHandler(wrappedNewChatHandler, new NewMessage({
                func: (event) => {
                    // Проверяем, что это новый чат (личный)
                    const chat = event.chat;
                    return chat && chat.className === 'User';
                }
            }));
            
            console.log('👂 Подписка на новые чаты активирована');
        } catch (error) {
            console.error('❌ [TelegramBot] Ошибка подписки на новые чаты:', error.message);
            console.error('❌ [TelegramBot] Stack trace:', error.stack);
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
            
            // Проверяем, есть ли уже такой пользователь в БД
            const existingUser = await this.userDb.findUserById(chat.id);
            
            if (!existingUser) {
                console.log(`🆕 Обнаружен новый чат с пользователем: ${sender.username || sender.firstName}`);
                
                // Добавляем нового пользователя в БД
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
                
                // Добавляем новый чат в БД
                await this.userDb.upsertChat({
                    id: chat.id,
                    title: `${chat.firstName || ''} ${chat.lastName || ''}`.trim() || chat.username || 'Личный чат',
                    type: chat.className,
                    username: chat.username
                });
                
                console.log(`✅ Новый пользователь ${sender.username || sender.firstName} добавлен в БД`);
            }
            
        } catch (error) {
            console.error('❌ Ошибка обработки нового чата:', error.message);
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

        // Сохраняем handler для возможности перезапуска
        this._messageHandler = handler;

        // Используем ТОЛЬКО polling для получения сообщений
        this._startPolling(handler, chatId);
        console.log(`✅ [TelegramBot] Подписка на сообщения через polling: ${chatId}`);

        // Polling уже запущен как основной канал

        // Запускаем heartbeat, если еще не запущен
        this._ensureHeartbeat();
    }

    // Тестирование подписки на сообщения
    async _testMessageSubscription(chatId) {
        try {
            console.log(`🔍 [TelegramBot] Тестируем подписку на группу ${chatId}...`);
            
            // Проверяем, можем ли мы получить информацию о чате
            const chat = await this.client.getEntity(chatId);
            console.log(`✅ [TelegramBot] Чат найден: ${chat.title || chatId}`);
            
            // Проверяем последние сообщения
            const messages = await this.client.getMessages(chatId, { limit: 1 });
            if (messages.length > 0) {
                const lastMsg = messages[0];
                console.log(`📨 [TelegramBot] Последнее сообщение: "${lastMsg.text?.substring(0, 50)}..." от ${lastMsg.senderId}`);
            } else {
                console.log(`⚠️ [TelegramBot] Нет сообщений в чате`);
            }
            
            // Polling работает постоянно, переподписка не требуется
            console.log(`✅ [TelegramBot] Проверка polling завершена`);
            
        } catch (error) {
            console.error(`❌ [TelegramBot] Ошибка тестирования подписки:`, error.message);
            console.error(`❌ [TelegramBot] Stack trace:`, error.stack);
        }
    }

    // Альтернативный способ получения сообщений через polling
    _startPolling(handler, chatId) {
        if (this._pollingTimer) return;
        
        console.log(`🔄 [TelegramBot] Запускаем polling сообщений для группы ${chatId}`);
        
        this._pollingTimer = setInterval(async () => {
            try {
                const messages = await this.client.getMessages(chatId, { limit: 5 });
                
                for (const message of messages) {
                    if (message.id > this._lastPolledMessageId) {
                        // Дедупликация сообщений (атомарная проверка для защиты от race condition)
                        const sizeBefore = this._processedMessages.size;
                        this._processedMessages.add(message.id);
                        
                        // Если размер не изменился - сообщение уже было обработано
                        if (sizeBefore === this._processedMessages.size) {
                            // Логируем только один раз для каждого сообщения, чтобы не спамить консоль
                            if (!this._loggedSkippedMessages.has(message.id)) {
                                console.log(`🔄 [Polling] Сообщение ${message.id} уже обработано, пропускаем`);
                                this._loggedSkippedMessages.add(message.id);
                                
                                // Очищаем старые записи (оставляем только последние 100)
                                if (this._loggedSkippedMessages.size > 100) {
                                    const toDelete = Array.from(this._loggedSkippedMessages).slice(0, 50);
                                    toDelete.forEach(id => this._loggedSkippedMessages.delete(id));
                                }
                            }
                            continue;
                        }
                        
                        // Обновляем только если сообщение НЕ было обработано
                        this._lastPolledMessageId = message.id;
                        this.lastMessageAt = Date.now();
                        
                        console.log(`📨 [Polling] Получено сообщение: "${message.text?.substring(0, 50)}..." в ${new Date().toLocaleTimeString()}`);
                        
                        // Создаем событие в том же формате, что ожидает обработчик
                        const event = {
                            message: message,
                            chat: await this.client.getEntity(chatId),
                            sender: message.sender
                        };
                        
                        // Вызываем обработчик
                        Promise.resolve()
                            .then(() => handler(event))
                            .then(() => {
                                console.log(`✅ [Polling] Сообщение обработано успешно`);
                            })
                            .catch((error) => {
                                console.error(`❌ [Polling] Ошибка обработки:`, error.message);
                            });
                    }
                }
            } catch (error) {
                console.error(`❌ [Polling] Ошибка получения сообщений:`, error.message);
            }
        }, 10000); // Проверяем каждые 10 секунд
    }

    // Heartbeat: следим, что слушатель живой, при необходимости переподключаемся
    _ensureHeartbeat() {
        if (this._heartbeatTimer) return;
        const warnSilenceMs = 3 * 60 * 1000; // 3 минуты без сообщений — предупреждение
        const intervalMs = 30 * 1000; // проверка каждые 30 секунд (чаще)
        this._heartbeatTimer = setInterval(async () => {
            try {
                const now = Date.now();
                const silence = this.lastMessageAt ? (now - this.lastMessageAt) : null;
                
                // Более детальная диагностика
                console.log(`💓 [Heartbeat] Клиент=${this.client?.connected ? 'connected' : 'disconnected'} silenceMs=${silence ?? 'n/a'} lastMsg=${this.lastMessageAt ? new Date(this.lastMessageAt).toLocaleTimeString() : 'never'}`);

                // Проверяем состояние клиента
                if (!this.client) {
                    console.error('❌ [Heartbeat] Клиент не инициализирован!');
                    return;
                }

                if (!this.client.connected) {
                    console.warn('⚠️ [Heartbeat] Клиент отключен, пытаюсь переподключиться...');
                    try {
                        await this.client.connect();
                        console.log('✅ [Heartbeat] Переподключение успешно');
                        
                        // Polling продолжит работу автоматически после переподключения
                        console.log('✅ [Heartbeat] Переподключение завершено, polling активен');
                    } catch (err) {
                        console.error('❌ [Heartbeat] Ошибка переподключения:', err.message);
                    }
                }

                if (silence != null && silence > warnSilenceMs) {
                    console.warn(`⚠️ [Heartbeat] Нет входящих сообщений ${Math.round(silence/1000)} сек. Проверьте доступность слушателя/фильтры.`);
                    
                    // Попробуем принудительно проверить соединение
                    try {
                        const me = await this.client.getMe();
                        console.log(`🔍 [Heartbeat] Проверка соединения: я ${me.username || me.firstName}`);
                    } catch (err) {
                        console.error('❌ [Heartbeat] Ошибка проверки соединения:', err.message);
                    }
                } else if (silence != null && silence < 5000) {
                    // Сообщения приходят регулярно — оставляем polling активным как основной канал
                }

                // Гарантируем, что polling запущен
                if (!this._pollingTimer && this._messageHandler) {
                    const { chatId } = this.config.group;
                    console.log('🔄 [Heartbeat] Polling не активен, запускаем...');
                    this._startPolling(this._messageHandler, chatId);
                }
            } catch (e) {
                console.error('❌ [Heartbeat] Ошибка в heartbeat:', e.message);
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
            console.error('❌ Не удалось получить информацию о пользователе:', error.message);
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
            console.log(`📤 [TelegramBot] Отправляем сообщение пользователю ${userId}: "${messageText.substring(0, 50)}..."`);
            await this.client.sendMessage(userId, { 
                message: messageText 
            });
            console.log(`✅ [TelegramBot] Сообщение отправлено успешно пользователю ${userId}`);
        } catch (error) {
            console.error(`❌ [TelegramBot] Ошибка отправки личного сообщения пользователю ${userId}:`, error.message);
            console.error(`❌ [TelegramBot] Stack trace:`, error.stack);
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
        const {
            useDatabase = true,
            fallbackToTelegram = false
        } = options;

        try {
            // Убираем избыточное логирование поиска
            // console.log(`🔍 Поиск пользователя ${userIdOrUsername} в личных чатах...`);
            
            // Определяем тип поиска (по ID или по username)
            const isUsernameSearch = typeof userIdOrUsername === 'string' && !userIdOrUsername.match(/^\d+$/);
            
            let userData = null;
            
            // Сначала ищем в БД, если она загружена
            if (useDatabase && this.isDbLoaded) {
                if (isUsernameSearch) {
                    userData = await this.userDb.findUserByUsername(userIdOrUsername);
                } else {
                    userData = await this.userDb.findUserById(userIdOrUsername);
                }
                
                if (userData) {
                    // Убираем избыточное логирование найденных пользователей
                    // console.log(`✅ Пользователь найден в БД: ${userData.username || userData.first_name || userData.id}`);
                    
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
            
            console.log(`❌ Пользователь ${userIdOrUsername} не найден`);
            return null;
            
        } catch (error) {
            console.error('❌ Ошибка поиска пользователя:', error.message);
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
            // Если chatId не указан, ищем пользователя в личных чатах
            if (!chatId) {
                const userResult = await this.findUserInAllChats(username, {
                    onlyPrivateChats: true
                });
                
                if (!userResult) {
                    console.error(`❌ Пользователь @${username} не найден в личных чатах`);
                    return false;
                }
                
                chatId = userResult.user.id;
            }

            await this.client.sendMessage(chatId, {
                message: messageText,
                replyTo: replyToMessageId
            });
            
            console.log(`✅ Reply сообщение отправлено пользователю @${username}`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка отправки reply сообщения пользователю @${username}:`, error.message);
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
            
            console.log(`✅ Reply сообщение отправлено в группу для @${username}`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка отправки reply сообщения в группу для @${username}:`, error.message);
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
            console.log(`📤 [TelegramBot] Отправляем сообщение пользователю @${username}: "${messageText.substring(0, 50)}..."`);
            
            // Ищем пользователя в личных чатах
            const userResult = await this.findUserInAllChats(username, {
                onlyPrivateChats: true
            });
            
            if (!userResult) {
                console.error(`❌ [TelegramBot] Пользователь @${username} не найден в личных чатах`);
                return false;
            }

            console.log(`✅ [TelegramBot] Пользователь @${username} найден, отправляем сообщение`);
            await this.client.sendMessage(userResult.user.id, {
                message: messageText
            });
            
            console.log(`✅ [TelegramBot] Личное сообщение отправлено пользователю @${username}`);
            return true;
        } catch (error) {
            console.error(`❌ [TelegramBot] Ошибка отправки личного сообщения пользователю @${username}:`, error.message);
            console.error(`❌ [TelegramBot] Stack trace:`, error.stack);
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
            
            console.log(`✅ Сообщение переслано пользователю ${userId}`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка пересылки сообщения пользователю @${username}:`, error.message);
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
            
            console.log(`✅ Сообщение переслано в группу ${toGroupChatId}`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка пересылки сообщения в группу:`, error.message);
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

