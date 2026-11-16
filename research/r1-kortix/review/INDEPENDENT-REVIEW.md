# Независимая рецензия AWE R1

**Вердикт: CHANGES REQUIRED для окончательного инженерного handoff; условно пригодно как исследование.** Ключевые проверенные фактические утверждения подтверждаются источниками. Production/release readiness не проверена и не одобрена. Найдены три major и два minor замечания: прежде всего недоопределённая последовательность qualification/admission и неполный контракт первого аналитического результата. Фатальной фактической подмены current source, фиктивного выполненного application test или доказанного предложения второго orchestrator в проверенной части не обнаружено.

Дата: 2026-11-13. Reviewer session: `8b27d2d9-f236-479c-8fba-366e5a013631`. Объект — неизменённый draft сессии `ca44c6ed-7df6-44c8-94ee-5f8c56ae165d`, полученный из разрешённой private Drive-копии. Все locator ниже относительно `package/` draft. Номера строк относятся именно к полученному файлу, не будущей редакции.

## Границы независимости

Прочитаны задание владельца с pasted_content, основной отчёт A–L, ledger, reconciliation, handoff, task cards и пять приложений BC/DE/F/G/M; полный аудит OpenCode использован как первичный документ о чужой инспекции текущего AWE. Прежние 22 MD и handoff присутствуют и прошли проверку целостности; прежние исследования переиспользованы, отдельные значимые фрагменты F/G/H/editorial/review и сводного корпуса проверены целевым образом. **Новая полная построчная экспертиза всех 22 MD и всех vendor claims не выполнена.** Полноту содержания нельзя выводить из количества файлов или SHA.

Прямого current-source доступа нет. Не пытался включить computer access, прочитать запрещённый cleanroom или импортировать туда исторический код. AWE не изменялся. Нет установок исследуемых пакетов, запуска их кода, live-provider вызовов, deployment, покупок или дополнительных субагентов. Публичные пакеты получены HTTP GET и статически прочитаны; проверка собственного скрипта структуры пакета — не тест AWE.

## Blockers

**Для выпуска исследовательского документа: новых blocker не установлено; major требуют исправления до маркировки final implementation handoff.**

**Для инженерного GO продолжают действовать явно признанные blockers:** недоступны final current tree и воспроизводимый release; изоляция shell не доказана; application compatibility и R0 regression после будущих изменений NOT_RUN. Они не являются ошибкой исследователя и не требуют обходить доступ. Поддержка: OC L126–171; draft L157–170,196–210. Закрытие только разрешённым inventory/restore/testing, не редакторским PASS.

## Major findings

### M1. T5 использует qualification/admission до появления их минимального контракта в T6

**Где:** `FINAL-REPORT-A-L.md:65–76,180–189`; `IMPLEMENTATION-TASK-CARDS.md:54–70`; `annex/DE.md:126–145`.

В архитектуре Manager обязан проверять qualification, профиль и generation до исполнения. T5 уже выдаёт capability/profile binding и provisional qualification. Но versioned qualification state/CAS/generation и revoke явно вводятся только T6, зависимым от T5. T4 квалифицирует QA, а не задаёт transition authority и persisted admission записи первой продуктовой capability. Фраза «сначала existing-equivalent audit» не определяет, что делать при отсутствии эквивалента.

**Контрпример проектирования, не выполненный тест:** T5 выпущен по своему checklist, capability отозвана после admission; executor/acceptance используют старый receipt, потому что T6 ещё не внедрён. Либо инженер реализует временный второй qualification store, нарушая reuse-first.

**Точная правка:** перенести минимальный capability/qualification binding, trusted issuer, immutable version/profile, eligibility/generation и revoke/recheck в T3/T4 либо отдельный T4a до T5. Полный learned provenance graph, memory retrieval и transfer оставить T6. Альтернатива: T5 строго qualification-only experiment с явным запретом provisional product admission до T6. Отдельно назвать existing owner и persisted seam, либо UNKNOWN T0 gate.

**Приёмка правки:** в DAG нет цикла; до T5 заданы tests wrong profile, absent receipt, revoke между admission и effect/acceptance, restart со stale generation. Все тесты остаются будущими NOT_RUN.

### M2. Первый analytics contract недоопределён для собственной отрицательной приёмки

**Где:** `annex/G.md:150–160`; `IMPLEMENTATION-TASK-CARDS.md:54–61`; `FINAL-REPORT-A-L.md:129`.

Пример сумм корректен: USD 14000 cents, EUR 7000 cents. Но contract говорит «deduplicate event_id», а конфликтующий duplicate в holdout внезапно требует BLOCKED. Не определены область блокировки (вся миссия/валюта/только конфликт), допустимые kind/status/currency, нецелые/отрицательные/слишком большие amount, пустая группа и missing event_id. Пустая группа включена в holdout без ожидаемого результата. Независимые oracle могут дать разные верные интерпретации.

**Точная правка:** добавить компактную утверждаемую input schema и decision table: exact duplicate; conflicting duplicate по каждому значимому полю; missing ID; unknown enum; integer/sign/range; empty input/group; missing settled amount. Зафиксировать observable verdict и что разрешено вывести частично. Не навязывать бухгалтерскую трактовку: выбранную политику явно маркировать DESIGN/owner contract. Для cents либо ограничить currency allowlist двумя валютами, либо задать minor-unit scale; не распространять «cents» на любые валюты автоматически.

**Приёмка правки:** reference calculator и независимый checker получают один frozen contract; публичные edge примеры с expected outcomes проверяют полноту правил, закрытые значения остаются закрытыми. Ни один тест не требует угадать политику.

### M3. Сопоставление Composio приписывает старому пакету ошибку, уже исправленную в нём

**Где:** `RECONCILIATION.md`, R14; `annex/F.md`, F3 и таблица H; `FINAL-REPORT-A-L.md:57,146` (принятое ISC само по себе верно).

Представлено как новое исправление K: «Composio repo MIT = package MIT» → package ISC. Однако исходный `evidence/previous/H-BUILD-BUY-REUSE-MATRIX.md`, таблица §3, уже прямо содержит `Composio Mastra 0.10.6 | ISC adapter npm` и Node >=22.22.3. Поэтому нельзя приписывать всему прежнему согласованному пакету утверждение MIT. Если ошибочная фраза была в отдельном старом документе, надо указать её точный locator и признать внутреннее расхождение, а не новую находку относительно единого K.

**Точная правка:** R14: «В части старых vendor/repository материалов возможно смешение лицензий; прежний H уже различал ISC adapter и hosted terms. Повторная npm metadata проверка подтверждает прежний H; это подтверждение/нормализация, не новая коррекция всего пакета». Если конкретный MIT locator не предъявлен — удалить утверждение о старой ошибке.

**Приёмка правки:** каждая строка reconciliation имеет точный старый claim/source и новый source; классификация confirmed/refined/superseded/unknown не выдумывает спор. Остальные R01–R20 проверить по тому же правилу; не заявляю, что каждая из них ошибочна.

## Minor findings

### m1. Handoff acceptance требует воспроизводимых команд, но карточки дают сценарии без harness mapping

**Где:** OC L546–622; `IMPLEMENTATION-TASK-CARDS.md:5–7,20–97`; `GITHUB-HANDOFF.md:29–43`.

Заданы полезные P/N и evidence, но нет связки case ID → runner/fixture → expected observer → команда. Current commands нельзя честно выдумать. Добавить template runbook с `COMMAND_PENDING_T0`, владельцем заполнения и gate до исполнения; для независимого CSV oracle можно подготовить конкретный формат fixture/result сейчас без запуска AWE. Это не требование нового масштабного обзора. Не называть карточки полностью patch-ready до заполнения.

### m2. Версионные и локальные ссылки полезны, но пакет не самодостаточен по raw upstream evidence

**Где:** `EVIDENCE-LEDGER.md`, разделы источников и ограничений; `annex/M.md:31–33`; `verify_package.py`.

Ограничение раскрыто честно. Проверка main links не проверяет внутренние source paths приложений; paths вроде `evidence/mastra/...` относятся к чужой сессии. Добавить маленький source index: URL, version/commit, capture time, digest, available-here yes/no, originating session/path. Не нужно публиковать приватный raw ZIP или исторические исходники. Проверку structural links именовать ровно `main-document links`, а не «все ссылки пакета».

## Проверка покрытия A–L и требований

| Раздел | Результат reviewer | Что ограничивает окончательную приёмку |
|---|---|---|
| A | Покрыт: решение, baseline, первый outcome, сложность | Не обещает гарантированный результат/срок |
| B | Покрыт документально, не direct current source | Current tree/restore UNKNOWN |
| C | Покрыт, требуется M3 | Не каждое старое утверждение независимо перепроверено |
| D | Содержательный расширяемый каталог и bounded execution | M1: минимальный admission до T5 |
| E | Разделены retrieval/skills/practice/weights; holdout/revoke предусмотрены | Не выполнен learning/transfer эксперимент |
| F | Полный lifecycle, grants отдельно от discovery, effect semantics | Adapter/runtime compatibility не доказана |
| G | Предметные oracle и negative controls для разных доменов | M2: contract первых данных; ни один демонстратор не запущен |
| H | Версии/альтернативы/риски и качественная сложность присутствуют | Полные terms, TCO inputs и transitives UNKNOWN; это честный partial |
| I | Seams и no-op/reuse-first есть | Readiness условная, не patch-ready; M1/m1 |
| J | Приоритеты, зависимости, rollback и stop rules есть | M1 и уточнение runbook |
| K | Unknowns и safety regression перечислены явно | Не подтверждает фактическое отсутствие регрессий |
| L | Независимая рекомендация ограничена evidence | Final research label только после правок; не engineering GO |

Прочие ключевые требования: нет фиксированного потолка профессий; concurrency/depth/cost ограничены отдельно; сохранение файла не competence; OpenCode не runtime-посредник; второй Head/Manager/Factory/TI/Memory/QA не предлагается; новые vendor покупки отложены; сомнения не остановили разрешённое исследование. Версии, сроки и стоимость проверены выборочно: фиктивные числовые сроки/стоимость в основном draft не обнаружены; unknown не заменён нулём.

## Независимо сверенные claims

| Claim | Источник и результат | Класс доказательства |
|---|---|---|
| R0 offline closure, не production PASS | Полный OC, особенно L68–124,718–728; draft корректен | Документ аудитора; его suites не запускал |
| Final HEAD не final working tree | OC L146–171; `446adaea…`, dirty files, no remotes | Документ, не самостоятельный git current audit |
| bwrap bind / / не FS confinement | OC L126–144; аргументы прямо приведены | Статический вывод из процитированного кода, exploit NOT_RUN |
| Head scope loss, memory disabled, QA no tools | OC L175–323 совпадает с draft B/I | Документальная сверка |
| OC не читал старый Kortix package | OC L498–532 прямо подтверждает | Документальная сверка |
| core/memory/libsql/mcp версии, engines, peers/license | Самостоятельный GET точных npm metadata; все четыре Apache-2.0, Node >=22.13.0 | Metadata, не installation PASS |
| createScorer/runEvals в core 1.82.0 | Tarball integrity SHA-512 совпал; прочитаны `.d.ts` и source maps: evals/base.ts:1981–2005; evals/run/index.ts:231–318 | Собственный static upstream inspection |
| Workflow generic writes unfenced, primitive отдельно существует | core 1.82.0 source `workflows/run-ownership.ts:14–58`, `storage/run-fencing.ts`; blanket «fencing нет» draft не делает | Static upstream, не runtime race test |
| notScorable не даёт полной coverage | core source evals/run/index.ts:503–524 явно исключает all-not-scorable gate из verdict | Static upstream |
| deleteThread/background vectors и stale metadata | Git `6e8dfcb…` memory/src/index.ts:1051–1139; semantic-recall.mdx:240–261 прочитаны самостоятельно | Static upstream/docs, не AWE wiring |
| Composio 0.10.6 ISC/Node >=22.22.3 | Самостоятельный exact npm metadata GET | Metadata подтверждена, old-new attribution требует M3 |
| Playwright MCP 0.0.85 alpha dependency | Exact metadata: playwright/core 1.66.0-alpha-2026-11-09 | Подтверждена версия пакета; не повторная проверка mutable latest |
| MCP 2026-07-28 cancellation transport-specific | Получена первичная страница: HTTP close SSE; stdio notification, timeout maximum | Documentation, не actual negotiated protocol |
| Структура и hashes draft | Прочитан и выполнен verify_package.py: A–L, 728 OC lines, 23 old MD включая handoff, main links и SHA256SUMS OK | Только собственный file test |

Проверка tarball integrity выполнена для core 1.82.0, memory 1.41.0, libsql 1.29.0. Она не доказывает publisher trust, git↔npm correspondence или корректность установки. Для MCP/Composio/Playwright в этой проверке — metadata only. Локальные результаты и извлечённые публичные тексты в `primary/`; никаких private current AWE sources в review deliverable нет.

## Не проверено

- Current AWE source, реальный lockfile, Node/browser/bwrap, private recorder/observer и возможность восстановления frozen R0.
- Runtime, R0/security/regression/live/compatibility tests; model aliases/provider usage/cancellation; browser cross-mission isolation.
- Все API surfaces приложений: Skills/ToolSearch/datasets/observability не повторно проверены исчерпывающе reviewer; подтверждение коллег остаётся атрибутированным.
- Полный dependency graph, supply-chain/advisories, юридическая достаточность лицензий/terms, цены и ROI.
- Исполнение трёх демонстраторов, false acceptance QA, measurable learning, transfer, экономическая выгода multi-agent.
- Полный повторный audit каждой строки прежних 22 MD и всех URL; hash equality не заменяет эту работу.

## Решение о передаче

Исправить M1–M3, добавить runbook/index по m1–m2, пересчитать hashes и передать новую редакцию для ограниченного повторного review изменённых участков. До этого корректная маркировка — **research draft, changes required; current-code feasibility conditional; application acceptance NOT_RUN**. Сама рецензия не меняет cleanroom policy и не разрешает импорт запрещённых материалов. Владелец может читать её в private Drive; публикация приватных исходников не выполнялась.

## Первичные источники

- [OpenCode audit, docs commit 28971e26aaf094560bf500d1d71e5e3671207e83](https://github.com/failm3/nivict-ai-academy/blob/28971e26aaf094560bf500d1d71e5e3671207e83/03%20-%20Практика/05%20-%20AWE%20GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md)
- [Предыдущий пакет, commit c1a6b59c48fcb74527575dc91951f7e613d8c6de](https://github.com/failm3/nivict-ai-academy/tree/c1a6b59c48fcb74527575dc91951f7e613d8c6de/03%20-%20Практика/05%20-%20AWE%20GROUP/RESEARCH/KORTIX-2026-11-13-ENTERPRISE-RESEARCH)
- [core 1.82.0](https://registry.npmjs.org/@mastra/core/1.82.0), [memory 1.41.0](https://registry.npmjs.org/@mastra/memory/1.41.0), [libsql 1.29.0](https://registry.npmjs.org/@mastra/libsql/1.29.0), [mcp 2.8.0](https://registry.npmjs.org/@mastra/mcp/2.8.0)
- [Composio 0.10.6](https://registry.npmjs.org/@composio/mastra/0.10.6), [Playwright MCP 0.0.85](https://registry.npmjs.org/@playwright/mcp/0.0.85)
- [Memory source pinned](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/memory/src/index.ts#L1051-L1139)
- [Semantic recall pinned](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/memory/semantic-recall.mdx#L240-L261)
- [MCP cancellation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation)
