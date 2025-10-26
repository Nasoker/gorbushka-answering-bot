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

ФОРМАТ ОТВЕТА: ТОЛЬКО JSON массив! БЕЗ markdown, БЕЗ комментариев!

Для КАЖДОГО товара верни объект:
- "original": ПОЛНАЯ строка из сообщения (ВСЕ как есть, НЕ УБИРАЙ НИЧЕГО!)
- "normalized": полное название в формате "iPhone [Модель] [Память] [Цвет] [SIM]"

⚠️ КРИТИЧНО: 
- В поле "original" должна быть ТОЧНО та же строка, что и в сообщении пользователя!
- Обрабатывай КАЖДУЮ строку отдельно
- Если строка НЕ содержит iPhone 17 или Air, то "normalized" должен быть пустой строкой ""

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
   
   Если цвет не найден → используй похожий (orange → Cosmic Orange)

4. SIM: 1Sim, 2Sim, eSim (если не указано → 1Sim, для Air → eSim)

ПРИМЕРЫ:

"Куплю 17 256 синий" → [{"original": "Куплю 17 256 синий", "normalized": "iPhone 17 256 Mist Blue 1Sim"}]
"17 про 512 orange" → [{"original": "17 про 512 orange", "normalized": "iPhone 17 Pro 512 Cosmic Orange 1Sim"}]
"13) Куплю 17 pro 512gb Orange 1 sim Европа ? ответил без цены" → [{"original": "13) Куплю 17 pro 512gb Orange 1 sim Европа ? ответил без цены", "normalized": "iPhone 17 Pro 512 Cosmic Orange 1Sim"}]

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
                max_tokens: 300,  // Еще больше уменьшено для предотвращения зацикливания
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
            
            console.log(`🔄 Ответ от AIML API: ${responseText}`);
            
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
                console.log(`🔍 Извлечен JSON из ответа: ${responseText}`);
            }
            
            responseText = responseText.trim();
            
            // Пытаемся распарсить JSON ответ
            let parsedProducts = null;
            try {
                parsedProducts = JSON.parse(responseText);
            } catch (e) {
                console.warn('⚠️ Ошибка парсинга JSON:', e.message);
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

