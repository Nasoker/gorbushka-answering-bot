#!/usr/bin/env node

/**
 * Основная точка входа - Бот мониторинга
 */

import { MonitorBot } from './src/bot/MonitorBot.js';
import { config } from './src/config/config.js';

// Создание и запуск бота
const bot = new MonitorBot({ config });

// Обработка завершения работы
process.on('SIGINT', async () => {
    await bot.disconnect();
    process.exit(0);
});

// Запуск
bot.start().catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
});

