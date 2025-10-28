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
            
            console.log(`📋 Найдено ${privateChats.length} личных чатов из ${dialogs.length} всего чатов`);
            
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
            // Подписываемся на все новые сообщения для обнаружения новых чатов
            this.client.addEventHandler(this.handleNewChat.bind(this), new NewMessage({
                func: (event) => {
                    // Проверяем, что это новый чат (личный)
                    const chat = event.chat;
                    return chat && chat.className === 'User';
                }
            }));
            
            console.log('👂 Подписка на новые чаты активирована');
        } catch (error) {
            console.error('❌ Ошибка подписки на новые чаты:', error.message);
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

        this.client.addEventHandler(handler, new NewMessage({
            chats: [chatId],
        }));
        console.log(`✅ Подписка на сообщения: ${chatId}`);
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
            await this.client.sendMessage(userId, { 
                message: messageText 
            });
        } catch (error) {
            console.error('❌ Ошибка отправки личного сообщения::', error);
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
            // Ищем пользователя в личных чатах
            const userResult = await this.findUserInAllChats(username, {
                onlyPrivateChats: true
            });
            
            if (!userResult) {
                console.error(`❌ Пользователь @${username} не найден в личных чатах`);
                return false;
            }

            await this.client.sendMessage(userResult.user.id, {
                message: messageText
            });
            
            console.log(`✅ Личное сообщение отправлено пользователю @${username}`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка отправки личного сообщения пользователю @${username}:`, error.message);
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

