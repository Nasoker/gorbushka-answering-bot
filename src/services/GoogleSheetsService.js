import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './LoggerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Сервис для работы с Google Sheets
 */
export class GoogleSheetsService {
    constructor(config) {
        this.config = config;
        this.sheets = null;
        this.auth = null;
        this.resolvedSheetName = null;
        this.logger = getLogger();
    }

    /**
     * Инициализация подключения к Google Sheets
     */
    async initialize() {
        try {
            const credentialsPath = path.resolve(this.config.credentialsPath);

            if (!fs.existsSync(credentialsPath)) {
                throw new Error(`Файл credentials.json не найден по пути: ${credentialsPath}`);
            }

            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

            this.auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                ['https://www.googleapis.com/auth/spreadsheets.readonly']
            );

            await this.auth.authorize();
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });

            if (this.config.sheetGid) {
                this.resolvedSheetName = await this.getSheetNameById(parseInt(this.config.sheetGid));
            } else if (this.config.sheetName) {
                this.resolvedSheetName = this.config.sheetName;
            } else {
                throw new Error('Не указан ни GOOGLE_SHEET_GID, ни GOOGLE_SHEET_NAME');
            }

            this.logger.info('GoogleSheets', 'Подключение к Google Sheets успешно', { sheetName: this.resolvedSheetName });
            return true;
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка инициализации Google Sheets', { error: error.message });
            throw error;
        }
    }

    /**
     * Получение имени листа по его ID
     */
    async getSheetNameById(sheetId) {
        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.config.spreadsheetId,
            });

            const sheet = response.data.sheets.find(
                s => s.properties.sheetId === sheetId
            );

            if (!sheet) {
                throw new Error(`Лист с ID ${sheetId} не найден в таблице`);
            }

            return sheet.properties.title;
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка получения имени листа по ID', { sheetId, error: error.message });
            throw error;
        }
    }

    /**
     * Получение всех данных из таблицы
     */
    async getAllData() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.spreadsheetId,
                range: `${this.resolvedSheetName}!A:Z`,
            });

            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                return [];
            }
            return rows;
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка получения данных', { error: error.message });
            return [];
        }
    }

    /**
     * Получение данных из определенного диапазона
     */
    async getRange(range) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.spreadsheetId,
                range: `${this.resolvedSheetName}!${range}`,
            });

            return response.data.values || [];
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка получения диапазона', { range, error: error.message });
            return [];
        }
    }

    /**
     * Поиск по тексту в таблице
     */
    async searchByText(searchText, options = {}) {
        try {
            const {
                columnIndex = null,
                caseSensitive = false,
                exactMatch = false,
            } = options;

            const allData = await this.getAllData();

            if (allData.length === 0) {
                return [];
            }

            const headers = allData[0];
            const dataRows = allData.slice(1);
            const results = [];
            const normalizedSearch = caseSensitive ? searchText : searchText.toLowerCase();

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                const columnsToSearch = columnIndex !== null ? [columnIndex] : row.map((_, idx) => idx);

                for (const colIdx of columnsToSearch) {
                    const cellValue = row[colIdx] || '';
                    const normalizedCell = caseSensitive ? cellValue : cellValue.toLowerCase();

                    let isMatch = false;

                    if (exactMatch) {
                        isMatch = normalizedCell === normalizedSearch;
                    } else {
                        isMatch = normalizedCell.includes(normalizedSearch);
                    }

                    if (isMatch) {
                        const rowData = {};
                        headers.forEach((header, idx) => {
                            rowData[header] = row[idx] || '';
                        });

                        rowData._rowNumber = i + 2;
                        rowData._matchedColumn = headers[colIdx];
                        rowData._matchedValue = cellValue;

                        results.push(rowData);
                        break;
                    }
                }
            }

            return results;
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка поиска', { searchText, error: error.message });
            return [];
        }
    }

    /**
     * Поиск по нескольким критериям
     */
    async searchByMultipleCriteria(criteria) {
        try {
            const allData = await this.getAllData();

            if (allData.length === 0) {
                return [];
            }

            const headers = allData[0];
            const dataRows = allData.slice(1);
            const results = [];

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                let matchesAll = true;

                for (const [columnName, searchValue] of Object.entries(criteria)) {
                    const columnIndex = headers.indexOf(columnName);

                    if (columnIndex === -1) {
                        matchesAll = false;
                        break;
                    }

                    const cellValue = (row[columnIndex] || '').toLowerCase();
                    const searchValueLower = searchValue.toLowerCase();

                    if (!cellValue.includes(searchValueLower)) {
                        matchesAll = false;
                        break;
                    }
                }

                if (matchesAll) {
                    const rowData = {};
                    headers.forEach((header, idx) => {
                        rowData[header] = row[idx] || '';
                    });
                    rowData._rowNumber = i + 2;
                    results.push(rowData);
                }
            }

            return results;
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка поиска по критериям', { error: error.message });
            return [];
        }
    }

    /**
     * Получение информации о таблице
     */
    async getSpreadsheetInfo() {
        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.config.spreadsheetId,
            });

            return {
                title: response.data.properties.title,
                sheets: response.data.sheets.map(sheet => ({
                    title: sheet.properties.title,
                    id: sheet.properties.sheetId,
                    rowCount: sheet.properties.gridProperties.rowCount,
                    columnCount: sheet.properties.gridProperties.columnCount,
                })),
            };
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка получения информации о таблице', { error: error.message });
            return null;
        }
    }

    /**
     * Получение заголовков таблицы
     */
    async getHeaders() {
        try {
            const data = await this.getAllData();
            return data.length > 0 ? data[0] : [];
        } catch (error) {
            this.logger.error('GoogleSheets', 'Ошибка получения заголовков', { error: error.message });
            return [];
        }
    }
}

// Экспорт синглтона
let sheetsServiceInstance = null;

export function getGoogleSheetsService(config) {
    if (!sheetsServiceInstance) {
        sheetsServiceInstance = new GoogleSheetsService(config);
    }
    return sheetsServiceInstance;
}
