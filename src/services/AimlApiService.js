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
            
            const systemPrompt = `Ты - эксперт по Apple iPhone. Твоя задача: распознать модели iPhone в сообщении пользователя и нормализовать их названия.

⚠️ КРИТИЧНО: Мы работаем ТОЛЬКО с iPhone 17 и iPhone Air!
Если упомянут iPhone 16, 15, 14 или старше → верни пустой массив []
Если упомянут НЕ Apple (Samsung, Xiaomi и т.д.) → верни пустой массив []

ФОРМАТ ОТВЕТА:
Верни ЧИСТЫЙ JSON массив БЕЗ markdown форматирования (без \`\`\`json).
Для КАЖДОГО товара верни объект:
- "original": точная строка из сообщения (БЕЗ слов "Куплю/Продаю/и т.д.")
- "normalized": полное название в формате "iPhone [Модель] [Память] [Цвет] [SIM]"

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

ПРАВИЛА НОРМАЛИЗАЦИИ:

1. МОДЕЛЬ (КРИТИЧНО):
   ⚠️ Если пользователь НЕ указал "17" или "air" → верни []
   
   - "17" БЕЗ "про" → "iPhone 17"
   - "17 про/pro" (БЕЗ "макс") → "iPhone 17 Pro"
   - "17 про макс/pro max" → "iPhone 17 Pro Max"
   - "air/аир" → "iPhone Air"
   
   ❌ ЗАПРЕЩЕНО:
   - "16" → [] (пустой массив)
   - "15" → [] (пустой массив)
   - "14" или старше → [] (пустой массив)
   - Samsung/Xiaomi/другие бренды → [] (пустой массив)

2. ПАМЯТЬ:
   - Если НЕ указана → используй минимальную (256GB для всех)
   - Доступно: 256GB, 512GB, 1TB, 2TB

3. ЦВЕТ (КРИТИЧНО):
   Сопоставляй сокращения/перевод с ТОЧНЫМИ названиями:
   
   Для iPhone 17:
   - "синий/blue/голубой/мист" → "Mist Blue"
   - "белый/white" → "White"
   - "черный/black" → "Black"
   - "зеленый/sage/сейдж" → "Sage"
   - "фиолетовый/lavender/лаванда" → "Lavender"
   
   Для iPhone 17 Pro/Pro Max:
   - "оранжевый/orange/космик" → "Cosmic Orange"
   - "синий/blue/дип/deep" → "Deep Blue"
   - "серебро/silver/серебряный" → "Silver"
   
   Для iPhone Air:
   - "белый/white/cloud" → "Cloud White"
   - "золотой/gold" → "Light Gold"
   - "синий/blue/sky" → "Sky Blue"
   - "черный/black/space" → "Space Black"
   
   ⚠️ Если цвет НЕ существует для модели → подбери похожий ИЗ СПИСКА выше

4. SIM:
   - Если НЕ указано → "1Sim" (кроме iPhone Air → "eSim")
   - Варианты: "1Sim", "2Sim", "eSim"
   - iPhone Air ТОЛЬКО "eSim"

ПРИМЕРЫ:

✅ ПРАВИЛЬНО (iPhone 17/Air):
Вход: "17 256 синий"
Выход: [{"original": "17 256 синий", "normalized": "iPhone 17 256 Mist Blue 1Sim"}]

Вход: "17 про макс 512 orange"
Выход: [{"original": "17 про макс 512 orange", "normalized": "iPhone 17 Pro Max 512 Cosmic Orange 1Sim"}]

Вход: "air gold"
Выход: [{"original": "air gold", "normalized": "iPhone Air 256 Light Gold eSim"}]

❌ НЕПРАВИЛЬНО (старые модели):
Вход: "16 pro max 256 desert"
Выход: []

Вход: "15 про 512"
Выход: []

Вход: "14 pro black"
Выход: []

Вход: "samsung galaxy s24"
Выход: []

ВАЖНО:
- Обрабатывай ТОЛЬКО iPhone 17, iPhone 17 Pro, iPhone 17 Pro Max, iPhone Air
- Все остальные модели (16, 15, 14 и старше) → возвращай []
- Используй ТОЛЬКО цвета из списка выше для соответствующих моделей
- НЕ выдумывай несуществующие комбинации
- Проверяй доступность SIM для модели (Air только eSim)
- НЕ Apple бренды (Samsung, Xiaomi и т.д.) → возвращай []`;
            
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
                max_tokens: 800,  // Увеличено для более сложных ответов
                temperature: 0.1,  // Снижено для максимальной точности
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
            
            // Очищаем от markdown форматирования (```json ... ```)
            responseText = responseText.trim();
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (responseText.startsWith('```')) {
                responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
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

