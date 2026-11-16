# Реестр согласования выводов

Решения выпускающего для final research 2026-11-13. Это не независимый повторный audit verdict. Колонка competing claim не означает, что все эти ошибки были утверждениями прежнего K: строки без точного старого locator — проверяемые гипотезы/риски, а не установленный спор с K. OC — evidence/opencode-audit.md; K — evidence/previous/awe-nox-final-report.md. Source commits и классы — EVIDENCE-LEDGER.md.

| ID | Прежнее / competing claim | Более сильное или уточняющее evidence | Принятое решение | Что остаётся неизвестным |
|---|---|---|---|---|
| R01 | K final independent verdict unknown | OC L68–116,146–171 | R0 documented OFFLINE SCOPE VERIFIED/CLOSED | Production, owner GO, clean restore |
| R02 | 22/22 как признак общей готовности | OC прямо говорит re-count saved summary, doubles, no new regression | Не суммировать suites/core/integrated в надёжность; не собственный тест | External providers и профессиональный результат |
| R03 | OC как независимая проверка 22 MD | OC L9,498–532 не читал их по cleanroom policy | Независимый аудит AWE, не рецензия прежнего пакета | Review draft получен; редакционные исправления в REVIEW-DISPOSITION.md, нового независимого PASS нет |
| R04 | Historical export может описывать current | K editorial уже разделяет; OC current TS отличается | H применим только к d5e9d857… | Current cleanroom недоступен |
| R05 | Существующие Head/Manager нуждаются в замене ради native-first | OC допускает дальнейшее сокращение custom code; M проверил SDK | Preserve ownership; migration deferred | Contract parity будущего child workflow |
| R06 | Сначала tool catalog/Skills wiring | BC/F/G указывают safety/spec/QA blockers | Restore и execution safety gates раньше новых эффектов; fixtures параллельно | Точный минимальный diff |
| R07 | Memory object ≈ working memory loop | OC L297–307 | Wiring/scopes прежде обучения; не второй Memory | Current caller signatures/ACL |
| R08 | Thread/resource scopes обеспечивают business ACL | DE source M1/M4 | Trusted application ACL до retrieval + cache/load checks | Local integration tests |
| R09 | Change thread metadata/deleteThread немедленно удаляет доступ/векторы | DE source stale embeddings + background cleanup | Immediate tombstone/deny, reconciliation | Очистка всех derived/cached copies |
| R10 | Atomic working-memory merge готов в LibSQL | DE upstream storage capability; docs PG | Не обещать; проверить actual adapter, сериализовать/CAS по current store при gap | Multi-process runtime behavior |
| R11 | Высокий average scorer означает complete PASS | DE notScorable исключён из aggregate | Mandatory coverage gate отдельно; unscored blocked | Domain calibration |
| R12 | QA native eval API unknown | G оставлял package/API gate; M проверил core 1.82.0 .d.ts/source | API доступен в core; отдельный @mastra/evals не обязательный выбор | AWE compile/wiring/runtime остаётся NOT_RUN |
| R13 | Mastra generic workflow либо без fencing вообще, либо готовая замена Manager | M run-ownership.ts:14–35 + storage/run-fencing.ts и LibSQL supportsRunFencing | Primitives существуют; generic writes и side effects не автоматически fenced | Adapter-specific parity |
| R14 | CONFIRMED: прежний H-BUILD-BUY-REUSE-MATRIX.md:68,121 уже указывал ISC adapter и Node >=22.22.3 | Exact npm @composio/mastra 0.10.6 повторно проверен выпускающим; primary/composio_mastra.json | Подтверждение/нормализация прежнего H, не новая коррекция K; ошибочная MIT-attribution снята | Hosted quote/terms, exact full graph |
| R15 | MCP 2025-11-25 current universal cancellation | F docs 2026-07-28 transport-specific changes | Pin negotiated protocol/transport; не автоматический upgrade | Actual client/server protocol |
| R16 | @playwright/test 1.49.1 или latest MCP достаточный pin | OC unpinned npx; F latest 0.0.85 alpha deps | Inventory фактической квалифицированной связки; latest не recommendation | Browser revision/OS/context isolation |
| R17 | Обязательны три первых одновременных внедрения | G предлагает три demonstrator contracts; BC data first | Последовательно data → research/code; один общий loop | Измеренная квалификация каждого |
| R18 | Все промежуточные outputs обязательно документы | M context/result envelope; domain criterion | Typed evidence достаточно; final format задаётся spec | Никакой document-count competence |
| R19 | Краткий adapter = малая работа на безопасность | BC isolation/state/recovery | Класс труда определяется semantics; сквозные изменения существенны | Effort/time/cost не оценены |
| R20 | Старые defects закрыты навсегда либо всё ещё открыты | OC позднее closure | Regression categories сохранить, current FAIL только по current counterexample | Фактический повтор после будущих изменений |

Общие запреты: не расширять доступ ради выяснения unknown; не импортировать historical code в запрещённый cleanroom; не выдавать разрешение на эффекты из технического PASS; no-op предпочтительнее дублирования существующей реализации.
