# Доступность первичных источников

Полный аудит OpenCode доступен локально (728 строк); прежние 22 MD и handoff также приложены. Текущие исходники AWE **недоступны**: повторное чтение документа не заменяет текущий source audit. Доступ к компьютеру не включался, forbidden cleanroom не читался. Полный upstream capture всех specialist claims не приложен и не объявляется проверенным выпускающим.

Машиночитаемый [SOURCE-INDEX.json](SOURCE-INDEX.json) содержит URL, pin, дату/ограничение capture time, SHA-256, available_here и originating session/path. Отсутствие сопоставления URL с файлом консервативно обозначено false; это не утверждение, что источник недоступен онлайн. SHA256SUMS включает все приложенные файлы. Проверка ссылок в verify_package.py называется **main-document links**, она не проверяет каждую внешнюю ссылку или внутренний path каждого annex.

## Что переполучено выпускающим

- Exact npm metadata: core 1.82.0, memory 1.41.0, libsql 1.29.0, mcp 2.8.0, Composio 0.10.6, Playwright MCP 0.0.85. Все шесть GET успешны, versions/license/engines подтверждены.
- SHA-512 tarball integrity core/memory/libsql совпали; сохранены выбранные source-map sources и types, не целые tarballs. Это не установка, git↔npm equivalence или runtime compatibility.
- Pinned Mastra memory source и semantic-recall docs на 6e8dfcb83facb0861ebefa4fee384429a113acf4 получены GET и прочитаны в блокирующих местах. Background cleanup/stale metadata подтверждены статически.
- Core source workflow run-ownership:14–58 и evals/run:503–524 прочитаны: generic unfenced writes, отдельные fencing primitives, coverage gap подтверждены статически.

## Приложения и происхождение

| Annex | Session | Исходный path | Raw upstream доступность |
|---|---|---|---|
| BC | f33e82e4-bc8e-4950-aa61-7f6463889f9a | /workspace/out/engineering-feasibility-B-C-H-I-J-K.md | OC/previous доступны; current AWE нет |
| DE | 463b5a08-3788-4efd-825f-d179001ffec4 | /workspace/out/D-E-capability-learning-contract.md | Выбранные memory sources здесь; остальные URL/locators в annex, captures не все |
| F | 8e857294-81f8-4fde-bcfe-50871d6c10de | /workspace/out/F-H-I-K-tool-intelligence-security.md | Exact metadata здесь; MCP docs/bwrap/registry здесь не переполучены, свидетельства специалиста/reviewer |
| G | 804fc879-59b1-4fd1-9b1c-8afc8ebbb9c3 | /workspace/out/G-professional-qa-demonstrators.md | OC доступен; WCAG/judge/Playwright docs raw не приложены |
| M | 33985002-8eec-4260-801b-ce2079c481b7 | /workspace/out/mastra-reuse-multiagent-HIJ.md | Выбранные package sources/types здесь; Skills/ToolSearch/observability не перепроверены полностью |

Все пять получены в draft ZIP из private Drive. Две sessions cp (draft/review) вернули session not found; обходов доступа не было. Исходный review сохранён без изменения в review/. Его данные о собственных upstream-проверках остаются атрибутированными, не нашими тестами. Исторические runtime sources и потенциально чувствительный raw evidence ZIP в final не включены; прежние исследования не становятся cleanroom-safe автоматически.
