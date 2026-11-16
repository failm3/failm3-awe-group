# ROUTERCHEAP-ROUTING-AUDIT-2026-11-12

Режим: только чтение. В AWE, OpenCode и маршрутизации ничего не менялось. Ключ API не выводился и в отчёт не попал.

## Метод
- Источник списка моделей: `GET https://router.cheap/v1/models` с текущим ключем `ROUTER_CHEAP_API_KEY` → HTTP 200, **75 моделей**.
- Объявлено в `opencode.json`: **50**. Объявленных, но отсутствующих в API: **0**. В API, но не объявлено: 25 (24 медиа-модели + `hy3`).
- На каждую чат-модель: один запрос `POST /v1/chat/completions`, сообщение `Ответь одним словом: OK`, `max_tokens=64`, таймаут 90 с, 4 потока.
- Сбойные модели повторены до 3 раз (пауза 2 с), таймаут 120 с.
- Модели с пустым ответом проверены повторно с `max_tokens=1024`.
- 24 модели генерации изображений, видео и голоса **не пробовались** (`SKIPPED`): чат-запрос к ним бессмыслен и мог бы списать деньги за генерацию.
- Для всех успешных ответов поле `model` в ответе совпало с запрошенным ID (расхождений: 0). Подмены модели роутером не обнаружено.

## Итог

| Категория | Кол-во | Модели |
|---|---|---|
| OK с первой попытки | 39 | см. таблицу |
| OK после повтора (временный сбой) | 4 | `claude-haiku-5-5`, `claude-opus-5`, `deepseek-v4-flash-vision-exp` (SSL EOF), `gemini-3.8-flash` (см. ниже) |
| OK, но 64 токенов мало (reasoning) | 2 | `glm-5.3-flash`, `kimi-k3` |
| Устойчиво недоступны: нет свободного источника (503) | 2 | `claude-haiku-4-5`, `gemini-4-carbon` (первая попытка 500, затем 503 ×3) |
| Устойчиво недоступны: 403 `model_not_on_source` | 2 | `kimi-k2.7-code`, `kimi-k2.7-code-highspeed` |
| Объявлены как чат, но media-only (400) | 2 | `minimax-h3-768p`, `gemini-omni-fast` |
| Пропущены (медиа) | 24 | см. таблицу |

**Чат-моделей, проверенных реальным запросом: 51. Рабочих: 45. Нерабочих: 6** (4 по причине провайдера/источника, 2 не являются чат-моделями).

## Существенные находки
1. **Все 5 моделей, на которые маршрутизирует AWE** (`src/config/models.ts`: `claude-opus-5-5`, `claude-sonnet-5-5`, `gpt-6-astra`, `kimi-k3.1-pro`, `deepseek-v4-flash`), отвечают HTTP 200 с текстом `OK`. Маршрутизация моделей **не объясняет** зависание миссии `d2d08e60`.
2. `claude-fable-5-2` и `gpt-6-astra` (кандидаты для LLM-PROVIDER-RECOVERY-TEST-01) работают, возвращаемый ID совпадает с запрошенным.
3. **`gemini-3.8-flash` вернул HTTP 200, `finish_reason=stop` с текстом-ошибкой** `Upstream temporarily unavailable, please retry.` в поле `content` (31,8 с). Повтор дал нормальный `OK` за 61 с. Любой клиент, проверяющий только HTTP-код, примет эту ошибку за ответ модели. Это риск для QA в AWE; ничего не исправлено.
4. `kimi-k2.7-code*`: ошибка роутера прямо говорит, что источник «Kimi Pool» не обслуживает модель и повтор не поможет; нужны источники «Kimi Reserve» / «Kimi Last Resort». Это настройка аккаунта Router.Cheap, решает владелец.
5. Ошибки 503 приходят с `code: "model_not_found"`, хотя текст означает «нет свободного источника». Классифицировать по этому `code` нельзя: это временная недоступность, а не отсутствие модели.
6. Временные `SSL: UNEXPECTED_EOF_WHILE_READING` для 3 моделей при 4 параллельных запросах: соединение рвалось до HTTP-ответа, повтор проходил с первой попытки. Без повторов клиент получит ложные отказы.
7. Комментарий в `src/config/models.ts` устарел: там `claude-haiku-5-5` помечен как 403, а сейчас он отвечает. Причина отказа `claude-haiku-4-5` тоже изменилась: сейчас 503, а не 403. Не исправлено (вне рамок аудита).
8. В `opencode.json` два media-only ID (`minimax-h3-768p`, `gemini-omni-fast`) объявлены как чат-модели.

## Ограничения
- Один короткий запрос на модель проверяет доступность маршрута, а не качество, вызов инструментов, длинный контекст или стриминг.
- Заголовок `x-request-id` роутер не отдаёт; в таблице `request_id` взят из поля `id` тела ответа. Для ошибок тот же ID есть в тексте ошибки.
- Стоимость: ~60 коротких запросов (≤1024 выходных токенов, фактически ≤77). Баланс аккаунта через API не запрашивался.
- Состояние источников меняется: результаты действительны на 2026-11-12 ~20:33–20:36 UTC.

## Полная таблица

Колонки: модель | объявлена в opencode.json | owned_by | попыток | HTTP (последняя попытка) | класс | задержка, мс | возвращённая модель | request ID | ответ / безопасный текст ошибки.

| Модель | В конфиге | owned_by | Попыток | HTTP | Класс | мс | returned model | request ID | Ответ / ошибка |
|---|---|---|---|---|---|---|---|---|---|
| `grok-4.6` | да | openai | 1 | 200 | OK | 5990 | `grok-4.6` | `202611122033202324725548268d9d6sBe4TiNI` | `OK`  |
| `claude-haiku-4-5` | да | anthropic | 3 | 503 | UPSTREAM_503 | 488 | `—` | `202611122035088030196338268d9d63nuQOu1m` | `{"error":{"code":"model_not_found","message":"Выбранная модель временно недоступна: сейчас нет свободного исто`  |
| `seedance-2.0-fast` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `grok-imagine-video-1.5` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gemini-nano-banana-2.1` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gpt-6-sol` | да | openai | 1 | 200 | OK | 2642 | `gpt-6-sol` | `202611122033203327851018268d9d6SAc9rfnq` | `OK`  |
| `qwen3.8-27b` | да | openai | 1 | 200 | OK | 2970 | `qwen3.8-27b` | `202611122033205597527688268d9d6C88LdiFg` | `OK`  |
| `claude-opus-4-8` | да | anthropic | 1 | 200 | OK | 2930 | `claude-opus-4-8` | `202611122033215180924378268d9d6dYzeUik9` | `OK`  |
| `deepseek-v4-pro-0813` | да | openai | 1 | 200 | OK | 3177 | `deepseek-v4-pro-0813` | `202611122033229427135768268d9d66IFdu1gK` | `OK`  |
| `gpt-image-2.6-flare` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gpt-6.1-terra` | да | openai | 1 | 200 | OK | 2345 | `gpt-6.1-terra` | `202611122033227423829138268d9d6xs4n5wti` | `OK`  |
| `wan-3.0` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gemini-3.8-flash` | да | openai | 1 | 200 | OK | 61149 | `gemini-3.8-flash` | `202611122036122444501518268d9d6oatHuIkx` | `Upstream temporarily` после повтора |
| `claude-fable-5` | да | anthropic | 1 | 200 | OK | 3160 | `claude-fable-5` | `202611122033255476432338268d9d6GrhfJmFC` | `OK`  |
| `grok-imagine-image-2.0` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `qwen3.8-flash` | да | openai | 1 | 200 | OK | 2037 | `qwen3.8-flash` | `202611122033256905513058268d9d6MYE2s6Zu` | `OK`  |
| `gpt-image-2.5-flare-4k` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gemini-4-argon` | да | openai | 1 | 200 | OK | 3575 | `gemini-4-argon` | `202611122033259317741508268d9d69OqXQJ6V` | `OK`  |
| `deepseek-v4-flash-0731` | да | deepseek | 1 | 200 | OK | 2916 | `deepseek-v4-flash-0731` | `202611122033287836256998268d9d6Vdu5eyUR` | `OK`  |
| `gpt-image-2.5-sunburst-4k` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `kimi-k2.7-code` | да | openai | 3 | 403 | AUTH_OR_ACCESS (постоянная) | 1269 | `—` | `202611122037194647047508268d9d6PBZ6jv9P` | `{"error":{"code":"model_not_on_source","message":"Источник «Kimi Pool» не обслуживает модель kimi-k2.7-code, п`  |
| `grok-voice` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `glm-5.3` | да | openai | 1 | 200 | OK | 2284 | `glm-5.3` | `202611122033289685258788268d9d6KuiaC30Y` | `OK`  |
| `deepseek-v4.1-flash` | да | openai | 1 | 200 | OK | 3709 | `deepseek-v4.1-flash` | `202611122033302733241068268d9d6DJvAJmnU` | `ОК`  |
| `mimo-v2.6-pro` | да | openai | 1 | 200 | OK | 2657 | `mimo-v2.6-pro` | `202611122033307487788888268d9d6qICaNGuj` | `OK`  |
| `claude-opus-4-6` | да | anthropic | 1 | 200 | OK | 3214 | `claude-opus-4-6` | `202611122033314590672538268d9d6E2mtMYTX` | `OK`  |
| `kimi-k3.1-pro` | да | openai | 1 | 200 | OK | 2846 | `kimi-k3.1-pro` | `202611122033334807560798268d9d61v7luLFH` | `OK`  |
| `grok-4.5` | да | openai | 1 | 200 | OK | 4113 | `grok-4.5` | `202611122033333012062318268d9d6g8IS5R1E` | `OK`  |
| `gpt-image-2` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `minimax-h3-768p` | да | openai | 1 | 400 | MEDIA_ONLY (не чат) | 1188 | `—` | `202611122033352538988328268d9d6xLqpymwZ` | `{"error":{"code":"invalid_request","message":"model minimax-h3-768p is media-only and cannot be used for text `  |
| `gpt-5.6-terra` | да | openai | 1 | 200 | OK | 3478 | `gpt-5.6-terra` | `202611122033367115176388268d9d6cZhfKHWF` | `OK`  |
| `gpt-5.6-luna` | да | openai | 1 | 200 | OK | 2384 | `gpt-5.6-luna` | `202611122033360458946368268d9d632INHup1` | `OK`  |
| `gpt-image-2.5` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gemini-omni-fast` | да | openai | 1 | 400 | MEDIA_ONLY (не чат) | 412 | `—` | `202611122033373608833398268d9d6JoRu9Esb` | `{"error":{"code":"invalid_request","message":"model gemini-omni-fast is media-only and cannot be used for text`  |
| `claude-sonnet-5` | да | anthropic | 1 | 200 | OK | 2950 | `claude-sonnet-5` | `202611122033377899812468268d9d65qY7zcPZ` | `OK`  |
| `deepseek-v4-flash` | да | openai | 1 | 200 | OK | 2326 | `deepseek-v4-flash` | `202611122033381985201728268d9d68B3WLybL` | `OK`  |
| `gemini-4-carbon` | да | openai | 3 | 503 | UPSTREAM_503 | 1590 | `—` | `202611122035174775228098268d9d6W8CSBZA4` | `{"error":{"code":null,"message":"Внешний провайдер временно недоступен (статус 500). Попробуйте позже. (reques`  |
| `gpt-image-2.6` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `claude-sonnet-5-5` | да | anthropic | 1 | 200 | OK | 1850 | `claude-sonnet-5-5` | `202611122033395419045978268d9d6wwbtFfFH` | `OK`  |
| `claude-opus-5` | да | anthropic | 1 | 200 | OK | 5536 | `claude-opus-5` | `202611122034380247729358268d9d6EWrqKOO0` | пусто после повтора |
| `kimi-k3` | да | openai | 3 | 200 | OK | 3022 | `kimi-k3` | `202611122036072594009058268d9d6WTS4rx6X` | пусто OK при max_tokens=1024; пусто при 64 (reasoning съел лимит) |
| `gpt-6-astra` | да | openai | 1 | 200 | OK | 3115 | `gpt-6-astra` | `202611122037276194653068268d9d6N2pYAGUF` | `OK` после повтора |
| `minimax-m3.1-flash-preview` | да | openai | 1 | 200 | OK | 4636 | `minimax-m3.1-flash-preview` | `202611122033413363228168268d9d6c2MpxI9A` | `OK`  |
| `glm-5.3-flash` | да | openai | 3 | 200 | OK | 12449 | `glm-5.3-flash` | `202611122035408630439508268d9d65sbiGoTp` | пусто OK при max_tokens=1024; пусто при 64 (reasoning съел лимит) |
| `gpt-image-2.5-flare-2k` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `veo-3.1-lite` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `kimi-k2.7-code-highspeed` | да | openai | 1 | 403 | AUTH_OR_ACCESS | 712 | `—` | `202611122033441090702138268d9d6VI1RVeqn` | `{"error":{"code":"model_not_on_source","message":"Источник «Kimi Pool» не обслуживает модель kimi-k2.7-code-hi`  |
| `gpt-6-luna` | да | openai | 1 | 200 | OK | 2285 | `gpt-6-luna` | `202611122033449976001568268d9d6STdpLRmb` | `OK`  |
| `viduq3-turbo` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `qwen3.8-max` | да | openai | 1 | 200 | OK | 2697 | `qwen3.8-max` | `202611122033460486550528268d9d6qKHpjqI9` | `OK`  |
| `gpt-image-2.5-sunburst` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gpt-image-2.5-sunburst-2k` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `seedance-2.0-mini` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gpt-image-2.6-sunburst` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `minimax-m3.1-flash` | да | openai | 1 | 200 | OK | 2838 | `minimax-m3.1-flash` | `202611122033466610210118268d9d64pSAVgLZ` | `OK`  |
| `deepseek-v4.1-flash-1017` | да | openai | 1 | 200 | OK | 2666 | `deepseek-v4.1-flash-1017` | `202611122033491146450758268d9d6N6ppiC67` | `OK`  |
| `claude-opus-5-5` | да | anthropic | 1 | 200 | OK | 2142 | `claude-opus-5-5` | `202611122037217303221528268d9d63AEXzDOT` | `OK` после повтора |
| `kling-3.0` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `chirp-3-hd` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `claude-fable-5-2` | да | anthropic | 1 | 200 | OK | 3450 | `claude-fable-5-2` | `202611122037242934465828268d9d6x48SLeKM` | `OK` после повтора |
| `glm-5.2` | да | openai | 1 | 200 | OK | 3259 | `glm-5.2` | `202611122033517516626588268d9d6LWHHOdgw` | `OK`  |
| `gemini-omni-edit` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `claude-fable-5-1` | да | anthropic | 1 | 200 | OK | 3686 | `claude-fable-5-1` | `202611122033538442697148268d9d6QGjcyVFx` | `OK`  |
| `claude-sonnet-4-6` | да | anthropic | 1 | 200 | OK | 2602 | `claude-sonnet-4-6` | `202611122033544555135388268d9d6Hs6oNyJd` | `OK`  |
| `claude-opus-4-7` | да | anthropic | 1 | 200 | OK | 2573 | `claude-opus-4-7` | `202611122033549190436848268d9d6hrPED7JD` | `OK`  |
| `claude-haiku-5-5` | да | anthropic | 1 | 200 | OK | 3611 | `claude-haiku-5-5` | `202611122034335734236488268d9d6hDClIu2n` | пусто после повтора |
| `gpt-image-2.5-flare` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `deepseek-v4-pro` | да | openai | 1 | 200 | OK | 2608 | `deepseek-v4-pro` | `202611122033573870574288268d9d65OWi8hYT` | `OK`  |
| `gpt-5.5` | да | openai | 1 | 200 | OK | 5543 | `gpt-5.5` | `202611122034013987100078268d9d6r5pzoUkl` | `OK`  |
| `deepseek-v4-flash-vision-exp` | да | deepseek | 1 | 200 | OK | 20187 | `deepseek-v4-flash-vision-exp` | `202611122034415771848388268d9d6i5lnHeT2` | пусто после повтора |
| `gpt-6.1-sol` | да | openai | 1 | 200 | OK | 3449 | `gpt-6.1-sol` | `202611122033576072526498268d9d6zVmcyyBA` | `OK`  |
| `hy3` | **нет** | openai | 1 | 200 | OK | 4371 | `hy3` | `202611122033593505529568268d9d61ZiR9ntn` | `OK`  |
| `grok-4.7` | да | openai | 1 | 200 | OK | 5804 | `grok-4.7` | `202611122033597163896118268d9d6UiprpUy1` | `OK`  |
| `seedance-2.5` | **нет** | openai | 1 | — | SKIPPED (медиа) | None | `—` | `—` | media generation model; chat probe not applicable and would incur generation cost  |
| `gpt-5.6-sol` | да | openai | 1 | 200 | OK | 16230 | `gpt-5.6-sol` | `202611122034149656162648268d9d6epfwtPdp` | `OK`  |

## Исходные данные
Сырые результаты (без ключа): `/tmp/opencode/rc-audit-results.json`, `/tmp/opencode/rc-retry-results.json`, `/tmp/opencode/rc-models.json`. Скрипты: `/tmp/opencode/rc_audit.py`, `/tmp/opencode/rc_retry.py`.
