# AWE — инженерная реализуемость R1

**Рекомендация: сохранить текущие Mastra и собственный Mission Manager; сначала сделать R0 восстанавливаемым, закрыть границы исполнения и потерю требований, квалифицировать существующий QA, затем допустить одну способность с переносом на новую задачу. OpenCode пригоден как инструмент разработки небольших проверяемых изменений, но доказательств, что он уже способен безопасно внедрить весь R1 без инженерного контроля, нет.** Не добавлять OpenCode в пользовательский runtime и не строить второй Head, Factory, TI, Memory или QA. Это исследовательский маршрут, не разрешение реализации.

Дата: 2026-11-13 UTC. Автор: session `f33e82e4-bc8e-4950-aa61-7f6463889f9a`. Разделы соответствуют **новому** заданию B/C/H/I/J/K; старые документы с такими буквами имеют другие заголовки. Все предлагаемые application tests ниже **NOT_RUN**.

## 0. Доказательная рамка

### Что доступно и что действительно сделано

Использован переданный evidence bundle: прежние 22 основных MD и handoff, полный 728-строчный OpenCode-аудит, выбранные исторические исходники, новая документация и inventory. `kortix sessions cp` с evidence-сессии ответил not found; взята уже разрешённая копия того же пакета из private Drive, без изменения доступа. Прочитаны оригинальные релевантные разделы, а не только summary коллеги. Прежний пакет используется как baseline и набор вариантов, **не перепечатывается как новый обзор рынка**.

В этой сессии выполнены чтение материалов, статический разбор выбранного исторического кода и контроль целостности исследовательского пакета. Свежие первичные веб-источники ограничены Bubblewrap, Docker security и Playwright browser contexts — только для проверки границ sandbox/browser рекомендаций. Исходный frozen cleanroom недоступен; подключённый компьютер в переданных evidence имеет `access.mode=off`. Никакого обхода, выполнения AWE, установки dependencies, запуска миссий, покупок, внешних записей, deployment или новых субагентов.

### Evidence grades

| Метка | Значение | Не означает |
|---|---|---|
| **H** | Непосредственно прочитанный исторический source snapshot | Наличие этой реализации в текущем R0 |
| **D** | Точное утверждение OpenCode-аудита или другого документа | Независимый запуск/чтение текущего исходника мной |
| **P** | Первичная документация поставщика | Совместимость с установленным AWE или пройденный benchmark |
| **V** | Выполненная здесь проверка исследовательских файлов | Тест продукта AWE |
| **I** | Инженерный вывод, контракт, предлагаемый эксперимент | Реализованный интерфейс или прошедший тест |
| **U** | Недостаточно доступных доказательств | Установленное отсутствие функции |

Все ссылки на `src/...` ниже происходят из OpenCode-аудита, grade **D**, даже когда автор аудита непосредственно читал эти строки. Текущий source commit не установлен: локальный HEAD `446adaea833b0ebade1a21fbda3f71118d19b0d6` не включает окончательные незакоммиченные изменения. Нельзя сделать GitHub source permalink текущего R0 путём подстановки этого HEAD.

### Неизменяемые источники

- **[OC]** [Полный OpenCode-аудит](https://github.com/failm3/nivict-ai-academy/blob/28971e26aaf094560bf500d1d71e5e3671207e83/03%20-%20%D0%9F%D1%80%D0%B0%D0%BA%D1%82%D0%B8%D0%BA%D0%B0/05%20-%20AWE%20GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md), docs commit `28971e26aaf094560bf500d1d71e5e3671207e83`; локально `evidence/opencode-audit.md`, SHA-256 `ed43097ca94dbd0ec80439fd8b915be5a3127a7b98beded8459c02e65b236ae6`. Номера строк OC в отчёте относятся именно к этому файлу.
- **[K22]** [Предыдущий пакет](https://github.com/failm3/nivict-ai-academy/tree/c1a6b59c48fcb74527575dc91951f7e613d8c6de/03%20-%20%D0%9F%D1%80%D0%B0%D0%BA%D1%82%D0%B8%D0%BA%D0%B0/05%20-%20AWE%20GROUP/RESEARCH/KORTIX-2026-11-13-ENTERPRISE-RESEARCH), docs commit `c1a6b59c48fcb74527575dc91951f7e613d8c6de`. Важнейшие для этого заключения: `editorial-resolution.md`, B, C, H, I, J, K, `awe-nox-opencode-backlog.md`, F/G и L; точные hashes — исходный inventory/handoff.
- **[HIST]** [Исторический runtime](https://github.com/failm3/awe-group-runtime/tree/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda), commit `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda`, не текущий Mastra cleanroom.
- **[BWRAP]** [Bubblewrap README](https://github.com/containers/bubblewrap): sandbox policy определяется параметрами вызывающего процесса; само использование инструмента не создаёт требуемую политику. Rolling page, конкретная установленная версия AWE **U**.
- **[DOCKER]** [Docker Engine security](https://docs.docker.com/engine/security/): namespaces/cgroups и attack surface daemon; контейнер не автоматически безопасная граница. Версия кандидата не выбрана.
- **[PW]** [Playwright Browser contexts](https://playwright.dev/docs/browser-contexts): независимые non-persistent contexts изолируют browser state. Это не filesystem/network isolation shell worker и не доказательство context-per-mission в AWE.

## B. Текущее состояние AWE и разница между управлением и компетенцией

### B1. Что новый аудит действительно уточняет

| Вопрос | Новое evidence | Инженерное следствие |
|---|---|---|
| R0 lifecycle/recovery | OC 68–116: 73/73 source entries и 55/55 evidence entries совпали; из сохранённого summary пересчитаны 22 passed suites; прочитаны core 241/241 и integrated 379/379 | Узкий **R0 OFFLINE SCOPE VERIFIED / CLOSED** документально обоснован. Числа не суммировать, новый regression не выполнялся |
| Воспроизводимость | OC 146–169: dirty working tree, remotes отсутствуют, финального commit/push нет; lockfile не входит в source manifest | Нужен release identity и clean restore; существующий HEAD не release |
| Исполнение shell | OC 126–144, `src/tools/index.ts:258–261`: `bwrap --unshare-pid --die-with-parent --bind / / ...` | PID containment полезен, но host filesystem остаётся доступным; это статический риск, не выполненный exploit |
| Чтение/запись | OC 138–140, `src/tools/index.ts:334–378`: workspace-path checks, но `.env` не исключён, write в общий workspace | Разделить runtime/secrets и mission workspace; deny одного имени `.env` недостаточен |
| Требования | OC 177–207: `prompt-master.ts:56–87`, `head-agent.ts:104–129`; Head получает title/objective/criteria без полного scope/risks/raw request | Исправить сквозной контракт, а не заменить planner |
| Профессиональный QA | OC 309–323: QA без tools, изображения заменяются ссылкой, ограничение evidence window, heuristic criteria checks | Существующий gate сохранять; нужен независимый доступ к точным артефактам и предметные oracles |
| Memory | OC 297–307: semanticRecall и workingMemory выключены, missionMemory не используется в просмотренном src, нет стабильных resource/thread | Объекты Memory есть; межмиссионное обучение не доказано. Не строить вторую память |
| MCP/browser | OC 283–295: общий Playwright client, `npx @playwright/mcp` без pin; `--isolated` не доказывает mission isolation | Pin и contract tests обязательны для browser-способности, не заявлять совместимость по версии Playwright test |
| Расходы | OC 251–267, `mission-manager.ts:2533–2559`: totals делегаций не полный ledger | До платного pilot учитывать весь путь и не выдавать incomplete totals за стоимость accepted outcome |

Версии `@mastra/core 1.82.0`, `@mastra/mcp 2.8.0`, `@mastra/memory 1.41.0`, `@mastra/libsql 1.29.0`, `@playwright/test 1.49.1` — **D**, согласованы автором OC с package/lock/node_modules (OC 33–48). Это не моя проверка установленных binaries, CVE или clean install.

### B2. Что исторический код добавляет, а чего не добавляет

Непосредственно прочитаны следующие существующие symbols (**H**):

1. [`createExecutionGate`, `awe/execution_security/gate.mjs:15–90`](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/execution_security/gate.mjs#L15-L90). Проверки binding/expiry/fence, повторная авторизация вокруг awaits, quarantine при неизвестном исходе; `requestPhysicalEffect` отказывает. Комментарий прямо ограничивает профиль и отсутствие общего physical executor. Полезен как исторический контракт тестирования, **не модуль для копирования в запрещённый cleanroom**.
2. [`createExecutableTools`, `awe/executable_tools/host.mjs:21–68`](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/executable_tools/host.mjs#L21-L68). Host-owned admission, проверка pin, barrier перед effect; browser/API возвращают fixtures (46–47); `entries.size<32` в строке 29 — ограничение этого исторического fixture host, **не потолок компетенций AWE**.
3. [`createContextStore` и `createArtifactStore`, `awe/context/store.mjs:3–62`](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/context/store.mjs#L3-L62). Instance-local Maps, CAS/digest и bound bytes; это не durable межмиссионная база знаний.
4. [`prepareRuntimeReview`, `awe/tool_registry/runtime-adapter.mjs:1–11`](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/tool_registry/runtime-adapter.mjs#L1-L11) и [`createDiscovery`, `discovery.mjs`](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/tool_registry/discovery.mjs): discovery/review не доказательство runtime dispatch.

**Вывод I:** задача R1 — не «добавить агентность», а сделать ограниченный рабочий маршрут доказуемо безопасным и профессионально приемлемым. Исторический source не переносить в cleanroom и не использовать для восстановления R0. Сам отчёт содержит ссылки на историю, поэтому передача его в иной cleanroom допускается только по действующим там правилам; этот текст не отменяет запреты.

## C. Сверка Kortix и OpenCode без предпочтения авторства

| Тезис прежнего Kortix | Новый OpenCode | Решение и grade |
|---|---|---|
| Final independent QA неизвестен; не объявлять старые defects исправленными или открытыми автоматически | Прочитан final closure и сверены манифесты | Обновить **документальный** статус offline closure; неизвестность clean restore/owner GO остаётся. D |
| Исторический export не текущий cleanroom | OC предупреждает о непереносимости historical выводов | Противоречия нет: это уже было явно в editorial-resolution/B. H+D |
| Сохранить Head/Manager/Factory/TI/Memory/QA | OC рекомендует сохранить Mastra, но отмечает тяжёлую custom orchestration | Сохранение сейчас и возможное последующее сокращение custom code совместимы. Миграция без contract parity преждевременна. I |
| Native ToolSearch/SkillSearch → scoped adapter → memory/skills → packs | OC ставит restore/isolation/requirements прежде способностей | **Изменить порядок**: каталог/коннектор не должен опережать безопасное исполнение и QA. Не удалять native-first, но убрать его из безусловного critical path. I |
| Memory существует; reuse/extend | OC показывает неиспользование миссионной памяти и выключенные функции | Развести object existence и работающий loop. Будущий no-op audit, затем wiring при доказанном gap. D+I |
| QA/Artifact Store уже есть | OC: integrity сильнее semantic correctness; reviewer без tools | Не новая QA-платформа, а расширение evidence access и frozen domain oracles. D+I |
| H содержит CONFIGURE_NATIVE/NECESSARY_NEW_CODE | Editorial-resolution уже делает verdicts условными; OC требует проверки установленной версии | Принимать более осторожную редакторскую трактовку, не переписывать всё по strongest label таблицы. I |
| Пакет публикуется для независимого review | OC 500–536 прямо не читал пакет из-за cleanroom policy | Называть OC независимым аудитом AWE, **не независимой проверкой 22 MD**. D |
| Первый outcome может быть research/data/code/UI | OC предлагает три небольшие способности | Последовательно квалифицировать одну, затем две другие; не три одновременных внедрения. I |

**Снятые вопросы:** существование current компонентов, ограниченный offline closure, конкретная потеря scope/risks, недостаточность текущей shell/browser isolation и QA evidence. **Не снятые:** restore, exact release, live provider/MCP semantics, предметное качество, lifetime economics, qualified skills и safe autonomy. Нельзя заменить эти неизвестные уверенностью одного из авторов.

## H. Build / Buy / Reuse — минимальная матрица решений

Сложность ниже — относительный engineering risk, не человеко-дни. Цены и сроки не установлены. Готовые компоненты сэкономят часть реализации, но не отменяют интеграционные тесты, сопровождение и модели. Любая версия вне установленного стека должна быть выбрана и зафиксирована в будущем ADR; «latest» не pin.

| Решение / версия | Уже есть / gap | Интеграция и относительная сложность | Альтернатива, стоимость, риски | Verdict и проверка |
|---|---|---|---|---|
| R0 release; final commit U | Dirty frozen working tree и evidence D | Reuse Git/lock/manifests, отдельный read-only inventory; средняя из-за неполноты bundle | Архив без restore недостаточен; затраты на хранение/восстановление U | **Reuse**; clean checkout/install + прежний offline gate и hash identity |
| Mastra core 1.82.0 / existing Head/Manager/Factory | Agent/tools уже используются D | Малые additions к существующим call paths; framework migration высокая | LangGraph/Temporal не drop-in recovery; второй control plane отклонить | **Reuse**; negative recovery parity на изменённом path |
| Requirements envelope, schema ещё не выбрана | Specification есть, propagation gap D | Типизированный binding через текущие planner/delegation/repair/QA; средняя | Prompt-only reminder дешевле, но не сохраняет enforcement | **Build small delta**; требование/запрет не теряется при любом переходе |
| Bubblewrap, версия U | Текущий вызов D; небезопасный mount profile | Harden existing worker policy, не новый scheduler; средняя/высокая, Linux-specific | Rootless container worker — больше ops, но воспроизводимый image; cloud — data/cost gate | **Compare bounded options**, не объявлять победителя; synthetic-secret, egress, descendants и recovery tests |
| Контейнерный worker, version/digest U | Не доказан как действующий компонент | Один execution adapter, nonroot/read-only mounts/no host socket/limits; высокая | Контейнер с privileged/host mounts не улучшение; shared kernel остаётся threat-model условием | **Conditional reuse infrastructure**; выбрать только после security fixture evidence |
| Playwright test 1.49.1; MCP server U | Singleton, unpinned server D | Pin actual resolved server/browser; mission-owned context/lifetime; средняя | Отдельный server process per mission сильнее разделяет lifecycle, дороже | **Reuse/extend**; cookie/storage/download/cancel cross-mission tests |
| Existing QA + deterministic validators | Gate есть; domain tools/evidence gap D | Read-only isolated inspection, versioned test adapters; средняя/высокая | Promptfoo/Inspect только при runner gap; не обязательная платформа | **Extend**; seeded defects, false accept и held-out acceptance |
| Mastra Skills/search core 1.82.0 | Upstream availability из K22; local wiring U | Loader + qualified version binding через Factory; средняя, не «просто конфиг» до проверки | Одна pinned filesystem procedure дешевле нового каталога | **Reuse then conditional wiring**; invalid/stale/unauthorized pack блокируется |
| Memory 1.41.0 / libsql 1.29.0 | Objects есть, mission wiring U/D | Existing resource/thread, provenance/ACL, version/qualification refs; средняя | Новая DB/RAG platform не нужна для первого outcome | **Defer broad ingest**, узкий validated feedback; cross-project leakage test |
| Traces/ledger existing SDK | Totals неполные D | Add spans и accounting всех вызовов, binding к миссии; средняя | Langfuse/MLflow дают UX, но data export/retention и ops | **Native-first**, buy deferred; reconciliation успешных и неуспешных вызовов |
| Managed OAuth / connector marketplace | TI research candidates ≠ installed actions D | Только missing action через текущий grant/effect boundary; высокая policy нагрузка | Existing read-only fixtures/exports достаточны для первого результата | **Defer buy**; реальная задача, scopes, revoke, receipt и economics до допуска |
| OpenCode developer tool, version U | Аудит демонстрирует чтение/анализ, не весь future implementation | Использовать для bounded patch/test cycle; не вставлять в runtime | Обычный developer workflow с теми же gates; лицензия/стоимость конкретного запуска U | **Use as implementation aid conditionally**; accepted diff и independent regression, не self-report |

**TCO сравнивать** как compute + storage/egress + model/tool usage всех попыток + интеграция + сопровождение/security + eval/regression + выход/миграция. Неизвестный тариф не ноль. Для первого loop разумно отказаться от новых платных платформ: это уменьшает зависимости, но не обещает нулевую стоимость.

## I. Практическая реализуемость OpenCode внутри существующего AWE

### I1. Карта точек изменения — не вымышленные интерфейсы

| Existing anchor из OC | Минимальный предполагаемый delta (I) | Как подтвердить до правки |
|---|---|---|
| `src/agents/prompt-master.ts:56–87` | В frozen specification добавить стабильные requirement IDs, explicit exclusions и проверяющий механизм | Прочитать schema/output/caller; выяснить existing equivalent; новое поле не вводить, если уже есть нужное |
| `src/agents/head-agent.ts:104–129` | Передавать полную approved requirement binding; сокращать описание можно, authority поля нельзя | Contract test с уникальными scope/risks markers и отрицательным запретом; captured plan inputs |
| `src/agents/mission-manager.ts`, особенно QA artifact path 790–798 и totals 2533–2559 | Передавать binding во все stages; evidence references на immutable bytes; полный ledger | Точный текущий call graph, repair/recursive paths и сохранённые checkpoint schemas |
| `src/agents/specialists.ts:188`, `src/agents/recursion.ts:277–288` | Factory выбирает минимальный qualified procedure/tool set; children наследуют ограничения, не расширяют | Existing inputs/types; child negative grant tests; неизвестная роль не автоматически qualified |
| `src/tools/index.ts:258–261,334–378` | Заменить небезопасную policy исполнения за existing tool interface; runtime secrets вне mount | Только source review недостаточен: synthetic-secret fixtures, mount/egress observation, cancel/restart |
| `src/config/mcp.ts:171–257`, `src/tools/browser.ts` | Pin server; mission ownership lifecycle/context | Resolved binary/server identity, existing singleton callers, два browser mission fixtures |
| `src/agents/qa-agent.ts:29–108`, `src/agents/qa-gate.ts:153–159,229–282` | Независимое чтение evidence/oracles; unsupported criteria → UNKNOWN/FAIL, не inferred success | Current schemas и authority; tests на потерянный/чужой/повреждённый/визуальный artifact |
| `src/memory/index.ts` | Связать verified receipts с existing scoped memory при необходимости | Существующий backend/API/ACL; не придумывать имя метода или migration до inventory |

Это **логические seams, а не готовый diff**: доступного текущего source tree нет. Symbol-level указания исторического кода существуют, но заменять ими современный source mapping нельзя. Непосредственно подтверждённые OC symbols `synthesizeRoleInstructions()` и imports/Agent creation дают ориентир, но не гарантируют API после нового snapshot.

### I2. Требования как исполняемый контракт

Предлагаемый минимальный envelope (**I**, не installed schema): `spec_id/version/hash`, исходный user intent ref, `scope`, `excluded_scope`, risk constraints, criterion IDs и evidence/oracle binding, approval ref, budget/resource policy ref. Не копировать в prompts секреты или tokens. Hash сохраняет identity, но не смысл; authority проверяется инструментальным gate независимо от LLM.

Инварианты:

- Head, delegation, repair, recursion и QA получают одну approved version; child может сузить scope, но не расширить.
- Подмена input/constraint/criterion после approval требует новой версии и соответствующего gate; не «автоматическая реконструкция» требований при unavailable source.
- Каждому критерию соответствует outcome/evidence/checker или явный BLOCKED. Сохранённый файл не закрывает criterion «корректный анализ».
- Если старый checkpoint не содержит обязательный binding, fail closed/migration gate, а не тихий default allTools.
- Artifact ref должен связывать mission/spec/release/version и bytes digest; чужой artifact с тем же именем не проходит.
- Промежуточный результат может быть typed evidence, а не обязательным новым документом; final deliverable определяется contract, не общей нормой «каждый агент создаёт файл».

### I3. OpenCode: что можно поручить, что нельзя обещать

**Реалистично:** отдельный patch существующего schema/call boundary; небольшой adapter; написание contract fixtures; pin dependency; дополнительные QA adapters. **Сложно и требует отдельных gates:** замена process boundary, state migration, cancellation/recovery, browser singleton lifecycle. **Не доказано:** способность OpenCode автономно закончить эти изменения в конкретный срок/бюджет либо production-grade security.

Каждая будущая задача: разрешённый snapshot → read-only no-op/gap audit → один ограниченный diff → positive/negative tests → полный относящийся к нему R0 regression → независимый review → owner scope gate. Если найден existing equivalent, результат — no-op с evidence, не новый сервис. Если нужный код недоступен/запрещён, остановить эту implementation-задачу, а не восстанавливать из исторического экспорта.

Не заменять смысл approval командой «OpenCode всё подтвердил». Исполнитель не может сам повысить автономность, выдать себе новые tools, превратить fixture PASS в live PASS или одобрить собственную квалификацию.

## J. Минимальный phased DAG внедрения

**Все этапы ниже — будущая программа после отдельного разрешения разработки/испытаний. Сейчас RESEARCH ONLY.** DAG описывает зависимости инженерных задач, а не требование внедрить новый DAG engine в Mission Manager.

```text
G0 разрешённый current inventory и границы
  → S0 frozen release + restore + R0 parity
      ├→ S1 bounded execution + cancellation parity
      └→ S2 requirement binding + propagation
S1 + S2 → S3 independent QA qualification
S3 + bounded cost/usage instrumentation → S4 один capability loop
S4 → S5 transfer / scoped memory feedback / controlled rollout
S5 → повтор loop для следующей capability, не массовая активация
```

Документальный дизайн S1/S2/S3 допускается параллельно без исполнения. Реальное применение изменений — только после gates. Тестовые offline doubles маркировать явно; provider/browser live compatibility — отдельные будущие разрешённые проверки, не часть молчаливого разрешения S0.

| Stage | Deliverable и существующий владелец | Acceptance P/N и evidence | Gate / rollback |
|---|---|---|---|
| **G0** | Read-only inventory release/schema/dependency/tool/entrypoint, evidence gaps; existing release responsibility | P: current source tree и dirty diff связаны с audit; N: historical HEAD не признан current; raw secrets исключены из bundle | Доступ уже разрешён; если нет, blocked. Никаких новых permissions ради завершения |
| **S0** | Immutable final R0 commit + lockfiles/system/browser/MCP identities + private sanitized release bundle; existing Git/release | P: clean restore воспроизводит source identity и тот же offline gate; N: отсутствующий lock/dependency, manifest mismatch, wrong schema блокируют. Evidence: commit/tree/digests, restore log, environment, full test index | Владелец принимает только scope offline. До изменения сохранить доказанный baseline; restore не из одних hashes. Финальный новый SHA пока U |
| **S1** | Один isolated worker за existing tool boundary; process registry и Manager остаются authority | P: разрешённые reads/writes/export; N: synthetic secret, чужая mission, host path/symlink, egress, unbounded descendants, late output, restart/cancel blocked. Независимое наблюдение actual effects, не только return code | Без S1 не выполнять недоверенный код. При failure disable new route, drain/reconcile, восстановить pinned worker; не продолжать на небезопасном fallback |
| **S2** | Approved requirement envelope во всех current paths | P: scope/criteria trace end-to-end; N: dropped exclusion, stale spec, injected child policy, repair criterion weakening и чужой artifact reject | Schema/active mission compatibility review. Feature flag off только если не теряется binding; старые миссии pin или quarantine |
| **S3** | Existing QA с read-only evidence access и независимыми oracles, benchmark seeded defects | P: correct results accepted; N: wrong value, unsupported claim, hidden code bug, broken UI interaction, missing criterion rejected; damaged/unavailable evidence даёт UNKNOWN/FAIL, не PASS | До pilot заранее зафиксировать пороги и fatal defects; ни self-grading, ни красивый screenshot не достаточны. Rollback verifier version + invalidate affected qualifications |
| **S4** | Одна capability на existing Factory/tools; baseline → процедура → accepted task → held-out variant | P: реальное полезное deliverable на новой задаче; N: cached answer/fixture substitution, unverified skill, omitted failures, budget overrun не проходят. Ledger включает planner/QA/repairs/children/failures | Owner выбирает допустимый task/effects/data/cost scope; default no external writes. Не покупать tool ради benchmark. Rollback pack/version, сохранить receipts |
| **S5** | Transfer и feedback через existing scoped Memory; extension catalogue отдельно от admission | P: улучшение переносится на отличающийся task; N: cross-project leakage, revoked/stale source/skill, train/holdout leakage blocked | Допуск только данного класса задач/версии. Неудача → unqualified/stale/revoked, не удаление плохих результатов из статистики |

### J1. Содержание S0 — что значит «воспроизводимый commit»

Не просто закоммитить dirty working tree. Сначала разрешённый review состава: code/config/lockfiles, test fixtures и approved evidence; секреты, runtime data и запрещённые historical imports не публиковать. Связать новый commit с frozen source manifest, отдельно указать coverage exclusions. Зафиксировать Node/OS/system dependencies и разрешённый способ получения browser/MCP artifacts. Не добавлять гигантский node_modules как замену recipe.

Restore в отдельном разрешённом окружении должен доказать: (a) какие bytes восстановлены, (b) что зависимости разрешаются из lock/pins, (c) что прежний offline behavior сохранён, (d) что state backup/schema совместимы. Если registry/artifact уже недоступен, статус PARTIAL, не reproducible. Source hash `d2562ef0a50a7d25e4da83dc01fe632720708192a756a4adf7ded77bce3680a7` и evidence hash `13c5b976452fce762f9be531483c99add814e0f43258cc0af6f2b2cd3caf3983` — заявленные OC hashes **манифестов**, не SHA всего release (OC 72–87).

### J2. Первый профессиональный результат и следующие два

**Первый рекомендуемый класс I:** анализ предоставленной таблицы на локальных разрешённых данных. Он позволяет получить проверяемые числовые результаты без внешних writes/OAuth/deploy; это выбор снижения зависимостей, не утверждение доказанной способности AWE.

- Frozen task: реальные user questions, schema/data dictionary, units/timezone/missingness, допустимые трансформации, ожидаемый deliverable.
- Baseline: текущая разрешённая конфигурация на отдельном наборе; никаких исследований «на production данных по умолчанию».
- Процедура: inspect → explicit assumptions → transformations → independent recalculation → result with caveats.
- QA: второй путь расчёта, wrong denominator/duplicate/date/currency fixtures, sample-level reconciliation. LLM judge не единственный oracle чисел.
- Holdout: другой dataset и edge cases; transfer: новая схема/домен с тем же типом анализа. Не объявлять mastery по повтору practice.

Затем по тому же loop: **source-backed research memo** (claim→source span, conflicting evidence, blocked source и ложная цитата) и **small code fix** (locked build/test, независимый hidden regression/security case, scope adherence). Для кода S1 обязателен; browser/UI нужен лишь если deliverable требует взаимодействия. Эти три примера не ограничивают расширяемый каталог. Новый домен добавляется manifest/procedure/oracles/evidence, а не новым управляющим агентом.

### J3. Метрики и правила сравнения

До испытаний фиксировать dataset split, task definition, версии, budget caps и пороги acceptance; в этом исследовании значения порогов **не выдуманы**. Обязательны: accepted outcomes / все попытки, false acceptance среди seeded bad cases, false rejection среди корректных, defect taxonomy, wall time и стоимость на accepted outcome с включением неуспехов. UNKNOWN usage не превращать в ноль. Safety violations блокируют независимо от среднего quality score.

One executor vs delegation сравнивать только на одинаковых tasks/quality gates/budget boundaries и близких условиях; перепад модели/доступа/тестов фиксировать как confounder. Существующие limits depth 3 / total agents 12 / parallel children 4 из OC 237–241 — текущие bounded execution параметры, не ограничения каталога профессий и не оптимальные доказанные настройки.

## K. Риски, регрессии, rollback и неизвестные

### K1. Минимальная обязательная regression сетка

Сохранить проверенные R0 invariants; не повторять ремонт исторического defect без подтверждённого failing current case. Из старого K P0-02 сохранить как regression categories: stale fence file write; revoke during async discovery; immutable artifact lineage; repair data-dir isolation; search fallback после abort; browser/MCP quiescence; child signal; crash gap; empty grants; lifetime budget через restart. Новый OC closure меняет статус ранее расследуемого defect, но не отменяет необходимости регрессии при изменении соответствующего path.

Для каждого изменённого маршрута будущий QA фиксирует: exact source/schema/tool/oracle versions, command/environment, stdout/stderr/exit, actual effect observer, before/after state, fault point, expected vs observed, raw evidence hash. Сценарии process kill, stale lease, malformed checkpoint, double completion, same-name artifact, timeout после effect и restart должны остаться проверяемыми. «Abort requested» недостаточно; irreversible remote effect нельзя откатить локальным cancel.

### K2. Риски и конкретные эксперименты

| Риск / grade | Ближайшая проверка | Стоп-условие |
|---|---|---|
| R0 потеряется из-за dirty state D | G0/S0 clean restore без изменения исходного frozen экземпляра | Нет полного bundle/lock/environment → не объявлять release |
| Shell читает runtime secrets или чужие данные D | Синтетические canary secrets, чужая mission directory, mount/net/process observation | Любая утечка → блок execution route; не тестировать реальными секретами |
| Container/bwrap ложное чувство безопасности P/I | Threat model плюс symlink, fd inheritance, sockets, `/proc`, descendants, network, artifact export cases | Host mounts/socket/privileged escape path или неизвестный effect → fail |
| Browser state cross-mission D/U | Две local fixtures с разными cookies/storage/downloads, cancel одной не ломает другую | Shared state/incorrect teardown → browser capability не qualified |
| Scope потерян или ослаблен D | Marked constraint trace planner→child→repair→QA; malicious document instructions | Любое расширение authority/criterion downgrade без approval → fail |
| QA принимает красивый, но неверный результат D | Seeded bug/value/citation/missing-section/UI-interaction benchmark, отдельный oracle | Fatal defect accepted → qualification blocked, не компенсировать средним score |
| Provider usage/cancel/tool-calling U | Только позже owner-approved minimal probes с bounded spend и read-only/no effect tool | Несогласованная usage/неизвестный effect → unknown/reconcile, не retry blindly |
| Skills native compatibility U | Current lock/import/type and smallest no-effect contract test | API не совпадает → no config-only claim; отдельный bounded adapter decision |
| Memory загрязняет обучение U | Scoped provenance, revoked source, held-out leakage и with/without memory comparison | Непроверенный feedback повышает qualification либо leakage → отключить promotion |
| State downgrade портит active missions U | Restore old/new schemas с pinned running missions, backup readback | Несовместимость → drain/quarantine; не исполнять старым кодом новую state schema |
| Стоимость не полная D | Reconcile spans всех LLM/tool calls с доступными provider usage records | Missing usage → economic result incomplete; cap enforcement отдельно от telemetry |

### K3. Rollback — не «git reset и забыть»

1. Прекратить admission новых миссий на изменённый binding; не повышать старым миссиям права.
2. Завершить или отменить работающие processes через существующий Manager; зафиксировать unknown effects и провести reconciliation, не retry автоматически.
3. Вернуть согласованную комбинацию code/config/schema/tool/skill/oracle pins. Поставить incompatible missions в quarantine или завершить на старом pinned runtime.
4. Restore backup допускается только после проверки schema/readback; receipts, audit history и unresolved intents не терять.
5. Отозвать квалификацию затронутой capability; повторить targeted regression перед новым допуском.
6. Внешние эффекты rollback кода не отменяет. Compensation только отдельным разрешённым действием.

### K4. Owner gates — когда действительно нужны решения

Сейчас не просим согласований. Будущие gates: разрешение implementation/test scope после research; принятие frozen R0 именно в offline scope; категории данных и допустимый execution threat model; любой external account/new scope/cloud upload/spend; разрешённые live compatibility probes; принятие профессионального результата по заранее замороженным критериям; расширение автономности конкретного класса задач. Инженер сам выбирает внутренние имена классов и находит existing equivalent — владельцу не нужно решать эти детали.

Owner GO не заменяет technical evidence; technical PASS не создаёт разрешения на внешний effect. При недоступном источнике — явный UNKNOWN/blocked, не invented reconstruction.

## Итог: что исключено из критического пути

Не нужен новый orchestration framework, новый Memory/QA/catalog service, массовый MCP marketplace, общий migration на PostgreSQL, обязательный внешний OAuth broker, Windows computer-use, распределённая execution fabric, массовый ingestion или «все профессии сразу». Дополнительный parser только после воспроизводимого format gap; observability SaaS только после gap существующих traces; native search только когда размер реального allowed tool set делает retrieval полезным. Эти варианты остаются условными, а не превращаются в оплачиваемый backlog.

**Минимальный engineering bet:** recoverable R0 → bounded worker и preserved requirements → qualified existing QA → один accepted/held-out/transfer capability loop. Каталог расширяется без фиксированного потолка; одновременно допущенные действия, ресурсы, агенты и расходы ограничены. Создание документа/Skill/агента — только подготовка, не доказательство профессиональной компетенции.

## Передача и ограничения использования

Основной файл: `/workspace/out/engineering-feasibility-B-C-H-I-J-K.md`. Session: `f33e82e4-bc8e-4950-aa61-7f6463889f9a`. Private Drive: `/drives/me/Research/AWE-engineering-2026-11-13/`. Отдельно передаётся `engineering-verification.json` с результатами проверки файлов и NOT_RUN scope.

Для сборки финального пакета ссылки [OC]/[K22]/[HIST] закреплены commits; source line ranges не следует перепривязывать к новым snapshots без проверки. Самостоятельных current-code source tests здесь нет. Архив evidence и исторические исходники **не импортировать в cleanroom**, если действующие правила это запрещают; наличие ссылки/копии в Drive не меняет authority.
