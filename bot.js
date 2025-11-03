#!/usr/bin/env node

/**
 * Основная точка входа - Бот мониторинга
 */

import { MonitorBot } from './src/bot/MonitorBot.js';
import { config } from './src/config/config.js';
import { getLogger } from './src/services/LoggerService.js';

const logger = getLogger();

// Создание и запуск бота
const bot = new MonitorBot({ config });

// Обработка завершения работы
process.on('SIGINT', async () => {
    logger.info('Main', 'Получен сигнал завершения, останавливаем бота');
    await bot.disconnect();
    process.exit(0);
});

// Запуск
bot.start().catch((error) => {
    logger.error('Main', 'Критическая ошибка при запуске', { error: error.message });
    process.exit(1);
});

