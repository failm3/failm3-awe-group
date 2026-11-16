# AWE R1 authenticated delta

**Решение: пакет пригоден для ограниченной инженерной передачи как design/evidence handoff; implementation GO, compatibility PASS и production PASS не выданы.** Сохранить Mastra и существующих владельцев R0. Новый authenticated source audit подтверждает различие исторического E0/E1 runtime и описанного локального Mastra R0, а не устраняет его. Новая независимая проверка этого delta запрошена отдельно; её итог — в release review.

Дата: 2026-11-13 UTC. Автор: worker / ae5a2f34-4215-4e82-a92e-80ac8463df65. READ-ONLY GitHub/AWE. Не запускались AWE, установки, deployments, provider calls или платные тесты. Созданы только исследовательские файлы. Этот документ имеет приоритет над прежними утверждениями о недоступности GitHub и статусе review; baseline-final сохранён побайтно как историческая версия, а не переписан задним числом.

## 1. Authenticated access proof

Коннектор `github-9e374r`, account `GitHub — AWE Audit`, connection_id `90314ad7-bd99-4500-9e39-e39b39c3f254`, owner shared/project. `accounts` обнаружил connected-as failm3; schema discovery `show` и реальные `call --account workspace` выполнены. `get_the_authenticated_user` вернул login failm3, id 214712147, requestId `log_SAmLuF7vM_yz`. Доказательство: `source-evidence/identity.json`. Это не публичный web fetch. Credentials не извлекались.

`list_repositories_for_the_authenticated_user`, type=owner, sort default full_name, per_page=100: page1 шесть owner repos; page2 пуст. Это полный результат именно owner-filter для авторизованной identity, не обещание видимости всех организаций/collaborations. Repos: awe-group-observer (private), awe-group-runtime (public), awe-model-council (private), awe-opencode-recordings (private), nikita-sheremetyev-portfolio (private), nivict-ai-academy (public). Несвязанные private repos не читались.

Branch listing page1/per_page=100: academy 9, runtime 6, observer 1; меньше размера страницы. Все возвращённые names/SHAs сохранены в `*-branches.json`. Содержимое feature branches не исследовалось. Деревья main: academy 5021 entries, runtime 563, observer 141, recordings 4691; `truncated=false`. Branch list и recursive tree — metadata, не чтение каждого файла.

Pinned main:
- academy: `0373e9b756c78d9ed422c3201ce46b8e9ce86744`;
- runtime: `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda`;
- observer: `ad44f45552e8518e613bcb8ff48c4affe544fc0e`;
- recordings: `221a8cacacbee38a34e3171ba45d278b8dcae684` (tree/branches, не содержание recordings).

Все 27 успешно полученных файлов перечислены в `source-evidence/SOURCE-MANIFEST.json`: repository, branch, commit, path, blob SHA, byte size, SHA256, raw connector capture. Base64 decoded bytes проверены против Git blob hash и size; каждый blob сверён с pinned tree. Это fetch/integrity verification, не утверждение о полном security-review каждого байта. Full OC прочитан; по коду выполнена targeted static seam inspection. Exact line locators ниже относятся к сохранённым bytes. Raw connector responses включены для воспроизводимости.

## 2. Полный OpenCode audit и локальный R0

Файл `03 - Практика/05 - AWE GROUP/REPORTS/OPENCODE-R1-INDEPENDENT-ENGINEERING-AUDIT-2026-11-13.md`, 54131 bytes, 727 строк, получен через authenticated content call с academy commit pin. Он побайтно совпал с `baseline-final/evidence/opencode-audit.md`. Поэтому его содержательные выводы не новые; новой является authenticated provenance.

Audit — первичное свидетельство другого аудитора о локальном R0: source 73/73, evidence 55/55, сохранённые 22 suites; не наши тесты. Source manifest SHA256 d2562ef0a50a7d25e4da83dc01fe632720708192a756a4adf7ded77bce3680a7; evidence manifest 13c5b976452fce762f9be531483c99add814e0f43258cc0af6f2b2cd3caf3983. Его local HEAD 446adaea833b0ebade1a21fbda3f71118d19b0d6 с dirty tree не final release commit.

Observer README явно запрещает читать snapshot как rerun/source proof. Pinned LATEST содержит collection 2026-11-13T18:20:07.145644+00:00, local launch/runtime HEAD 29db82e7b00c25c96dbf035aef4b5e3a9ff3eff4, modified counts 281/15, opaque branch IDs. Это более поздняя telemetry, не доказательство, что это тот же frozen R0, и не разрешение заменить audit HEAD этим SHA. TAP MISSING, event schema unsupported, тестовые counts — наблюдения сохранённых артефактов. state.json и HISTORY содержимое не читалось; исходный код observer не найден в перечисленном main tree, только telemetry.

Нет `src/agents/mission-manager.ts`, `src/memory/index.ts`, `src/config/mcp.ts` или package-lock.json в полученных main trees academy/runtime. По этим exact paths это отрицательный inventory-факт, не доказательство отсутствия local R0 вообще. Current frozen source, lockfile, node_modules, browser revision, bwrap version и clean restore остаются НЕ ПРОВЕРЕНО. Recordings tree доступен; raw session contents намеренно не извлекались, чтобы не импортировать личные данные/секреты без нужды. Ошибочно предполагаемый `awe-group-recorder` вернул upstream 404; действительный repo называется awe-opencode-recordings. README.md там также 404; это отсутствие пути, не отказ доступа ко всему repo.

## 3. Версии: не смешивать три класса

**Прочитано в historical source:** runtime package.json version 0.2.0, E1/package.json 1.0.0; оба декларируют Node 24.21.0 / npm 11.19.0, .node-version 24.21.0. Production dependencies в этих двух manifests не объявлены. Это не версии исполняемой здесь среды и не версии R0. Ни installation, ни transitive resolution не проверялись.

`E1/contracts/schemas.mjs:2–3`: AWE_E1/1, awe.e1.contracts/1. `E1/infra/config.mjs:10–13` содержит собственные исторические source pins и LIVE_BLOCKERS; нельзя считать embedded SOURCE_COMMIT текущим repo HEAD. RT-02/runtime-lock.json декларирует Windows, Python 3.13.2, null executable hashes. Hermes source lock декларирует 0.22.2+2645.g7058601 / commit 7058601bf5cdc35502676a9b8aec0480e7e80127, Python 3.14, NOT_INSTALLED_IN_AWE, dependencies NOT_VALIDATED. Это разные профили/декларации, не совместимый единый installed stack. TOOLS-02 binary pins тоже null. Upstream Hermes bytes здесь не fetched.

**Только audit-reported local R0:** @mastra/core 1.82.0, @mastra/memory 1.41.0, @mastra/libsql 1.29.0, @mastra/mcp 2.8.0, @ai-sdk/openai 4.0.115, @playwright/test 1.49.1, Express 4.21.2, Zod 4.6.7. Непосредственно local package/lock/node_modules не читались. Playwright Test pin не равен MCP server pin; audit сообщает unpinned npx @playwright/mcp.

**Предыдущий upstream research:** source snapshots и version checks в baseline-final/primary и SOURCE-INDEX сохранены как отдельная evidence category. Их не выдаём за версии AWE или новый compatibility test. Новый market research не проводился.

## 4. Реальные historical seams и вывод для R1

| Прочитанный locator (runtime pinned SHA выше) | Наблюдение | Следствие и приёмка |
|---|---|---|
| E1/mission/authority.mjs:10–24; ingress.mjs:8–30,79–83 | WeakMap/context generation; OFFLINE_BOOTSTRAP_ONLY; CONTRACT_PREFLIGHT_ONLY; effects=0/execution_authorized=false | Полезный исторический контракт, не persistent R0 authority. T4a current persisted CAS/fence остаётся UNKNOWN. Нужны Q-A01–06, revoke/restart/issuer/profile. |
| awe/execution_security/authority.mjs:12–22,47–51,84–85 | issuer/subject generation, epoch/revision/fence и in-memory grant revocation | Не считать map durable. Нельзя закрыть M1 как implemented на основании сходства терминов. Найти current store/dispatch в T0. |
| awe/execution_security/native-authority-adapter.mjs:8,16,41–49 | explicit OFFLINE_TEST_VIEW_NOT_DURABLE, unconfigured DB port, replay NOT_IMPLEMENTED, dispatch false/DENY | Ни rename ни reuse adapter не дают native admission. Нужна отдельная проверка actual persisted boundary, не новый authority service. |
| awe/budget/memory-ledger.mjs:14–24,215,258,274–295; d09-quota-port.mjs:11–15 | mock ledger/checkpoint, simulated attempt, synthetic NOT_SENT proof; quota planning only / zero cap / DENY | Сохранить принцип одного ledger; не импортировать simulation в R0 accounting. T3 должен покрыть planner/head/QA/repair/child/embedding и UNKNOWN usage. |
| INTEGRATION-01/adapters/model-gateway.mjs:1–24 | recorded mock providers, MOCK_ONLY, maxAttempts=1, physical DENY | Не доказательство Router.Cheap tool/usage/cancel compatibility. Никаких live claims; probes остаются NOT_RUN. |
| awe/memory/boundary.mjs:35–105; service.mjs:4–17,73–112 | instance-local monotonic observations, disposable E0 cache; ACL/provenance before lexical ranking | Хороший design reference, не Mastra scoped memory текущего R0. Resource/thread не ACL. T6 wrong tenant, holdout leak, stale/tombstone/revoke нужны отдельно. |
| DATA-02/src/integration-ports.mjs:4–34 | trusted-host memory-only seam, readBindings/spec_ref recheck, no retry/reserve writer, restore HOLD | Сохранить no-second-owner принцип; current R0 equivalent пока не установлен. Не внедрять DATA-02 в cleanroom. |
| INTEGRATION-01/adapters/runtime.mjs:1–30 | process adapter + readback hash, synthetic lost ACK path, physical DENY | Integrity != domain correctness; T4 oracle и T5 analytics не закрываются существованием readback. |
| E1/infra/vault.mjs:10–66; config.mjs:13,35,85–92 | scoped handles/revoke, OFFLINE_PREFLIGHT, live blockers | Наличие vault API не подтверждает isolation/secrets protection. T2 canary test на отдельном разрешённом окружении обязателен. |

Эта таблица не cross-version transplant plan. Current symbol locations в baseline task cards происходят из OC report, а не прямого local source read. Сохранённые historical source нужны только для доказательства границы; получатель с clean-room запретом НЕ ДОЛЖЕН импортировать raw sources или запрещённые производные материалы. User разрешил этот read-only audit, но это не меняет policy получателя.

## 5. Сопоставление A–L и конкретные решения

A executive / B state: retain R0+Mastra; historical/current разделены выше. C reuse/framework: no rewrite, SDK feasibility только conditional, installed API verification в T0. D capability: existing Factory/TI/Manager; discovery не grants; qualification before admission. E learning: existing Memory, verified provenance и independent promotion, не отдельная memory authority. F integrations: allowlist adapter за existing boundary, Composio SDK runner не доказанный extra orchestrator; optional OAuth только по gap. G QA: immutable contract+oracles, producer не меняет expected; analytics-contract v1 остаётся frozen proposal. H versions: исправление источников версий выше. I economics: стоимость только из actual full ledger; тарифы/account terms UNKNOWN. J implementation: прежний DAG сохраняется T0→T1→T2/T3→T4→T4a→T5→T6→T7, T8/T9 optional. K risks: freeze/restore/isolation/issuer/revoke/SDK/browser/cost не закрыты authenticated доступом. L handoff: documentary ready не patch-ready; exact current mapping и permissions обязательны.

На ближайший patch decision: **не внедрять ничего сейчас**. Передать OpenCode ограничения и task cards; после отдельного разрешения T0 должен разрешить every current locator/command, затем T1 restore. Если equivalent уже есть — no-op с evidence. Для всех остальных — минимальный existing-owner delta, regression, независимая приёмка, rollback из baseline cards. В частности, T4a нельзя отложить после первого аналитического допуска.

Acceptance контракты и риски не изменены: baseline-final/IMPLEMENTATION-TASK-CARDS.md, ANALYTICS-CONTRACT.md, TEST-RUNBOOK.md. `COMMAND_PENDING_T0` остаётся blocking, хотя исторический package имеет test script: исторический `node E1/verification/offline.mjs` НЕ подходящий runner текущего R0. Не выполнять его в качестве substitute.

## 6. Closure и readiness

Независимый reviewer 8b27d2d9 прочитал прежний final ZIP SHA256 7511d7463c9fb9a04c2291f5d73b0980f407edceafda3e4422b187a8930b1a31 и дал documentary closure всех пяти: M1 T4a admission/revoke, M2 deterministic analytics, M3 Composio attribution, m1 blocking runbook mapping, m2 hashed source index. Полные файлы в independent-baseline-recheck. Это НЕ implementation closure и не автоматический PASS этого нового delta. Итог отдельного re-review будет вложен до выпуска.

Remaining limits: source identity final local R0; current dependencies/locks/environment; exact persisted admission/fence seam; clean restore; sandbox filesystem/network isolation; browser per-mission lifecycle; Router.Cheap usage/cancel; full costs; real domain QA/transfer; production workload. Все NOT_TESTED/UNKNOWN согласно категории, не скрытые задачи на позднее. Утверждения old baseline «GitHub недоступен» заменены текущим proof, но «current frozen R0 исходники недоступны» остаётся верным для этого исследования.
