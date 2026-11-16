# Runbook будущей приёмки

**DESIGN / NOT_RUN.** Current AWE source и test runner недоступны. Ни одна команда runtime не выдумана. `COMMAND_PENDING_T0` — блокирующий placeholder, не shell-команда. OpenCode в T0 обязан заполнить actual repo path/symbol, fixture path+digest, runner/version, exact command, environment и независимого владельца oracle; до этого сценарий не исполняется и карточка не patch-ready. Изменение fixture/oracle после запуска требует новой версии, не подгонки expected.

Общий evidence envelope: case_id, source/tree/lock/environment, approved spec и contract digest, fixture/oracle/model/tool/procedure pins, actual command/exit/stdout/stderr, before/after state и independent observer output, expected/observed/verdict, usage/cost или UNKNOWN, attempts/limits, defects и ограничения. Все строки ниже имеют runner/command=`COMMAND_PENDING_T0` и статус NOT_RUN.

| Case ID → task | Fixture | Expected observer / verdict | Evidence | Owner заполнения / независимой приёмки |
|---|---|---|---|---|
| R-01 → T0/T1 | Разрешённый frozen bundle + missing-lock variant | Restore parity; отсутствующий lock BLOCKED | Inventory, restore logs, R0 gate index | Release engineer / independent reviewer |
| S-01 → T2 | Synthetic secret, чужая mission, symlink/fd/proc/socket | Нет forbidden read/write/effect | Worker policy + independent host-side canary observer | Security engineer / security reviewer |
| S-02 → T2 | Child daemon, cancel/restart/late callback | Descendants quiescent; revoked callback не принят | Process/effect/state timeline | Manager engineer / security reviewer |
| C-01 → T3 | Marker spec/exclusions, stale revision/tamper | Везде одинаковый binding; tamper fail closed | Plan/child/repair/resume/QA traces | Manager engineer / QA |
| C-02 → T3 | Fake provider всех phases, crash/duplicate callback | Полный ledger без double count; unknown usage не 0 | Calls/reservations/reconciliation | Storage engineer / QA |
| Q-01 → T4 | Good и seeded-bad domain corpus | Mandatory coverage; critical bad не принят, good controls проходят | Confusion table + case outcomes | Domain curator / independent evaluator |
| Q-A01 → T4a | Trusted matching receipt/profile | Допуск только в утверждённом scope | Stored admission/state snapshot | Manager/storage engineer / QA authority |
| Q-A02 → T4a | Absent receipt | DENY до effect | Independent effect log пуст | Manager/storage engineer / QA authority |
| Q-A03 → T4a | Wrong profile/version | DENY, нет fallback widening | Profile/admission log | Manager/storage engineer / QA authority |
| Q-A04 → T4a | Forged/unauthorized issuer | DENY даже при корректной форме | Authority lookup + receipt decision | Security engineer / QA authority |
| Q-A05 → T4a | Revoke после admission, до dispatch/acceptance | Старый generation запрещён; remote pre-revoke outcome reconciled | Atomic/fence traces + observer | Manager/storage engineer / independent reviewer |
| Q-A06 → T4a | Restart со stale generation | Старый receipt не возрождает grant | Persisted state before/after restart | Manager/storage engineer / independent reviewer |
| A-01 → T5 | Публичный набор ANALYTICS-CONTRACT | USD 14000/EUR 7000, duplicate=1, pending USD 9000 | Raw input + independent exact metrics | Data curator / независимый data checker |
| A-02 → T5 | Exact/conflicting duplicates по каждому полю | Exact unchanged; любой conflict BLOCKED всей миссии | Case-level errors; отсутствие partial totals | Data curator / data checker |
| A-03 → T5 | Missing ID, invalid enums/sign/range/missing amounts | BLOCKED_INPUT; no totals | Schema decision table coverage | Data curator / data checker |
| A-04 → T5 | Header-only, пустая группа, negative net, large exact sum | Значения/flags по contract, exact strings | Independent calculator + report readback | Data curator / data checker |
| A-05 → T5 | Frozen закрытый набор и seeded wrong solver | Не cached answer; верные outcomes и rejected mutants | Curator-sealed expected + independent results | Curator / QA; solver не видит expected |
| L-01 → T6 | Practice/holdout/transfer разделены по provenance | Fresh-context transfer с равным budget/profile, no contamination | Exposure ledger и paired outcomes | Memory engineer / independent curator |
| L-02 → T6 | Revoked source, stale cache, cleanup failure, wrong tenant | Immediate deny; derived qualification revoked; reconciliation проверена | ACL/retrieval/index readback | Memory engineer / security reviewer |
| D-01 → T7 | G/D1 code и G/D2 closed-corpus cases | Exact money и supported claims, no fabricated compatibility | Independent oracle + output render | Domain owner / независимый QA |
| M-01 → T7 | Paired single/team и model routes | Полная стоимость, quality/latency counts; нет gain → single | Все attempts, merge/QA usage | Experiment curator / independent analyst |
| B-01 → T8 | Две browser missions, cookies/downloads, cancel, lost ACK | No cross-state; один cancel не рушит другой; no blind retry | Browser/provider readback | Tool engineer / security reviewer |
| V-01 → T9 | Один измеренный vendor gap, drift/retry faults | Existing R0 contracts сохранены; иначе не подключать | Pin/terms/contract regression | Tool engineer / independent reviewer |

После каждого будущего patch: relevant R0 regression, включая revoke/fence, immutable artifacts, repair isolation, abort fallback, child signal, crash gap, empty grants и lifetime budget. Точный mapping старых suites берётся из разрешённого current evidence в T0; нельзя заменить его произвольно названным `pnpm test`. Эти функции-владельцы — существующие ответственности, а не новые агенты/менеджеры.
