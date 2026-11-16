# AWE R1 — итоговое инженерное исследование

**Рекомендация: сохранить действующую архитектуру AWE и Mastra; принять новый аудит как основание только для R0 OFFLINE SCOPE VERIFIED / CLOSED. Ближайшая инженерная цель — один ограниченный цикл профессиональной компетенции: утверждённые требования → безопасное исполнение → независимый предметный QA → новая задача → измеренный перенос. Не покупать платформы, не переписывать orchestration и не объявлять сохранённые документы обучением.**

Дата: 2026-11-13. Статус: FINAL RESEARCH / EDITORIAL CORRECTIONS VERIFIED; engineering GO не выдан. Выпускающий: worker, session `ae5a2f34-4215-4e82-a92e-80ac8463df65`; исходный draft: `ca44c6ed-7df6-44c8-94ee-5f8c56ae165d`. Независимая рецензия draft потребовала изменения; disposition и границы повторной проверки — [REVIEW-DISPOSITION.md](REVIEW-DISPOSITION.md). AWE не изменялся, приложение и live-тесты не запускались, deployment и GitHub-публикация не выполнялись. Этот пакет — законченный исследовательский результат с предложенными контрактами, не выполненный R1 и не план дальнейшего рыночного исследования.

## Как читать пакет

Основной отчёт содержит решения A–L. `EVIDENCE-LEDGER.md` связывает утверждения с источниками и пределами вывода; `RECONCILIATION.md` фиксирует разрешение противоречий; `IMPLEMENTATION-TASK-CARDS.md` — будущие ограниченные изменения; `GITHUB-HANDOFF.md` — безопасная передача OpenCode. В `annex/` сохранены полные инженерные расчёты и схемы специалистов, в `evidence/` — исходные исследования. При расхождении предложений действует reconciliation этого пакета, а не самая уверенная фраза приложения.

Классы: **D** — документальное свидетельство о текущем AWE; **H** — исторический код; **U-SRC/API** — закреплённый upstream, проверенный коллегой; **P** — документация/metadata поставщика; **DESIGN** — предлагаемая архитектура; **TEST-FILE** — выполненная проверка исследовательских файлов; **UNKNOWN** — доказательств недостаточно. Ни D, ни upstream, ни hash файлов не являются выполненным здесь тестом приложения. Все будущие application acceptance tests — **NOT_RUN**.

## A. Executive decision

1. **Reuse first.** Head планирует; Mission Manager владеет состоянием, admission/recovery/budget; Factory создаёт исполнителей; TI отвечает за поиск и metadata; Memory хранит scoped знания/опыт; QA принимает результат. Новых параллельных владельцев этих функций не вводить.
2. **R0 закрыт в узком документально подтверждённом offline scope.** Аудитор сверял манифесты и сохранённые результаты. Production, live-provider compatibility, tenant isolation всех маршрутов и полезность профессионального продукта этим не доказаны [E01–E03].
3. **Восстанавливаемость и безопасные границы раньше нового исполнения.** Известный HEAD не содержит всего final working tree; текущий shell profile не даёт достаточной filesystem isolation. Это блокирует недоверенный execution, но не параллельную подготовку схем/fixtures [E03–E04].
4. **Первый срез — аналитика предоставленной таблицы**, затем evidence-based research и bounded codefix. Это порядок минимизации зависимостей, не рейтинг профессий. UI, marketing, документы и автоматизации получают свои отдельные oracle; три демонстратора не квалифицируют их автоматически.
5. **Каталог без фиксированного потолка; исполнение ограничено.** Namespace/version/search/lazy loading расширяются по потребности. Число одновременно активных агентов, глубина, вызовы, затраты, время и ресурсы ограничиваются независимо. Нет обещания бесконечного хранения или универсальной экспертности.
6. **OpenCode — инженерный инструмент, не runtime-посредник.** Разработка возможна как последовательность небольших patches с независимой приёмкой. Готовность выполнить весь R1 автономно, стоимость и сроки не установлены.

## B. Current assessment

### Что уже существует и где разрыв

| Контур | Доказанное в доступном scope | Что не следует выводить | Следующий delta |
|---|---|---|---|
| R0 | D: offline closure; проверки сохранённых suites, source/evidence manifests | Production PASS; полный clean restore; новый regression run | Frozen release identity + restore/parity |
| Prompt Master → Head | D: спецификация есть, но Head получает не весь scope/risks/raw request | Достаточность улучшенного prompt | Immutable approved requirement binding по всему пути |
| Factory/recursion | D: реальные Mastra Agent, существующие caps | Keyword role = квалифицированный специалист | Qualified procedure/model/tool binding |
| Manager | D: durable lifecycle/recovery, собственное управление | Framework workflow автоматически даёт ту же семантику | Сохранить ownership; расширять только обнаруженные gaps |
| TI/tools | D: allTools и research search различаются | Найденный инструмент уже подключён/разрешён | Typed lifecycle и один approved binding |
| Memory | D: объекты есть, recall/working memory выключены, нет устойчивого wiring scopes | Рабочее межмиссионное обучение | Scoped wiring + provenance/qualification |
| QA | D: gate есть, tools нет, images передаются ссылками, критерии эвристичны | Artifact integrity = предметная корректность | Полный spec, immutable evidence, domain oracle |
| MCP/browser | D: singleton, unpinned npx server | Playwright test version = server version; --isolated = mission isolation | Pin фактическую связку и раздельный lifecycle/context |
| Economics | D: суммы делегаций не все вызовы | Полная цена принятого результата | Unsampled durable call ledger |

Локаторы D: OC L175–323, `src/agents/head-agent.ts:104–129`, `specialists.ts:188`, `recursion.ts:277–288`, `mission-manager.ts:790–798,2533–2559`, `qa-agent.ts:29–108`, `qa-gate.ts:153–159,229–282`, `memory/index.ts`, `config/mcp.ts:171–257`. Это ссылки **из отчёта аудитора**, не просмотренные составителем текущие исходники.

Reported installed stack: core 1.82.0, memory 1.41.0, libsql 1.29.0, mcp 2.8.0, Playwright Test 1.49.1. Фактические Node, browser revision, MCP server/SDK protocol, bwrap и final release SHA остаются discovery gates. Исторический `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda` не подставляется вместо current Mastra runtime.

### Почему это не универсальная автономность

Оркестрация и ограничение исполнения решают иной класс задач, чем профессиональная методика, качественный источник, инструмент и проверяемый продукт. Система может правильно завершить mission с плохим отчётом. Рекурсивная генерация role instructions не даёт компетенцию; множество агентов не исправляет общий ошибочный oracle. Реальная максимальная самостоятельность AWE не измерена.

## C. Reconciliation

Приоритет: относящееся к тому же snapshot независимое фактическое свидетельство > конкретный статический source/API > документальный отчёт > vendor claim > предложение. Более новый документ не автоматически сильнее старого, если scope другой.

- Старое «финальный независимый verdict неизвестен» обновлено на **documented offline closure**; live/production/restore неизвестность остаётся.
- Старые D1–D9 сохраняются как категории regression, не список доказанно открытых дефектов текущего R0.
- OpenCode **не читал 22 MD Kortix** из-за cleanroom restrictions. Его аудит независим от прежнего текста, но не рецензирует этот текст [OC L498–532].
- Native-first сохранён, однако ToolSearch/массовый каталог больше не обязательный первый шаг: безопасность, сохранение требований и QA предшествуют новому execution.
- QA-специалист оставил native eval API compatibility UNKNOWN; последующая точная проверка core 1.82.0 коллегой подтверждает createScorer/runEvals API. Это снимает upstream API unknown, **не AWE wiring/runtime unknown**. Покупка отдельной eval-платформы не нужна.
- Workflow ownership с unfenced generic writes не отменяет наличия отдельных Mastra fencing primitives. Ни «fencing отсутствует вообще», ни «workflow заменяет R0 без доработок» не принимается.
- Выбран первый demonstrator data analysis; research/code — следующие применения того же механизма, не три обязательных параллельных rollout.
- Полные детали и новые memory/MCP/license уточнения: `RECONCILIATION.md`.

## D. Universal capability specification

**Компетенция — проверенное сочетание scope + task/input/output contract + procedure/knowledge + model/tool/environment profile + независимые receipts.** Название профессии — поисковая метка, не допуск.

### Логическая схема DESIGN

- `CapabilityVersion`: id/namespace, version/digest, tenant/project/ACL ref, owner, taskClass, input/output schema refs, applicability/exclusions, procedure/knowledge/assets refs, tool bindings, execution profile, mandatory criterion/checker refs, risk/effect classes, revalidation triggers, rollback candidate.
- `Qualification`: immutable capability/profile refs, lifecycle, availability, revision/generation, evidence refs, evaluator/authority, validity window, reason. Отдельна от manifest: отзыв не переписывает историю tested bytes.
- `KnowledgeRecord`: fact/episode/procedure/lesson, sources с URI/version/span/hash/time, derivedFrom/conflictsWith, rights/allowedUses, scope/ACL, epistemic/trust status, verification и freshness.
- `EvaluationReceipt`: spec/release/capability/tool/model/oracle/dataset digests; case-level expected/observed/status/evidence; evaluator; coverage; defects; contamination checks; полный cost ref; limitations.

Полные предлагаемые TypeScript-формы — `annex/DE.md` §2.3. Это не existing exports, не требование новых таблиц и не второй registry: сначала сопоставить текущим сущностям и расширить только отсутствующее.

### Lifecycle и admission

`qualification → provisional → verified → deprecated`; отдельная ось `eligible | quarantined | revoked`. Quarantined/revoked перекрывают lifecycle немедленно. Qualification допускает только ограниченную практику; provisional — узкий low-risk scope с полной проверкой; verified — ровно проверенный профиль и область после blind holdout/transfer. Deprecated не выдаётся новым миссиям. Новая модель/процедура/семантика tool/среда требует revalidation, а не наследования названия роли.

Head выбирает только доступные версии. Manager проверяет approved spec, ACL всех dependencies, действительность qualification, совпадение профиля, grants и остаток ресурсов; фиксирует admission receipt с generation. Factory получает уже урезанный контекст. Перед consequential effect и final acceptance проверяются текущие revoke/fence. Resume не обходит отзыв; [] означает deny-all; manifest не выпускает полномочия.

Минимальный persisted qualification/admission/revoke contract вводится в T4a **до T5**, а не откладывается до T6. Existing owner — Manager/storage и независимый QA; точный current persisted seam UNKNOWN до T0. Если существующего эквивалента нет, T4a блокирует product admission до реализации минимального расширения current store. Полный контракт и negative cases — карточка T4a.

### Команда и модели

Default — один исполнитель с независимым QA. Команда оправдана независимыми подзадачами, различающимися методами и измеренной пользой. Явные фазы producer → validators → merge достаточны первому срезу; implementation DAG не означает новый runtime DAG engine. Расхождения решает evidence/oracle, не большинство моделей.

Model routing расширяет существующий registry: сначала hard constraints privacy/account/modality/context/tool schema/price ceiling/qualification, затем сравнение принятого качества, полной цены и latency. Unknown compatibility не «лучший guess», а pinned baseline/blocked. Fallback не расширяет бюджет/права и не повторяет уже отправленный эффект. Отдельные лимиты на active children, lifetime creations, depth, concurrency, tokens/currency, deadline, retries/repairs, размер контекста и общие browser/filesystem ресурсы. Atomic reservation до admission; restart не сбрасывает counters.

## E. Learning и memory governance

Retrieval добавляет контекст; Skill задаёт процедуру; практика даёт наблюдения; lesson — проверяемая гипотеза; fine-tuning меняет веса. Эти механизмы не взаимозаменяемы. Fine-tuning отложен до доказанного model bottleneck, разрешённых training rights и независимого сравнения с более простыми средствами.

Цикл: gap taxonomy → reuse источников/процедур → baseline → bounded practice → candidate lesson → validation → frozen candidate → закрытый holdout → transfer в fresh context → promotion → drift/revoke. Ошибку требований, tool failure или плохой oracle нельзя автоматически лечить добавлением текста в память.

Practice/validation/holdout/transfer разделять по семействам исходных объектов; paraphrases и производные одного dataset могут утечь между split. Solver не видит ответы и evaluator feedback закрытых cases. После раскрытия case становится regression/development data; для следующего promotion нужен новый закрытый набор. Сравнение baseline/candidate использует одинаковые permissions/budget/profile и учитывает все attempts. Если baseline уже без ошибок, нельзя заявить повышение качества без иной измеримой цели. Counts/разброс/assumptions обязательны; никаких выдуманных процентов готовности.

Memory работает через existing storage, stable trusted tenant/project/resource/thread IDs и ACL **до** retrieval, затем при load/cache/readback. Resource/thread scopes не business ACL. Новая thread при общем resource не изолирует holdout. По pinned Mastra source metadata старых embeddings не меняется автоматически при изменении thread metadata; deleteThread допускает background vector cleanup, поэтому return не доказывает полное удаление. Нужны immediate tombstone/deny + cache invalidation + проверяемая reconciliation; затронутые derived lessons/qualifications отзываются по graph. Atomic merge нельзя обещать для LibSQL по документации PostgreSQL [E10–E12].

Ingestion: источник/права/версия → ограниченное извлечение → page/table/bbox/time provenance → quarantine → проверка claims → approved retrieval. Retrieved instructions недоверенные. Сначала маленький структурированный/lexical корпус; embeddings, OCR, parser и массовое ingestion — только при измеренном gap. Данные/веса/telemetry не отправлять облачному parser без отдельного допуска. Удаление records не означает unlearning из весов.

## F. Tool lifecycle и execution governance

Единый lifecycle поверх TI: **discovery → evaluation → selection → compatibility → security → permission → connection → execution → verification → reuse**. Каждый переход имеет отдельный receipt/status; discovery не установка, OAuth connection не grant, transport success не business success, QA PASS не permission на публикацию.

Tool binding содержит canonical operation identity, vendor/package/commit/integrity, schema digest, runtime/protocol/transport, license provenance, risk/effect class, qualification/expiry. Grants/credentials остаются в существующей security/account boundary. Несколько REST/SDK/MCP/CLI bindings не три независимые компетенции.

Выбор простейшего пути: существующий typed builtin → одна REST/SDK операция при gap → MCP если уже подходящий сервер → bounded CLI для local utility → browser только где интерфейс действительно нужен. Нельзя fallback на более широкий shell/browser ради обхода отказа. MCP Registry — источник metadata, не доверенный установщик. Native ToolSearch ищет только authorized projection registered tools; scripts Skills исполняются исключительно через тот же квалифицированный tool boundary.

Перед эффектом durable intent: logical operation/effect slot, attempt, spec/grant/fence, adapter/schema/args digest, account/resource, deadline/reservation, provider idempotency key при реальной поддержке. После — outcome/provider ID/readback/usage либо unknown. Timeout после send → reconcile, не blind retry. SDK/manager/workflow retries делят один бюджет. Cancellation request не доказывает quiescence и не отменяет remote commit. Compensation — отдельный разрешённый эффект.

Безопасность worker: mission-only writable mounts, минимальный read-only root, no host secrets/socket/SSH agent, ограничения proc/dev/capabilities, pids/CPU/RAM/disk, default-deny network, проверка redirects/DNS/SSRF, process-tree join и guarded artifact export. `bwrap --bind / /` не даёт нужной filesystem isolation [E04]. Контейнер тоже не автоматически безопасен. Нужен выбранный threat model и synthetic canaries, не реальные секреты.

MCP protocol version/transport должны фиксироваться: свежая спецификация 2026-07-28 отличается от прежней 2025-11-25 по cancellation; фактическая negotiated version AWE неизвестна. Не обновлять SDK автоматически. `@playwright/mcp 0.0.85` — наблюдённый коллегой latest metadata с alpha Playwright dependency, **не выбранный AWE pin** [E14].

## G. Domain QA

Existing QA получает неизменяемый approved requirement set с IDs, criticality, oracle/version, applicability/evidence и blocked policy; immutable artifact bytes; pinned release/model/tool/procedure; read-only verifier results. Producer не изменяет oracle/hidden expected values и не выпускает собственный qualification receipt. Hash доказывает байты, не истинность.

Статусы по каждому критерию: PASS / FAIL / NOT_VERIFIED / BLOCKED / NOT_APPLICABLE с основанием. Mandatory coverage — отдельный hard gate: notScorable исключается из среднего Mastra, поэтому высокий average недостаточен. Критический дефект не компенсируется стилевыми баллами. Checker unavailable не PASS.

| Домен | Независимый oracle | Обязательный отрицательный контроль |
|---|---|---|
| Code | Frozen API/requirements, build/types/tests, независимые inputs и mutations | Правдоподобный patch с hidden bug; изменение tests вместо исправления |
| UX/UI | Реальный flow, keyboard/focus/error/loading, responsive evidence | Красивый screenshot при сломанной CTA/overflow |
| Visual design | Actual pixels, brand brief, typography/hierarchy/composition и blind reference review | Формальная техническая исправность при непригодной композиции; baseline update автором |
| Research | Claim → точный supporting passage/version, альтернативы и ограничения | Существующая ссылка не поддерживает claim; fabricated pin; docs → tested подмена |
| Analytics | Raw-data reconciliation независимым exact calculator/query | Duplicate joins, mixed currencies, missing→0, denominator/refund ошибки |
| Marketing | Approved claims/brand/legal contract; real experiment для uplift | Выдуманные отзывы/кейсы; copy review как доказанный revenue uplift |
| Documents | Открытие и render конечного файла, content/numeric oracle | Правильный MD при обрезанном PDF или cached неверной формуле |
| Automation | Независимый target-state observer и fault injection | HTTP 200 без результата, lost ACK→duplicate, wrong tenant |

Разные модели не обеспечивают независимость: общие данные и стилистические biases остаются. Сначала deterministic/domain oracle, затем blind LLM review с перемешанным порядком и калибровкой на good/bad fixtures. Спорный обязательный criterion остаётся blocked или передаётся разрешённому эксперту. Snapshot не хороший дизайн; scanner не полный WCAG/UX PASS. Числа стартовых challenge sets в annex/G — **предложение**, не проведённый benchmark и не универсальная policy.

Первый demonstrator: CSV settled sales минус refunds, дедупликация event_id, валюты раздельно, полный детерминированный contract — [ANALYTICS-CONTRACT.md](ANALYTICS-CONTRACT.md); invalid input блокирует весь результат без частичных totals. Oracle считает независимо от notebook. Далее исследовательская записка в закрытом корпусе с conflicting versions/недоступным источником и bounded TypeScript money bugfix. Полные открытые примеры, negative cases и transfer contracts — `annex/G.md` §5; опубликованные значения уже не hidden.

## H. Build / buy / reuse matrix

Классификация труда и состояние доказанности — **две независимые оси**. «Существует» относится к компоненту, «без изменений» — к выбранному действию; «готовая интеграция» описывает доступный substrate, не integrated PASS. Оценка усилий качественная, не сроки.

| Решение / version evidence | Выбор / класс изменения | Состояние | Стоимость и альтернатива |
|---|---|---|---|
| Head/Manager/Factory, reported core 1.82.0 | Reuse; существует / без изменений ownership | Существует D; R1 bindings требуют разработки | Existing stack вместо нового orchestrator; model/ops расходы неизвестны |
| Approved spec + full ledger | Build в current paths; существенная сквозная доработка | Возможно; требует разработки/проверки | Prompt-only/trace-only дешевле, но неполны |
| Mastra Skills/Workspace core 1.82.0 | Готовая native интеграция как substrate; малый adapter при gap | API существует; AWE compatibility gate | Не новый Skills engine; execution scripts требует security |
| Memory 1.41.0 + LibSQL 1.29.0 | Настройка + сквозные ACL/wiring доработки | Declared peers подходят; не runtime PASS | Existing DB; новая vector DB/PG не обязательны |
| createScorer/runEvals core 1.82.0 | Готовый substrate + предметные adapters | API подтверждён коллегой; AWE wiring требует разработки | Existing test runner fallback; не обязательный Promptfoo/Inspect |
| MCPClient 2.8.0 | Reuse + pin/context/cancel adapter | Declared peers совместимы; runtime неизвестен | Один typed API вместо MCP, если проще |
| Playwright MCP actual pin UNKNOWN | Discovery gate; настройка pin + lifecycle доработка | Не готово к утверждению isolation | Test 1.49.1 — другой пакет; latest не pin |
| Worker bwrap/container/VM version UNKNOWN | Существенная доработка; архитектурное изменение только если новый execution boundary выбран | Возможность есть; threat-model/tests нужны | Harden existing profile vs rootless worker; нет выбранной покупки |
| Observability 1.24.0 candidate | Optional малый exporter adapter | Metadata есть; installation UNKNOWN | Existing logs + обязательный ledger; SaaS deferred |
| Composio Mastra 0.10.6, ISC | Готовый vendor adapter, AWE policy adapter требуется; defer buy | Peer range не runtime compatibility; Node >=22.22.3 gate | Один existing API/MCP; hosted terms/цена UNKNOWN |
| Docling/Crawl4AI | Готовый parser/acquisition + малый adapter при format gap; defer | Prior pinned source, не AWE integration | Existing parser/browser; license/weights/egress review перед выбором |
| Temporal/LangGraph/new orchestration | Архитектурное изменение; не выбирать сейчас | Не доказан blocker existing Manager | Migration/recovery parity и ops, стоимости UNKNOWN |
| Fine-tuning/массовый marketplace | Существенная работа; defer | Нет доказанного bottleneck/прав/экономики | Approved procedures/retrieval сначала |

Mastra core/memory/libsql/mcp manifests: Apache-2.0, общий минимум Node >=22.13.0; declared peer ranges перечислены в annex/M §3. Это не legal audit всех transitives. Docling prior source pin `b9bf356f9763095ca9d51e7452a054a7db20f237`, Crawl4AI `cae74b203a33994f7e13b9052c3b0d5c93daa0e6`; это commit snapshots, не установленные package versions. Новый pin выбирается только после discovery.

Числовой цены нет: неизвестны accounts/нагрузка/quote/SLA. TCO = integration + operations/security + worker/storage/egress + все model/tool attempts + QA/repair/regression + exit cost. Цена accepted result включает неуспешные попытки и planning/judges, не только успешную delegation. UNKNOWN usage/цена не ноль. No purchase сейчас.

## I. Detailed OpenCode feasibility

**Возможно:** TypeScript/Mastra предоставляет пригодные поверхности, existing AWE имеет точки расширения. **Совместимо:** архитектурно условно при сохранении владельцев и R0 contracts; declared peers лишь предварительный фильтр. **Готово:** исследовательские контракты и материалы, не patch. **Требует разработки:** сквозной spec/ledger, safety boundary, qualification/QA/memory wiring. **Подтверждено тестом:** только проверки файлов этого пакета; AWE integrated R1 NOT_RUN.

| Seam по OC | Минимальное изменение | Класс | Acceptance до признания готовым |
|---|---|---|---|
| prompt-master.ts:56–87 → head-agent.ts:104–129 | Full approved spec ref/hash, exclusions/risks/criterion IDs | Малый schema adapter, сквозная propagation доработка | Markers проходят plan/child/repair/QA/resume; tamper/missing revision fail |
| mission-manager.ts + storage | Context bindings, reservations/attempt ledger, unknown reconciliation | Существенная доработка только отсутствующих paths | Crash/dedupe/lifetime budget; immutable evidence; no second recovery owner |
| specialists.ts:188, recursion.ts:277–288 | Qualified profile/Skill refs, narrowed grants | Малый adapter после current API audit | Unknown role не promoted; [] deny-all; no unlimited children |
| tools/index.ts:258–261,334–378 | Isolated worker и scoped file boundary | Существенная security доработка | Canary secret/foreign directory/symlink/egress/descendants negative tests |
| config/mcp.ts:171–257, browser.ts | Exact server/browser pin, mission context/lifecycle | Настройка + существенная lifecycle доработка при singleton gap | Two-mission isolation, cancel одного не повреждает другое |
| qa-agent.ts:29–108, qa-gate.ts:153–159,229–282 | Verifier adapters, mandatory coverage, actual media | Существенная предметная доработка | Seeded defects fail, good controls accepted, missing evidence blocked |
| memory/index.ts и generate/stream callers | Trusted stable scopes, records/revoke | Настройка + adapter/сквозная ACL доработка | Cross-tenant/holdout leakage absent, tombstone immediate, reconcile verified |
| config/models.ts:56–104 | Constraints then measured route | Малый policy adapter; benchmark отдельный | Unsupported alias/schema/fallback over budget denied |

Перед diff: разрешённый frozen tree → найти existing equivalent → сверить symbols/types/locks/callers/migrations → no-op если контракт уже есть → один bounded patch → positive/negative tests → R0 regression → independent review. Не конструировать private current source из historical exports. No-op с доказательством — корректное закрытие task.

Native workflow — только optional bounded child procedure, если обычная TS функция не решает gap. Generic ownership writes unfenced по package source; отдельные fencing primitives есть. Авто-restart и resume не должны конкурировать с Manager; external effects проходят existing boundary. Native approval API может дать UI/transport, но authority остаётся current gate с spec/args/account/version/expiry и повторной revoke проверкой. Второй Head через Agent.network не нужен.

OpenCode не должен самостоятельно принимать свой patch, расширять grants, менять oracle ради зелёного теста, покупать ресурс или превращать fixture PASS в production GO. Размер diff не равен безопасности. Версия самого OpenCode и цена конкретного запуска не исследованы; срок выполнения не обещается.

## J. Компактный R1 DAG

Все этапы будущие, **NOT_RUN**. Требуется отдельный инженерный допуск, не предоставляемый этим исследованием.

```text
T0 current inventory → T1 frozen restore/R0 parity
T1 → T2 safety boundary
T1 → T3 immutable requirements + complete ledger
T2 + T3 → T4 independent domain QA
T4 → T4a minimal qualification/admission/revoke binding
T4a → T5 first data capability (baseline + new held-out result)
T5 → T6 scoped learning/transfer and extended provenance
T6 → T7 repeat research/code; compare single/team and routes
T2 + T3 → T8 browser/MCP qualification only when needed
T7 → T9 optional workflow/exporter/vendor only at measured gap
```

Schema/fixture/oracle authoring может идти параллельно read-only inventory; исполнение недоверенного кода ждёт safety gate. T8/T9 не блокируют первый local data result. Полные карточки с входом, delta, P/N acceptance, evidence, rollback и stop rule — `IMPLEMENTATION-TASK-CARDS.md`.

## K. Риски, неизвестные, эксперименты

| Unknown / риск | Как разрешить в будущем допустимом scope | Stop rule |
|---|---|---|
| Final dirty snapshot не восстановим | Source/config/locks/system/browser inventory + clean restore | Hash-only не release PASS |
| Shell/FS/network exposure | Synthetic canaries, path/TOCTOU/fd/proc/socket/egress cases, независимый observer | Любая утечка блокирует route |
| Browser sharing | Два независимых cookie/storage/download fixtures + cancel | Пересечение state блокирует browser qualification |
| Provider model alias/tool calling/usage | Bounded отдельно разрешённый probe, exact request/config/response | Unknown не compatibility; no blind paid retry |
| Correlated QA | Good/bad human-labelled set, blind order swap, deterministic oracle | Critical false accept блокирует qualification |
| Holdout contamination | Split provenance/exposure ledger; fresh scope без shared retrieval | Leakage аннулирует holdout; новый набор |
| Memory revoke/cleanup | Immediate deny + cache/index reconciliation; race tests | Успешный delete API не sufficient |
| State/schema rollback | Old/new snapshot readback, active mission pin/drain | Incompatible binary не читает new state по умолчанию |
| Cost undercount | Fake provider всех phases/retries + duplicate callbacks/crash | Missing usage = UNKNOWN, не zero |
| Tool drift/supply chain | Exact lock/integrity/license/scripts/advisories/schema review | Изменённый digest → review/requalify |
| Team overhead | Paired single/team trials с равными ресурсами | Нет полезного выигрыша → оставить single |

Regression categories сохраняют stale fence/revoke race, immutable artifact lineage, repair data-dir isolation, abort fallback, MCP quiescence, child signal, crash gap, empty grants, lifetime budget/restart. Ранее открытые D1–D9 не объявляются текущими FAIL без same-snapshot counterexample.

Rollback: stop admission → deny new dispatch → drain/cancel/join → сохранить unknown intents/receipts → reconcile → вернуть совместимые code/config/schema/tool/skill/oracle pins → проверить readback → requalify affected capabilities. Blind DB restore или git reset не отменяют внешние эффекты и могут потерять evidence. Security revoke сильнее version pin.

## L. Final recommendation и проверенный scope

**Принять reuse-first, bounded competence и независимый domain QA как направление R1. Не принимать универсальную автономность, production readiness или обучение по факту сохранения материалов.** Сохранить доказанное R0 и сделать его восстанавливаемым; затем один local analytics loop с честными receipts, следующими новыми задачами и scoped learning. Расширять каталог по реальным gaps, а не числу профессий или инструментов. OpenCode получает bounded engineering tasks после отдельного допуска и остаётся вне пользовательского пути.

Составитель использовал полный прежний сводный отчёт, полный 728-строчный аудит OpenCode и исходные материалы коллег. Это синтез, не повторный аудит каждого vendor claim всех 22 MD. Полученные материалы и integrity проверяются отдельно от истинности тезисов. Direct current cleanroom недоступен; computer access.mode=off не менялся. Исторические исходники не импортировались в cleanroom; архив итогового пакета не включает historical runtime source или чувствительный raw ZIP.

**Фактически выполнено:** чтение разрешённых документов, сопоставление evidence, проверка целостности локальной передачи и структуры итогового пакета, сохранение private Drive. **Коллегами документированы:** upstream source/metadata inspections и проверки исходных evidence hashes. **Не выполнено:** AWE regression/security/runtime/live tests, установочная compatibility, qualification демонстраторов, provider calls, deployment, purchase и access changes. Причина: research-only scope и отсутствие разрешённого current runtime. Тестовые планы не выдаются за тесты.

Будущие owner gates: инженерное исполнение, данные/threat model, любые accounts/scopes/cloud transfer/spend/external effects, продуктовая приёмка и расширение автономности. В этом исследовании промежуточных согласований не требуется и не запрашивается. Независимый review draft выполнен (3 major, 2 minor). Исправления и самостоятельная ограниченная повторная проверка выпускающего описаны в REVIEW-DISPOSITION.md; это не новый независимый PASS и не engineering GO.
