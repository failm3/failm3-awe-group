# R1 implementation task cards

Все карточки — DESIGN / NOT_RUN / NOT_AUTHORIZED_FOR_EXECUTION_BY_THIS_REPORT. Разработка только после отдельного допуска. Сначала existing-equivalent audit; обнаруженный эквивалент закрывается no-op с evidence. Никаких новых Head/Manager/Factory/TI/Memory/QA. Точные current symbols и release version — T0 discovery gate.

## Общий контракт приёмки

Evidence: source/tree/lock/environment digests, spec/oracle/fixture versions, reproducible command, actual exit/logs, independent effect observer, before/after state, output hashes, case-level outcomes, ограничения, полная usage/cost либо UNKNOWN. Producer не меняет oracle и не принимает собственную квалификацию. P/N ниже — positive/negative cases, не результаты.

Общий rollback: stop admission/dispatch, drain/cancel/join, preserve unknown intents, reconcile, restore только совместимые code/config/schema/tool/procedure/oracle pins, затем targeted regression. Отзыв сильнее pin. Compensation external effect отдельно разрешается.

## T0 — Current inventory и разрешённые границы
- Зависимости: нет. Existing owner: release/security; read-only, без изменений.
- Вход: разрешённый current frozen source, audit OC, scope policy. Недоступность не обходить.
- Delta: inventory commit/tree/dirty state, lock/node/OS/bwrap/browser/MCP/schema, entrypoint→effect call graph, test/evidence identity. Private secrets не включать.
- P: существующие symbols/версии и missing gaps подтверждены. N: historical HEAD и manifest hash не принимаются как final release SHA.
- Выход: release-inventory + permission boundary + no-op/gap map.
- Acceptance: каждый planned seam имеет current locator или UNKNOWN blocker. Stop: source prohibited/unavailable.
- Rollback: неприменим read-only. Source: E01–E06.

## T1 — Frozen restore и R0 parity
- Зависимость: T0. Owner: existing Git/release. Класс: настройка release, без смены ownership.
- Delta: sanitized immutable source/config/lock/test bundle, system/browser recipe и state schema; clean restore в отдельно разрешённой среде.
- P: restored bytes/locks/environment и прежний offline gate воспроизведены. N: missing dependency, manifest mismatch, incompatible state дают blocked.
- Выход: exact release identity, restore logs, full gate index и scope verdict.
- Acceptance: проверены восстановление и relevant offline tests, не только hashes. Никакой public push по этой карточке без отдельного разрешения.
- Rollback: исходный frozen snapshot, no external effects. Stop: restore incomplete. Evidence E02–E03.

## T2 — Минимальная безопасная execution boundary
- Зависимость: T1. Owner: current tools/Manager. Класс: существенная security доработка; отдельный adapter, не scheduler.
- Delta: выбрать проверяемый existing bwrap profile или isolated worker; mission-only writes, secrets вне mount, bounded network/process/resources, guarded export.
- P: разрешённый local read/write/output. N: synthetic host secret, чужая mission, symlink/TOCTOU/fd/proc/socket escape, egress redirect, daemon child, cancel/restart/late callback.
- Выход: threat model, pinned worker/config, independent observations и R0 regression.
- Acceptance: forbidden effect отсутствует по observer; descendants quiescent; unknown remote outcome честен. Не реальные секреты.
- Stop: любой escape или небезопасный fallback. Rollback: disable route + common rollback. E04, annex/F §5–8.

## T3 — Immutable requirements и полный ledger
- Зависимость: T1; проектирование fixtures параллельно T2. Owner: Prompt Master/Head/Manager/storage.
- Класс: существенная сквозная доработка; поля/имена адаптировать текущей schema.
- Delta: approved spec ref/hash + scope/exclusions/risks/criterion IDs через delegation/repair/resume/QA; durable calls/reservations/attempts для planner/head/executor/QA/repair/embeddings.
- P: один approved binding на всей цепочке; все fake-provider calls учтены. N: dropped exclusion, changed criterion, stale revision, duplicate callback, crash до finish, absent usage, fallback over budget.
- Выход: schema compatibility map, trace/evidence, ledger reconciliation.
- Acceptance: missing/tampered spec fail closed; missing usage UNKNOWN; restart не сбрасывает lifetime resources; no new billing service.
- Stop: silent old-state defaults/allTools; неполный call coverage. Rollback common с quarantine incompatible missions. E05/E08/E16.

## T4 — Квалифицировать existing domain QA
- Зависимости: T2+T3 для исполнения; corpus authoring раньше. Owner: QA/qa-gate.
- Класс: существенная доработка domain contracts; native core scorer substrate reuse.
- Delta: immutable snapshots, restricted verifier adapters, criterion coverage, PASS/FAIL/NOT_VERIFIED/BLOCKED distinction; qualified oracle access отдельно solver.
- P: good controls приняты. N: wrong value, false citation, hidden code defect, missing criterion, artifact injection, lost media/source, replaced same-name artifact отклонены.
- Выход: frozen rubric/corpus, confusion counts, false accept/reject/abstention, checker version receipts.
- Acceptance: все mandatory coverage присутствуют; критический known bad не принят; не BLOCKED на все good controls; пороги заранее risk-based, не постфактум.
- Stop: correlated self-grading/изменение oracle автором. Rollback verifier pin + revoke затронутой qualification. E07/E12, annex/G.

## T4a — Минимальный qualification/admission/revoke до первого допуска
- Зависимости: T4 и T0 persisted-seam mapping. Owner: существующие Manager/storage, QA и Factory; не новый registry/authority.
- Current persisted seam: **UNKNOWN / COMMAND_PENDING_T0**. T0 находит актуальную сущность, transaction/CAS primitive и callers; при отсутствии эквивалента минимальные поля добавляются в existing store. Пока atomicity не доказана, product admission запрещён.
- DESIGN delta: immutable capabilityVersion/digest, procedure/spec/profile/model/tools/environment digest; qualification id/revision/generation; lifecycle + availability; evidence/receipt refs; trusted issuer principal; scope/expiry/revalidation reason. Только независимый уполномоченный QA выпускает receipt, не solver. Issuer authority проверяется отдельно от подписи/имени.
- Admission атомарно читает live eligibility/generation, matching profile/scope, valid receipts, grants и ресурсы; сохраняет receipt с version+generation. Неизвестный профиль, issuer или отсутствующий receipt → DENY. Qualification-state допускает лишь ограниченную практику; provisional допускает только явно заданный low-risk scope после независимой приёмки, не всю профессию.
- Revoke атомарно увеличивает generation и выставляет deny/quarantine; effect dispatch и final acceptance проверяют актуальный generation. Проверка и локальный dispatch должны быть связаны существующим fence/ownership protocol, не разнесены незащищённым check-then-use. Remote effect, принятый до revoke, не обещается отменить: durable unknown/reconciliation.
- Restart перечитывает persisted authority; старый admission не восстанавливает eligible. Отзыв сильнее version pin. T6 расширяет provenance/retrieval, но не вводит базовый revoke впервые.
- P: правильный trusted receipt/profile допускает только утверждённый scope. N: absent receipt, wrong profile, forged/unauthorized issuer, revoke между admission и dispatch/acceptance, stale generation после restart — DENY/blocked без нового запрещённого эффекта.
- Выход: current seam/transaction map, immutable bindings, negative traces, independent state/effect observer.
- Acceptance: все Q-A01–Q-A06 из TEST-RUNBOOK.md выполнены в будущем; state transitions и fence/restart semantics доказаны. Сейчас **NOT_RUN**.
- Stop: нет atomic persisted path или попытка временного второго store. Rollback: stop admission, preserve history, revoke affected binding, common rollback.

## T5 — Один data capability end-to-end
- Зависимость: T4a. Owner: Factory/Head/current tools/QA.
- Класс: контент/настройка procedure плюс малый binding adapter только при gap.
- Delta: scope descriptive CSV analytics: dedupe, settled/refund, валюты раздельно, frozen ANALYTICS-CONTRACT.md v1, independently computed totals и owner deliverable.
- P: новый закрытый input, правильные totals/exclusions/единицы в final artifact. N: duplicate multiplication, mixed currency, pending included, missing→0, cached answer, превышение budget.
- Выход: capability/profile/spec binding, actual artifact, independent receipts, full attempts ledger, limitations.
- Acceptance: owner-oriented result на новых cases, не наличие procedure.md. T4a допускает provisional только после независимого QA и matching receipt в явно ограниченном scope; verified требует T6 transfer. Sample counts не production proof.
- Stop: tool/policy grant расширяется ради успеха. Rollback version/eligibility + preserve failed trials. annex/G §5 D3.

## T6 — Scoped learning, transfer и revoke
- Зависимость: T5. Owner: existing Memory/Factory/QA/storage.
- Класс: scoped wiring/ACL/qualification существенная доработка; не новая БД.
- Delta: versioned lesson, trusted scopes, dependency provenance, расширение уже введённых T4a qualification/CAS/generation, tombstone/cache/index reconciliation.
- P: M1 approved lesson → fresh M2 на иной задаче, сравнение baseline/candidate с равным profile/budget; сохранённый lesson используется по evidence. N: shared-resource holdout leak, wrong tenant, stale/revoked source, background cleanup failure, rollback resurrects grant.
- Выход: split/exposure ledger, case-level transfer outcomes, revocation/readback evidence.
- Acceptance: заявлено только реально измеренное улучшение; no improvement → no superiority claim; blind holdout не из публичного примера.
- Stop: contamination или self-promotion. Rollback deny affected versions/descendants, preserve evidence. E10–E12, annex/DE.

## T7 — Повтор loop и измерение команды/маршрута
- Зависимость: T6. Owner: те же компоненты.
- Класс: новые domain procedures/checkers, малые adapters; без архитектурного изменения.
- Delta: research closed-corpus, затем bounded codefix; paired single/team и model routing только при измеримом вопросе.
- P: новые domain oracles/held-out transfer; все costs включая merge/QA. N: invented compatibility, test rewrite, blind majority PASS, cheap metric with omitted failures.
- Выход: отдельная qualification каждого scope/profile; decision single vs team с counts/разбросом.
- Acceptance: каталог расширился без переписывания runtime; verified не перенесён по одному названию профессии. Если team не лучше — single.
- Stop: universal profession claim из узких fixtures. Rollback отдельного binding. annex/G §5 D1/D2, annex/M §5.

## T8 — Browser/MCP только при реальной необходимости
- Зависимости: T2+T3; не блокирует T5. Owner: existing MCPClient/browser/tools.
- Класс: pin настройка + mission lifecycle adapter; при singleton refactor существенная работа.
- Delta: exact package/integrity/browser image/protocol transport, qualified tool schema, bounded timeout/cancel и per-mission contexts/accounts.
- P: fixture browser workflow со scoped receipt/readback. N: cross cookies/storage/downloads, чужой account, progress flood, schema drift, cancel одного нарушает другого, lost ACK→blind repeat.
- Выход: binding manifest, two-mission evidence, errors/unknown outcome semantics.
- Acceptance: no network npx latest resolution during mission; server pin не берётся из test package. Live provider отдельно разрешается.
- Stop: SDK/protocol unknown at actual execution. Rollback pin/disable browser route, no broad fallback. E09/E14.

## T9 — Optional SDK/vendor gap
- Зависимость: T7 и доказанный gap. Owner: existing boundary.
- Класс: малый exporter/parser adapter либо существенный workflow integration; новая recovery authority отклоняется.
- Delta: ровно один из optional workflow, telemetry exporter, parser, managed OAuth, только по ADR с альтернативой no-op.
- P: measurable gap закрыт, current contracts preserved. N: second orchestrator, unmanaged retries, scopes leakage, unsupported schema/licence/price assumptions.
- Выход: exact pin/license/terms/TCO inputs, contract tests, reversible feature.
- Acceptance: no new paid commitment/cloud transfer без отдельного допуска; native/простая TS функция предпочтительны при эквивалентности.
- Stop: нет измеренного преимущества. Rollback common. E13–E15, annex/M/F.
