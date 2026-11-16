# Контракт аналитики CSV

**DESIGN v1, предложение для утверждения в mission spec, не бухгалтерский стандарт и не выполненный тест.** T5 и оба независимых oracle обязаны использовать один digest этого контракта. Он заменяет неоднозначную missingness-политику draft G/D3. Изменение политики требует новой spec/procedure/oracle version и повторной квалификации. Holdout values и seeds сюда не входят.

## Вход

UTF-8 CSV с единственной строкой заголовка, ровно шесть уникальных колонок `event_id,order_id,currency,kind,amount_cents,status`; порядок колонок произвольный, неизвестные/повторные/пропущенные колонки запрещены. RFC4180 quoting, LF или CRLF; BOM запрещён в этом узком v1. Пустые физические строки кроме завершающего переноса не игнорировать. Размер и row-count bounds задаёт approved mission spec до чтения; превышение блокирует вычисление. Формульные строки не исполняются.

После CSV parsing значения не trim и не приводятся к lower/upper case. ID — ASCII `[A-Za-z0-9_-]{1,64}`, оба обязательны. `currency ∈ {USD,EUR}`, `kind ∈ {sale,refund}`, `status ∈ {settled,pending}`. `amount_cents` обязателен в обеих status: десятичная строка `0|[1-9][0-9]*`, целое от 0 до 9007199254740991 включительно. Знаки, пробелы, leading zero, десятичная точка, экспонента, NaN/null/пусто запрещены. Currency scale = 2 только для USD/EUR; FX отсутствует. Refund задаётся неотрицательной величиной, знак вычитания применяется алгоритмом. Проверка диапазона до преобразования; вычисления exact integer (например BigInt), не float.

## Решения и observable outcomes

| Условие | Правило | Наблюдаемый результат |
|---|---|---|
| Empty file / нет header / malformed CSV / schema mismatch | Весь вход invalid | BLOCKED_INPUT, error code + row/field, totals отсутствуют |
| Header без data rows | Корректный пустой набор | PASS_DATA: USD=0, EUR=0; counts=0; `empty_input=true` |
| Валюта без settled rows | Корректная пустая группа | Её net=0, `empty_settled_group=true`; pending отдельно |
| Missing/invalid ID, enum, amount, range, bounds | Validation прежде дедупликации, всей миссии | BLOCKED_INPUT, нет частичных totals |
| Exact duplicate event_id и все остальные 5 parsed fields равны | Одна уникальная запись независимо от порядка/CSV quoting | duplicate_rows += число лишних записей; totals не меняются |
| Same event_id, хотя бы одно из order_id/currency/kind/amount/status отличается | Конфликт; first/last-wins запрещены | BLOCKED_INPUT / CONFLICTING_EVENT, весь результат без totals |
| Разные event_id, одинаковый order_id | Не дубль; отдельные события | Оба включены по status/kind |
| Settled sale/refund | Sales minus refunds отдельно по USD/EUR | Exact signed net, отрицательный net допустим |
| Pending sale/refund | Не входит в settled total | Отдельные positive pending_sale / pending_refund amounts и counts по currency |
| Net больше safe integer | Не ошибка input при допустимых отдельных amounts | Exact signed decimal string, не float/JSON number |

При BLOCKED разрешены только diagnostics: schema/parse error, row/field, conflict IDs, input hash и limits; вычисленные partial sums и success chart запрещены. Нет нулей вместо unknown. Не выдавать malformed input за FAIL компетенции: компетентный результат на таком case — правильный BLOCKED. QA сравнивает ожидаемый статус, а не требует PASS_DATA всегда.

## Выход и oracle

JSON result envelope: `contract_digest`, `input_sha256`, `status`, `errors[]`, `metrics` (отсутствует при BLOCKED). Для PASS_DATA: `metrics.USD/EUR` содержат `settled_sales_cents`, `settled_refunds_cents`, `net_cents`, `pending_sales_cents`, `pending_refunds_cents` как decimal strings, counts по kind/status, empty-group flags; общие raw_rows, unique_events, duplicate_rows. Человеческий отчёт определяет metric, units, exclusions, отдельные currencies, отсутствие FX/causal/financial-audit claim. Визуализация, если требуется, использует те же проверенные значения и units.

Независимые reference calculator и checker реализуют контракт отдельно; не используют notebook/формулы solver как oracle. Curator вручную размечает публичные controls и закрытые cases, фиксирует expected digest до запуска solver. Seeded ошибочный checker и cached-answer solver должны обнаруживаться проверками. Формат fixture: `case_id`, `contract_digest`, CSV bytes/hash, expected status/errors/metrics, classification, oracle owner; hidden expected не передаётся исполнителю.

## Публичные controls (DESIGN, не holdout)

- e1/o1/USD/sale/10000/settled; e2/o2/USD/sale/5000/settled; exact e2 повтор; e3/o2/USD/refund/1000/settled; e4/o3/EUR/sale/7000/settled; e5/o4/USD/sale/9000/pending → USD net `14000`, EUR net `7000`, duplicate_rows=1, raw_rows=6, unique_events=5, USD pending_sales=`9000`.
- Header only → оба net `0`, empty_input=true. Только pending EUR sale 7 → net обеих валют `0`, EUR pending_sales=`7`.
- e1 с amount 1 и e1 с amount 2 → BLOCKED_INPUT/CONFLICTING_EVENT; ни одна валюта не получает partial total.
- Пустой event_id; `GBP`; amount `-1`, `1.5`, `01`, пусто или `9007199254740992` → BLOCKED_INPUT. Пустой amount у pending тоже BLOCKED.
- Settled USD refund 10 без sale → net `-10`; две различные sales по `9007199254740991` → exact net `18014398509481982`.

Все эти controls и закрытые acceptance/transfer cases **NOT_RUN в AWE**. Публичные значения больше не являются секретной оценкой переноса.
