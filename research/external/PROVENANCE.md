# Происхождение дополнительных источников

Эти материалы добавлены для исследовательского контекста. Они не заменяют актуальный R2 runtime в корневом `src/`.

| Источник | Зафиксированный commit | Что включено | Статус |
|---|---|---|---|
| https://github.com/failm3/awe-group-runtime | `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda` | Полное публичное дерево default branch в `awe-group-runtime/` | Исторический reviewed E0/E1 export; не R2 и не E1 Pilot acceptance |
| https://github.com/failm3/nivict-ai-academy | `9b9122366a0be96303153930b9e9f8bbd10ed76c` | 276 выбранных `.md/.json/.jsonl/.csv/.txt` из `03 - Практика/05 - AWE GROUP` | Архитектура, research, decisions и audits; не актуальный runtime |
| https://github.com/failm3/awe-opencode-recordings | неизвестен | Ничего | Публичный API вернул 404; авторизованный доступ отсутствует |
| https://github.com/failm3/awe-group-observer | неизвестен | Ничего | Публичный API вернул 404; авторизованный доступ отсутствует |
| https://github.com/failm3/awe-model-council | неизвестен | Ничего | Публичный API вернул 404; авторизованный доступ отсутствует |

## Allowlist и исключения academy

Из academy исключены `CHAT-LOGS`, `CHAT-HANDOFFS`, `PROMPTS`, `UPLOADS`, archive chunks, raw-provenance, binary screenshots/archives, файлы с `GRANT`, `TELEGRAM`, `TRANSITION` в имени и весь остальной academy vault. Такой allowlist минимизирует публикацию частных диалогов, личных данных, credentials и непроверенных архивов. Полные публичные оригиналы остаются доступны по source URL; локальная загруженная копия сохранена вне release.

Из runtime исключений по типам не потребовалось: скачанное публичное дерево скопировано целиком. Оно содержит тестовые secret-like fixtures; при сканировании они классифицируются по контексту, а не автоматически считаются действующими ключами.

## Лицензии и повторное использование

GitHub metadata обоих доступных источников на момент сборки не сообщает license. Их включение в исследовательский snapshot не переназначает права и не означает blanket permission для производных работ. Проверяющий должен читать внутренние notices и связываться с правообладателем при необходимости reuse за пределами исследования.

## Локальные источники

Основной snapshot получен из трёх разрешённых worktree одной Git-истории:

- `r2-final-autonomy` at `a2eae351f813befdae585e93e406973365920562` — актуальные R2 source и рабочие evidence;
- `r2-ucl-integration` at `c42efdde4c17507d126c797e772f9500f73bce79` — 45 history files, отсутствующие в основном рабочем дереве;
- `r1/dev` at `bd3859a550a046c16454f44ddc2648c81318f14e` — инвентаризирован и сохранён в приватном архиве; его уникальные generated/ignored материалы не добавлялись в public snapshot вслепую.

45 восстановленных файлов выбраны строго по существующему `reports/r2-final-evidence.sha256`; перед копированием проверен SHA-256 каждого. Исторические evidence не редактировались.
