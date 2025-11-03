import { getLogger } from './LoggerService.js';

/**
 * Менеджер состояния обработки сообщений
 */
export class ProcessingStateManager {
    constructor() {
        this.enabled = false; // По умолчанию обработка выключена
        this.lastChanged = new Date().toISOString();
        this.logger = getLogger();
    }

    /**
     * Проверка, включена ли обработка
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Получение текущего состояния
     */
    getState() {
        return {
            enabled: this.enabled,
            lastChanged: this.lastChanged
        };
    }

    /**
     * Установка состояния обработки
     */
    setState(enabled) {
        this.enabled = enabled;
        this.lastChanged = new Date().toISOString();
        
        const message = enabled ? 'Обработка включена' : 'Обработка выключена';
        this.logger.info('ProcessingState', message);
        
        return {
            success: true,
            enabled: this.enabled,
            message: message
        };
    }
}

