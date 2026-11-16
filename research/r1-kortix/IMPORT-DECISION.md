# Решение о допустимости импорта (cleanroom)

- Источник: `/home/nox/awe-r1-inbox/AWE-ALL-MATERIALS-AUTHENTICATED-2026-11-13.zip`
- SHA-256 архива: `ea55a4eee47081a68a34cda9953481d02c41a7bedd80ec75e05e23afc0f5117a` — совпал с заявленным.
- Проверено: 2026-11-13, до извлечения.

## Импортировано — `authenticated-release/*` (59 файлов)

Исследовательские документы: FINAL-REPORT-A-L, annex BC/DE/F/G/M, IMPLEMENTATION-TASK-CARDS,
ANALYTICS-CONTRACT, TEST-RUNBOOK, RECONCILIATION, REVIEW-DISPOSITION, EVIDENCE-LEDGER,
VERIFICATION/MANIFEST/SOURCE-INDEX. Это рекомендации и evidence о внешних системах,
не исходный код AWE.

## НЕ импортировано

| Часть архива | Файлов | Причина |
|---|---|---|
| `previous-collection/` | 839 | Снимки исторических репозиториев и их evidence: `awe-group-runtime`, `awe-group-observer`, `nivict-ai-academy`. Импорт и повторное использование запрещены. |
| `authenticated-release/authenticated/source-evidence/content-*.json` | — | Дословные фрагменты содержимого тех же репозиториев. Не читались и не извлекались. |
| `authenticated-release/AWE-R1-AUTHENTICATED-2026-11-13.zip` | 1 | Вложенный архив; не распаковывался. |
| `__pycache__/*.pyc` | 1 | Бинарные артефакты. |

## Правило дальнейшей работы

Документы используются как гипотезы и требования к приёмке, а не как архитектура.
Любое утверждение из них проверяется на текущем коде R0. Ни один исторический
исходник не копируется, не читается и не переписывается в этот репозиторий.
