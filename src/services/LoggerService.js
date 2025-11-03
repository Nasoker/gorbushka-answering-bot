import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Сервис логирования с сохранением в текстовые файлы
 * Каждый день создается новый файл (с 00:00 по МСК)
 * Хранятся логи за последние 2 дня
 */
export class LoggerService {
    constructor(config = {}) {
        this.logsDir = config.logsDir || path.resolve(process.cwd(), 'logs');
        this.maxDays = config.maxDays || 2;
        this.currentDate = null;
        this.currentFilePath = null;
        this.messageCounter = 0; // Счетчик сообщений для SearchHandler
        
        // Создаем директорию для логов если не существует
        this.ensureLogsDir();
        
        // Инициализируем файл логов
        this.initLogFile();
        
        // Запускаем проверку смены дня каждые 60 секунд
        this.startDayCheckInterval();
    }

    /**
     * Создание директории для логов
     */
    ensureLogsDir() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    /**
     * Получение текущей даты в МСК
     */
    getMoscowDate() {
        const now = new Date();
        // Смещение МСК = UTC+3
        const moscowTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
        const year = moscowTime.getUTCFullYear();
        const month = String(moscowTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(moscowTime.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Получение текущего времени в МСК
     */
    getMoscowTime() {
        const now = new Date();
        // Смещение МСК = UTC+3
        const moscowTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
        const hours = String(moscowTime.getUTCHours()).padStart(2, '0');
        const minutes = String(moscowTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(moscowTime.getUTCSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Инициализация файла логов
     */
    initLogFile() {
        const currentDate = this.getMoscowDate();
        
        // Если дата изменилась - создаем новый файл
        if (this.currentDate !== currentDate) {
            this.currentDate = currentDate;
            this.currentFilePath = path.join(this.logsDir, `${currentDate}.txt`);
            this.messageCounter = 0; // Сбрасываем счетчик при смене дня
            
            // Создаем новый пустой файл если не существует
            if (!fs.existsSync(this.currentFilePath)) {
                fs.writeFileSync(this.currentFilePath, '', 'utf8');
            }
            
            // Удаляем старые логи
            this.cleanOldLogs();
        }
    }

    /**
     * Удаление логов старше maxDays дней
     */
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logsDir);
            const now = new Date();
            const moscowNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));
            
            files.forEach(file => {
                // Удаляем старые txt и json файлы
                if (!file.endsWith('.txt') && !file.endsWith('.json')) return;
                
                const filePath = path.join(this.logsDir, file);
                const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.(txt|json)$/);
                
                if (dateMatch) {
                    const fileDate = new Date(dateMatch[1] + 'T00:00:00Z');
                    const daysDiff = Math.floor((moscowNow - fileDate) / (1000 * 60 * 60 * 24));
                    
                    // Удаляем файлы старше maxDays дней
                    if (daysDiff > this.maxDays) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ Удален старый лог: ${file}`);
                    }
                }
            });
        } catch (error) {
            console.error('❌ Ошибка очистки старых логов:', error.message);
        }
    }

    /**
     * Запуск интервала проверки смены дня
     */
    startDayCheckInterval() {
        setInterval(() => {
            const currentDate = this.getMoscowDate();
            if (this.currentDate !== currentDate) {
                this.initLogFile();
            }
        }, 60000); // Проверяем каждую минуту
    }

    /**
     * Запись лога
     * @param {string} level - Уровень лога (info, error, warning)
     * @param {string} source - Источник лога (например, SearchHandler, TelegramBot)
     * @param {string} message - Сообщение
     * @param {Object} data - Дополнительные данные
     * @param {number} messageId - ID сообщения (для SearchHandler)
     */
    log(level, source, message, data = null, messageId = null) {
        try {
            // Проверяем и обновляем файл если нужно
            this.initLogFile();
            
            const time = this.getMoscowTime();
            let logPrefix = `[${time}]`;
            
            // Добавляем номер сообщения для SearchHandler
            if (source === 'SearchHandler' && messageId) {
                logPrefix += `[msg:${messageId}]`;
            }
            
            // Формируем строку лога
            const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
            const logLine = `${logPrefix} [${level.toUpperCase()}] [${source}] ${message}${dataStr}\n`;
            
            // Добавляем строку в конец файла
            fs.appendFileSync(this.currentFilePath, logLine, 'utf8');
            
            // Выводим в консоль (без \n так как console.log добавит сам)
            process.stdout.write(logLine);
            
        } catch (error) {
            console.error('❌ Ошибка записи лога:', error.message);
        }
    }

    /**
     * Информационный лог
     */
    info(source, message, data = null, messageId = null) {
        this.log('info', source, message, data, messageId);
    }

    /**
     * Лог ошибки
     */
    error(source, message, data = null, messageId = null) {
        this.log('error', source, message, data, messageId);
    }

    /**
     * Лог предупреждения
     */
    warning(source, message, data = null, messageId = null) {
        this.log('warning', source, message, data, messageId);
    }

    /**
     * Инкремент счетчика сообщений
     */
    incrementMessageCounter() {
        this.messageCounter++;
        return this.messageCounter;
    }

    /**
     * Получение текущего счетчика сообщений
     */
    getMessageCounter() {
        return this.messageCounter;
    }
}

// Синглтон
let loggerInstance = null;

export function getLogger(config) {
    if (!loggerInstance) {
        loggerInstance = new LoggerService(config);
    }
    return loggerInstance;
}

