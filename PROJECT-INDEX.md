# AWE GROUP — карта исследовательского комплекта

Этот репозиторий — снимок реальной системы Nox / AWE GROUP и её инженерной истории для независимых исследований Codex и Fable 5.2. Актуальная реализация находится в `src/`, а не во внешних исторических экспортах.

## Статус и границы выводов

- Проверенная контрольная точка исходников: **`a2eae351f813befdae585e93e406973365920562`**, ветка `r2/final-autonomy`.
- Независимый аудит Codex: **REJECT; R2 не принят, R3 не начат**. См. [аудит](reports/CODEX-R2-INDEPENDENT-AUDIT.md).
- Профессиональный прогон №5 имеет неизменный исходный **FAIL** и отдельный последующий offline-readback **PASS**. Это не изначально зелёный live-summary.
- Эксперименты с повторным использованием опыта глобально невалидны; улучшение качества не доказано. В 18 валидных парах повторного эксперимента ON 12/18, OFF 11/18, точный McNemar `p=1`.
- Денежная стоимость провайдера — **UNKNOWN**. Доступность внешних сервисов, универсальность на произвольных задачах и production readiness не установлены.
- Публикационная копия добавляет evidence, документацию и навигацию; исторические verdicts и исходники продукта не исправляются.

## 1. С чего начать исследование

1. [Независимый аудит R2](reports/CODEX-R2-INDEPENDENT-AUDIT.md) — фактические ограничения, команды воспроизведения и причины REJECT.
2. [AS-IS архитектура](docs/ARCHITECTURE-AS-IS.md) — реальные компоненты, полномочия, persistence и границы.
3. [README продукта](README.md) — установка, CLI/API, инструменты и security prerequisites. Отдельные исторические формулировки уточнены в AS-IS документе.
4. [Карта evidence](reports/RESEARCH-EVIDENCE-INDEX.md) — реестр прогонов, FAIL/PASS, журналов, контрольных сумм и пробелов.
5. [Отчёт о сборке](AWE-RESEARCH-REPOSITORY-ASSEMBLY-REPORT.md) — состав публикации, локальный архив, сканирование и проверки восстановления.
6. `RELEASE-MANIFEST.sha256` — SHA-256 каждого файла снимка, кроме самого манифеста.

## 2. Актуальная система Nox

| Область | Основные файлы | Что реально реализовано |
|---|---|---|
| Вход и допуск | `src/index.ts`, `src/cli/index.ts`, `src/api/server.ts` | CLI, аутентифицированный loopback REST API, specification approval, host admission |
| Prompt Master | `src/agents/prompt-master.ts` | Структурирование запроса и acceptance criteria до исполнения |
| Head | `src/agents/head-agent.ts`, `src/agents/capability-plane.ts` | Планирование, выбор инструментов, запрос приобретения возможности |
| Mission Manager | `src/agents/mission-manager.ts`, `src/agents/lifecycle.ts` | Делегирование, параллельные batches, checkpoints, recovery, не более двух repair iterations |
| Специалисты и рекурсия | `src/agents/specialists.ts`, `src/agents/recursion.ts` | Временные роли, вложенные и параллельные дети, depth 3, 12 agents/mission, 4 children/call, 10 steps/child |
| Независимый QA | `src/agents/qa-agent.ts`, `src/agents/qa-gate.ts`, `src/agents/candidate.ts` | Отдельный LLM-review, детерминированный blocking gate, привязка candidate/receipt/artifacts |
| Узкие capabilities | `src/capabilities/` | Конечные CSV analytics, verification и static web-product checks; не универсальная профессиональная квалификация |
| Persistence | `src/utils/storage.ts`, `src/utils/r0-runtime-fs.ts`, `src/memory/index.ts` | JSON state, artifacts, checkpoints, leases, atomic writes, локальная LibSQL/SQLite memory |
| Experience reuse | `src/memory/experience.ts`, `src/config/experience-policy.ts` | Хост-разрешённая передача проверенных артефактов как untrusted reference data; эффект качества не доказан |
| Модели и usage | `src/config/models.ts`, `src/utils/model-ledger.ts` | Router.Cheap routing, per-role overrides, durable SDK-call ledger; monetary cost остаётся UNKNOWN |
| Конфигурация | `package.json`, `package-lock.json`, `tsconfig.json`, `opencode.json` | Node 22, TypeScript, Mastra, pinned dependencies; `opencode.json` — пример клиентской конфигурации, не credential store |

### Маршрут миссии

`USER → PROMPT MASTER → EXPLICIT APPROVAL → HEAD → MISSION MANAGER → SPECIALISTS / RECURSION → QA + DETERMINISTIC GATE → ARTIFACT`

Утверждение спецификации не является само по себе правом на исполнение: отдельный trusted host admission обязателен. UCL возвращает только metadata и не выдаёт execution authority.

## 3. Инструменты и security

Реестр `src/tools/index.ts` содержит 12 именованных адаптеров плюс 5 браузерных; `delegate` добавляется отдельно при разрешении:

- `csv_analytics`, `shell`;
- `file_read`, `file_write`, `file_list`;
- `web_fetch`, `web_search`, `web_extract`;
- `save_artifact`, `ti_search`, `manus_search`, `capability_library`;
- `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_get_text`.

`web_search` использует Tavily primary и DuckDuckGo JSON fallback. Наличие адаптера не доказывает доступность API, credentials или браузерного сервиса сегодня.

Security-код: `src/security/`, `src/utils/qualification.ts`, `src/utils/local-capability.ts`. Реализованы deny-by-default grants, path/ownership/cancellation fencing, descriptor-relative file access, SSRF/DNS pinning, qualified local execution, process reclamation, Linux cgroups/rlimits. Их применимость зависит от host prerequisites.

**P0-предупреждение:** экспериментальные `scripts/r2-final-transfer/verifier.ts` и импортирующий его repeat verifier запускали сгенерированный CommonJS с правами пользователя хоста. Не запускать эти verifier на недоверенных артефактах. Они сохранены для исследования, а не как безопасный инструмент оценки.

## 4. UCL / каталог возможностей

- Код: `src/ucl/`, `src/tools/ucl-search.ts`, `src/ucl-mcp/main.ts`.
- Индекс: `data/db/ucl.sqlite`; SHA-256 `ef2bee5e689d484b86c2dbff0138347cb5f6e1a5f9a4dcd45c58aef51e39e1be`.
- 4 466 canonical records из 4 504 source rows; все `UNVETTED`, `installed=UNKNOWN`, qualification table пуста.
- Два читателя: in-process `capability_library` и stdio MCP `capability_search` / `capability_inventory`.
- Search read-only, metadata-only: `approved:false`, `execution_authority:false`.
- Протокол MCP проверен отдельным процессом; реальный owner OpenCode initialize/list/search не подтверждён.
- Документация: `docs/ucl-two-consumers.md`, `reports/UCL-R2-INTEGRATION.md`, `reports/UCL-INDEPENDENT-QA.md`.
- Источники и imports: `data/source/`, `data/tool-catalog/`, `reports/ucl-source/`, `ti-service/`.

## 5. Модели

Фактические defaults задаёт `src/config/models.ts`: Head/planning/QA — `claude-opus-5-5`; research/data — `deepseek-v4-flash`; coding/code — `kimi-k3.1-pro`; top-level coder — `claude-fable-5-2`; writer/general — `claude-sonnet-5-5`; creative — `gpt-6-astra`. Trusted host может задавать allowlisted exact-agent/exact-role overrides.

Разработка checkpoint использовала Kimi K3.1 Pro High. Это не означает, что все сохранённые миссии использовали эту модель: конкретные вызовы смотреть в `state/model-calls/` и ledgers соответствующего прогона. SDK records не реконструируют transport retries, embeddings и денежную стоимость.

## 6. QA, тесты и протоколы

- 53 test suites: `src/tests/*.test.ts`; runner `scripts/run-offline-tests.mjs`.
- Professional: `scripts/r2-final-professional/` — fixtures, runner, independent text verifier, readback.
- Acquisition: `scripts/r2-final-acquisition-live.ts`.
- Замороженный transfer: `scripts/r2-final-transfer/FROZEN-PROTOCOL.md`.
- Повторный experience reuse: `scripts/r2-experience-reuse/PROTOCOL.md`.
- R0/R1: `NOX-R0-FINAL-ENGINEERING-REPORT.md`, `reports/R1-CHECKPOINT.md`, `reports/R1-P0-ACCEPTANCE.md`, `reports/r1-release-inventory.md`.
- R2 self-assessment: `reports/R2-FINAL-CHECKPOINT-STATUS.md`. Его нумерация местами противоречива; независимый аудит определяет DoD по формулировкам таблицы. Acquisition summary содержит 13 boolean checks, хотя checkpoint называет «12/12».

Безопасные стартовые проверки после `npm ci`: `npm run typecheck`, `npm test` и professional `--validate-only`. Для полного native suite нужны Chromium и его host libraries. Run-5 `reverify.ts` не выполняет сетевых вызовов, но требует воспроизведения исходного абсолютного `runRoot`: сохранённые backing paths привязаны к build workspace. При переносе снимка он ожидаемо сообщает `Artifact backing path escapes its mission workspace`; это portability gap, а не новый FAIL исходной миссии. Не запускать live/paid missions или experimental generated-code verifier.

## 7. Evidence и история решений

Все professional №1–5 и два ранних прогона, acquisition failures и green `1794846721863`, frozen transfer и repeat reuse находятся в `reports/`. Исходные summary не переписаны. Решения и дефекты можно проследить по Git-истории: `88d08ee` — nested executor attribution; `238f773`/`f92174e` — delegation topology; `326d46d` — spec-neutral format parsing; `2a53bf7` — repeat experiment; `a2eae35` — checkpoint.

`reports/r2-final-evidence.sha256` — старый манифест: все 90 файлов восстановлены, включая 45 найденных в sibling worktree. Полный новый манифест охватывает сам release snapshot.

## 8. Дополнительные источники

- `research/r1-kortix/` — imported reusable research и его provenance, не актуальный runtime.
- `research/external/awe-group-runtime/` — отдельный исторический E0/E1 export из `failm3/awe-group-runtime` at `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda`; **не R2 source**.
- `research/external/nivict-ai-academy/AWE-GROUP/` — выбранные текстовые architecture/research/audit документы из `failm3/nivict-ai-academy` at `9b9122366a0be96303153930b9e9f8bbd10ed76c`; **исторический контекст**, не runtime.
- `failm3/awe-opencode-recordings`, `failm3/awe-group-observer`, `failm3/awe-model-council` публично недоступны без авторизации; их содержимое не получено и не выдумано. Видимость приватных репозиториев не менялась.

Подробности allowlist и исключений: [PROVENANCE.md](research/external/PROVENANCE.md) и `RELEASE-PROVENANCE.json`.

## 9. Что остаётся только локально

Полный приватный архив включает Git bundle и рабочие копии tracked/untracked/ignored материалов трёх worktree. В публичный snapshot не вошли `node_modules`, `dist`, OpenCode profiles/cache, browser screenshots, рабочие Mastra memory.db/WAL/SHM, временные test workspaces, частные chat logs, внешние archives/chunks и непубличные репозитории. Исключение не означает удаление оригинала.

Лицензия `package.json` — ISC; отдельный root LICENSE в исходной checkpoint отсутствует. Сторонние зависимости, исследования, каталоги и внешние snapshots сохраняют свои исходные права и условия. Отсутствие лицензии у внешнего репозитория не означает разрешение на произвольное переиспользование.

Точные ограничения полноты перечислены в [реестре evidence](reports/RESEARCH-EVIDENCE-INDEX.md) и [отчёте сборки](AWE-RESEARCH-REPOSITORY-ASSEMBLY-REPORT.md).
