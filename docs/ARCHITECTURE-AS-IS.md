# Архитектура AWE GROUP / Nox — AS IS

Документ описывает код checkpoint `a2eae351f813befdae585e93e406973365920562`. Это исследовательская фиксация, не утверждение production readiness или принятия R2.

## Системная граница

Nox — локальный Node.js/TypeScript runtime с CLI и Express API. Он использует Mastra agents, Router.Cheap OpenAI-compatible API, JSON persistence и LibSQL/SQLite memory. Внешние web/TI/Manus/browser services являются адаптерами; их регистрация не доказывает текущую доступность.

```text
User / CLI / authenticated REST API
              |
              v
       Prompt Master --> pending specification
              |
       explicit user approval
              |
       trusted host admission (separate authority)
              |
              v
         Head Agent --> allowed tools / acquisition request
              |
              v
       Mission Manager --> durable plan, budgets, checkpoints
              |
       +------+-------+----------------+
       |              |                |
  specialists   parallel children   nested children
       |              |                |
       +--------------+----------------+
                      |
                 candidate artifacts
                      |
          independent QA reviewer + deterministic gate
                      |
             completed / failed / paused / recovery
```

## Оркестрация

### Спецификация и approval

`src/agents/prompt-master.ts` превращает запрос в структурированную спецификацию. Approval связывается с конкретным spec hash. `src/utils/spec-binding.ts` и `src/utils/mission-admission.ts` отделяют согласие пользователя от host execution admission. Host resolver выбирается доверенной конфигурацией, а не model text/request body.

### Head

`src/agents/head-agent.ts` получает approved spec и разрешённый набор инструментов, вызывает модель, разбирает план, ограничивает выбор capabilities. `src/agents/capability-plane.ts` обрабатывает обнаружение/запрос новой возможности. Некорректный первый план имеет ограниченную коррекцию; это не неограниченная автономная сессия.

### Mission Manager и рекурсия

`src/agents/mission-manager.ts` назначает специалистов, объединяет artifacts, хранит checkpoints, управляет не более чем двумя repair iterations. `src/agents/recursion.ts` создаёт временные узлы, резервирует общий бюджет, использует `Promise.allSettled`, проверяет owner/spec/cancellation и передаёт host executor вложенным детям.

Пределы кода: depth 3, 12 agents/mission, 4 children/call, 10 child steps. Wall-clock overlap подтверждён для двух детей professional №5, но не доказывает CPU concurrency или универсальный выбор топологии.

### Жизненный цикл

`src/agents/lifecycle.ts`, `src/utils/process-registry.ts` и storage управляют pause/cancel/resume, leases, process reclamation и ambiguous recovery. Повтор внешнего эффекта требует отдельного решения. Отмена уже произведённого внешнего эффекта не гарантируется.

## QA — что означает «независимый»

`src/agents/qa-agent.ts` — функционально отдельный model call. `src/agents/qa-gate.ts` — детерминированный blocking gate над candidate, evidence и acceptance criteria. `src/agents/candidate.ts` связывает bytes и receipt. Gate не может смягчить отказ модели.

Head и QA могут использовать одного провайдера и одну модель; статистическая независимость ошибок не доказана. В professional №1–3 production QA принимал работы, которые затем получали внешний FAIL. Следовательно, QA verdict нельзя считать универсальным доказательством корректности.

## Tools, acquisition и authority

См. реестр `src/tools/index.ts`. Tool grant deny-by-default и spec-scoped. `src/security/` реализует file/workspace boundaries, shell isolation, network request checks и resource limits. Linux resource tests требуют user-systemd/cgroup prerequisites.

Acquisition — не произвольная установка из интернета. `src/utils/qualification.ts` и `src/utils/local-capability.ts` требуют trusted host qualification canonical path, exact executable bytes, fixed args и probe evidence. Release повторно проверяет qualification/bytes и записывает receipt. Green acquisition доказывает один Node procedure `observation-digest-v1`, а не универсальную установку любой UCL-записи.

## Persistence и memory

- Missions, specs, approvals, artifacts, candidates, delegation trees, model-call ledgers и checkpoints — JSON файлы.
- `src/utils/storage.ts` — atomic writes/CAS/leases; `.awe-data/` — обычная runtime область.
- `src/memory/index.ts` — Mastra LibSQL/SQLite message memory: 20 recent agent messages, 50 mission messages; semantic recall и working memory отключены.
- `src/memory/experience.ts` — отдельный механизм межмиссионного experience transfer с host authorization, source artifact integrity и qualification binding. Reference data вставляется как untrusted user-message content.

В публичный snapshot включены JSON evidence; memory.db/WAL/SHM оставлены локально из-за потенциально приватного message content. В исследованных R2 professional базах таблицы messages/threads пусты, но это не универсальная гарантия для всех локальных баз.

## UCL

`src/ucl/librarian.ts` выполняет read-only FTS5/BM25 search. In-process и MCP consumers используют одну библиотеку и один byte-identical index. Все записи `UNVETTED`, без install/execute/grant/qualify authority. Hazard filters и hash/count checks fail closed. Настоящая интеграция owner OpenCode не подтверждена, несмотря на успешный MCP child-process test.

## Model routing и наблюдаемость

`src/config/models.ts` — единственный источник defaults и allowlisted host overrides. `src/utils/model-ledger.ts` записывает started/terminal events, model/agent/mission IDs и reported usage. `cost.amount=null` / `UNKNOWN`, если провайдер не сообщил стоимость. Ledger не измеряет все HTTP retries или embeddings.

Logs/artifacts делают конкретные миссии наблюдаемыми. Однако полный owner workflow через обычный OpenCode interface не принят; REST/CLI runtime и проверенный MCP server не равны подтверждённому owner E2E.

## Основные нерешённые проблемы

1. Experimental transfer verifier исполняет generated code без достаточной host/network/process isolation — P0.
2. Experience reuse quality improvement не доказан; обе многоцелевые серии глобально невалидны.
3. Professional readback и numeric verification имеют перечисленные в Codex audit ограничения.
4. Production QA может пропускать topology/attribution/citation дефекты.
5. Реальный OpenCode MCP consumer и owner acceptance не подтверждены.
6. Generic MCP registry, Windows computer-use, image generation, cloud deployment, PostgreSQL production storage не реализованы как завершённые capabilities.
7. Полный offline suite имеет host prerequisites; переносимость на произвольном чистом хосте не доказана.
