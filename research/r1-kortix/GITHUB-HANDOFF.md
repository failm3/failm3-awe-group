# AWE R1 OpenCode handoff

**Статус: FINAL RESEARCH с исправлениями независимого review draft; editorial recheck, не независимый повторный PASS. Не запускать разработку, публикацию, deployment, live API, покупку, установку или изменение доступа на основании этого файла. GitHub-публикация не выполнена и не разрешена этим handoff.**

## 1. Допустимое использование

Получатель сначала проверяет свою cleanroom policy. Полный архив содержит прежние исследования, исторические сведения и ссылки; отсутствие raw source не делает его автоматически допустимым. Если policy запрещает прежний Kortix package, нельзя импортировать его, делать пересказ запрещённого source или использовать этот handoff для обхода. При недоступности допустимого источника фиксировать UNKNOWN. Отдельный policy-compatible brief допускается только в пределах уже разрешённого содержания; сам этот файл не разрешает передачу.

Не использовать historical runtime d5e9d857… как current baseline. Reported HEAD 446adaea… не final frozen release. Current tree/locks/Node/browser/MCP/bwrap/schema остаются T0 discovery gates.

## 2. Инженерное решение

Сохранить Head/Mission Manager/Factory/TI/Memory/QA и доказанный R0. Не создавать второй orchestrator, catalogue owner, memory service или eval authority. Масштабировать каталог контрактами; выполнение ограничивать ресурсами и полномочиями. Native Mastra API сокращают собственный код, но не заменяют domain oracle, ACL, effect authorization и recovery.

Принять документальное R0 OFFLINE SCOPE VERIFIED/CLOSED, не production PASS. Предыдущие D1–D9 — regression categories, не автоматически текущие FAIL. OpenCode не читал прежние 22 MD, следовательно не подтверждал их выводы.

Первый результат R1 — bounded local CSV analytics с независимыми числовыми oracle, новой задачей и измеренным переносом; не новый файл Skill сам по себе. Research и bounded codefix идут тем же loop позднее. Отдельная разработка разрешается владельцем вне этого исследования.

## 3. Что аудитировать сейчас без реализации

1. Проверить claim↔evidence в EVIDENCE-LEDGER.md: D не U-SRC и не TEST.
2. Проверить решения RECONCILIATION.md, особенно R0, native evals, fencing, stale memory metadata и cleanroom.
3. Проверить разделы D–G: immutable requirements, authority/ACL, qualification/holdout/transfer/revoke, независимость QA.
4. Проверить H/I на выдуманные версии, цену, совместимость и скрытый second owner.
5. Проверить DAG и каждую task card: достаточны ли positive/negative acceptance и rollback; нет ли исполнения до safety.
6. Выдать finding с severity, source locator, counterexample, affected claim и минимальной correction. Недоступность current source не закрывать предположением.

Audit verdict отдельно для: research consistency, source support, feasibility, safety и release readiness. Research PASS не engineering GO. Фиксировать собственные выполненные действия; не присваивать чужие тесты.

## 4. Будущий bounded implementation contract

После отдельного допуска: T0 inventory → T1 restore/R0 parity → T2 execution isolation + T3 spec/ledger → T4 calibrated domain QA → T4a minimal qualification/admission/revoke → T5 analytics → T6 transfer/provenance → T7 другие scopes. T8 browser и T9 optional vendor/workflow только при gap. Подробности — IMPLEMENTATION-TASK-CARDS.md; имена сущностей там логические, не новые mandatory tables.

Каждый patch: найти current existing equivalent → no-op если уже есть → минимальный diff → migration/rollback compatibility → positive + negative/fault tests → relevant R0 regression → независимая приёмка. Producer не меняет oracle ради PASS и не выпускает себе qualification.

Обязательные инварианты: [] deny-all; revoke сильнее pins; lifetime budget не сбрасывается restart; missing usage UNKNOWN; retries разных слоёв общие; timeout после dispatch не failure-before-effect; cancel не quiescence; remote unknown требует reconcile; compensation отдельно разрешается; capability text не grants.

Acceptance evidence: exact source/tree/lock/environment identity, spec/procedure/model/tool/oracle/data digests, actual commands/logs/exit, per-case expectations/outcomes, independent observer, full usage либо UNKNOWN, limitations. Ни хеш документа, ни число tests, ни agreement моделей не профессиональная приёмка.

## 5. Карта пакета

- FINAL-REPORT-A-L.md — основной читаемый синтез.
- EVIDENCE-LEDGER.md — E01–E18, source versions/locators/ограничения.
- RECONCILIATION.md — R01–R20 и принятые решения.
- IMPLEMENTATION-TASK-CARDS.md — T0–T9 с acceptance/rollback.
- annex/ — полные specialist reports; F/G содержат явно обозначенные редакционные коррекции M3/M2.
- ANALYTICS-CONTRACT.md / TEST-RUNBOOK.md — frozen proposal contract и mapping будущих сценариев; команды COMMAND_PENDING_T0 не исполнять.
- SOURCE-AVAILABILITY.md / REVIEW-DISPOSITION.md — доступность источников и судьба замечаний.
- evidence/ — оригиналы OC и предыдущих исследований; ограниченный импорт согласно policy.
- VERIFICATION.json / SHA256SUMS — только проверки файлов, не AWE.

Выпускающий: worker, session `ae5a2f34-4215-4e82-a92e-80ac8463df65`, `/workspace/out/package/`. Архив `/workspace/out/AWE-R1-FINAL-2026-11-13.zip`. Для разрешённого копирования: `kortix sessions cp <session>:<path> <destination>`. Если команда недоступна, разрешённая private Drive-копия у владельца. Независимый review исходного draft — CHANGES REQUIRED; проверка исправлений выпускающим не подменяет независимый повторный verdict. Research-complete не patch-ready: T0 должен разрешить все current symbols и команды до инженерного исполнения.
