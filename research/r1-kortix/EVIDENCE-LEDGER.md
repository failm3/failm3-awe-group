# Индекс доказательств AWE R1

Дата 2026-11-13. Это traceability ledger составителя, не новый аудит runtime. Все утверждения текущего AWE ниже класса D основаны на документе OpenCode; прямого current-source доступа нет. Указанные тесты другого аудитора не выполнены составителем.

## Первичные идентичности

- **OC / D:** [OpenCode independent audit](https://github.com/failm3/nivict-ai-academy/blob/28971e26aaf094560bf500d1d71e5e3671207e83/03%20-%20Практика/05%20-%20AWE%20GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md), docs commit `28971e26aaf094560bf500d1d71e5e3671207e83`. Локально [полный оригинал](evidence/opencode-audit.md), 728 строк. Строки OC относятся к оригиналу, не к текущему source.
- **K / prior research:** [22 MD](https://github.com/failm3/nivict-ai-academy/tree/c1a6b59c48fcb74527575dc91951f7e613d8c6de/03%20-%20Практика/05%20-%20AWE%20GROUP/RESEARCH/KORTIX-2026-11-13-ENTERPRISE-RESEARCH), publication `c1a6b59c48fcb74527575dc91951f7e613d8c6de`; [полный сводный оригинал](evidence/previous/awe-nox-final-report.md). Также приложен прежний handoff. Сохранение этих исследований не подтверждает их claims.
- **H / historical:** [runtime export](https://github.com/failm3/awe-group-runtime/tree/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda), `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda`. Не current Mastra; исходники не включены в итоговый архив.
- **U / upstream:** Mastra commit `6e8dfcb83facb0861ebefa4fee384429a113acf4`, проверен DE; отдельная проверка точных npm packages коллегой M не заново доказывает Git↔npm mapping. [core 1.82.0](https://registry.npmjs.org/@mastra/core/1.82.0), [memory 1.41.0](https://registry.npmjs.org/@mastra/memory/1.41.0), [libsql 1.29.0](https://registry.npmjs.org/@mastra/libsql/1.29.0), [mcp 2.8.0](https://registry.npmjs.org/@mastra/mcp/2.8.0). Package API/manifest — не AWE integration PASS.

## Claim ledger

| ID | Утверждение / решение | Класс, точный locator | Предел доказательства |
|---|---|---|---|
| E01 | Current scope и reported stack | D, OC L13–65,33–48 | Final release identity неизвестна; historical snapshot не current |
| E02 | R0 OFFLINE SCOPE VERIFIED/CLOSED | D, OC L68–124,718–728: manifest checks и пересчёт сохранённых suites | Не собственные новые regression/live/security tests; не production |
| E03 | HEAD не восстанавливает final dirty tree | D, OC L146–171; reported HEAD 446adaea833b0ebade1a21fbda3f71118d19b0d6 | Manifest не lock/browser/environment recipe; restore NOT_RUN |
| E04 | Shell profile недостаточен для FS isolation | D, OC L126–144; tools/index.ts:258–261,334–378 | Статическое свидетельство, exploit не запускался |
| E05 | Требования теряются на пути к Head/QA | D, OC L175–232,309–323; prompt-master.ts:56–87, head-agent.ts:104–129, qa-gate.ts:153–159,229–282 | Immutable binding — DESIGN; актуальные symbols T0 |
| E06 | Factory уже создаёт Mastra Agent, Manager существует | D, OC L211–247; specialists.ts:188, recursion.ts:277–288 | Не основание создавать вторых владельцев; capability qualification отсутствием доступа не опровергается |
| E07 | QA не имеет достаточного предметного evidence | D, OC L309–323; qa-agent.ts:29–108 | Будущие domain oracles — DESIGN, annex/G §3–6 |
| E08 | Delegate totals не полный cost ledger | D, OC L249–267; mission-manager.ts:2533–2559 | Все экономические оценки UNKNOWN до полного ledger |
| E09 | MCP singleton/unpinned npx; TI research отдельно от allTools | D, OC L277–295; config/mcp.ts:171–257; annex/F §2 | Server/browser/protocol actual pins UNKNOWN; mission isolation NOT_RUN |
| E10 | Memory wiring disabled/неполон | D, OC L297–307, memory/index.ts | Не считать dependency включённым learning loop |
| E11 | ACL, stale embedding metadata, background cleanup | U-SRC/P через annex/DE §10 M1/M4: memory/src/index.ts:480–512,631–649,789–835,1051–1139,1708–1722; semantic-recall.mdx:240–261, commit U | Немедленные tombstone/deny/reconciliation — DESIGN, AWE tests NOT_RUN |
| E12 | Atomic merge и scorer coverage требуют отдельных gates | U-SRC/P, annex/DE M1:1224–1294, M3 working-memory.mdx:237–314, M6 gates-and-verdicts.mdx:46–56, commit U | PG docs не гарантия LibSQL; notScorable не достаточная coverage |
| E13 | Native skills/scorers/workflow surfaces доступны | U-API/U-SRC коллеги, annex/M §4 и §11: exact core 1.82.0 .d.ts/sourcesContent; annex/DE M2 skill-search.ts:308–428 | API не wired AWE; generic ownership и отдельные fencing primitives различать |
| E14 | MCP cancellation и Playwright latest различаются по версиям | P/META коллеги, annex/F §6 и Sources: MCP 2025-11-25 / 2026-07-28 cancellation; registry latest snapshot 0.0.85 | Mutable latest не selected pin; actual negotiated transport неизвестен |
| E15 | Licenses/engines/peers уточнены, buy deferred | META, annex/M §3/11; annex/F §7/Sources; @composio/mastra 0.10.6 ISC, Node >=22.22.3 | Не full dependency/security/legal audit; hosted price UNKNOWN |
| E16 | Последовательный R1 и bounded capability | DESIGN: annex/BC, DE, F, G, M; итоговый report D–K и task cards | Не существующая реализация, не оценка сроков/готовности |
| E17 | OC не проверял прежние 22 MD | D, OC L498–532 | Нельзя считать этот draft независимо одобренным |
| E18 | Получение/целостность исследовательских материалов | TEST-FILE, VERIFICATION.json и SHA256SUMS | Hash доказывает сохранение байтов, не компетенцию/истинность |

## Подробные источники специалистов

- [BC](annex/BC.md): current assessment, ordering, security/recovery seams; session `f33e82e4-bc8e-4950-aa61-7f6463889f9a`.
- [DE](annex/DE.md): schemas, provenance, learning/holdout/revoke; session `463b5a08-3788-4efd-825f-d179001ffec4`.
- [F](annex/F.md): lifecycle, sandbox, supply chain, vendors/MCP; session `8e857294-81f8-4fde-bcfe-50871d6c10de`.
- [G](annex/G.md): domain QA и три demonstrator contracts; session `804fc879-59b1-4fd1-9b1c-8afc8ebbb9c3`.
- [M](annex/M.md): pinned package API/source inspections, teams/routing/workflows; session `33985002-8eec-4260-801b-ce2079c481b7`.

F/G содержат обозначенные исправления M3/M2; остальные отчёты коллег сохранены без редакции. Поэтому их локальные пути относятся к их исходным сессиям, не ко всем файлам этого архива. Источники онлайн и session/path позволяют разрешённое повторное получение; raw upstream evidence всех коллег не включено. Точный индекс доступности, URL/pins/digests и исходные session paths — SOURCE-AVAILABILITY.md; локальные первичные копии выпускающего — primary/. Несогласованности решены в RECONCILIATION.md, а не замолчаны.

## Получение и пределы

Попытки `sessions cp` вернули `session not found`; использованы уже разрешённые private Drive-копии тех же материалов. История попыток находится в логе составителя. Исходный evidence ZIP проверяется по inventory 42 records; прежние 22 опубликованных Git blobs проверены evidence-коллегой, не заново сетевым запросом составителя. Оба полных исходных отчёта прочитаны; прочие 22 MD переиспользованы как evidence corpus/предметные материалы, не заявляется новая построчная экспертиза каждого vendor claim.

Current source не предоставлен, computer access.mode=off; доступ не расширялся. Приватный raw ZIP и historical runtime source не включены. Старые MD могут содержать исторические сведения/пути: весь пакет **не cleanroom-safe по умолчанию**. Handoff описывает ограничения передачи.
