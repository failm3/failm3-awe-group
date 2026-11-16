# Контракт компетенции AWE

**Решение:** сохранить Head, Mission Manager, Agent Factory, Tool Intelligence, Memory и QA. Добавить в их существующие контракты версионированную квалификацию способности, независимые доказательства допуска и контролируемую публикацию опыта. Переиспользовать Mastra Memory/Skills/evals, но не считать их готовым механизмом профессионального обучения. Первый результат R1 — ограниченная способность, прошедшая новые задачи и дефектные контрольные примеры, а не увеличившийся каталог документов. Новая БД, новый Memory service, дообучение весов и миграция orchestration для этого не обоснованы.

Дата: 2026-11-13 UTC. Исследователь: session `463b5a08-3788-4efd-825f-d179001ffec4`. Покрытие: D/E, относящиеся к ним H/I/J/K. Все проектные интерфейсы ниже — предложения, не найденные exports AWE. Никакого внедрения, установки зависимостей AWE, запуска миссий/LLM, платных экспериментов, deployment или расширения доступа не было.

## 1. Доказательства и новая информация

### 1.1. Уровни доказательств

- **C-upstream:** непосредственно прочитанный код закреплённого upstream commit; подтверждает реализацию SDK, не AWE wiring.
- **H-code:** исторический код AWE; не доказательство текущего cleanroom.
- **D-audit:** заявление независимого OpenCode-аудита о прочитанном актуальном коде; здесь не повторено непосредственным доступом.
- **D-upstream:** документация в закреплённом upstream commit; не тест и не гарантия adapter compatibility.
- **P:** инженерное предложение/вывод, который ещё должен пройти испытание.
- **U:** неизвестно. Отсутствие доступа не доказывает отсутствие функции.
- **T-local:** выполненная здесь проверка исследовательских файлов, не runtime test.

Прочитан полный 728-строчный OpenCode-аудит [O]. Предыдущие E/F/G и integration/implementation материалы использованы как исходный проект, а не переписаны как новое исследование. База включает 22 опубликованных MD и handoff; проверено локально соответствие SHA-256 всех **42/42** записей переданного inventory. Это T-local о целостности передачи, не независимая повторная проверка всех утверждений 22 документов и не тест AWE.

Свежая проверка ограничена первичным Mastra source: read-only Git clone по `@mastra/memory@1.41.0`, HEAD `6e8dfcb83facb0861ebefa4fee384429a113acf4`; в том же commit `packages/core/package.json` содержит `1.82.0`. Никакие скрипты репозитория не запускались. Tags/core version согласуются с D-audit [O:35–48], но состояние реально установленного AWE повторно не проверено. Старые исходники в cleanroom не переносились.

### 1.2. Что меняется относительно предыдущего пакета

| Вопрос | Предыдущий пакет | Новое доказательство и решение |
|---|---|---|
| Завершённость R0 | Final independent QA/owner GO оставались unknown | [O:70–169] поддерживает только R0 OFFLINE SCOPE VERIFIED/CLOSED; это D-audit о сохранённых результатах, не новый запуск. Финальный воспроизводимый commit остаётся не доказан |
| Межмиссионная память | Наличие Memory/LibSQL, target memory architecture | [O:297–307]: recall и working memory выключены, missionMemory не используется в просмотренном src, stable resource/thread не передаются; теперь есть конкретный wiring gap по аудиту, не только общая гипотеза |
| Skills | Native loader уже рекомендован | Прямо перепроверен SkillSearch [M2]. Поиск/get/cache не является certification. Нужна authorized projection до list/search/get и invalidation уже загруженных инструкций |
| Retrieval ACL | Общая рекомендация ACL до поиска | [M1:789–835] действительно AND-composes resource/thread filter и user filter. Но [M4:240–261] metadata embeds остаются старыми после изменения thread metadata; обычное изменение ACL в metadata не отзывает доступ |
| Rollback/delete | Общий отзыв и cascade | [M1:1051–1139]: deleteThread запускает background vector cleanup, ошибки cleanup логируются. Успешный return/settled не удостоверяет полное удаление. Нужны immediate deny/tombstone и отдельная reconciliation |
| Concurrent memory | Версионирование как требование | [M1:1236–1294], [M3:294–308]: atomic merge требует capability storage; docs называют @mastra/pg. Нельзя обещать multi-process atomic merge для reported LibSQL 1.29.0 |
| Evals | Рекомендация hidden tests | [M5:110–121]: fresh thread не гарантирует изоляцию при общем resource; [M6:52–56]: notScorable исключается из среднего. Нужен явный coverage gate, иначе формальный pass может скрыть непроверенные критерии |

Старое предупреждение «не считать document storage обучением» сохраняется. OpenCode не читал прежний Kortix-пакет [O:9; 498–528]; его заключение нельзя называть независимой проверкой этих 22 файлов. Не переносим свойства `awe/context/store.mjs` исторического `d5e9d857…` на TypeScript Mastra runtime. Никакие новые профессиональные компетенции этим исследованием не сертифицированы.

## 2. D — Универсальная архитектура компетенции

### 2.1. Единица компетенции

**Компетенция — проверенное в ограниченном scope сочетание task contract, процедуры, знаний, исполнителя/model profile, разрешённых инструментов, среды и независимой проверки результата.** Название профессии — индекс для человека, не единица допуска. `data-analysis` слишком широко; «сверить агрегаты CSV с заданными правилами пропусков/валют и воспроизводимым пересчётом» — пригодный квалификационный scope.

Каталог расширяем без enum профессий и фиксированного потолка. Namespaced ID, versioned manifests, поисковый индекс, lazy loading и pagination позволяют добавлять классы задач без перестройки runtime. Фактическая ёмкость ограничена хранением, latency поиска, контекстом и стоимостью поддержки: это не обещание бесконечной инфраструктуры. Каждый запуск ограничен числом загруженных skills, depth/parallelism, временем, tool calls, tokens, затратами, permissions и effect classes. Лимиты задаёт существующий Manager, не manifest навыка. Нынешние лимиты рекурсии из [O:237–241] — D-audit, не предложение новых глобальных потолков каталога.

### 2.2. Владельцы существующих границ

| Существующий компонент | Минимальное расширение | Что запрещено дублировать |
|---|---|---|
| Prompt Master | Весь approved task/spec, typed criteria, excluded scope, risk, verifier refs и hash | Второй сборщик требований |
| Head | Выбор versioned capability по scope/evidence, регистрация gap | Второй planner/router или обещание компетенции по названию роли |
| Tool Intelligence/registry | Разрешённые candidate refs и совместимость tool versions | Второй каталог; discovery не выдаёт grant |
| Agent Factory | Подключение admitted skill/procedure/context и закреплённого execution profile | Новая agent factory или отдельный постоянный агент на каждый навык |
| Mission Manager | admission receipt, budgets, final-state fencing, bounded practice/repair | Новый workflow/recovery engine |
| Memory + Artifact Store | Источники/эпизоды/derived records, ACL, lifecycle pointers, immutable receipts | Второе хранилище «истины», новая RAG-платформа |
| QA | Независимый предметный oracle, holdout access, coverage, qualification receipt | Параллельная QA-служба с собственным PASS authority |

Квалификационный runner — ограниченный режим существующего исполнения + eval adapter. Это не новый управляющий агент. Вызовы scorer не должны обходить общий cost ledger. Выполнение тестового скрипта остаётся tool effect под существующими grants/cancellation/fences.

### 2.3. Минимальные схемы

Ниже логические TypeScript-формы для реализации через уже установленный валидатор и storage conventions. Это **не готовый patch** и не новые SDK symbols. Отдельные таблицы необязательны: если текущие registry/Memory имеют соответствующие entities, расширить их. Нельзя складывать весь объект в свободно редактируемую working memory модели.

```ts
type Ref = { id: string; revision: string; sha256: string };
type Scope = { tenantId: string; projectId?: string; aclRef: Ref };
type Lifecycle = 'qualification' | 'provisional' | 'verified' | 'deprecated';
type Availability = 'eligible' | 'quarantined' | 'revoked';

type CapabilityVersion = {
  schemaVersion: string;
  id: string; version: string; manifestHash: string;
  scope: Scope; ownerRef: string;
  taskClass: string; inputSchemaRef: Ref; outputSchemaRef: Ref;
  applicability: Ref; excludedScope: string[];
  procedureRef: Ref; knowledgeRefs: Ref[]; assetRefs: Ref[];
  tools: { registryId: string; versionConstraint: string }[];
  executionProfileRef: Ref; // model/provider/config + runtime/tool/env pins
  criteria: { id: string; verifierRef: Ref; mandatory: boolean }[];
  riskClass: string; effectClasses: string[];
  practiceDatasetRef: Ref; qualificationPolicyRef: Ref;
  revalidateOn: string[];
  rollbackTo?: Ref; // pointer candidate, not permission to reactivate
};

type Qualification = {
  capabilityRef: Ref; executionProfileRef: Ref; scope: Scope;
  lifecycle: Lifecycle; availability: Availability;
  stateRevision: number; generation: number;
  validFrom: string; validUntil?: string;
  evidenceRefs: Ref[]; policyRef: Ref;
  evaluatorIdentity: string; approvalRef: Ref;
  reason: string; supersedes?: Ref;
};

type KnowledgeRecord = {
  id: string; revision: string; kind: 'fact'|'episode'|'procedure'|'lesson';
  scope: Scope; artifactRef: Ref;
  source: { uri: string; version?: string; locator: string;
    observedAt: string; publishedAt?: string; sha256: string }[];
  derivedFrom: Ref[]; claimScope: string[]; conflictsWith: Ref[];
  rightsBasis: string; allowedUses: string[];
  extractorRef?: Ref; // config/model/version; not source authority
  epistemicStatus: 'observed'|'reported'|'inferred'|'tested';
  trust: 'quarantine'|'reviewed'|'verified'|'revoked';
  verificationRefs: Ref[]; recheckAt?: string;
};

type EvalReceipt = {
  id: string; taskSpecRef: Ref; capabilityRef: Ref; profileRef: Ref;
  datasetSnapshotRef: Ref; split: 'practice'|'validation'|'holdout'|'transfer';
  caseIds: string[]; inputHashes: string[]; outputRefs: Ref[];
  evaluatorRef: Ref; evaluatorIdentity: string; environmentRef: Ref;
  criterionResults: { caseId: string; criterionId: string;
    status: 'pass'|'fail'|'not_run'|'not_scorable'|'error'; evidenceRefs: Ref[] }[];
  aggregate: { accepted: number; attempted: number; falseAccepts?: number;
    invalidCases?: number; costLedgerRef: Ref; elapsedMs: number };
  contaminationCheckRef: Ref; issuedAt: string; authorityRef: Ref;
};
```

Qualification вынесена из immutable manifest: изменение допуска не меняет задним числом tested version. `Ref.sha256` удостоверяет байты, а не истинность; `authorityRef` — проверяемая серверная роль/запись журнала, не строка, которой доверяют из prompt. Секреты, holdout answers и actual grants не включаются в manifest. Test dataset ref допустим только как opaque identity: executor не получает mount/URL скрытых ответов.

**Обязательные invariants (P):** ссылки разрешаются с ACL; hash/revision совпадают; отсутствующий verifier/receipt или error блокирует verified; evaluator не равен автору оцениваемого изменения в смысле роли/доступа; receipt нельзя записать tool исполнителя; deprecated/revoked не выдаётся новым миссиям; manifest не увеличивает grants; `availability != eligible` имеет приоритет над любым lifecycle; состояние меняется CAS по `stateRevision` и через существующую authority.

### 2.4. Admission без нового authorization layer

Проектный `resolveCapability(taskSpec, callerContext)` внутри existing selection path возвращает snapshot refs и denial reasons, не выполняет side effects. Перед выдачей Factory контекста проверяются:

1. Полнота approved spec и соответствие task scope/criteria.
2. Актуальный ACL, разрешение на каждый dependency/artifact и право использовать его в этом purpose.
3. Lifecycle/availability, expiry, отсутствие invalidated dependencies.
4. Совпадение model/tool/environment с qualification profile или отдельное основание совместимости.
5. Достаточность уже выданных grants/budgets. Недостаток → blocked/needs authorized acquisition, не установка «по просьбе skill».
6. Signed/authority-bound admission receipt с `generation`, spec hash, exact refs, лимитами и scope.

Manager rechecks generation/ACL перед consequential tool effect и перед final acceptance. Checkpoint закрепляет refs, а не mutable `latest`. Resume проверяет validity снова. Отзыв → stop/blocked согласно существующим R0 правилам; не молчаливое переключение процедуры посреди миссии. Rollback не отменяет уже принятые внешним сервисом действия.

## 3. Жизненный цикл qualification → provisional → verified → deprecated

| Переход | Доказательства | Разрешённое исполнение | Кто решает |
|---|---|---|---|
| Новый кандидат → qualification | Sources/rights/provenance, procedure draft, scope, независимый eval plan, budgets | Только approved isolated practice/fixtures | Existing Manager policy + authority |
| qualification → provisional | Positive/negative practice, validation, R0 safety gate, coverage, calibrated QA; нет unresolved mandatory failure | Ограниченный low-risk scope с полной проверкой результата; external effects отдельно разрешены | QA receipt + existing admission authority |
| provisional → verified | Заранее закрытый holdout + transfer в fresh context; достаточная выборка/неопределённость по policy; hard constraints pass; полная стоимость | Только подтверждённый scope/profile. Verified не значит unlimited autonomous | QA receipt + existing admission authority |
| verified → qualification нового version/profile | Изменены procedure, модель, tool semantics, source dependency или outcome contract | Старая версия может оставаться eligible, если изменение её не инвалидирует | Versioned change decision |
| Любое → deprecated | Заменённая/неподдерживаемая версия; reason/replacement | Не выдаётся новым миссиям; уже начатые по утверждённой drain policy | Maintainer + policy |
| Любое → quarantined/revoked | Leakage, injection, неправильное знание, отозванные права, критическая регрессия | Немедленный deny; расследование, без auto-resume | Security/QA authority |

Последний переход — отдельная availability-ось, потому что deprecated означает устаревшее, но не всегда опасное. Нельзя ждать полной реквалификации, чтобы остановить доступ. Re-enable требует нового receipt, не снятия флажка моделью. Negative результаты сохраняются: удаление FAIL ради улучшения dashboard запрещено.

## 4. E — Обучение, которое можно измерить

### 4.1. Пять разных механизмов

| Механизм | Что меняется | Что может доказать улучшение | Чего не доказывает |
|---|---|---|---|
| Retrieval | Доступный task context из разрешённых источников | Релевантность/faithfulness и end-to-end качество на новых запросах | Изменение весов, освоение процедуры |
| Skills | Versioned инструкции, supporting files/assets | Воспроизводимое исполнение при controlled loading | Сам факт наличия SKILL.md |
| Процедуры | Порядок действий, preconditions, проверки, handling ошибок | Меньше предметных дефектов на unseen cases при равном budget | Текстовая «рефлексия» автора |
| Практика и episodic feedback | Полученные receipts, failure taxonomy, кандидаты уроков | Перенос исправления на независимый split | Повтор уже раскрытого ответа |
| Fine-tuning весов | Новый model checkpoint/adapter | Независимый holdout, safety/regression, economics и deployment compatibility | То, что Memory что-то запомнила |

Fine-tuning **defer**: пока нет разрешённого training dataset, доказанного bottleneck модели и сравнения с retrieval/procedure/model selection. Требует прав на обучение (не только чтение), privacy review, отдельного model/version rollback, бюджета и проверки provider support. Здесь нет предположения о доступности fine-tuning у текущего провайдера. Удаление memory record не «разучивает» обученные веса.

### 4.2. Цикл приобретения

1. На реальном отказе либо новой задаче Head/QA создаёт gap record: `knowledge/tool/procedure/model/verifier/requirements/environment`. Не каждую ошибку лечить новой памятью.
2. Tool Intelligence и Memory ищут существующие решения; ограниченное получение только нужных первичных источников. Чужие инструкции — untrusted data.
3. Уточнить task contract и получить baseline текущего approved profile, не сравнивать с заведомо слабым strawman.
4. Выполнить ограниченную практику на training fixtures; анализировать failure taxonomy, а не свободный self-critique.
5. Создать immutable candidate procedure/lesson с ссылками на вход, дефект, независимое объяснение и проверку.
6. На validation выбрать candidate; зафиксировать manifest/profile/rubric/budget до доступа к holdout.
7. QA запускает blind holdout и transfer. Не передавать solver ответы, score explanations скрытых cases или предыдущие transcripts.
8. Promotion только по policy и independent receipts. Outcome отдельной миссии записать episodically; общий закон/процедура публикуется после проверки применимости.
9. Мониторить accepted-result cost, failure severity и drift; отзыв по dependency graph и version rollback.

### 4.3. Практика, holdout и перенос

Разделение datasets делается по **семействам задач/исходным объектам**, не случайно по строкам одного файла. Производные того же репозитория, перефразированные abstracts, похожие таблицы и изображения считаются возможными near-duplicates. Проверка overlap: hashes/normalized content + provenance families, выборочное независимое семантическое review. Это не гарантия отсутствия pretraining contamination внешней LLM; неизвестность явно отмечается.

- **Practice:** ответы доступны, можно исправлять процедуру, считать попытки и стоимость.
- **Validation:** выбор candidate и threshold policy, не evidence окончательного superiority.
- **Holdout:** закрыт от автора/solver; зафиксирован независимым QA до candidate freeze. Полный leakage лишает split статуса holdout.
- **Transfer:** новый task family/формат/ограничение при сохранении claimed scope, fresh executor и context. Другая model — отдельный profile, а не автоматическое право переносить verified.
- **Drift sentinel:** новые случаи после adoption, не бесконечно повторяемый старый экзамен.

После разборов ошибки holdout case становится development data; следующий promotion использует новый закрытый набор. Ограничить число submits по policy, вести exposure ledger. Для cross-mission теста M1 сохраняет только approved lesson, M2 работает в новом thread/process и получает только разрешённый knowledge snapshot; сырые диалоги M1 запрещены. Контрольная M2 получает тот же профиль без candidate lesson. Это отделяет перенос знания от восстановления старого ответа из истории.

### 4.4. Измерения и честный вывод

Основная метрика: `Q = independently_accepted_cases / attempted_eligible_cases`. Инфраструктурные ошибки, отмены и исчерпание budget показываются отдельно; нельзя молча исключать их ради высокого success rate. Rules for invalid fixtures фиксируются заранее и применяются симметрично.

Дополнительно:
- `false_acceptance = defective_outputs_accepted / all_defective_outputs_presented_to_QA` на независимо размеченных seeded defects;
- `cost_per_accepted = total_cost_of_all_attempts_and_QA / accepted_count`; при нуле accepted — undefined/infinite, не нулевая цена;
- latency до независимого acceptance, число repairs, human interventions, safety violations, coverage обязательных критериев;
- по retrieval: relevant span coverage, claim/source support, obsolete hits, unauthorized disclosure; retrieval metric не заменяет Q.

Paired comparison baseline/candidate на одинаковых независимых cases, с фиксированными model/config/tools/budgets, randomized order и repeats для стохастичности. Публиковать counts, per-family результаты и доверительный интервал для delta; корреляцию repeats/семейств учитывать кластеризацией, не считать их независимыми наблюдениями. Минимально значимый эффект и non-inferiority margins устанавливаются до теста, из риска/ценности задачи. Универсальные «95% задач» или «30 примеров достаточно» не предлагаются.

Правило promotion: полный mandatory coverage + отсутствие hard safety failure + policy quality floor + уверенность в переносе + допустимые cost/latency. Если интервал эффекта широк — **improvement not demonstrated**, оставить provisional, даже если среднее выше. Zero observed leaks не доказательство нулевого риска; sample size и сценарии всегда видимы.

Для отделения механизмов полезен небольшой ablation: baseline, approved retrieval only, procedure only, combined — на одном budget. Не обязательно покупать новую eval-платформу. Если улучшение исчезает без доступа к старым ответам, не объявлять learning. Если качество растёт только за счёт многократного роста расходов, показывать trade-off, а не «бесплатное обучение».

### 4.5. Три первых scope, а не закрытый список профессий

| Scope | Практика | Holdout/transfer | Независимый oracle |
|---|---|---|---|
| Небольшое исправление кода | Репозиторий-fixture с известным дефектом и открытыми тестами | Другой модуль/edge case; скрытый regression test; forbidden files | Build + behavior tests от QA, diff constraints, отсутствие unauthorized effects |
| Исследовательская записка | Разрешённый фиксированный corpus с противоречиями | Новый вопрос/источник; fake citation/устаревшая версия | Проверка claim→span, версии, различение факта/вывода, completeness по brief |
| Анализ таблицы | Synthetic CSV, known totals, явные единицы | Другой формат, missing/duplicates/currency/timezone, denominator trap | Независимый пересчёт из raw data другим checker и проверка метода/выводов |

Для каждого существуют намеренно дефектные outputs: green author tests при неверном behavior; правдоподобная, но неподдержанная цитата; неверный знаменатель. QA, пропускающий такой дефект, не может выдавать verified этому scope. Число fixtures определяется содержательным покрытием и uncertainty, не желанием быстро получить PASS.

## 5. Проверенная память, provenance, ACL и rollback

### 5.1. Publication pipeline поверх существующей Memory

`raw episode/source → quarantine → reviewed claim/lesson → tested scoped procedure → authorized publication`.

Raw transcript, tool response, summary и self-reflection никогда не меняют verified knowledge напрямую. Ingest gate проверяет source authority/права, locator и bytes, scope, expiry, conflict и supporting evidence. «Reviewed» означает качество проверки записи, не непогрешимость её содержания. Даже tested claim привязан к environment/version и может быть опровергнут.

Provenance граф связывает `source snapshot → extracted spans → knowledge claim → procedure version → qualification → mission outcome`. Derivation хранит parser/config/model; generated summary не заменяет оригинальный locator. Лицензия публичной веб-страницы не предполагается разрешением на bulk ingestion, redistribution или model training. Недостаточно прав → metadata/link only либо quarantine, не автоматический импорт.

При конфликте сохранять обе записи и причину расхождения: timestamp, jurisdiction, version, input assumptions. Правило «самая свежая автоматически истинна» непригодно. Изменение source hash инвалидирует зависимые утверждения по scope; не обязательно весь каталог, но при неполном graph — fail closed для затронутого capability.

### 5.2. Защита от загрязнения

- Separate namespaces/purposes: production episodes, reviewed knowledge, procedure manifests, practice data, hidden evals. Это разделение existing storage/ACL, не пять новых Memory сервисов.
- LLM может предложить lesson; подтвердить его может только authority-controlled QA path. Tool output/prompt не меняет trust, grant или qualification.
- Malicious PDF, SKILL.md и поисковый snippet не могут вызвать install/secret read/network write без existing effect gate.
- Не включать сырые eval transcripts в production recall. Не давать scorer tool logs с секретами; redaction до модели и trace export.
- Дедупликация не объединяет ACL/rights: одинаковый content hash у двух проектов не делает их общедоступными.
- Retrieval/cache keys включают tenant/project/purpose, policy generation и snapshot versions. Запрещённые title/snippet/citation IDs тоже leakage.
- Загруженный в контекст вредный skill нельзя гарантированно «забыть» удалением cache entry: отозвать execution admission, завершить/пересоздать affected context и восстановиться на разрешённом checkpoint.

### 5.3. ACL до поиска и перед использованием

`resourceId` — scope identifier Mastra, не доказанная пользовательская аутентификация. Caller не выбирает произвольный resource строкой; сервер получает identity из existing auth context и вычисляет доступный набор. Для project-private записей scope не должен быть одним global user resource, который смешивает все проекты пользователя. Использовать opaque scoped ID mapping и grants, а shared knowledge — только отдельную authorized sanitized publication.

До lexical/vector search применить доступный набор; до reranking/snippet/context assembly повторно проверить актуальный ACL. Если конкретный adapter не поддерживает нужный фильтр надёжно, использовать prefiltered allowed corpus/partition или temporarily lexical-only; не искать по всем tenant, а потом скрывать имена в ответе. Даже отправка embeddings приватного текста внешнему embedder требует права на этот канал обработки.

Revocation алгоритм (P):
1. Атомарно увеличить policy/dependency generation и поставить deny/tombstone в source of truth.
2. Новые retrieval/admission/effects используют эту generation и блокируют запись немедленно.
3. Инвалидировать caches, loaded skills, derived records, qualification и pending publication; affected runs остановить по R0 policy.
4. Удалить/reindex lexical/vector copies, summaries и artifacts согласно retention; повторять cleanup с bounded reconciliation.
5. Независимый probe проверяет отсутствие выдачи на всех путях и orphan records. Запись receipt означает verified cleanup только после проверки, не после вызова delete.

### 5.4. Rollback и concurrency

Хранить immutable versions плюс mutable active pointer с CAS. Promotion транзакционно связывает admitted version, QA receipt и generation; readers получают целый snapshot, а не смешение нового skill со старым verifier. При нескольких writer processes нельзя полагаться на in-process mutex SDK. Использовать существующие transaction/lease/CAS conventions; при невозможности атомарной публикации — один authority writer и version checks. Новая PostgreSQL-инфраструктура не требуется лишь потому, что working-memory merge не поддержан.

Откат означает новый audit event, active pointer на последнюю **всё ещё допустимую** версию, новую generation, invalidation caches и повторный admission. Он не стирает FAIL, не возвращает отозванную лицензию и не восстанавливает разрешение на удалённые данные. Внешние effects требуют reconciliation/compensation по существующему Manager; knowledge rollback не обещает их отмену.

## 6. Mastra — что действительно можно переиспользовать

| Механизм и pin | Проверено | Ограничение | Решение |
|---|---|---|---|
| Memory 1.41.0, core 1.82.0, SHA `6e8dfcb…` | C-upstream: recall filter AND [M1:789–835], thread/resource ownership [M1:631–649] | Не business ACL и не trusted knowledge pipeline | Reuse scopes, добавить caller-bound policy adapter |
| Structured working memory | D-upstream: schema, scope, replace/merge semantics [M3:237–314] | Агентское обновление summary не qualification ledger | Только ограниченный task/user state; authoritative receipts отдельно в существующем storage |
| Atomic merge | C-upstream: supportsAtomicWorkingMemoryMerge + strict checks [M1:1224–1294] | Нельзя считать LibSQL multi-process safe по docs о PostgreSQL | Capability check; single writer/CAS для authoritative metadata |
| Semantic recall | C/D-upstream: message embeddings получают metadata [M1:1708–1722], all new messages [M4:67] | Автоматически индексирует и ошибочные tool/assistant messages; stale embedded ACL [M4:261] | Не включать глобально для trusted memory; сначала isolated episodes, approved publication |
| Delete/settled | C-upstream [M1:480–512;1051–1139] | Background cleanup, caught errors; drain не подтверждает deletion | Tombstones + verification/reconciliation |
| SkillSearchProcessor | C-upstream [M2:308–428] | list/search/get/thread cache без AWE admission в этом участке | Reuse native loader с restricted workspace/projection; recheck прямой get и cache |
| Evals/datasets/experiments | D-upstream [M5–M7] | Требуются target/scorers/storage domains; `new Mastra` по O не подключён; full integration U | Начать runEvals adapter над existing QA/runner, datasets storage только после compatibility probe |
| Experiment memory | D-upstream [M5:110–121], [M7:23–59] | Fresh thread + same resource всё ещё leak/shared state | Dedicated eval resource per isolation unit, explicit snapshots, no prod recall |
| Gates/verdicts | D-upstream [M6:46–56] | notScorable исключён из среднего; verdict может отсутствовать; `scored` не pass | Mandatory per-case coverage и fail closed при missing/error/notScorable |
| Observational memory/summarization | C-upstream: options/engine [M1:374–401;516–554] | LLM-компрессия не проверяет истину, дополнительный inference cost | Defer для authoritative learning; при необходимости только episode summarization с provenance |

Нельзя blindly копировать документационный пример `resourceId='ci-user'` на holdout: он допустим для проверки общей памяти, но не для независимых cases. Также `persistence: {experiments:'none'}` не отключает target memory/vector/trace persistence [M5:279–281]. Эти две детали особенно важны для теста межмиссионного обучения и защиты скрытого набора.

Совместимость на уровне версии **возможна**, не установлена запуском: `@mastra/memory` peer range включает core 1.82.0; это не удостоверяет совместимость всех AWE wrappers и LibSQL methods. Current cleanroom manifests, DB schema, Node, installed dist/type declarations и auth boundary нужно сверить при разрешённом внедрении.

## 7. H/I — Build / Buy / Reuse и точки внедрения OpenCode

Названия текущих файлов и номера строк в этой таблице происходят из [O], не из непосредственного чтения frozen cleanroom. «Низкая/средняя» — относительная инженерная сложность, не сроки или цены.

| Изменение | Точка AWE / готовый механизм | Тип / сложность | Verification / риск / rollback |
|---|---|---|---|
| Capability manifest + qualification metadata | Existing registry, Memory/Artifact Store, validator; current schema U | Extend / средняя | Validate refs/CAS/ACL; не ломать старые missions; feature-gated read-only selection |
| Approved spec pass-through | prompt-master.ts:56–87 → head-agent.ts:104–129 → Manager → QA | Extend / низкая–средняя | Hash/full fields survive handoff/recovery; отсутствие criteria блокирует acceptance; revert routing flag |
| Versioned skill loading | specialists.ts (создание Agent), core SkillSearchProcessor | Integrate adapter / средняя | Denied direct skill get/search/list/cache; no execution grant widening; fallback existing prompts |
| Stable resource/thread | src/memory/index.ts, generate calls, specialists.ts | Configure + adapter / средняя | Fresh process readback; scope negatives; disabled recall fallback |
| Memory promotion/revocation | Existing Memory/Artifact authority | Extend / средняя | Crash/retry idempotency, revoke while running, no stale index reveal; generation deny + pointer rollback |
| Qualification evals | qa-agent.ts:29–108, qa-gate.ts:153–282, Manager acceptance; core runEvals | Reuse + bridge / средняя | Per-criterion coverage, scorer errors, holdout isolation, false accepts; fallback existing gate, never bypass it |
| Cost/effect evidence | Manager totals:2533–2559 + provider/scorer/tool hooks | Extend / средняя | All attempts/planner/QA/repair/embedding accounted or explicitly unknown; disable promotion if budget unknown |
| New vector DB / standalone Memory SaaS | Existing LibSQL sufficient as initial storage hypothesis | Defer / не доказана необходимость | Измерить retrieval quality/latency before purchase; no pricing invented |
| Fine-tuning pipeline | Provider support, dataset rights, model artifact registry unknown | Defer / высокая отдельная задача | Requires baseline comparison, privacy/safety/rollback; не относится к первому R1 slice |

Важное ограничение feasibility: этот отчёт даёт конкретные seams и acceptance conditions, но не утверждает «готовый patch». Без финального source snapshot нельзя назвать точные сигнатуры AWE, миграции DB и объём diff. OpenCode сначала проверяет существующие поля/functions и **reuse**, а не автоматически создаёт сущности по каждому имени из таблицы. Никакая рекомендация не требует заменить Mission Manager на Mastra Workflows.

## 8. J — Короткая программа реализации после отдельного допуска

| Этап | Результат | Зависимости | Условие перехода |
|---|---|---|---|
| P0 Baseline | Frozen reproducible R0, lockfiles/env, restored safety evidence | Разрешение внедрения и текущий source | Clean restore + offline gate; здесь NOT RUN |
| P1 Safe contracts | Full spec flow, skill/knowledge refs, authority-bound receipts, isolated execution | P0; isolation work у основной команды | No grant widening; fixtures с secrets/другим project недоступны; cancel/recovery unchanged |
| P2 One thin capability | Один из трёх scope + baseline + independent oracle + bounded practice | P1; QA calibration | Реальное улучшение либо честный provisional/not-demonstrated; artifact presence не gate качества |
| P3 Measured transfer | Candidate freeze, hidden holdout, fresh M2, ledger и comparisons | P2; isolated eval storage | Scope-limited qualification receipt с per-case coverage и uncertainty |
| P4 Controlled memory publication | Approved lesson reuse + revoke/rollback + competing writers/crash tests | P3; existing storage policy | Никакой cross-project/holdout leakage; rollback на допустимый snapshot |
| P5 Expand by demand | Следующий task class без новой архитектуры | P4, measured demand/gap | Добавляется manifest/procedure/oracle, не новый управляющий сервис |

Параллельно P0/P1 можно **готовить** fixture corpora, rubric и manifests на synthetic inputs. Нельзя параллельно обходить неготовую isolation, запуская практику с production secrets. Минимальный cost/eval instrumentation нужен уже P2, а не только после «трёх успешно приобретённых компетенций»: иначе улучшение нечем доказать. Полная observability-платформа может подождать.

## 9. K — Приёмочные тесты и неизвестные

Все нижеследующие runtime тесты **NOT RUN**; это спецификация будущей приёмки.

| ID | Сценарий | Oracle / обязательное доказательство |
|---|---|---|
| C01 | Неизвестная профессия, новый namespaced manifest | Добавляется без enum/code migration профессий; selection bounded; без fake verified |
| C02 | Manifest меняет tool permission | Existing grant gate отказывает независимо от skill text |
| C03 | Потерян scope/criteria между Prompt Master/Head/QA | Spec hash/mandatory fields mismatch → FAIL, не reconstructed acceptance |
| C04 | Practice pass, но unseen task fail | Не повышать verified; сохранить failure receipt |
| C05 | Scorer throws/notScorable/отсутствует | Mandatory coverage FAIL, не усреднение по оставшимся scores |
| C06 | Solver узнаёт скрытый expected output | Exposure ledger инвалидирует holdout; promotion blocked |
| C07 | Fresh thread, общий resource | Тест должен обнаружить cross-case retrieval; отдельные resources/snapshots устраняют его |
| C08 | Новая миссия после approved lesson | Fresh process/context, no old transcript; paired no-lesson baseline показывает transfer либо отсутствие доказательства |
| C09 | Revocation после embedding metadata | Немедленный deny до reindex; zero title/snippet/citation leakage через search/get/cache |
| C10 | Vector cleanup падает | Tombstone остаётся; cleanup не объявляется completed; retry/reconciliation evidence |
| C11 | Два writer processes публикуют разные versions | CAS conflict, один active snapshot; ни mixed refs, ни потерянного audit event |
| C12 | Crash между receipt и active pointer | Recovery идемпотентен; нельзя увидеть verified без полного receipt |
| C13 | Model/API/tool update | Старый receipt не применяется молча; requalification/compatibility receipt |
| C14 | Отзыв уже загруженного skill | Новый effect блокируется generation check; affected context перезапущен, не продолжает stale instructions |
| C15 | Prompt injection в source/PDF/skill | Нет policy mutation/secret read/unauthorized network effect; trusted record не возникает |
| C16 | Неправильный approved lesson отозван | Descendant qualification invalidated; rollback не resurrect revoked rights |
| C17 | Self-issued PASS/чужой receipt hash | Authority/identity/hash check блокирует; автор не сам себе examiner |
| C18 | Seeded domain defects | QA обнаруживает неисправное поведение/число/цитату, false-acceptance опубликован с denominator |
| C19 | Token/cost usage missing | Cost unknown явно; budget/admission policy не считает его нулевым |
| C20 | Новая функция ломает cancellation/recovery | R0 regression блокирует release, даже при хорошем quality score |

Неизвестные: current frozen source и DB migrations; реальные AWE auth boundaries; LibSQL adapter feature coverage; provider/tool cancellation; reproducимость model snapshot; scorer/model цены; corpus size и retrieval bottleneck; независимость judge относительно solver; качество на реальных доменах. Ни один из этих пунктов не закрывается сохранением этого отчёта.

## 10. Источники и воспроизводимость исследования

Все ссылки ниже — источники, не разрешение импортировать historical code в cleanroom. Внедренческая команда должна получать только разрешённый cleanroom-compatible handoff. Сохранённые raw historical snapshots повторно в результат не включены.

**[O] OpenCode audit**, docs commit `28971e26aaf094560bf500d1d71e5e3671207e83`, [полный отчёт](https://github.com/failm3/nivict-ai-academy/blob/28971e26aaf094560bf500d1d71e5e3671207e83/03%20-%20Практика/05%20-%20AWE%20GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md). Локальная копия `evidence/bundle/evidence/opencode-audit.md`, 728 строк. Все ссылки вида O:N–M относятся к этим строкам. Его current code claims — D-audit, не наши C-upstream.

**[P22] Предыдущий Kortix пакет**, publication commit `c1a6b59c48fcb74527575dc91951f7e613d8c6de`, [папка](https://github.com/failm3/nivict-ai-academy/tree/c1a6b59c48fcb74527575dc91951f7e613d8c6de/03%20-%20Практика/05%20-%20AWE%20GROUP/RESEARCH/KORTIX-2026-11-13-ENTERPRISE-RESEARCH). Особенно E-KNOWLEDGE-INGESTION.md:29–74 (provenance/ACL), F-SKILL-LIFECYCLE.md:29–65 (native loader/lifecycle), G-CAPABILITY-PACKS.md (domain scope), I-TARGET-INTEGRATION-MAP.md, K-OPENCODE-READY-IMPLEMENTATION-PACK.md. Это исходные исследовательские предложения; текущая конкретизация не объявляет их реализованными.

Все Mastra-ссылки закреплены на **`6e8dfcb83facb0861ebefa4fee384429a113acf4`**, tag `@mastra/memory@1.41.0`, core package `1.82.0`:

- **[M1]** [packages/memory/src/index.ts](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/memory/src/index.ts): scopes 631–649, 789–835; cleanup 480–512, 1051–1139; atomic merge 1224–1294; embedded metadata 1708–1722.
- **[M2]** [packages/core/src/processors/processors/skill-search.ts](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/core/src/processors/processors/skill-search.ts#L308-L428): native search/list/get, loaded-skill thread cache.
- **[M3]** [working-memory.mdx](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/memory/working-memory.mdx#L237-L314): structured schema, merge/replace, concurrency.
- **[M4]** [semantic-recall.mdx](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/memory/semantic-recall.mdx): all new messages 67; filters и stale metadata 240–261.
- **[M5]** [experiments.mdx](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/evals/experiments.mdx): execution status ≠ quality 56–77; memory/resource 110–121; persistence 267–283.
- **[M6]** [gates-and-verdicts.mdx](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/evals/gates-and-verdicts.mdx#L46-L56): missing verdict, notScorable и gate semantics.
- **[M7]** [evals-with-memory.mdx](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/evals/evals-with-memory.mdx#L19-L59): targetOptions, shared/per-item threads, unsupported RequestContext seeding.
- **[M8]** [datasets.mdx](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/docs/src/content/en/docs/evals/datasets.mdx#L12-L53): dataset versions, storage domain, API. Документирование API не runtime proof AWE.
- **[M9]** [Memory package manifest](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/memory/package.json), [Core package manifest](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/core/package.json).

**Итог:** профессиональное развитие реализуемо как небольшой, но строго проверяемый слой контрактов и evidence поверх существующей AWE. Главная новая разработка — не хранение знаний, а authority-controlled admission, promotion/revocation и измерение переноса. SDK сокращает объём этой разработки, но не заменяет предметный oracle, права доступа и границы безопасности R0.
