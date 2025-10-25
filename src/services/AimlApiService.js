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

ПРАВИЛА ОБРАБОТКИ:
- Если ВСЕ товары необрабатываемые (16, 15, 14, не Apple) → верни пустой массив []
- Если есть СМЕШАННЫЕ товары (обрабатываемые + необрабатываемые) → верни массив с пустым normalized для необрабатываемых
- Если ВСЕ товары обрабатываемые → верни полный массив с normalized

ФОРМАТ ОТВЕТА:
Верни ТОЛЬКО ЧИСТЫЙ JSON массив. НИКАКИХ дополнительных комментариев, объяснений или текста!
БЕЗ markdown форматирования (без \`\`\`json).
БЕЗ заголовков, описаний или пояснений.
ТОЛЬКО JSON массив!

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
   
   - "17 air/air 17/17air/air17" → "iPhone Air" (ВАЖНО: это одна модель!)
   - "air/аир" (БЕЗ других слов) → "iPhone Air"
   - "17" БЕЗ "про" и БЕЗ "air" → "iPhone 17"
   - "17 про/pro/рro" (БЕЗ "макс") → "iPhone 17 Pro"
   - "17 про макс/pro max/рro max" → "iPhone 17 Pro Max"
   
   ТОЛЕРАНТНОСТЬ К ОПЕЧАТКАМ:
   - "рro" вместо "pro" → распознавай как "pro"
   - "макs/мака" вместо "макс" → распознавай как "макс"
   - "оранжевый" → распознавай как "orange"
   - "сим" → распознавай как "sim"
   - Небольшие опечатки в словах → исправляй автоматически
   
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
   
   Для iPhone 17 Air или Iphone Air:
   - "белый/white/cloud" → "Cloud White"
   - "золотой/gold" → "Light Gold"
   - "синий/blue/sky" → "Sky Blue"
   - "черный/black/space" → "Space Black"
   
   ⚠️ КРИТИЧНО: Если цвет НЕ существует для модели → верни [] (пустой массив)
   НЕ подбирай похожие цвета! Только точные совпадения из списка выше для каждой модели!

4. SIM:
   - Если НЕ указано → "1Sim" (кроме iPhone Air → "eSim")
   - Варианты: "1Sim", "2Sim", "eSim"
   - "без сим/без sim/no sim" → "eSim"
   - iPhone Air ТОЛЬКО "eSim"
   
   РАСПОЗНАВАНИЕ SIM:
   - "sim+esim/сим есим/сим+есим/nano-SIM + eSim/sim" → "1Sim"
   - "сим+сим/sim+sim" → "2Sim"
   - "(nano-SIM и eSIM)" → "1Sim"

ПРИМЕРЫ:

✅ ПРАВИЛЬНО (iPhone 17/Air):
Вход: "17 256 синий"
Выход: [{"original": "17 256 синий", "normalized": "iPhone 17 256 Mist Blue 1Sim"}]

Вход: "17 про макс 512 orange"
Выход: [{"original": "17 про макс 512 orange", "normalized": "iPhone 17 Pro Max 512 Cosmic Orange 1Sim"}]

Вход: "17 air 256 black"
Выход: [{"original": "17 air 256 black", "normalized": "iPhone Air 256 Space Black eSim"}]

Вход: "17 256 black sim+esim"
Выход: [{"original": "17 256 black sim+esim", "normalized": "iPhone 17 256 Black 1Sim"}]

Вход: "17 про 512 синий сим+сим"
Выход: [{"original": "17 про 512 синий сим+сим", "normalized": "iPhone 17 Pro 512 Deep Blue 2Sim"}]

Вход: "17 рro 256 black" (с опечаткой)
Выход: [{"original": "17 рro 256 black", "normalized": "iPhone 17 Pro 256 Black 1Sim"}]

Вход: "16 pro max 256 natural\n17 Pro Max 256 Silver 1сим"
Выход: [
  {"original": "16 pro max 256 natural", "normalized": ""},
  {"original": "17 Pro Max 256 Silver 1сим", "normalized": "iPhone 17 Pro Max 256 Silver 1Sim"}
]

Вход: "samsung galaxy s24\n17 air 256 black"
Выход: [
  {"original": "samsung galaxy s24", "normalized": ""},
  {"original": "17 air 256 black", "normalized": "iPhone Air 256 Space Black eSim"}
]

❌ НЕПРАВИЛЬНО:
Вход: "16 pro max 256 desert"
Выход: []

Вход: "17 Pro 256 белый без сим"
Выход: []
Причина: Белого цвета нет у iPhone 17 Pro

ВАЖНО:
- Обрабатывай ТОЛЬКО iPhone 17, iPhone 17 Pro, iPhone 17 Pro Max, iPhone Air
- "17 air" = "iPhone Air" (это ОДНА модель, а не две!)
- Все остальные модели (16, 15, 14 и старше) → возвращай []
- КРИТИЧНО: Используй ТОЛЬКО цвета из списка для КОНКРЕТНОЙ модели
- Если цвет не существует для модели → возвращай [] (НЕ подбирай похожий!)
- НЕ выдумывай несуществующие комбинации
- Проверяй доступность SIM для модели (Air только eSim)
- НЕ Apple бренды (Samsung, Xiaomi и т.д.) → возвращай []

ПОМНИ: Верни ТОЛЬКО JSON массив! Никаких комментариев, объяснений или дополнительного текста!`;
            
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
            
            // Логируем информацию об использовании токенов
            if (data.usage) {
                console.log(`📊 Использование токенов: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}, total=${data.usage.total_tokens}`);
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

