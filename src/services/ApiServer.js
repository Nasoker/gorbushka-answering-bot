import express from 'express';
import { ProcessingStateManager } from './ProcessingStateManager.js';
import { getLogger } from './LoggerService.js';

/**
 * API сервер для управления answering-bot
 * Слушает только localhost для безопасности
 */
export class ApiServer {
    constructor(options = {}) {
        this.port = options.port || 3001;
        this.host = '127.0.0.1'; // Только localhost
        this.app = express();
        this.stateManager = new ProcessingStateManager();
        this.server = null;
        this.logger = getLogger();
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Настройка middleware
     */
    setupMiddleware() {
        // Парсинг JSON
        this.app.use(express.json());
    }

    /**
     * Настройка маршрутов
     */
    setupRoutes() {
        // Проверка доступности
        this.app.get('/api/ping', (req, res) => {
            res.json({ 
                success: true, 
                message: 'pong',
                timestamp: Date.now()
            });
        });

        // Получение состояния обработки
        this.app.get('/api/processing/state', (req, res) => {
            const state = this.stateManager.getState();
            res.json(state);
        });

        // Включение/выключение обработки
        this.app.post('/api/processing/toggle', (req, res) => {
            const { enabled } = req.body;
            
            if (typeof enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Параметр "enabled" должен быть boolean'
                });
            }
            
            const result = this.stateManager.setState(enabled);
            res.json(result);
        });


        // 404
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint не найден'
            });
        });

        // Обработка ошибок
        this.app.use((err, req, res, next) => {
            this.logger.error('ApiServer', 'Ошибка сервера', { error: err.message });
            res.status(500).json({
                success: false,
                error: 'Внутренняя ошибка сервера'
            });
        });
    }

    /**
     * Запуск сервера
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, this.host, () => {
                    this.logger.info('ApiServer', 'API сервер запущен', { url: `http://${this.host}:${this.port}` });
                    console.log(`🚀 API сервер: http://${this.host}:${this.port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        this.logger.error('ApiServer', `Порт ${this.port} уже используется`);
                    } else {
                        this.logger.error('ApiServer', 'Ошибка запуска сервера', { error: error.message });
                    }
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Остановка сервера
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('ApiServer', 'API сервер остановлен');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Получить менеджер состояний
     */
    getStateManager() {
        return this.stateManager;
    }
}

