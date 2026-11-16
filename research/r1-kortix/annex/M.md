# Mastra и развитие AWE

**Решение:** сохранить существующие Head, Mission Manager, Agent Factory, Tool Intelligence, Memory и QA. Подключать Mastra как библиотеку ограниченных возможностей, а не второй управляющий контур. Ближайшая полезная комбинация — полный контракт требований, один квалифицируемый исполнитель с независимым QA, детерминированные scorers и полный журнал расходов. Динамические команды включать по измеренной необходимости. Перенос recovery на Mastra Workflows сейчас не обоснован.

Исследование 2026-11-13. Специализированный вклад в мультиагентность и разделы H/I/J общего исследования. Никакие AWE-файлы, зависимости, deployment, процессы приложения, модели, browser/MCP-сервисы и платные trials не запускались и не изменялись. Субагенты не создавались.

## 1. Доказательства и воспроизводимость исследования

### 1.1. Что действительно прочитано

- Полное задание владельца, включая pasted_content, в сессии `1887875a-7fda-4d43-bc20-c36c6dda3cc3`.
- Полный 728-строчный аудит OpenCode, commit документа `28971e26aaf094560bf500d1d71e5e3671207e83`. Его чтение текущего cleanroom и пересчёт сохранённых тестов — **документальное свидетельство другого аудитора**, не мой тест и не мои текущие исходники AWE.
- Пакет предыдущих 22 MD + handoff, публикация `c1a6b59c48fcb74527575dc91951f7e613d8c6de`: использованы прежде всего C/D/E/F/H/I/J/K, baseline B и source appendix M; остальные материалы использованы для навигации, ограничения scope и устранения дублирования. Это целевое продолжение, не новый обзор рынка и не повторная построчная экспертиза всех 22 документов.
- Точные npm packages `@mastra/core@1.82.0`, `@mastra/memory@1.41.0`, `@mastra/libsql@1.29.0`, `@mastra/mcp@2.8.0`: получены публичным GET, SHA-512 tarball сверены с registry integrity. Прочитаны опубликованные `.d.ts` и исходный TS из `sourcesContent` sourcemaps. Пакеты **не устанавливались и не исполнялись**.
- Для необязательного observability adapter прочитаны registry metadata `@mastra/observability@1.24.0`; его реализация и сборка с AWE не проверялись.

`kortix sessions cp` из evidence-сессии `4d4607fa-b2d8-407d-89ba-0993e25ab7aa` вернул «session not found». Без изменения доступа использована уже предоставленная приватная Drive-копия `/drives/me/Research/AWE-evidence-2026-11-13/awe-evidence-bundle-2026-11-13.zip`. **Выполнена собственная проверка SHA-256 всех 42 records по inventory.json: 42 совпали, 0 несовпадений.** Это проверка передачи evidence, не тест AWE. Архив не переносился в запрещённый cleanroom.

### 1.2. Evidence grades

| Grade | Значение | Чего не доказывает |
|---|---|---|
| U-SRC | Прочитанный код из точного опубликованного upstream package | Что этот путь подключён и работает в AWE |
| U-API | Type declarations точного пакета | Runtime semantics во всех ветвях |
| META | npm manifest, engines, peers, integrity | Успешную установку, security и транзитивную совместимость |
| A-DOC | Аудит текущего AWE другим автором с путями/строками | Непосредственный доступ исследователя к current source |
| H-SRC | Исторический экспорт runtime | Текущее поведение frozen R0 |
| DESIGN | Инженерное предложение / гипотеза | Реализованность и измеренный выигрыш |
| TEST | Выполненная здесь проверка | Только названный scope: hashes пакетов/evidence, не application tests |

Текущий frozen cleanroom недоступен; точный release commit неизвестен. Исторический `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda` содержит иной runtime; его `package.json` не используется для вывода о Mastra dependencies текущего AWE. Локальный HEAD `446adaea833b0ebade1a21fbda3f71118d19b0d6`, указанный OpenCode, не воспроизводит незакоммиченный финальный working tree.

### 1.3. Как читать ссылки на исходники

В разделе 11 — registry/tarball URLs. Локальные файлы даны относительно `evidence/mastra/` в этой сессии. `sources/core/...` — восстановленный **текст** из sourcemap пакета, не отдельный checkout и не выполненный код. `.d.ts` можно открыть через `https://unpkg.com/@mastra/core@1.82.0/dist/<path>`; line anchors ниже относятся к сохранённому файлу. Прежний пакет связал core tag с Git commit `6e8dfcb83facb0861ebefa4fee384429a113acf4`; здесь эта Git-связь заново не подтверждалась, поэтому основная идентичность нового исследования — package version + registry integrity, не предположение о Git HEAD.

## 2. Что изменилось относительно прежнего исследования

1. **R0:** прежние формулировки «independent audit in progress / final unknown» устарели. Новый аудит обосновывает **R0 OFFLINE SCOPE VERIFIED / CLOSED**, но не production PASS. Перечисленные ранее D1–D9 нельзя автоматически перенести в новый backlog как неисправленные дефекты. Источник: OpenCode L68–171; сохраняется отдельный разрыв filesystem isolation L126–144.
2. **Memory:** прежнее «Memory существует, добавить metadata» недостаточно. OpenCode L297–307 показывает disabled recall/working memory, отсутствие стабильных resource/thread и отсутствие memory у specialists. Сначала нужен wiring и проверка изоляции, затем knowledge promotion. Это не просто настройка одного флага.
3. **Skills:** прежний F уже проверил `SkillSearchProcessor`; не надо снова изобретать loader. Новый аудит подтверждает installed Workspace/skills types, но не wiring. Рекомендация сохраняется условной, а не «всё уже включено».
4. **Workflows:** наличие готового SDK не означает, что custom manager следует немедленно удалить. Теперь проверен точный исходник lease: generic workflow ownership действительно оставляет writes unfenced, хотя пакет одновременно имеет fencing primitives для других путей. Обобщения «Mastra вообще не умеет fencing» и «Mastra уже заменяет R0 guarantees» одинаково неверны.
5. **Dynamic teams:** текущая фабрика уже создаёт реальных Mastra Agent. `Agent.network()` или вложенные `agents` не нужны как второй Head. Выбор команды должен оставаться внутри существующего admission/manager.
6. **Observability:** tracing поддерживается, но полноценный exporter — отдельная необязательная зависимость; tracing не автоматически полный cost ledger. Важнее сначала охватить все вызовы, чем приобрести интерфейс мониторинга.
7. OpenCode не читал предыдущий пакет из-за cleanroom restrictions (L498–532). Его согласие с native-first не является независимой проверкой каждого прежнего документа.

## 3. Версионная матрица — что фактически доступно

| Компонент | Источник о наличии в AWE | Свежая проверка upstream | Вывод |
|---|---|---|---|
| core 1.82.0 | A-DOC L33–48 | META/U-API/U-SRC; Node >=22.13.0; Zod ^3.25.0 или ^4.0.0 | Использовать pinned baseline, не latest upgrade |
| memory 1.41.0 | A-DOC L33–48, 297–307 | peer core >=1.80.0-0 <2.0.0-0 | core 1.82.0 входит в declared range |
| libsql 1.29.0 | A-DOC L33–48 | peer core >=1.76.0-0 <2.0.0-0 | Не нужен новый DB только ради eval/memory |
| mcp 2.8.0 | A-DOC L33–48, 277–295 | peer core >=1.79.0-0 <2.0.0-0; Zod ^4.2.0 | Reported Zod 4.6.7 входит в declared peer range; не runtime proof |
| observability 1.24.0 | Установка не доказана | META: core >=1.16.0-0 <2.0.0-0; Zod ^3.25.0 или ^4.0.0; Node >=22.13.0 | Кандидат, не обязательная миграция |
| @ai-sdk/openai 4.0.115 | Только A-DOC L33–48 | В этой lane не загружался | Compatibility Router.Cheap/tool calls/usage UNKNOWN |
| @playwright/test 1.49.1 | Только A-DOC L33–48 | Не повторялось | Не является версией MCP browser server |
| @playwright/mcp | Аудит сообщает unpinned npx | Точный установленный сервер неизвестен | Pin фактическую рабочую версию отдельно; не выдумывать pin |

У первых четырёх пакетов общий Node minimum >=22.13.0. Это лишь нижняя граница engines. Версии AWE Node/lockfile/browser и весь dependency graph нужны при восстановлении baseline; из корректных peer ranges не следует воспроизводимость установки. Все четыре manifests указывают Apache-2.0; это не бесплатность моделей/хостинга и не license-аудит транзитивных зависимостей.

## 4. Проверенные поверхности Mastra и минимальные изменения AWE

### 4.1. Agents, dynamic arguments и команды

**U-API:** `core/package/dist/agent/types.d.ts:590–666` — строка модели, model configs/список fallback и `DynamicArgument` через requestContext. L685 — dynamic workflows; L753–761 — dynamic agents/scorers/memory. `agent/agent.d.ts:1289–1302` — `network()`. `agent/agent.types.d.ts:578–598` — maxSteps, stopWhen, callbacks, activeTools, abortSignal.

**A-DOC:** `src/agents/specialists.ts` создаёт Mastra Agent; recursion имеет depth=3, total agents=12, parallel children=4 (аудит L233–247). Это параметры текущего документа, не предел библиотеки и не потолок каталога компетенций. Их сохранение на первом пилоте снижает вариативность; увеличение требует отдельного benchmark.

**Решение DESIGN:** сохранить `createSpecialist` как единственную точку создания исполнителей. Добавить binding идентификатора/version/digest квалифицированной процедуры, разрешённой модели и контракт контекста. Фабрика получает уже отфильтрованные полномочия; capabilities/role text не выдаёт grants. Использовать dynamic model API при необходимости, но resolver должен читать доверенную конфигурацию, а не LLM-поле `model` без проверки.

Не активировать `Agent.network()` одновременно с существующим Head: это ещё один агент-маршрутизатор и цикл принятия решений. Нативный subagent API можно позднее спрятать **за** текущей фабрикой только после доказательства, что все children проходят тот же durable admission, budget, grants, cancellation и receipts. Для ближайшего R1 это необязательная работа.

### 4.2. Workflows, suspend/resume и recovery

**U-API:** `workflows/workflow.d.ts` содержит create/run workflow, execute и suspend/resume; `workflows/types.d.ts:729–739` — foreach concurrency number/resolver, L877–884 — default concurrency=1 для отсутствующей foreach options. Это не общий global concurrency cap. `workflows/types.d.ts:440–466` — `autoRestartActiveRuns` и `allowUnclaimedResumes`.

**Ключевое U-SRC:** `sources/core/workflows/run-ownership.ts:14–35` прямо пишет: writes stay unfenced; lease информирует recovery sweep; storage без поддержки даёт no-op. L46–58: потеря renewal останавливает heartbeat и пишет warning. `sources/core/workflows/workflow.ts:5076–5106` — условия получения ownership; L5110 и далее — отдельный атомарный resume claim. **Resume claim не равно fencing произвольных side effects.**

**Важное уточнение:** `sources/core/storage/run-fencing.ts:3–12,76–93,204–210` описывает fenced writes, а `sources/libsql/storage/domains/workflows/index.ts:141–148` реализует supportsRunFencing и resolveRunFence. Поэтому наличие primitive и возможность adapter — да; автоматическое включение этих гарантий для generic workflow и shell/browser — нет. Потеря lease внешне уже отправленное письмо не отменяет.

**Рекомендация:** в R1 сохранять Mission Manager единственным владельцем mission state/recovery. Если новая профессиональная процедура действительно требует ветвления/повторения, можно исследовать bounded, преимущественно pure/read-only workflow внутри одного delegation step. Manager выдаёт лимиты и signal; workflow не создаёт независимый бюджет или permission authority. Generic auto-restart для такого child должен быть отключён/контролироваться manager, а все effects — через действующую AWE границу. Это **проект будущего эксперимента**, не проверенная интеграция.

Простой первый вариант — обычная TypeScript-функция/существующая последовательность делегаций. Если она решает задачу, workflow adapter не нужен. Полная замена manager — высокая сложность и отдельное архитектурное решение, не условие приобретения компетенций.

### 4.3. Approvals

**U-API:** `agent/agent.types.d.ts:667` — requireToolApproval; `agent/agent.d.ts:1651–1669,1702–1789` — resumeStream, approveToolCall/declineToolCall и generate variants. Наличие этих APIs подтверждено, но пока не выбран execution mode AWE, нельзя считать их drop-in заменой.

**DESIGN:** UI/HITL можно адаптировать к текущему approval record, однако исполнение разрешает существующий trusted gate. Approval bind: approved spec hash + task/action + normalized arguments digest + resource/account + tool version + expiry + actor. При resume проверить актуальные revoke/cancel/fence/budget, даже если пользователь раньше нажал approve. `approved:true` в model output не authority. Resume другого tenant, двойной resume, expired approval и изменённые args должны fail closed. Не вводить независимый approval store, расходящийся с AWE.

### 4.4. Memory

**U-SRC:** `sources/memory/index.ts:631–651` проверяет принадлежность thread resource; L735–800 — проверка при query, требование resourceId для resource-scoped recall и vector scope filter. L950–958 показывает getThreadById с optional resourceId: **это не универсальная авторизация всех прямых вызовов storage**. `memory/package/dist/index.d.ts:183–198` описывает mergeWorkingMemory с требованиями schema/resource/adapter.

**Решение:** включать не «память вообще», а конкретные scoped paths:

- thread = отдельный dialogue/mission channel; resource = доверенная область совместного доступа, не автоматически весь пользователь или вся организация;
- связывание tenant/project/principal выполняет existing API, не LLM; threadId нельзя угадывать и передавать как разрешение;
- specialists получают memory только если это нужно задачам, со стабильной identity;
- профессиональные факты и процедуры сохраняются в existing storage как versioned records с evidence/status/validity/ACL; conversational summary не становится verified knowledge;
- сначала lexical/structured lookup маленького approved корпуса; semanticRecall добавлять лишь при измеренном retrieval gap и с проверкой embedding storage/scopes;
- workingMemory допускает самообновление контекста, но не автоматическое повышение qualification или tool grants;
- rollback/revocation исключает процедуру из новых миссий; текущая миссия удерживает pinned version, кроме немедленного security revoke.

Не включать resource-scoped recall широко до cross-tenant тестов. Не переносить произвольную информацию из прошлой миссии в текущую только потому, что та принадлежала одному владельцу: project/client confidentiality может быть строже.

### 4.5. Evals, scorers и QA

**U-SRC:** `sources/core/evals/base.ts:1964–2005` — createScorer; `sources/core/evals/run/index.ts:231–318` — runEvals overloads для agent/workflow и default concurrency=1; L1112 и далее — отдельные memory threads в eval loop. **U-API:** `datasets/dataset.d.ts:213–268` — experiment/item surface. Это готовый execution/evaluation substrate, не готовые профессиональные критерии.

**A-DOC:** текущий QA без tools, картинки превращаются в ссылки, evidence window ограничен, criteria эвристичны (`src/agents/qa-agent.ts:29–44,61–108`; `mission-manager.ts:790–798`; `qa-gate.ts:153–159,229–282`; аудит L309–323).

**Решение:** не второй QA. Существующий gate получает результаты зарегистрированных проверяющих: build/test, независимый пересчёт, claim-source validation, visual evidence по применимости. Scorer является вычислителем метрики, gate — решением о приёмке. Critical invariant failure нельзя компенсировать высоким средним LLM score. Для непроверяемого результата возвращать `not evaluated/blocked`, не нулевой дефект и не PASS.

Scorer inputs: frozen spec/criterion IDs, artifact hash, fixture/oracle version, runtime/model/skill/tool bindings и independent evidence refs. Генератор не редактирует oracle и не видит hidden expected answers. Дешёвые детерминированные scorers до платных judges; judges калибровать на дефектных примерах. Evaluation tool access должен быть read-only/sandboxed, не broad allTools.

Прикладные rubrics, labels, held-out corpus, qualified threshold и promotion/rollback — **разработка AWE**, их Mastra не создаёт автоматически. `runEvals` только с независимыми thread IDs ещё не доказывает отсутствие leakage через общий resource/semantic memory; для benchmark нужен отдельный eval scope и запрет retrieval ответов.

### 4.6. Observability и cost ledger

**U-API:** `core/package/dist/mastra/index.d.ts:143–167` указывает `Observability` из отдельного `@mastra/observability`, exporters и default SensitiveDataFilter; `agent/agent.types.d.ts:584–598` — callbacks и abort. Нативная библиотека пригодна как источник traces. Default redaction нельзя считать доказательством удаления всех secrets, screenshots и пользовательских данных.

**A-DOC:** итоговые token totals AWE суммируют delegation results (`mission-manager.ts:2533–2559`), но не весь Prompt Master/Head/QA/repairs/nested chain (аудит L249–267).

**Минимум DESIGN:** расширить existing mission journal/call boundary, не новый billing service:

- `mission_id`, `logical_call_id`, `attempt_id`, `parent_call_id`, phase, agent/model/provider/skill version;
- reserved maximum, sent/not-sent/unknown, input/output/cache/reasoning tokens по тому, что реально вернул provider; nullable usage и источник;
- actual price source/version/currency/unit; неизвестная цена/usage — UNKNOWN, не 0;
- уникальный provider request id при наличии, дедупликация callback и restart;
- retries, judge, embeddings, summarization, planner, repair и неуспешные попытки входят в тот же mission accounting;
- reserve до dispatch, settlement после результата; crash с неизвестным счётом не освобождает reservation как «не потрачено»;
- traces могут быть sampled, ledger — нет; `onFinish` может не сработать при crash, поэтому callbacks недостаточно для durable accounting.

Не обещать абсолютно точный pre-call bill: streaming cancellation и provider usage могут быть неполными. Нужны ограниченные reservations и reconciliation. Langfuse/другой UI отложить до доказанной потребности; native storage exporter можно подключить позднее, без изменения владельца mission state. Provider-paid эксперименты только отдельным допуском.

### 4.7. Model selection

**A-DOC:** `src/config/models.ts:56–104` использует exact/substring role routing, specialists.ts:188 применяет его; Head plan не содержит selection. Нет measured capability routing. Каталог/комментарий LIVE-VERIFIED не доказательство работоспособности конкретного model alias.

**Рекомендация DESIGN:** расширить текущий registry, не писать новый model router service. Двухэтапный выбор:

1. Hard constraints: разрешённые provider/account, data locality/privacy, modality, tool-calling и structured-output compatibility, context limit, quota, approved price ceiling, квалификация на классе задач.
2. Среди допустимых — measured accepted-result quality/cost/latency и confidence результата; при неизвестном benchmark baseline pin, не выдуманный optimum.

Модель выбирается на delegation boundary и фиксируется в binding. Fallback — только на также разрешённый/квалифицированный route. Provider error не разрешает более дорогую модель без остатка бюджета; смена модели не должна автоматически повторять уже произошедший tool effect. Различные модели автора и QA могут уменьшать коррелированную ошибку, но независимость доказывают oracle/evidence, а не разные бренды.

## 5. Мультиагентность без увеличения числа агентов ради числа

### Когда один исполнитель лучше

Один рабочий агент + существующая независимая QA-проверка — исходный вариант, если задача короткая, последовательная, имеет общий изменяемый артефакт или помещается в один контекст. Примеры: локальный небольшой bugfix, единый небольшой dataset analysis, исследовательская записка по одному узкому вопросу. Дополнительные specialists добавляют handoff loss, повторное чтение, planner/judge costs и merge conflicts. «Один» здесь не означает самоаттестацию исполнителя или отключение QA.

### Когда команда обоснована

Команда — кандидат, если есть независимые bounded subproblems с раздельными outputs, реально разные профессиональные методы/инструменты или независимый поиск опровержений. Например, раздельный анализ нескольких независимых источников с последующей проверкой claims; разные модули кода с заранее фиксированными interfaces; data analysis и независимый пересчёт без доступа к ожидаемому ответу. Параллельность не сокращает критический путь там, где всем нужен один browser profile, один файл или результат предыдущего шага.

Head формирует ограниченный plan; manager валидирует dependencies и разрешает параллельность только для независимых задач. В текущем AWE parallel=true соседние batches — не DAG (A-DOC L211–231). Для первого R1 не нужен новый DAG engine: использовать явные фазы producer → independent validators → merge. Если конкретная capability действительно требует сложного DAG, сначала comparison простого планирования и Mastra child workflow, затем решение.

### Контракт передачи контекста

Предлагается расширение existing types, не обязательное новое имя API:

`ContextEnvelope = approved_spec_ref/hash + original_request_ref + scope + exclusions + risks + criterion_ids/checker_refs + dependency_results + source/artifact hashes + capability/skill bindings + effective tool grants + model route + budget/time/cancellation refs + provenance/trust labels`.

Prompt Master → Head → specialist → QA получают одну утверждённую версию требований. Краткое summary дополнительно, не вместо exclusions и scope. Любое изменение acceptance требует новой утверждённой версии. Контекст содержит только необходимые evidence slices, а не все малые предыдущие artifacts. Отсутствие evidence — typed missing input, не предложение модели додумать требования.

Результат делегации: typed result + evidence refs + criterion coverage + unresolved assumptions + resource usage + effect receipts. Не каждому внутреннему расчёту нужен новый файл, но финальный deliverable и evidence должны быть сохранены и доступны QA. Так сохраняется защита от пустого «готово», без стимуляции бессмысленных документов.

### Ограничения исполнения

Не фиксировать потолок каталога ролей/компетенций. Каталог растёт как metadata; одновременно загружается bounded shortlist. Execution ограничивает отдельно: active children, mission-lifetime agent creations, depth, tool concurrency, calls/tokens/currency, wall deadline, retries/repairs, input/output sizes и shared resources. `maxSteps` Mastra не заменяет эти ограничения.

Effective limit — минимум остатка mission budget, parent grant, provider quota, worker capacity и policy limit. Reserve атомарно **до** child creation; restart не сбрасывает lifetime counter. Child scope не шире parent; [] означает deny-all. Manager отслеживает весь descendant tree, stop admission после cancel, join/quiescence и unknown remote effects. Caps 3/12/4 — reported current defaults, не утверждённые будущие SLA.

### Разрешение противоречий

Head/manager не решают спор простым голосованием агентов. Сначала shared frozen criterion и evidence; детерминированный oracle приоритетен. QA формулирует конкретный counterexample; bounded targeted repair вместо повторного запуска всей команды. Неустранимое расхождение → blocked criterion/owner decision в существующем approval пути, без расширения прав. Конфликт требований не маскируется «лучшей попыткой».

### Как доказать пользу команды

Будущий парный experiment на одном frozen held-out наборе: single executor и current bounded team, одинаковые model/tool/knowledge permissions, одинаковый budget ceiling и независимый oracle. Записывать accepted-result rate, false acceptance, total cost включая failed runs/plan/QA/merge, wall time, repairs, handoff defects и нарушения scope. Повторять trials для стохастичности; публиковать число задач/повторов и разброс, не искусственную вероятность надёжности. Команда допускается только при измеренном преимуществе, важном для владельца, без ухудшения safety; предел не выбран произвольным процентом. Никакой такой experiment здесь не запускался.

## 6. H — Build / Buy / Reuse matrix

Сложность качественная: малая — локальный контракт/adapter; средняя — несколько call paths/storage/tests; высокая — изменение ownership/recovery/state. Это не сроки и не смета.

| Решение / версия | Уже в AWE | Действие и integration point | Сложность / R0 риск | Издержки и альтернатива | Доказательство / проверка |
|---|---|---|---|---|---|
| Mastra Agent core 1.82.0 | Factory создаёт Agent | REUSE; bind qualified procedure в specialists.ts | Малая/средняя; risk grants/defaults | Model calls; обычный executor baseline | A-DOC + U-API; deny-all child, frozen context |
| Dynamic model core 1.82.0 | Статический role router | CONFIGURE+ADAPTER в config/models.ts | Средняя; fallback/usage risk | Benchmark + provider charges; pinned route проще | U-API/META; constraints и fake-provider tests |
| Native subagents/network 1.82.0 | Свой Head/recursion уже есть | DEFER network; только совместимый backend factory позже | Высокая при обходе manager | Coordination cost; оставить current delegation | U-API; descendants budget/cancel/fence contract |
| Skills/Workspace core 1.82.0 | Installed types; wiring неизвестен | REUSE native loading, ADAPTER qualified refs/scoped tools | Средняя; executable scripts могут обойти gate | Search/context cost; fixed approved file loader | Предыдущий F + A-DOC; no implicit script execute |
| Memory 1.41.0 + LibSQL 1.29.0 | Объекты есть, end-to-end не доказан | CONFIGURE+ADAPTER memory/index.ts и calls specialists/head | Средняя; leakage/poisoning | Storage/embedding/judge; lexical first | U-SRC + A-DOC; A/B tenants, withdrawal, restart |
| createScorer/runEvals core 1.82.0 | Контур не подключён | REUSE substrate; BUILD domain checkers в existing QA | Средняя; критерии могут ослабиться | Judge/fixtures; deterministic checks first | U-SRC; seeded defects, hidden transfer |
| Datasets/experiments core 1.82.0 | Не доказано | CONFIGURE после minimal scorer adapter | Средняя; shared eval memory leakage | Storage/experiments; fixtures in existing repo проще | U-API; exact data/oracle/version binding |
| Tracing observability 1.24.0 candidate | Нет framework wiring по аудиту | ADAPTER local exporter, optional | Средняя; leaks/background cost | Storage и эксплуатация; existing logs first | META + U-API; redaction/correlation test |
| Mission cost ledger, AWE extension | Tokens частично | BUILD на current journal + all call wrappers | Средняя; race/recovery/budget risk | Engineering; trace-only неполон | A-DOC+DESIGN; crash/dedupe/unknown usage |
| Workflows core 1.82.0 | Не подключены по аудиту | DEFER migration; bounded procedure pilot при gap | Высокая для migration | Семантический перенос/retest; TS step проще | U-SRC; no duplicate effect/recovery owner |
| Native approval/resume core 1.82.0 | Existing AWE approval | ADAPTER только UI/transport при нужде | Средняя; stale/double approval | State integration; current approval проще | U-API; changed args/revoke/replay deny |
| MCP 2.8.0 | Playwright singleton | REUSE, pin actual server, per-mission identity | Средняя; browser shared state/cancel | Server/runtime cost; existing read tools | A-DOC+META; two-mission isolation |
| LangGraph/Temporal/new orchestrator | Не нужны для gap | DEFER/не покупать | Высокая; второй control plane | Migration/ops; current manager | Нет доказанного blocker для R1 |

Ни одна строка не требует покупки ресурса сейчас. Экономическое сравнение: стоимость принятого результата = полный расход всех попыток/планирования/исполнения/QA/repair + доля инфраструктурных расходов, делённые на принятые результаты в объявленном scope. Цены, negotiated contracts, latency/SLA и трудозатраты неизвестны. Нет основания указывать доллары или дни.

## 7. I — Может ли OpenCode практически внедрить

**Технологически — да:** SDK APIs существуют в точных версиях, текущая структура уже TypeScript/Mastra и имеет точки расширения. **Совместимость архитектуры — условно положительная:** предложенные adapters не меняют владельца mission state. **Непосредственная готовность к diff — не подтверждена:** нет воспроизводимого current source/lockfile в этой lane; caller/callee и типы требуется сверить в разрешённом cleanroom. **Работающие интеграции/тесты — не заявлены.** Само имя OpenCode не доказывает способность реализовать безопасную миграцию; приёмка одинакова для AI и человека.

| Integration point по OpenCode audit | Конкретный ожидаемый delta | Before diff / done-when |
|---|---|---|
| prompt-master.ts:56–87 → head-agent.ts:104–129 | Полный approved spec ref, scope/exclusions/risks/criteria checker type | Trace одного requirement через plan/child/repair/QA/resume; при missing hash fail |
| specialists.ts:188; config/models.ts:56–104 | Передача model/capability binding и deterministic policy | Неизвестная модель/несовместимая функция не fallback silently |
| recursion.ts:277–288 | Не считать keyword-role synthesis квалификацией | Unknown role candidate может работать только в разрешённом экспериментальном scope, не trusted capability |
| mission-manager.ts; current storage/lifecycle | Child budgets и cost journal, typed result/evidence propagation | Race/restart preserves lifetime caps; ledger exactly-once record, не обещание exactly-once provider effect |
| memory/index.ts + все generate/stream call sites | Stable scopes и versioned approved retrieval | Повторная миссия retrieves только разрешённое, revoked record исчезает |
| qa-agent.ts/qa-gate.ts | Domain checkers/scorers, immutable criterion coverage | Намеренно дефектный artifact не принимается; unavailable checker = blocked |
| tools/index.ts, security/tool-context.ts | Не обойти существующую границу через Workspace/workflow/native child | Все новые paths проходят grant/fence/abort, shell isolation исправляется отдельно |
| config/mcp.ts:171–257, tools/browser.ts | Pin actual server и isolate concurrent context | Две миссии не разделяют cookies/downloads/page authority |

Реалистичный масштаб ближайшего изменения — локальные schema/call-site/scorer adapters с cross-cutting тестами. Это **не** простое «включить Mastra» и **не** необходимость переписать 2930-строчный manager. Полную квалификацию, sandbox isolation и ledger нельзя честно назвать одной конфигурацией.

## 8. J — Приоритизированная программа, без бесконечной подготовки

Все пункты — будущая инженерная работа, не начатая этим исследованием. Сохраняется valid no-op: если финальный код уже удовлетворяет контракту, тест + evidence закрывают ticket без нового слоя.

### M0. Воспроизводимый baseline и безопасные границы

Зависимости: нет. Получить frozen source commit/bundle + lockfile + Node/OS/browser/MCP pins + evidence index; clean restore в разрешённой изоляции, воспроизвести R0 gate. Не импортировать historical implementation в cleanroom вопреки правилам. Отдельный workstream ограничивает filesystem/network/secrets для shell и browser. Acceptance: не только cwd/PID namespace, но запрет чтения synthetic secret/чужого workspace и сохранение cancellation/recovery. Rollback: исходный frozen release, без новых external effects.

### M1. Сохранение требований и минимальный ledger

После inventory M0; schema design/fixtures можно готовить параллельно isolation, исполнение недоверенного кода — после её gate. Пронести versioned spec/context envelope через Prompt Master→Head→Factory→repair→QA. Учитывать все fake-provider calls в одном mission ledger; ID/dedupe/reservation/unknown. Acceptance: изменённые/missing constraints блокируют выполнение; дубли callbacks не удваивают totals; absent usage не ноль. Это рано даёт стоимость baseline и предотвращает ложный вывод об эффективности.

### M2. Одна end-to-end профессиональная способность, затем ещё две

Не ждать workflow engine/semantic memory/SaaS tracing. Взять из прежних packs одну низкорисковую способность с существующими tools: исследовательская записка, анализ таблицы либо небольшой sandbox codefix. Существующий single executor + fixed approved procedure + independent deterministic/domain QA. Core createScorer/runEvals — по месту, не обязательно разворачивать все datasets APIs сразу. Acceptance: held-out задача даёт предметно правильный результат и checker обнаруживает подложенный существенный дефект. Далее тот же механизм для двух остальных классов; это доказывает перенос архитектуры, а не «все профессии освоены».

### M3. Controlled Skills и verified memory

Зависит от M1/M2 quality oracle. Native loader + approved records, scopes и promotion/withdrawal. Acceptance: улучшение на новых задачах после версии процедуры, без leakage, и rollback к старой процедуре с воспроизводимым binding. Чтение документа и successful save сами по себе не принимаются как competence.

### M4. Измеренная команда и выбор модели

Зависит от полного ledger M1 и oracle M2. Сравнить single vs bounded current team; независимая модель QA опциональна. По результатам расширить existing route policy, а не marketplace всех моделей. Acceptance: документированный выигрыш на конкретном классе задач с расходами/рисками и failure modes; отсутствие выигрыша означает оставить single baseline. На этом R1 уже полезен без автоматической рекурсии любых ролей.

### M5. Optional SDK orchestration/observability

Только после доказанного gap. Child workflow adapter или exporter — отдельные отключаемые features. Не входной gate для M2. Нужны explicit restore/cancel/duplicate resume/fence/effect tests и отсутствие второго recovery owner. Если преимущества нет — не внедрять.

**Что параллельно:** после M0 inventory независимы проектирование spec/ledger, разработка domain fixtures и ревью isolation; новый execution допускается только после safety gate. Scorer corpus и rubric можно готовить без провайдеров. Live provider/MCP probes, платные model trials, новые cloud sandboxes, расширение доступа, deployment и миграция storage требуют отдельного реального допуска владельца.

## 9. Минимальная матрица будущих contract tests

| ID | Сценарий | Доказательство успешности |
|---|---|---|
| CT-01 | Scope/exclusion survives plan, child, repair, QA, resume | Один approved spec hash и все criterion IDs, отказ при mismatch |
| CT-02 | [] grants, nested creation race, restart lifetime budget | Нет forbidden effect; L+1 child не зарегистрирован |
| CT-03 | Cancel parent во время model/tool/child wait | Нет новых dispatch; local descendants quiescent; remote unknown честно сохранён |
| CT-04 | Workflow stale lease, duplicate resume, crash после send | Существующая AWE effect boundary не допускает повтор; unknown требует reconcile |
| CT-05 | Approval replay/expired/revoked/changed args/cross-tenant | Ни один не исполняет tool; валидный approve даёт один logical operation |
| CT-06 | Memory identical thread IDs разных tenants; revoked record | Нет cross-tenant retrieval/cache/trace; withdrawal действует |
| CT-07 | Fake provider retries+judge+planner+repair+missing usage | Ledger включает все attempts, unknown не zero, callback duplicates deduped |
| CT-08 | Router rejects unavailable modality/tool schema/fallback over budget | Нет unauthorized provider call; diagnostic reason сохранён |
| CT-09 | QA seeded code/data/source/visual defects | Существенные дефекты блокируют accepted, не усредняются score |
| CT-10 | Held-out memory/skill transfer и rollback | Нет утечки answers; versioned comparisons; не только training PASS |
| CT-11 | Single vs team на одинаковом task set | Полные costs/latency/quality, explicit counts и разброс |
| CT-12 | Exporter secret canaries, crash до finish | Redaction не выпускает canary; ledger survives независимо от trace |
| CT-13 | Two concurrent browser missions | Cookies, pages, downloads и cancellations не смешиваются |

Tests NOT_RUN. Для external-effect тестов сначала локальные doubles с наблюдаемым счётчиком effects; real probes отдельно. Наличие source-level branch не означает успешно выполненный CT.

## 10. Итоговые решения и ограничения

- **Принять native-first и reuse manager.** Доказательство API сильное, совместимость AWE условная. Никакой второй Head/network orchestrator.
- **Не считать память «почти готовой» только по dependency.** Требуются stable scoped calls и отдельный qualification lifecycle.
- **Scorers внедрять раньше большого каталога.** Они позволяют измерить пользу каждой следующей процедуры/модели/команды; domain oracle остаётся инженерной работой.
- **Сохранить R0, но не ждать всех инфраструктурных улучшений для проектирования первых задач.** Порядок OpenCode разумен, если isolation/baseline — gates исполнения, а fixtures/spec/ledger готовятся параллельно; первый профессиональный thin slice не зависит от полной telemetry платформы.
- **Не гарантировать совместимость Router.Cheap, общий budget cap через maxSteps, exactly-once effects или production isolation от одного Mastra.** Все такие утверждения требуют указанных контрактных и затем разрешённых live tests.
- Не покупать connectors/vector DB/distributed orchestrator заранее. Каталог компетенций расширяемый; исполнение всегда ограниченное. Приобретённая компетенция — улучшенный, независимо проверенный результат на новых задачах, не файл, не новая роль и не число агентов.

## 11. Sources и точные ссылки

### AWE

- [Полный аудит OpenCode, immutable commit 28971e26…](https://github.com/failm3/nivict-ai-academy/blob/28971e26aaf094560bf500d1d71e5e3671207e83/03%20-%20%D0%9F%D1%80%D0%B0%D0%BA%D1%82%D0%B8%D0%BA%D0%B0/05%20-%20AWE%20GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md). Локально `evidence/evidence/opencode-audit.md`, особенно L33–65,68–171,175–323,453–475,498–532,663–716.
- [Предыдущий пакет, publication commit c1a6b59c…](https://github.com/failm3/nivict-ai-academy/tree/c1a6b59c48fcb74527575dc91951f7e613d8c6de/03%20-%20%D0%9F%D1%80%D0%B0%D0%BA%D1%82%D0%B8%D0%BA%D0%B0/05%20-%20AWE%20GROUP/RESEARCH/KORTIX-2026-11-13-ENTERPRISE-RESEARCH). Локально `evidence/evidence/previous/`, C/D/E/F/H/I/J/K; F L35–38 содержит прежнюю проверку SkillSearch на Git SHA.
- [Исторический runtime d5e9d857…](https://github.com/failm3/awe-group-runtime/tree/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda). Не current Mastra baseline.

### Точные опубликованные Mastra packages

- [core 1.82.0 metadata](https://registry.npmjs.org/@mastra/core/1.82.0), [tarball](https://registry.npmjs.org/@mastra/core/-/core-1.82.0.tgz), [Agent types](https://unpkg.com/@mastra/core@1.82.0/dist/agent/types.d.ts), [execution options](https://unpkg.com/@mastra/core@1.82.0/dist/agent/agent.types.d.ts), [workflow types](https://unpkg.com/@mastra/core@1.82.0/dist/workflows/types.d.ts), [scorer types](https://unpkg.com/@mastra/core@1.82.0/dist/evals/base.d.ts), [Mastra config](https://unpkg.com/@mastra/core@1.82.0/dist/mastra/index.d.ts).
- [memory 1.41.0 metadata](https://registry.npmjs.org/@mastra/memory/1.41.0), [tarball](https://registry.npmjs.org/@mastra/memory/-/memory-1.41.0.tgz), [Memory API](https://unpkg.com/@mastra/memory@1.41.0/dist/index.d.ts).
- [libsql 1.29.0 metadata](https://registry.npmjs.org/@mastra/libsql/1.29.0), [tarball](https://registry.npmjs.org/@mastra/libsql/-/libsql-1.29.0.tgz).
- [mcp 2.8.0 metadata](https://registry.npmjs.org/@mastra/mcp/2.8.0), [tarball](https://registry.npmjs.org/@mastra/mcp/-/mcp-2.8.0.tgz).
- [observability 1.24.0 metadata](https://registry.npmjs.org/@mastra/observability/1.24.0) — metadata only, не установленный AWE компонент.

### Документация, использованная прежними аудитами

[Mastra Workflows](https://mastra.ai/docs/workflows/overview), [Skills](https://mastra.ai/docs/workspace/skills), [Evals](https://mastra.ai/docs/evals/overview). Эти live URLs — навигация, не immutable version proof; новые выводы этой lane опираются на pinned packages выше. Широкий свежий web search не проводился, чтобы не повторять уже сделанный market review.

## 12. Передача

Session ID: `33985002-8eec-4260-801b-ce2079c481b7`.
Основной результат: `/workspace/out/mastra-reuse-multiagent-HIJ.md`.
Дополнительный архив `/workspace/out/mastra-source-evidence.zip` содержит registry metadata, выбранные `.d.ts`/sourcemap-derived TS, inventory и результаты integrity checks. Он не включает приватные AWE implementation snapshots. Все raw package tarballs остаются в `/workspace/evidence/mastra/` и доступны для разрешённой передачи по необходимости.
