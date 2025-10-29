/**
 * Сервис для работы с AIML API
 */
export class AimlApiService {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
        
        if (!this.apiKey) {
            throw new Error('AIMLAPI_KEY не установлен в .env файле');
        }
    }

    /**
     * Отправка сообщения на AIML API
     * @param {string} message - Текст сообщения
     * @returns {Promise<Object>} - Ответ от API
     */
    async sendMessage(message) {
        try {
            const endpoint = `${this.baseUrl}/chat/completions`;
            
            const systemPrompt = `Ты - эксперт по Apple iPhone. Твоя задача: найти iPhone 17 или iPhone Air в сообщении и нормализовать их названия.

РАБОТАЕМ ТОЛЬКО С: iPhone 17, iPhone 17 Pro, iPhone 17 Pro Max, iPhone Air
(включая сокращенные варианты: "17", "17 Pro", "17 Pro Max", "Air")

ФОРМАТ ОТВЕТА: ТОЛЬКО JSON массив! БЕЗ markdown, БЕЗ комментариев!

Для КАЖДОГО товара верни объект:
- "original": ПОЛНАЯ строка из сообщения (ВСЕ как есть, НЕ УБИРАЙ НИЧЕГО!)
- "normalized": полное название в формате "iPhone [Модель] [Память] [Цвет] [SIM]"

⚠️ КРИТИЧНО: 
- В поле "original" должна быть ТОЧНО та же строка, что и в сообщении пользователя!
- Обрабатывай КАЖДУЮ строку отдельно
- Если строка НЕ содержит iPhone 17, iPhone Air или их сокращения (17, Air), то "normalized" должен быть пустой строкой ""
- Если в строке есть флаги стран (🇯🇵, 🇺🇸, 🇪🇺, 🇨🇳 и т.д.), то "normalized" должен быть пустой строкой ""
- Если в строке НЕТ указания про SIM-карту (sim, сим, esim, есим и т.д.), то "normalized" должен быть пустой строкой ""

ДОСТУПНЫЕ МОДЕЛИ (ТОЛЬКО ЭТИ!):

📱 iPhone 17:
   Цвета: Mist Blue, Sage, White, Black, Lavender
   Память: 256GB, 512GB
   SIM: 1Sim, 2Sim, eSim
   
📱 iPhone 17 Pro:
   Цвета: Cosmic Orange, Deep Blue, Silver
   Память: 256GB, 512GB, 1TB
   SIM: 1Sim, eSim
   
📱 iPhone 17 Pro Max:
   Цвета: Cosmic Orange, Deep Blue, Silver
   Память: 256GB, 512GB, 1TB, 2TB
   SIM: 1Sim, eSim
   
📱 iPhone Air:
   Цвета: Cloud White, Light Gold, Sky Blue, Space Black
   Память: 256GB, 512GB, 1TB
   SIM: eSim только

ПРАВИЛА:

1. МОДЕЛЬ:
   - "17" → "iPhone 17"
   - "17 про/pro" → "iPhone 17 Pro" 
   - "17 про макс/pro max" → "iPhone 17 Pro Max"
   - "17 air/air" → "iPhone Air"

2. ПАМЯТЬ: 256GB, 512GB, 1TB, 2TB (если не указана → 256GB)

3. ЦВЕТ:
   iPhone 17: Mist Blue, Sage, White, Black, Lavender
   iPhone 17 Pro/Pro Max: Cosmic Orange, Deep Blue, Silver
   iPhone Air: Cloud White, Light Gold, Sky Blue, Space Black
   
   ОСОБЫЕ ПРАВИЛА ДЛЯ iPhone 17 Pro/Pro Max:
   - Все варианты белого/серебристого → Silver:
     * "сильвер", "silver", "белый", "white", "сильвер белый", "silver white"
     * "серебристый", "серебро", "серебряный"
   
   Если цвет не найден → используй похожий (orange → Cosmic Orange)

4. SIM: 1Sim, 2Sim, eSim (если не указано → 1Sim, для Air → eSim)
   
   ПРАВИЛА НОРМАЛИЗАЦИИ SIM:
   - "1Sim" (одна SIM-карта):
     * "sim+esim", "сим есим", "сим+есим", "nano-SIM + eSim", "sim"
     * "1sim", "1 sim", "одна сим", "одна sim"
   
   - "2Sim" (две SIM-карты):
     * "сим+сим", "sim+sim", "2sim", "2 sim", "две сим", "две sim"
   
   - "eSim" (только eSim):
     * "nano-Sim", "нано-сим", "esim", "e-sim", "эсим"

ПРИМЕРЫ:

"Куплю 17 256 синий сим" → [{"original": "Куплю 17 256 синий", "normalized": "iPhone 17 256 Mist Blue 1Sim"}]
"17 про 512 orange сим" → [{"original": "17 про 512 orange", "normalized": "iPhone 17 Pro 512 Cosmic Orange 1Sim"}]
"17 Pro 256 Orange (eSIM)" → [{"original": "17 Pro 256 Orange (eSIM)", "normalized": "iPhone 17 Pro 256 Cosmic Orange eSim"}]
"13) Куплю 17 pro 512gb Orange 1 sim Европа ? ответил без цены" → [{"original": "13) Куплю 17 pro 512gb Orange 1 sim Европа ? ответил без цены", "normalized": "iPhone 17 Pro 512 Cosmic Orange 1Sim"}]

ПРИМЕРЫ ЦВЕТОВ ДЛЯ iPhone 17 Pro/Pro Max:
"17 pro 256 белый сим" → [{"original": "17 pro 256 белый", "normalized": "iPhone 17 Pro 256 Silver 1Sim"}]
"17 pro max 512 white сим" → [{"original": "17 pro max 512 white", "normalized": "iPhone 17 Pro Max 512 Silver 1Sim"}]

ПРИМЕРЫ SIM-КАРТ:
"17 pro 256 sim+esim" → [{"original": "17 pro 256 sim+esim", "normalized": "iPhone 17 Pro 256 Silver 1Sim"}]
"17 pro max сим+сим" → [{"original": "17 pro max сим+сим", "normalized": "iPhone 17 Pro Max 256 Silver 2Sim"}]
"17 air nano-Sim" → [{"original": "17 air nano-Sim", "normalized": "iPhone Air 256 Cloud White eSim"}]

ПРИМЕРЫ С ФЛАГАМИ СТРАН:
"17 Pro 256GB Orange 🇯🇵" → [{"original": "17 Pro 256GB Orange 🇯🇵", "normalized": ""}]
"17 pro max 512 white 🇺🇸" → [{"original": "17 pro max 512 white 🇺🇸", "normalized": ""}]
"17 Air 256GB 🇪🇺" → [{"original": "17 Air 256GB 🇪🇺", "normalized": ""}]

ПРИМЕРЫ БЕЗ SIM-КАРТЫ (ИГНОРИРОВАТЬ):
"17 Pro 256 Orange" → [{"original": "17 Pro 256 Orange", "normalized": ""}]
"17 256 синий" → [{"original": "17 256 синий", "normalized": ""}]
"17 Air 512 white" → [{"original": "17 Air 512 white", "normalized": ""}]

МНОГОСТРОЧНЫЕ СООБЩЕНИЯ:
"КУПЛЮ\n\n17 Pro 256 silver sim - 1шт" → [{"original": "КУПЛЮ", "normalized": ""}, {"original": "17 Pro 256 silver sim - 1шт", "normalized": "iPhone 17 Pro 256 Silver 1Sim"}]

ВАЖНО: Если НЕТ iPhone 17 или Air → верни []`;
            
            const requestBody = {
                model: "deepseek/deepseek-chat",  // DeepSeek: дешевая и быстрая альтернатива для структурированных задач
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                max_tokens: 500,  // Увеличено для длинных сообщений с множеством товаров
                temperature: 0.3,  // Увеличено для разнообразия ответов
            };
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AIML API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            let responseText = data.choices?.[0]?.message?.content || '';
            
            // Проверяем на подозрительные ответы (повторяющиеся символы или фразы)
            if (responseText.length > 200) {
                // Проверяем на повторяющиеся символы
                if (/^(.)\1{50,}$/.test(responseText)) {
                    console.error(`❌ Подозрительный ответ от API: повторяющиеся символы "${responseText[0]}"`);
                    return {
                        success: false,
                        error: `API вернул некорректный ответ: повторяющиеся символы`
                    };
                }
                
                // Проверяем на повторяющиеся фразы (более 5 повторений подряд)
                const lines = responseText.split('\n');
                let repeatCount = 0;
                let lastLine = '';
                for (const line of lines) {
                    if (line.trim() === lastLine && line.trim() !== '') {
                        repeatCount++;
                        if (repeatCount > 5) {
                            console.error(`❌ Подозрительный ответ от API: повторяющиеся фразы "${line.trim()}"`);
                            return {
                                success: false,
                                error: `API вернул некорректный ответ: повторяющиеся фразы`
                            };
                        }
                    } else {
                        repeatCount = 0;
                        lastLine = line.trim();
                    }
                }
            }
            // Очищаем от markdown форматирования и лишнего текста
            responseText = responseText.trim();
            
            // Убираем markdown блоки
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (responseText.startsWith('```')) {
                responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            // Ищем JSON массив в ответе (может быть в начале)
            const jsonMatch = responseText.match(/^(\[.*?\])/s);
            if (jsonMatch) {
                responseText = jsonMatch[1];
            }
            
            responseText = responseText.trim();
            
            // Пытаемся распарсить JSON ответ
            let parsedProducts = null;
            try {
                parsedProducts = JSON.parse(responseText);
            } catch (e) {
                console.error('❌ Ошибка парсинга JSON:', e.message);
                console.error('📄 Проблемный JSON:', responseText);
                console.error('📏 Длина ответа:', responseText.length);
                
                // Попробуем найти и исправить обрезанный JSON
                if (responseText.includes('"original"') && !responseText.endsWith(']')) {
                    console.log('🔧 Попытка исправления обрезанного JSON...');
                    
                    // Ищем последний полный объект
                    const lastCompleteObject = responseText.lastIndexOf('}');
                    if (lastCompleteObject > 0) {
                        const fixedJson = responseText.substring(0, lastCompleteObject + 1) + ']';
                        try {
                            parsedProducts = JSON.parse(fixedJson);
                            console.log('✅ JSON исправлен успешно');
                        } catch (e2) {
                            console.error('❌ Не удалось исправить JSON:', e2.message);
                        }
                    }
                }
            }

            return {
                success: true,
                data: data,
                text: responseText,
                products: parsedProducts,
                usage: data.usage
            };
        } catch (error) {
            console.error('❌ Ошибка при обращении к AIML API:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

/**
 * Фабричная функция для создания экземпляра сервиса
 */
export function getAimlApiService(config) {
    return new AimlApiService(config);
}

