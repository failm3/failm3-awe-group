# Инструменты и безопасное расширение AWE

Редакция выпускающего 2026-11-13: исправленные места помечены M2/M3; оригинальный draft сохранён отдельно в Drive. Остальной текст — свидетельство исходного специалиста, не новые проверки выпускающего.

**Решение:** сохранить существующие Tool Intelligence, `allTools`, Mastra MCPClient, Mission Manager и R0 authorization/recovery. Добавлять не второй каталог и не универсальный автономный установщик, а проверяемые bindings к уже существующим инструментам. До исполнения нового кода нужны воспроизводимый frozen R0 и реальная граница filesystem/secrets/network. Первый R1-срез — одна профессиональная процедура, один минимальный набор инструментов, предметный QA и доказанный повтор на новой задаче.

Дата исследования: 2026-11-13. Специализация: F/H/I/K и безопасность R0. Session `8e857294-81f8-4fde-bcfe-50871d6c10de`. Только исследование: AWE не изменялся, зависимости не устанавливались, MCP/приложения не запускались, внешние бизнес-действия и покупки не совершались.

## 1. Доказательства и ограничения

Уровни, используемые в этом документе:

- **E1:** собственное статическое чтение конкретного исторического исходника или exact-version package manifest. Не runtime PASS.
- **E2:** документальное свидетельство OpenCode о текущем frozen cleanroom. Его выполненные проверки не называются нашими тестами.
- **E3:** первичная документация поставщика/спецификация; гарантирует описание, не интеграцию AWE.
- **P:** инженерное предложение, требующее реализации и acceptance.
- **U:** неизвестно/не проверено.

Прочитано исходное задание владельца, включая pasted_content. Использован пакет предыдущих 22 MD: обзор состава и предметное чтение D/F/H/I/K, а также полный независимый аудит OpenCode. Это не повторный аудит каждого утверждения всех 22 документов. `sessions cp` исходной evidence-сессии ответил `session not found`; использована разрешённая private Drive копия архива. Проверена целостность извлечённого evidence-пакета по SHA256SUMS. Исторические исходники не импортировались в запрещённый cleanroom. Текущий cleanroom недоступен; отсутствие доступа не означает отсутствие реализации.

### Опорные ссылки

**A — OpenCode audit:** [полный документ](https://github.com/failm3/nivict-ai-academy/blob/28971e26aaf094560bf500d1d71e5e3671207e83/03%20-%20Практика/05%20-%20AWE%20GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md), commit `28971e26aaf094560bf500d1d71e5e3671207e83`. Локальный оригинал `evidence/unpacked/evidence/opencode-audit.md`, 728 строк. Далее A:Lx означает строки этого файла.

**K — предыдущий пакет:** [каталог](https://github.com/failm3/nivict-ai-academy/tree/c1a6b59c48fcb74527575dc91951f7e613d8c6de/03%20-%20Практика/05%20-%20AWE%20GROUP/RESEARCH/KORTIX-2026-11-13-ENTERPRISE-RESEARCH), commit `c1a6b59c48fcb74527575dc91951f7e613d8c6de`. Здесь важны `D-TOOLS-CONNECTORS-LIBRARIAN.md`, `F-SKILL-LIFECYCLE.md`, `H-BUILD-BUY-REUSE-MATRIX.md`, `I-TARGET-INTEGRATION-MAP.md`, `K-OPENCODE-READY-IMPLEMENTATION-PACK.md`.

**H — historical runtime:** commit `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda`, не текущий Mastra cleanroom. [discovery.mjs:L16–60](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/tool_registry/discovery.mjs#L16-L60), [runtime-adapter.mjs:L1–11](https://github.com/failm3/awe-group-runtime/blob/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda/awe/tool_registry/runtime-adapter.mjs#L1-L11).

## 2. Новые findings и сверка с прежним исследованием

### F1. R0 закрыт только в ограниченном offline scope

**E2:** A:L68–116 сообщает проверки 73/73 source hashes, 55/55 evidence hashes и пересчёт 22/22 сохранённых suites, не новый regression run. Это достаточное документальное основание для `R0 OFFLINE SCOPE VERIFIED / CLOSED`, но не production PASS. Прежняя осторожность K-D «R0 не объявляется завершённым» была оправданна на прежнем evidence cutoff; теперь нужно уточнить статус, а не отрицать новые доказательства. Аудитор не читал K из-за cleanroom restriction: его нельзя представлять проверившим все 22 документа.

**E2:** A:L146–169: HEAD `446adaea833b0ebade1a21fbda3f71118d19b0d6` плюс modified/untracked файлы не восстанавливает финальный R0. Lockfile, browser binaries и полное окружение не покрываются source manifest. Первый engineering gate — commit/archive полного разрешённого source + lockfiles/environment + clean restore, не очередной README.

### F2. Discovery не является подключением или полномочием

**E2:** A:L277–295 разделяет локальный `allTools` и research candidates `ti_search`/`manus_search`; последние не устанавливают tools. Текущий MCP описан как singleton Playwright client с lazy discovery и фиксированными wrappers. `src/config/mcp.ts:171–257`, `src/tools/browser.ts` — ссылки аудитора, не прочитанный нами current source.

**E1 исторический:** H `discovery.mjs:18–26` возвращает `permitted:false`, `physical_decision:'DENY'`; `:49–59` проверяет metadata/manifest/PEP, но выдаёт только `BOUND_E0_ONLY` и `runtime_dispatch:false`. H `runtime-adapter.mjs:2–10` явно не исполняет, требует отдельные pinned adapter, current issuer/PEP, durable admission и OS egress. Это подтверждает корректное разделение концепций в историческом коде, но не доказывает его наличие в текущем cleanroom.

**P:** не переносить исторический TR API целиком поверх Mastra. Сначала найти эквиваленты в текущих tool-context/manager/store; добавить только недостающие поля и проверки. Размер старой TI базы не равен числу проверенных исполняемых компетенций.

### F3. Shell grant сейчас нельзя трактовать как scoped бизнес-разрешение

**E2:** A:L126–144 ссылается на `src/tools/index.ts:258–261`: `bwrap --unshare-pid --die-with-parent --bind / / ...`. PID containment не ограничивает root filesystem. `file_read` не исключает `.env` (`:334–346`), `file_write` работает в общем workspace (`:353–378`). Это статическое заключение аудитора, не наш exploit. Cwd check и env filtering недостаточны, если секрет читается с диска.

**E3:** [bubblewrap README](https://github.com/containers/bubblewrap) прямо возлагает security model на вызывающего, определяющего аргументы. Наличие bwrap не означает корректную песочницу. Локальная установленная версия bwrap неизвестна; нельзя назначить ей vulnerability status по названию.

### F4. Версия протокола отмены — реальный compatibility gap

Прежний K-D ссылался на MCP `2025-11-25`; эта версия действительно описывает `notifications/cancelled` и отдельный `tasks/cancel`. Но на дату проверки страница помечена older и указывает `2026-07-28`.

**E3, свежая проверка:** [MCP 2026-07-28 cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation) задаёт transport-specific cancellation: для Streamable HTTP закрывается response stream; для stdio отправляется `notifications/cancelled`. Сервер всё ещё может не отменить уже завершённый/неотменяемый запрос. Максимальный timeout должен ограничивать запрос независимо от progress. Это не rollback внешнего эффекта.

**P:** хранить negotiated protocol version и transport в binding/receipt. Не обновлять SDK/протокол автоматически из-за слова latest. До пилота проверить фактическую версию MCP SDK в lockfile AWE и сервере; тестировать cancellation по ней. Нельзя механически применить текущую спецификацию к установленному `@mastra/mcp 2.8.0`: совместимость не проверена.

### F5. Latest Playwright MCP не является безопасным pin

**E2:** A:L285–293 сообщает unpinned `npx @playwright/mcp`. **E1 свежие metadata:** npm latest при чтении — `@playwright/mcp 0.0.85`, Apache-2.0, Node `>=18`, зависимости `playwright` и `playwright-core` `1.66.0-alpha-2026-11-09`. Это не установленная версия AWE и не рекомендация её установить. В аудите `@playwright/test 1.49.1` — другой пакет.

**P:** зафиксировать уже квалифицированную связку server/browser/OS image, пакетный integrity и browser revision. Не запускать npx с network resolve во время миссии. Изменение schema/tools list/browser revision аннулирует qualification конкретного binding. Singleton `--isolated` не доказывает раздельный browser context/profile каждой миссии: A:L295 и отдельный future leakage test.

## 3. F — один жизненный цикл поверх существующего Tool Intelligence

Следующая таблица — **P**, контракт доработки существующих компонентов, не утверждение, что новые API уже реализованы.

| Этап | Что делает существующий контур | Доказательство/гейт | Чего он не разрешает |
|---|---|---|---|
| Discovery | TI собирает official registry/repo/API metadata | source URL, capture time, source hash, canonical product/action ID | Не устанавливает пакет и не запускает команду из metadata |
| Evaluation | TI + специалист сравнивают capability fit, maintenance, ограничения | пример задачи, контракт входа/выхода, лицензия и происхождение | Популярность/рейтинг не security approval |
| Selection | Head выбирает существующий подходящий binding прежде нового | детерминированные hard filters, сохранённое explanation | LLM не выдаёт себе grant |
| Compatibility | Engineering проверяет exact version/schema/runtime/transport | lockfile, peer ranges, platform, auth mode, fixture contract tests | Manifest match не runtime PASS |
| Security | существующая policy/security boundary | egress/filesystem/secret model, install scripts/SBOM/advisory review | Scanner clean не доказательство отсутствия уязвимостей |
| Permission | существующий issuer/approval + policy | principal/account/tenant/mission/action/resource/version/TTL/budget | OAuth connection не разрешение всех действий account |
| Connection | existing MCPClient или typed API/SDK/CLI adapter | approved account mapping, exact binary/schema, минимальный scope | Registry install command не исполняется напрямую |
| Execution | manager + current execution boundary | live grant/fence/revocation check и durable intent до эффекта | Search/load cache не final authorization |
| Verification | receipt + независимый QA | readback/provider ID, domain oracle, artifact lineage | HTTP 200/exit 0/наличие файла не бизнес-успех |
| Reuse | TI и Memory сохраняют проверенную recipe/binding | environment/task family, outcomes, expiry, negative cases | Документ не квалификация и не расширение прав |

### Минимальная модель данных без второго каталога

Расширять существующую запись TI: `capability_id`, `binding_id`, canonical vendor/repo/package identity, exact version+integrity, schemas digest, protocol/transport, source evidence, license evidence, runtime constraints, risk/effect class, verification receipt refs и expiry. Отдельно хранить состояние metadata, security review, adapter qualification и account connection. Grant и invocation — в существующем security/mission store, не в ToolCard. Секретные значения не попадают в TI, prompts, logs или exemplars.

Каталог расширяется без фиксированного количества профессий; execution всегда ограничен top-k загрузкой, scope, CPU/memory/pids/disk, временем, сетью, бюджетом и одновременными задачами. Ограничение результата поиска — не потолок компетенций. Не объединять SDK/REST/MCP представления одной операции как три навыка; хранить несколько bindings одной capability.

### Mature catalogs: что переиспользовать

**E3:** [официальный MCP Registry](https://modelcontextprotocol.io/registry/about) — metadata repository, в проверенной документации всё ещё preview; namespace authentication, REST API и стандартизированный server metadata. Он не размещает бинарники; security scanning делегируется package registries/aggregators. Официальная реализация не позиционируется поддерживаемой self-host установкой. Это довод за read-only ingestion в существующий TI, а не форк registry и не автоматическое trust.

npm/PyPI/OCI registry дают release artifacts/integrity и экосистемную информацию, но не квалификацию AWE. GitHub official source даёт owner/commit/license evidence, не разрешение запускать build hooks. Маркетплейсы/курируемые списки остаются дополнительными leads: fresh pin/license review каждого кандидата. Приватные tool metadata не публикуются в публичный MCP Registry.

**E3:** [Agent Skills specification](https://agentskills.io/specification) определяет `SKILL.md`, optional scripts/references/assets, optional license/compatibility и experimental `allowed-tools`. Это формат переносимой процедуры, а не security boundary. `allowed-tools` не должен повышать существующие grants. Загрузка Markdown с instruction injection не должна менять authority. Версия отдельного Skill — commit/content digest; отсутствие поля license означает необходимость выяснить права, не permissive default.

**P:** сначала native Mastra Skills/Workspace, отмеченный A:L453–459, но провести spike на обходы file/shell permissions. Простой fallback — read-only pinned Markdown loader через существующий file boundary, scripts только через уже квалифицированный executor. Не создавать новый Skills engine до доказанного отсутствия нужной функции.

## 4. H — версии, лицензии и варианты реализации

Точные npm manifests проверены GET без установки, сохранены в `out/primary/`; SHA в `manifest-checks.json`. Это проверка metadata, не legal audit транзитивных зависимостей.

| Средство | Версия/лицензия и доказательство | Решение и простая альтернатива | Сложность, стоимость, проверка |
|---|---|---|---|
| Mastra core/createTool/ToolSearchProcessor | `1.82.0`, Apache-2.0, Node >=22.13.0; npm E1; A:L35–48 сообщает установленную версию | **Reuse** существующий tool registry; search processor только внутри уже зарегистрированного allowlist. Альтернатива — текущий TI search без новой зависимости | Настройка/небольшой adapter при подтверждённом gap; compute/model расходы остаются. Проверить direct execute обходы и фильтры load/search |
| Mastra MCPClient | `2.8.0`, Apache-2.0, Node >=22.13.0; peers core >=1.79.0-0 <2.0.0-0, Zod ^4.2.0 | **Reuse**, не второй клиент. Прямой typed REST adapter проще, если нужна одна HTTP операция | Диапазоны допускают core 1.82.0 и reported Zod 4.6.7; transport/auth/cancel runtime неизвестен. Contract test обязателен |
| Playwright MCP | Фактический pin AWE U. Fresh npm latest `0.0.85`, Apache-2.0, alpha browser dependency; не выбранный runtime pin | **Закрепить существующую квалифицированную версию**, не latest. Существующие wrappers сохранить | Требуется inventory server/browser/image и profile separation; browser compute и external app terms отдельно |
| Agent Skills + Mastra Workspace | Формат спецификации + core 1.82.0, не новый npm номер Agent Skills | **Reuse/spike** native loader; fallback read-only Markdown loader | Средняя работа из-за permission integration, а не из-за Markdown. Проверить загрузку scripts, traversal, allowed-tools |
| MCP Registry ingestion | Mutable preview service; лицензия конкретных серверов отдельная | **Тонкий metadata adapter** в TI, без install/dispatch; fallback curated official URL | Небольшая логика normalization/cache, но qualification дорогая часть. Никакого автоматического доверия |
| Composio Mastra | `@composio/mastra 0.10.6`: manifest **ISC**, Node >=22.22.3; core peer ^1.46.0; требует @composio/core допустимого диапазона | **Отложить**, пока нет доказанного managed OAuth gap. Альтернатива — один existing provider API/MCP adapter | Редакционная коррекция M3: это подтверждение прежнего H-BUILD-BUY-REUSE-MATRIX.md:68,121, уже указавшего ISC и Node >=22.22.3, а не исправление всего K. MIT репозитория не заменяет лицензию конкретного пакета. Hosted service terms/стоимость отдельные и U. Node порог выше Mastra; actual AWE Node U |
| bubblewrap | Current AWE binary U. Проверен COPYING tag v0.11.0 с GNU Library GPL v2; не установлен и не выбран автоматически | **Исправить профиль изоляции** либо отдельный container/VM worker с тем же execution contract | Существенная security работа. Нельзя оценивать только размер diff; cgroups/egress/secret mounts/child lifecycle tests обязательны |
| ToolHive / managed sandbox | В K уже рассмотрены; новая exact-version квалификация здесь не проведена | **Резерв**, только если минимальный worker не покрывает lifecycle/isolation. Не второй TI/Head | Версия, лицензия выбранного release, OS support, тариф, data residency остаются gate; покупка сейчас не обоснована |
| Pipedream / Arcade / n8n / Activepieces | Сравнение уже в K-D; цены/лицензии всего сервиса не выведены из SDK | **Не подключать параллельно**. Рассмотреть одного посредника на конкретном интеграционном gap | Непроверенная AWE совместимость; managed auth не local grant. Не повторяем рыночный обзор без новой потребности |

Числовые сроки, стоимость и ROI не рассчитывались: неизвестны нагрузка, accounts, retention, SLA, environment и реальные SDK retries. TCO считать как engineering+operations+worker+storage/egress+provider/app/model calls; учитывать повторные попытки и фоновые активности. «Open source» не означает нулевую стоимость, а SDK license не даёт права использовать hosted API бесплатно.

## 5. Sandbox, supply chain и границы полномочий

Все требования ниже **P**, кроме явно указанных evidence findings.

**Shell:** по возможности typed executable + argv, без shell interpolation; executable allowlist сам по себе не спасает от интерпретатора, downloader или разрешённого бинарника с чтением произвольных файлов. Недоверенный код — отдельный worker namespace/container/VM. Read-only минимальный root, mission-only writable mount, закрытые чужие mission dirs и runtime secret dirs. Без Docker socket/host credentials/SSH agent; ограниченные proc/dev, user и capabilities. Cgroups/лимиты pids/CPU/RAM/disk и подтверждённое завершение дочернего дерева. `--bind / /` недопустим как квалифицированная filesystem isolation для untrusted execution.

**Filesystem:** authority на normalized resource, защита symlink/TOCTOU, deny secret files не только `.env` по имени. Лучше вообще не монтировать secret material. Artifact promotion через существующий manager с lineage/hash; запись script в output не должна сделать его автоматически executable. Checkout/zip extraction проверяет traversal, symlink и размер.

**Network:** default-deny outbound, allowlist destination+method/action где возможно; блок loopback/metadata/link-local/private targets для untrusted fetch, если они не разрешены отдельно. DNS rebinding, redirects и proxy bypass тестируются; egress policy применяется в worker/network boundary, не в промпте. Download не исполняется без нового review. Нет неявного перехода API→browser→shell ради обхода запрета.

**Secrets/auth:** короткоживущие scoped credentials или broker refs; связка account/principal/tenant/resource, redaction результатов и ошибок, запрет token passthrough к произвольному downstream. OAuth discovery endpoints — тоже SSRF поверхность. Client registration/redirect/PKCE/audience/resource проверяются по поддерживаемой версии протокола. Основание E3: [MCP security best practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices), в сохранённом ответе canonical docs path отличается; это документация, не проверенный AWE OAuth.

**Supply chain:** exact package and transitive locks, integrity/digest, publisher/source provenance, license file и нужные notices, install hooks, advisories и SBOM выбранного build. Signature подтверждает issuer, не доброкачественность. Build/install выполняются отдельно от миссии с секретами. Version/schema/tool-list drift переводит binding в review. Тексты tools, registry records, Skills и remote output — недоверенные данные, не system instructions.

**Owner approval:** выдаётся на объяснимое действие, scope, account, ресурсы, предел цены, время, версию adapter и эффект; отдельно purchase, deploy, outbound send, deletion, credentials/permissions и изменение исполняемой инфраструктуры. Existing policy может разрешать bounded read без нового интерактивного запроса; неизвестный или расширенный scope fail-closed. Research authorization этого задания не разрешает перечисленные эффекты. Approval challenge при изменении args/resource/version пересоздаётся; blanket «все tools» не подходит. Отзыв проверяется непосредственно перед эффектом, а не только при планировании.

## 6. Cancel, retries, idempotency и recovery

Не заменять R0 recovery на framework defaults. A:L269–275 и L465–475 предупреждает о несопоставимости семантик готового workflow engine и достигнутых R0 guarantees.

Минимальный invocation envelope (**P**, расширение existing store): operation ID, mission/task/agent, principal/account, grant revision, lease/fence, exact adapter/schema digest, normalized args digest, resource scope, reserved budget, deadline, provider idempotency key при наличии documented support. До внешнего эффекта durable intent; после — receipt с provider request/object ID, actual outcome, observation time, retry owner и cost/usage либо `unknown`.

| Ситуация | Требуемое поведение |
|---|---|
| Отмена до dispatch | Fence/deny, зафиксировать not-started; не отправлять запрос |
| Локальный worker остановлен | Join/process-tree quiescence; не выводить отсюда отмену remote effect |
| Remote request timeout / потерян ответ | `outcome_unknown` + reconcile/readback; не повторять автоматически неидемпотентную операцию |
| Provider поддерживает idempotency | Один durable key на бизнес-операцию, одинаковый semantic payload, учёт retention/window provider; изменение payload — не reuse ключа |
| Provider не поддерживает key | Durable intent и уникальный business marker/readback, если возможно; иначе manual recovery decision, не обещание exactly-once |
| HTTP 429/5xx на read | Bounded retries с backoff/jitter, Retry-After и общим deadline/budget; проверить read действительно не запускает эффект |
| SDK сам повторяет | Отключить или включить в единый retry budget; не суммировать скрыто SDK×manager×workflow |
| Revoke/lease loss после отправки | Запрет новых эффектов; поздний результат сохраняется как evidence, не проходит stale success promotion |
| Compensating action | Отдельный утверждённый эффект с own intent/receipt, не автоматическая «отмена» |

MCP `isError`, JSON-RPC success, HTTP status и CLI exit code нормализуются раздельно. Outcome accepted by provider, operation completed и QA accepted — разные состояния. При restart нельзя replay неизвестную write-операцию только потому, что отсутствует локальный success marker.

## 7. I — минимальные точки интеграции для OpenCode

Это **проектный diff map**, а не проверенный список актуальных функций: current исходники доступны только в отчёте OpenCode. Перед изменением разработчик должен подтвердить символы и тесты frozen tree.

| Existing seam | Минимальный delta | Что не создавать заново | Gate |
|---|---|---|---|
| `src/tools/ti-search.ts`, `manus-search.ts` | нормализация кандидатов, provenance, canonical binding + explain fields | Новый TI/search broker | research result никогда не появляется в executable registry сам |
| `src/tools/index.ts` | общий effect-boundary wrapper вокруг existing handlers, typed CLI envelopes | Второй tool dispatcher | Direct invoke и agent invoke проходят одинаковый grant/fence gate |
| `src/security/tool-context.ts` (из K) | exact binding/resource/account + current grant check | Вторую policy/issuer систему | Сверить уже реализованное; не дублировать поля без gap |
| `src/config/mcp.ts`, `src/tools/browser.ts` | pin server/browser, lifecycle ownership и mission-scoped state, timeout/abort mapping | Второй MCPClient/Playwright framework | Partial discovery errors, cancel races и cross-mission state tests |
| Existing manager/store | intent/receipt/reconciliation при отсутствующем контракте | Второй Mission Manager/Temporal migration | Crash after effect before receipt не даёт duplicate effect |
| `src/agents/specialists.ts` | загрузка выбранного pinned Skill + bounded tools | Вторую Agent Factory | Skill не добавляет полномочий; top-k и context budget |
| Existing QA | read-only domain validator/readback capability под scoped grants | Второй QA supervisor | Недостоверный, но существующий artifact отклоняется |

OpenCode технически может реализовать эти изменения внутри existing seams. **Непосредственная готовность к patch не подтверждена**: недоступны текущие signatures, lockfile entirety и executable tests. Самый простой API adapter — одна typed операция через existing createTool и authorization; SDK имеет смысл при signing/pagination/сложном auth, MCP — при уже подходящем сервере, CLI — при local utility без API. Не оборачивать всё в MCP ради унификации: унифицировать envelope/receipt, а не обязательный транспорт.

## 8. K — короткая программа внедрения и критерии приёмки

Ни один тест ниже не выполнен в этом исследовании; это будущие acceptance tests, не PASS.

| Этап | Зависимость/объём | Проверяемый выход | Stop rule |
|---|---|---|---|
| 0. Воспроизводимый R0 | Existing frozen sources; отдельный допуск на инженерные изменения | Source commit/archive+locks+env+browser inventory; clean restore и исходный offline gate | Hash-only без restore не закрывает этап |
| 1. Изоляция execution | 0; существенная security доработка existing worker | Synthetic secret, чужая mission, path/symlink/child/egress отрицательные тесты; cancel/recovery не регрессировали | Любое чтение host secrets/чужих файлов блокирует untrusted code |
| 2. Один binding | 0; параллельно с 1 допустимы только offline fixtures/schema work | Exact version + license + schemas + grant + receipt; public read или local bounded test | No auto-install, никакого real write в рамках исследования |
| 3. Один Skill/professional slice | 1–2 и requirements/QA seam | Профессионально валидный результат, включая deliberately flawed negative sample | Файл без предметной проверки не qualification |
| 4. Reuse на новой задаче | 3 | held-out задача, scope/версии/результаты, сравнение baseline и rollback | Запоминание прежнего примера не улучшение компетенции |
| 5. Один managed integration при gap | Только доказанный auth/coverage gap | tenant/account/revocation/cancel/readback/cost qualification | Без условия gap не покупать посредника |

### Обязательные adversarial/contract tests

1. TI candidate, чужой tenant record, expired binding и изменённый digest не становятся executable.
2. Grant revoked между discovery и invoke блокирует effect; подмена account/resource и replay approval блокируются.
3. Skills `allowed-tools`, embedded script и prompt injection не повышают scope.
4. Fake `.env`, host home, другая mission, symlink escape и write-outside доступны только как отрицательные fixtures; ни один настоящий секрет не используется.
5. Loopback/metadata/private address, DNS redirect/rebinding и разрешённый домен с запрещённым redirect не обходят egress.
6. Child process fork/daemon и browser worker завершаются при cancel; late callback не пишет stale artifact.
7. Две миссии не разделяют cookies/localStorage/downloads и auth state без явного разрешения.
8. Crash перед dispatch, после dispatch, после remote commit и перед local receipt; no blind duplicate, explicit uncertain state.
9. Partial MCP discovery error не становится успешным пустым каталогом; MCP tool error не становится QA success.
10. Progress flood не продлевает deadline бесконечно; retries разных слоёв не превышают общий лимит.
11. Изменение schema, package version, negotiated protocol, browser revision инвалидирует старую qualification или требует явного revalidation.
12. Domain QA отвергает артефакт с правильным hash, но неверным содержанием; повторный held-out результат оценивается независимо.

Для каждого теста нужны fixture identity, точные версии, ожидаемый oracle, actual result, logs/receipts, воспроизводимая команда и independent review. Эксплуатационный допуск не выводится из количества зелёных тестов: важны scope и негативные случаи.

## 9. Итоговые решения и остающиеся неизвестные

**Принять:** reuse-first Mastra/TI/allTools; различение research/qualification/authorization; first restore→isolation→one capability slice. Рекомендация OpenCode по порядку в целом обоснована E2. Чтобы не превращать R1 в бесконечную подготовку, schema fixtures, requirements/QA design и metadata normalization вести параллельно, но real untrusted execution не запускать до isolation gate.

**Уточнить прежнее:** R0 получил узкий offline closure; Composio package license отдельно от repo license; MCP 2025-11-25 не current specification; latest Playwright server может тянуть alpha browser; `--isolated` не доказанная per-mission state boundary.

**Исключить сейчас:** новый TI/Head/manager, массовый auto-install, blanket shell authority, покупку нескольких managed tool platforms, migration recovery на новый engine без R0 contract comparison, объявление документов компетенциями.

**U:** точный Node/bwrap/MCP SDK/browser AWE, восстановимость полного финала R0, current source wiring Workspace/Skills, реальная transport cancellation, OAuth tenant scoping, security advisories полного lockfile, production network policy и все live compatibility outcomes. Эти неизвестные не блокируют исследовательское решение, но блокируют соответствующие эксплуатационные утверждения.

## Источники свежей проверки

- [@mastra/core 1.82.0 manifest](https://registry.npmjs.org/@mastra/core/1.82.0).
- [@mastra/mcp 2.8.0 manifest](https://registry.npmjs.org/@mastra/mcp/2.8.0).
- [@composio/mastra 0.10.6 manifest](https://registry.npmjs.org/@composio/mastra/0.10.6).
- [Playwright MCP latest metadata](https://registry.npmjs.org/@playwright/mcp/latest), mutable; сохранён результат 0.0.85, не установлен.
- [MCP Registry](https://modelcontextprotocol.io/registry/about), mutable vendor docs snapshot.
- [MCP cancellation 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation) и [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/utilities/cancellation).
- [MCP security](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices).
- [Agent Skills specification](https://agentskills.io/specification).
- [bubblewrap README](https://github.com/containers/bubblewrap), [v0.11.0 COPYING](https://github.com/containers/bubblewrap/blob/v0.11.0/COPYING).
- Upstream Mastra source links/commit `6e8dfcb83facb0861ebefa4fee384429a113acf4` переиспользованы из K-D, не заявляются новым source audit: [ToolSearchProcessor](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/core/src/processors/processors/tool-search.ts), [MCP callTool](https://github.com/mastra-ai/mastra/blob/6e8dfcb83facb0861ebefa4fee384429a113acf4/packages/mcp/src/client/client.ts#L1760-L1855).

Сохранённые primary excerpts — исследовательские снимки, не полный mirror сайтов. Собственные выполненные проверки ограничены чтением originals, integrity evidence package и GET metadata/documents; новых AWE regression/security/live-тестов нет.
