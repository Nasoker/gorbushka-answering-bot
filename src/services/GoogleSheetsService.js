import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
        this.resolvedSheetName = null; // Имя листа, полученное по ID
    }

    /**
     * Инициализация подключения к Google Sheets
     */
    async initialize() {
        try {
            // Проверка наличия файла credentials
            const credentialsPath = path.resolve(this.config.credentialsPath);

            if (!fs.existsSync(credentialsPath)) {
                throw new Error(`Файл credentials.json не найден по пути: ${credentialsPath}`);
            }

            // Чтение credentials
            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

            // Создание JWT клиента
            this.auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                ['https://www.googleapis.com/auth/spreadsheets.readonly']
            );

            // Подключение
            await this.auth.authorize();

            // Создание клиента Google Sheets
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });

            // Получение имени листа по ID (если указан sheetGid)
            if (this.config.sheetGid) {
                this.resolvedSheetName = await this.getSheetNameById(parseInt(this.config.sheetGid));
            } else if (this.config.sheetName) {
                this.resolvedSheetName = this.config.sheetName;
            } else {
                throw new Error('Не указан ни GOOGLE_SHEET_GID, ни GOOGLE_SHEET_NAME');
            }

            return true;
        } catch (error) {
            console.error('❌ Ошибка инициализации Google Sheets:', error.message);
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
            console.error(`❌ Ошибка получения имени листа по ID ${sheetId}:`, error.message);
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
                range: `${this.resolvedSheetName}!A:Z`, // Читаем все колонки
            });

            const rows = response.data.values;

            if (!rows || rows.length === 0) {
                console.log('⚠️ Таблица пуста');
                return [];
            }
            return rows;
        } catch (error) {
            console.error('❌ Ошибка получения данных:', error.message);
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
            console.error(`❌ Ошибка получения диапазона ${range}:`, error.message);
            return [];
        }
    }

    /**
     * Поиск по тексту в таблице
     */
    async searchByText(searchText, options = {}) {
        try {
            const {
                columnIndex = null,  // Поиск в конкретной колонке (null = все колонки)
                caseSensitive = false,
                exactMatch = false,
            } = options;

            const allData = await this.getAllData();

            if (allData.length === 0) {
                return [];
            }

            // Первая строка - заголовки
            const headers = allData[0];
            const dataRows = allData.slice(1);

            const results = [];
            const normalizedSearch = caseSensitive ? searchText : searchText.toLowerCase();

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];

                // Определяем колонки для поиска
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
                        // Формируем объект с данными
                        const rowData = {};
                        headers.forEach((header, idx) => {
                            rowData[header] = row[idx] || '';
                        });

                        rowData._rowNumber = i + 2; // +2 потому что первая строка - заголовки, и нумерация с 1
                        rowData._matchedColumn = headers[colIdx];
                        rowData._matchedValue = cellValue;

                        results.push(rowData);
                        break; // Нашли совпадение в этой строке, переходим к следующей
                    }
                }
            }

            return results;
        } catch (error) {
            console.error('❌ Ошибка поиска:', error.message);
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

                // Проверяем все критерии
                for (const [columnName, searchValue] of Object.entries(criteria)) {
                    const columnIndex = headers.indexOf(columnName);

                    if (columnIndex === -1) {
                        console.warn(`⚠️ Колонка "${columnName}" не найдена`);
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
            console.error('❌ Ошибка поиска по критериям:', error.message);
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
            console.error('❌ Ошибка получения информации о таблице:', error.message);
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
            console.error('❌ Ошибка получения заголовков:', error.message);
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
