#!/usr/bin/env node

/**
 * Скрипт для сохранения сессии Telegram
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { config } from '../src/config/config.js';
import input from 'input';

async function saveSession() {
    try {
        console.log('🔐 Авторизация в Telegram...\n');

        // Валидация конфигурации
        config.validate();

        const { apiId, apiHash, phoneNumber, sessionString } = config.telegram;
        const session = new StringSession(sessionString);

        const client = new TelegramClient(session, apiId, apiHash, {
            connectionRetries: 5,
        });

        await client.start({
            phoneNumber: async () => phoneNumber,
            password: async () => {
                const password = await input.text('Введите пароль 2FA (если включен, иначе нажмите ENTER): ');
                if (password.trim() === '') {
                    throw new Error('NO_PASSWORD'); // Специальная ошибка для отсутствия пароля
                }
                return password;
            },
            phoneCode: async () => await input.text('Введите код из Telegram: '),
            onError: (err) => {
                if (err.message === 'NO_PASSWORD') {
                    console.log('ℹ️ 2FA не включен, продолжаем без пароля...');
                    return; // Игнорируем ошибку отсутствия пароля
                }
                console.error('❌ Ошибка:', err);
            },
        });

        console.log('\n✅ Успешная авторизация!');
        console.log('\n📝 Добавьте эту строку в файл .env:');
        console.log(`SESSION_STRING=${client.session.save()}`);
        console.log('\nПосле добавления сессии, бот будет запускаться без ввода кода.\n');

        await client.disconnect();
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

saveSession();

