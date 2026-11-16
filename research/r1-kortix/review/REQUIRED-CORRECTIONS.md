# Обязательные правки AWE R1

**CHANGES REQUIRED.** Это список правок к исходному draft, не изменения AWE и не инженерное разрешение. Полные доказательства, границы проверки и локаторы — в `INDEPENDENT-REVIEW.md`.

## До final implementation handoff

- [ ] **M1 / major:** определить минимальный qualification/admission/revoke контракт до T5. Перенести binding/issuer/profile/version/generation/recheck в существующие компоненты T3/T4 или T4a; либо ограничить T5 qualification-only experiment без product admission до T6. Указать persisted seam как подтверждённый либо UNKNOWN/T0. Добавить будущие отрицательные кейсы absent receipt, wrong profile, revoke-after-admission, stale generation after restart. Не создавать второй registry/manager.
- [ ] **M2 / major:** заморозить schema и decision table первого CSV analytics scope. Определить exact/conflicting duplicate, missing ID, enum, integer/sign/range, empty group/input, missing settled amount, область BLOCKED и partial output. Для cents явно ограничить валюты USD/EUR или определить minor-unit scale. Эти решения — DESIGN, не обнаруженные факты. Reference calculator и независимый checker используют один контракт; holdout не публикуется.
- [ ] **M3 / major:** исправить old-new attribution Composio в R14 и annex/F. Прежний H уже содержит ISC adapter и Node >=22.22.3 (`H-BUILD-BUY-REUSE-MATRIX.md:68,121`). Нельзя называть это новой коррекцией всего прежнего пакета. Дать точный старый MIT claim, если он существует, и обозначить внутреннее расхождение; иначе убрать такое приписывание. Повторно проверить остальные строки reconciliation на точность attribution.
- [ ] **m1 / minor:** добавить test runbook template: case ID → fixture → runner/command → expected observer → evidence → owner. Для неизвестных команд `COMMAND_PENDING_T0`, обязательное заполнение до исполнения. Никаких выдуманных команд текущего runtime.
- [ ] **m2 / minor:** добавить source index для приложений: URL, pinned version/commit, capture date, digest, доступность в пакете, originating session/path. Называть structural link check `main-document links`; не выдавать отсутствующие upstream captures за приложенные.

## Передача исправленной редакции

- [ ] Пересчитать manifest/hash после правок.
- [ ] Приложить change log по M1–M3/m1–m2 и изменённые локаторы.
- [ ] Передать изменённые участки на ограниченный повторный review; не объявлять замечания закрытыми только по обещанию.
- [ ] Сохранить `application acceptance NOT_RUN`, `current-code feasibility conditional`, ограничения cleanroom и запрет импорта исторического кода.

## Проверено / не проверено

**Проверено:** полный draft A–L и пять annex, ledger/reconciliation/cards/handoff; полный документ OpenCode; целевые места прежних исследований; exact metadata шести npm пакетов; SHA-512 tarball integrity трёх Mastra пакетов; выбранные API/source участки; pinned memory source и docs; MCP cancellation page; структура/контрольные суммы draft. Проверка файлов и статическое чтение не являются runtime тестами.

**Не проверено:** актуальный AWE tree/lockfile и восстановимость release; application/live/security/regression/compatibility tests; все старые 22 MD построчно; все vendor claims и API исчерпывающе; полный dependency graph/terms/pricing; actual qualification/transfer/demo outcomes. Отдельные API, проверенные специалистами, остаются их атрибутированными свидетельствами.

Новые blocker для выпуска исследовательского документа не установлены. Для engineering GO сохраняются недоступность current tree/restore evidence, недоказанная shell isolation и NOT_RUN regression/compatibility. Редактирование текста их не закрывает.
