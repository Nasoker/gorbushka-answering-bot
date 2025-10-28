#!/usr/bin/env node

/**
 * Скрипт для проверки конфигурации
 */

import { config } from '../src/config/config.js';
import fs from 'fs';

const checks = {
    '✅ API_ID': config.telegram.apiId && !isNaN(config.telegram.apiId),
    '✅ API_HASH': config.telegram.apiHash && config.telegram.apiHash !== 'your_api_hash',
    '✅ PHONE_NUMBER': config.telegram.phoneNumber && config.telegram.phoneNumber !== '+your_phone_number',
    '✅ GROUP_CHAT_ID': config.group.chatId && config.group.chatId !== 'your_group_id',
    '✅ SESSION_STRING (опционально)': config.telegram.sessionString && config.telegram.sessionString.length > 0,
};

let allGood = true;

Object.entries(checks).forEach(([key, value]) => {
    if (value) {
        console.log(`${key}`);
    } else {
        const icon = key.includes('опционально') ? '⚠️' : '❌';
        console.log(`${icon} ${key.replace('✅ ', '')}`);
        if (!key.includes('опционально')) {
            allGood = false;
        }
    }
});

// Проверка наличия .env файла
if (!fs.existsSync('.env')) {
    console.log('\n❌ Файл .env не найден!');
    allGood = false;
}

console.log('\n' + '='.repeat(50));

if (allGood) {
    console.log('\n✅ Конфигурация корректна! Можно запускать бота.\n');
} else {
    console.log('\n❌ Конфигурация некорректна. Исправьте ошибки выше.\n');
    process.exit(1);
}

