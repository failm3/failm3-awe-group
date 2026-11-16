# Реестр исследовательских доказательств

Все перечисленные каталоги находятся в `reports/`. Статусы взяты из сохранённых JSON и независимого аудита; исходные verdicts не переписывались.

## Контрольная точка

- Актуальный R2 source: commit `a2eae351f813befdae585e93e406973365920562`.
- Независимый Codex audit: `CODEX-R2-INDEPENDENT-AUDIT.md`, вердикт **REJECT**.
- Старый `r2-final-evidence.sha256`: **90/90** файлов доступны в snapshot; 45 восстановлены из `r2-ucl-integration` по точным SHA-256.
- Новый `../RELEASE-MANIFEST.sha256`: полный список файлов release, включая ранее untracked/ignored research evidence.

## Professional missions

| Прогон | Исходный `summary.json` | Сохранённое наблюдение |
|---|---|---|
| Ранний `03-27-59-584Z-557913` | FAIL | Research failed без final brief; analytics schema mismatch |
| Ранний `03-59-26-520Z-636780` | FAIL | Research paused; полнота дерева и QA не подтверждены |
| №1 `17-05-22-729Z-2757432` | FAIL | Два read-only failed children, нет требуемых авторских artifacts |
| №2 `18-47-03-020Z-3010790` | FAIL | Документы существуют; нет достаточных host intervals для attribution/overlap |
| №3 `19-44-16-972Z-3162655` | FAIL | Overlap есть, но нет общей parallel reservation; factual table rows без citations; analytics numeric parser issue задокументирован аудитом |
| №4 `20-01-22-654Z-3210017` | FAIL | Research failed; topology/attribution неприемлемы |
| №5 `20-21-29-437Z-3269230` | **FAIL** | Production QA PASS для двух миссий; исходный external summary FAIL по трём notation checks |

Для №5 отдельный `reverification.json` — **PASS**, SHA-256 исходного summary `c9278175b2d3e9dd12d0b31293dcbe20ee15b31b946962d8d4999677da24772a`; saved readback SHA-256 `c4c865d35de2afcaa69a4e43888a29417f8562a5a415fd53c721aef150abb171`. Это offline readback после format-only parser fixes, не новый live run и не замена исходного FAIL.

В каждом каталоге исследовать `summary.json`, `state/missions/`, `state/approvals/`, `state/candidate-evidence/`, `state/delegation-trees/`, `state/model-calls/`, `state/artifacts/` и итоговые документы. Два raw log в каждом professional run восстановлены из игнорируемых локальных evidence.

## Acquisition

Каталоги `r2-final-acquisition-*` содержат 21 последовательный run. Первые 20 имеют `passed:false`; их сохранены как failure history, а не отброшены.

Green run **`r2-final-acquisition-1794846721863`**: `passed:true`; неизвестная `observation-digest-v1` → acquire/replan → host qualification → invocation receipt → exact artifacts → QA. Summary содержит **13 boolean checks**, включая unknown monetary cost; исторический checkpoint называет это «12/12». Это один узкий Node procedure, не универсальная установка каталога.

Связанные offline regressions: `r2-qualified-*`, `r2-final-acquisition-focused/`, `r2-final-credential-regression/`.

## Experience reuse

| Материал | Протокол / результат |
|---|---|
| `r2-memory-transfer-1794781064860` | Ранняя контрольная пара; обе попытки pass, `transfer_observed=false`; передача без выигрыша correctness |
| `r2-final-transfer-1794798010397` | Frozen protocol: 40 pairs / 80 sequential arms / 240 s / 8 steps / no SDK retries. Рабочий snapshot сохраняет 80 attempts; 38 invalid, 36 wall-cap. 10 valid pairs: ON 6, OFF 3, b=3, c=0, p=0.25. **Глобально invalid** |
| `r2-experience-reuse-1794858271974` | Repeat: 20 pairs / 40 unique arms / 900 s / concurrency 4 / no retries или adaptive stopping. 39 completed + 1 failed model call. `t05-on` API error, `t18-off` empty terminal result при независимо валидном artifact. **Глобально invalid** |

Repeat paired analysis: 18 valid pairs, ON 12/18, OFF 11/18, b=2, c=1, exact McNemar `p=1`. Улучшение не доказано; равенство методов тоже не установлено. Не перезапускать завершённые серии ради желаемого результата.

`result.json`, `attempts.json`, `state/model-calls/`, artifacts и logs сохранены. Не запускать experimental verifier на недоверенных generated files: независимый аудит классифицировал host-code execution как P0.

## Offline regression и типизация

- `offline-after-run5-fixes.log`: 53 PASS, 0 FAIL (53 test suite files, не количество assertions).
- `r0-test-results/summary.json` и отдельные logs: текущий рабочий snapshot может отличаться от checkpoint HEAD, потому что regression outputs позднее перезаписывались; это указано в provenance.
- `professional-after-run5-validation.log`: professional validate-only references и controls.
- `r2-experience-reuse-preflight-1794858224019/`: repeat preflight evidence.
- Codex independently reproduced 53/53 и clean `tsc`; это не новый acceptance R2.

## R0 / R1 и более ранние этапы

- `../NOX-R0-FINAL-ENGINEERING-REPORT.md`, `r0-*` — offline closure и независимые R0 reviews.
- `R1-CHECKPOINT.md`, `R1-P0-ACCEPTANCE.md`, `r1-*` — finite P0 isolation, live analytics, local web practice, resource limits и failures.
- `E1-*`, `stage1-*`…`stage4-*` — исторические этапы; не актуальный R2 source.
- `ucl-*`, `UCL-*`, `R2-UCL-*` — UCL provenance, integration и negative evidence.
- `research/r1-kortix/` — reusable research import, не runtime.

## Локально сохранённое, но не опубликованное

- Полный Git bundle всех refs и byte-verified snapshots tracked/untracked/ignored файлов трёх worktree.
- `node_modules`, `dist`, browser binaries и OpenCode `.oc-isolated` cache/profile.
- Runtime `memory.db`, WAL/SHM и browser screenshots/page captures.
- Временные test workspaces, `.audit-cache` raw image, R0 packaging payloads.
- Полные скачанные academy vault, chat logs, archive parts и raw provenance.
- Три публично недоступных GitHub source не получены; они не находятся в локальном архиве под видом скачанных материалов.

## Пробелы и ограничения полноты

1. Нет содержимого трёх private/inaccessible repositories; их вклад неизвестен.
2. Публичный snapshot — не побайтовая копия всей машины: private profiles, credentials, chat logs, databases и archives намеренно исключены. Оригиналы сохранены локально, где были доступны.
3. Исторические absolute paths в artifacts/candidate receipts отражают WSL build environment; hash-bound run-5 readback может требовать исходный path или отдельно проверенный portable reader.
4. Provider monetary cost, HTTP transport retries, embeddings usage и текущий provider SLA неизвестны.
5. Нет подтверждения owner acceptance в обычном OpenCode UI; MCP server test не равен реальному client session.
6. Нет доказательства универсальности на произвольных задачах, текущей доступности всех external tools или production deployment.
7. Исходная Git history содержит 87 reachable commits и tag `r0-frozen-v5`; publication commit добавляет сборку поверх неё, не изменяя исторические commits.
8. Root LICENSE отсутствует; `package.json` заявляет ISC, внешние materials имеют собственные/неуказанные conditions.
9. Сканирование секретов — сигнатурное и контентное, но не математическое доказательство отсутствия секретов неизвестного формата.
10. R2 остаётся **NOT CONFIRMED**, R3 не начат.
