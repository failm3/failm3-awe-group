# AWE GROUP — отчёт о сборке исследовательского репозитория

Дата сборки: 2026-11-17. Назначение: независимое исследование Codex и Fable 5.2. Это сборка AS-IS evidence, **не принятие R2, не запуск R3 и не новый платный эксперимент**.

## 1. Итог

| Область | Статус |
|---|---|
| Единая точка входа | Готово: `PROJECT-INDEX.md`, ссылка также добавлена в начало `README.md` |
| Текущий Nox / R2 source | Включён из `a2eae351f813befdae585e93e406973365920562` |
| Архитектура AS-IS | `docs/ARCHITECTURE-AS-IS.md` |
| R0/R1/R2, UCL, tools, models, configs, QA, decisions | Включены; карта — `reports/RESEARCH-EVIDENCE-INDEX.md` |
| Исходные FAIL и последующие PASS | Сохранены раздельно, без переписывания verdicts |
| Исторический evidence manifest | **90/90**, отсутствующих и hash mismatch нет |
| Приватный backup | **PASS**: три worktree, 96 853 файла; полный Git bundle |
| Сканирование текста, архивов, SQLite, credentials/personal data/licensing | Выполнено; результаты в `reports/research-publication-security/` |
| SHA-256 release snapshot | **PASS**: 8 309 entries + manifest; чистая распаковка архива подтверждена |
| Локальные Git commits | **PASS**: audit descendant и отдельный однокоммитный root для публикации; все 8 310 blobs сверены |
| Чистое восстановление и offline checks | Результаты и host-prerequisite ограничения зафиксированы в разделе 7 и `reports/research-publication-security/offline-checks.json` |
| GitHub `failm3/awe-group` | **НЕ ОПУБЛИКОВАНО**: API 404, нет `gh`, credential helper или token environment |
| R2 / R3 | **R2 REJECT / NOT CONFIRMED; R3 STOPPED** |

Публикация не симулируется. До появления авторизованного GitHub-доступа нельзя честно подтвердить remote readback, публичные URL и их содержимое.

## 2. Источники и защита оригиналов

Сборка выполнена из копий. Исходные worktree не использовались как редактируемый release и не очищались.

### Приватный защищённый архив

Локальный `.research-backup/` содержит tracked, untracked и ignored материалы, включая Git metadata, зависимости, runtime profiles, базы и исходные evidence:

| Worktree | HEAD | Файлов, SHA-256 source == backup |
|---|---|---:|
| `r2-final-autonomy` | `a2eae351f813befdae585e93e406973365920562` | 28 320 |
| `r2-ucl-integration` | `c42efdde4c17507d126c797e772f9500f73bce79` | 21 367 |
| `r1-dev` | `bd3859a550a046c16454f44ddc2648c81318f14e` | 47 166 |
| **Итого** |  | **96 853** |

Git bundle: `.research-backup/git/awe-group-all-refs.bundle`, 11 refs, полная история, `git bundle verify` PASS. SHA-256: `5a4314e3083266cd3f4c2460ef451774d7f3c475332e301b625f11e43c199d16`; размер 11 003 090 bytes. Backup permissions: directory 0700, checksums/bundle 0600. Девять records в `BACKUP-CHECKSUMS.sha256` повторно проверены.

Первый backup на tmpfs завершился `No space left on device`; копия была восстановлена на project disk. При read-only SQLite inventory появились WAL/SHM и изменился служебный R1 `.git/index`; они повторно скопированы и учтены в финальных manifests. Временная 2-ГБ duplicate на tmpfs удалена только после успешной проверки основного backup.

### Состав public snapshot

В snapshot входят текущие `src/`, `scripts/`, `package.json`, lockfile, `tsconfig.json`, `opencode.json`, `README.md`, `data/`, `docs/`, `ti-service/`, исследовательский `research/`, 7 238 файлов в `reports/` и pinned supplementary sources. Старый `reports/r2-final-evidence.sha256` восстановлен полностью: 45 отсутствовавших файлов взяты из sibling worktree только после совпадения указанного SHA-256.

Промежуточная сборка ошибочно применяла общий exclude `artifacts/` и потеряла `reports/**/state/artifacts`. Дефект обнаружен именно run-5 readback и исправлен до финального снимка: правило сужено до root `/artifacts/`; все 2 120 допустимых текстовых mission-artifact файлов восстановлены из primary source и совпадают по SHA-256. Четыре исключённых файла — только R1 screenshots. Воспроизводимые правила исключений и финальная проверка: `scripts/research-release-exclude.txt` и `scripts/verify-research-snapshot.py`; redaction/external acquisition выполняются отдельно и фиксируются в transformation registries.

Финальный snapshot содержит 8 310 файлов; 7 238 из них — в `reports/`. Итоговые byte hashes определяются `RELEASE-MANIFEST.sha256`; количество файлов не используется как мера качества продукта.

## 3. Дополнительные GitHub-источники

| Репозиторий | Фактический результат |
|---|---|
| https://github.com/failm3/awe-group-runtime | Полное публичное дерево at `d5e9d857dbdeb8f31f9a798b10b5af4af639dbda`; 466 файлов в `research/external/awe-group-runtime/` |
| https://github.com/failm3/nivict-ai-academy | 276 выбранных текстовых AWE materials at `9b9122366a0be96303153930b9e9f8bbd10ed76c`; allowlist и исключения в `research/external/PROVENANCE.md` |
| https://github.com/failm3/awe-opencode-recordings | Public API 404; содержимое не получено |
| https://github.com/failm3/awe-group-observer | Public API 404; содержимое не получено |
| https://github.com/failm3/awe-model-council | Public API 404; содержимое не получено |

E0/E1 runtime и academy materials — supplementary history, **не текущий R2**. Приватная видимость репозиториев не менялась.

## 4. Что опубликовано и что остаётся локально

### Включено

- Все семь professional runs, включая два ранних и runs №1–5; mission state, candidates, QA, artifacts, model-call ledgers, recovered logs.
- 21 acquisition run: 20 FAIL и один green `1794846721863`; 13 boolean checks в green summary.
- Frozen transfer: 80 attempts, исходный invalid result, tracked/untracked continuation evidence.
- Repeat experience reuse: 40 attempts, один failed model call, invalid/negative analysis.
- UCL source/delivery evidence и две byte-identical metadata-only SQLite copies.
- R0/R1 reports, test results, decision history, QA/audits, Kortix research provenance.
- Текущая client/model configuration без credential values; provider cost остаётся UNKNOWN.

### Не включено, но сохранено локально, где доступно

- `node_modules`, `dist`, Chromium/browser binaries, OpenCode `.oc-isolated` profiles/caches.
- Runtime `memory.db`, WAL/SHM, browser page captures/screenshots, private working data.
- `.audit-cache`, временные test workspaces, R0 packaging payloads.
- Полный academy vault, chat logs, prompts, uploads, archive parts/raw provenance; в public snapshot выбраны только нужные текстовые materials.
- Содержимое трёх private/inaccessible GitHub repositories — оно не получено и поэтому не находится в backup под видом приобретённого.

Это намеренная безопасная копия, не побайтовый образ всей машины. Исключение не означает удаление оригинала.

## 5. Безопасность, личные данные и лицензии

### Text/credentials

Финальный scan охватывает каждый release file. 2 928 JSON валидны; четыре `.json` намеренно невалидны как acquisition negative controls и сохранены без исправлений. Найден один private-key signature: синтетический negative-control в `research/external/awe-group-runtime/tests/execution_security/isolation.test.mjs`, не действующий credential. Остальные непомеченные assignment findings при контекстной проверке оказались synthetic test values, grant fixtures или non-secret booleans. Сами matched values не публикуются в scan report.

В release нет `.env`, PEM/key/p12/pfx, working DB/WAL/SHM, архивов, `node_modules`, nested `.git`, OpenCode profile, chat-log/upload/prompt directories или symlinks. Это сигнатурная и контентная проверка, не математическое доказательство отсутствия неизвестных форматов секретов.

### Personal data и safe copies

В четырёх academy validation JSON найдены 302 Gmail occurrences, соответствующие 23 адресам. Только в public copy они заменены стабильными `redacted-contact-NN@example.invalid`; JSON остаётся валидным. Исходный и safe-copy SHA-256 каждого файла, а также число замен записаны в `SAFE-COPY-TRANSFORMATIONS.json`. Исходные hashes повторно сверены с pinned upstream. Оригиналы сохранены локально; остальные email occurrences относятся к public metadata/source corpora/test fixtures.

Также удалены семь temporary transpiler/test-cache directories и 117 пустых `.oc-isolated/cache` directory trees из восстановленных mission artifacts; во вторых не было ни файлов, ни symlinks. Это не historical R2 evidence; originals сохранены в private backup.

### Archives

Три доступных source archives просканированы потоково, без выполнения:

| Archive | Members | SHA-256 |
|---|---:|---|
| runtime source tar.gz | 466 | `d02c0ec77f8d122fba3d071576ff992238555d03685cd358eb1c6d463f7c285a` |
| academy source tar.gz | 5 122 | `80e48ff8548f1a2d86e6cca7e0c2c25f978b65aad358c9cf52b4c0b1d497cde5` |
| academy audit ZIP | 1 160 | `543a6be3e5207547c76808aa0b09a7a140c34b3636fac3f2d2bd6df1357be0f3` |

Unsafe member paths не найдены. Полные archives/chunks не включены в public snapshot. Четыре R1 backup archives находятся только в защищённом локальном backup; их byte hashes входят в private backup manifests.

### SQLite

`data/db/ucl.sqlite` и `reports/ucl-source/delivery/data/db/ucl.sqlite` byte-identical, SHA-256 `ef2bee5e689d484b86c2dbff0138347cb5f6e1a5f9a4dcd45c58aef51e39e1be`, `integrity_check=ok`. 4 466 canonical `capability` records, 4 504 `source_record`, qualification table пуста. UCL metadata-only: все UNVETTED, `installed=UNKNOWN`, нет execution authority.

### Licensing

Root `package.json` заявляет ISC, но отдельный root LICENSE в checkpoint отсутствует. GitHub metadata двух upstream snapshots не сообщает license. Сторонние dependencies, research, catalogs и external sources сохраняют исходные права; исследовательское включение не является blanket reuse grant.

## 6. Целостность verdicts и evidence

- Codex independent audit: **REJECT**. Наличие 53/53 suites и clean typecheck не меняет acceptance.
- Run 5 original `summary.json.passed=false`; SHA-256 `c9278175b2d3e9dd12d0b31293dcbe20ee15b31b946962d8d4999677da24772a`. Отдельный `reverification.json.passed=true`; это offline readback, не исходный green live run.
- Frozen transfer `result.json` SHA-256 `5703d7c221668df11d833b834e39a57397e9ab144842de253495e94eca167340`; experiment invalid.
- Repeat reuse `result.json` SHA-256 `d5b8aabb5647effd44cbbcce8414d579f72e18eb4290144b8e89d3f1b2739211`; 18 valid pairs, ON 12/18, OFF 11/18, exact McNemar `p=1`, globally invalid.
- Green acquisition доказывает только узкую Node procedure `observation-digest-v1`, не универсальную установку UCL tools.
- Experimental transfer/repeat verifiers небезопасны для generated code и не запускались при сборке.

Полная evidence map: `reports/RESEARCH-EVIDENCE-INDEX.md`.

## 7. SHA-256 snapshot, чистое восстановление и проверки

Release manifest создаётся после финальных documentation/security changes и содержит каждый file hash. Восстановление выполняется в новом `.research-assembly/restore` без зависимостей исходного working tree.

Разрешённые проверки: `sha256sum -c RELEASE-MANIFEST.sha256`, `npm ci --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm test`, professional `--validate-only`, run-5 `reverify.ts`. Они не создают live-миссий и не делают paid calls.

**Фактические результаты финального чистого восстановления:** см. `reports/research-publication-security/offline-checks.json`. Первый полный restore до исправления exclude прошёл SHA-256, `npm ci` и typecheck, но остановился на `npm test`: 50/53 suite PASS; все три FAIL потребовали исключённых Chromium binaries/libraries. После добавления только в изолированную restore-среду заведомо локальных browser prerequisites полный suite прошёл **53/53, 0 FAIL**, с результатами вне release tree. Эти host-specific prerequisites не входят в публикацию.

Run-5 readback выполняется в двух режимах: перемещённый restore проверяет выявленную absolute-path зависимость; исходный `runRoot` проверяется отдельно после frozen release archive, потому что verifier пишет свой результат обратно в run directory. При перемещении readback ожидаемо FAIL с `Artifact backing path escapes its mission workspace`; в исходном абсолютном `runRoot` повторный readback PASS, а SHA-256 исходных `summary.json` и `reverification.json` не изменились. Ни один результат не заменяет frozen release bytes или исходный summary.

### Release archive и локальные Git readbacks

Release archive создаётся как `.research-assembly/awe-group-research-2026-11-17.tar.gz` вне snapshot. Два последовательных archive restore прошли member-path safety, release/historical manifests, `npm ci --ignore-scripts`, typecheck; professional validate-only PASS, network/model calls = 0. Финальные archive SHA-256/size записаны во внешние `.research-assembly/awe-group-research-2026-11-17.tar.gz.sha256` и `.research-assembly/FINAL-RELEASE-IDS.json`.

Подготовлены два локальных Git readback:

- `.research-assembly/publication-repo`: audit commit, единственный parent — исторический `a2eae351f813befdae585e93e406973365920562`;
- `.research-assembly/public-release-repo`: **root commit без родителей, ровно один commit**, только он предназначен для будущей публикации и не переносит R2 ancestry.

Все 8 310 committed blobs прочитаны через `git show` и совпали с release SHA-256; оба tree идентичны, Git fsck PASS. Окончательные commit IDs, tree ID и SHA-256 commit objects находятся во внешнем `FINAL-RELEASE-IDS.json`: их нельзя встроить в те же commits без изменения их собственных hashes. Push не выполнялся. Промежуточные verification IDs сохранены в `reports/research-publication-security/release-artifacts.json` со статусом `superseded` и не являются текущими release IDs.

## 8. Ссылки

### Доступные upstream sources, проверенные при приобретении

- https://github.com/failm3/awe-group-runtime/tree/d5e9d857dbdeb8f31f9a798b10b5af4af639dbda
- https://github.com/failm3/nivict-ai-academy/tree/9b9122366a0be96303153930b9e9f8bbd10ed76c

### Целевые GitHub URLs — ожидаемые, пока НЕ подтверждённые readback

- Repository: https://github.com/failm3/awe-group
- Index: https://github.com/failm3/awe-group/blob/main/PROJECT-INDEX.md
- Assembly report: https://github.com/failm3/awe-group/blob/main/AWE-RESEARCH-REPOSITORY-ASSEMBLY-REPORT.md
- Release manifest: https://github.com/failm3/awe-group/blob/main/RELEASE-MANIFEST.sha256

На момент проверки repository API возвращает HTTP 404. Нет `gh`, Git credential helper, `GH_TOKEN` или `GITHUB_TOKEN`. Поэтому remote commit, push, public readback и remote file hashes не выполнены. Необходимо одно owner action: создать public `failm3/awe-group` и предоставить этой среде авторизованный Git/GitHub mechanism без передачи token в chat. После этого можно опубликовать подготовленный snapshot и проверить URLs/hashes.

### Local links

Новая navigation проверяется отдельно: все её 10 локальных ссылок разрешаются. Финальный audit 616 Markdown files проверил 1 008 local-link occurrences: осталось 255 unresolved historical targets (254 в imported `research/`, один отсутствующий `ti-service/CONTRACT.md`); две ранее ожидавшиеся ссылки на assembly report теперь разрешаются. Полный список — `reports/RESEARCH-LINK-GAPS.json`. Это задокументированный gap, не скрытое исправление evidence.

## 9. Исследовательская готовность и оставшиеся ограничения

Комплект пригоден для независимого source/evidence review после local restore: есть единый index, AS-IS architecture, source/config/tests, полный decisive evidence, original FAIL/PASS separation, safe-copy provenance и cryptographic manifests.

Не доказаны и не заявляются: R2 acceptance, универсальность, experience-reuse benefit, текущая доступность всех external services, owner E2E в обычном OpenCode UI, production readiness, точная provider monetary cost, содержимое трёх unavailable repos. Полный offline suite может зависеть от host prerequisites; его результат на этом host не является универсальной portability guarantee.

**Публикация — единственный внешний незавершённый этап, блокируемый GitHub repository/auth. R2 и R3 этим отчётом не возобновляются.**
