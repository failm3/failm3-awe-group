# AWE Tool Intelligence

Независимый приватный реестр инструментов на Python и PostgreSQL. Он сохраняет посты Telegram, их версии, URL, метаданные медиа, историю покрытия, кандидаты извлечения, карточки ресурсов и утверждения с происхождением. Исследовательская находка не является разрешением установить или запустить инструмент.

Рабочий каталог проекта не связан с AWE/OpenCode cleanroom. API по умолчанию слушает `127.0.0.1`. Развёртывание на пользовательском WSL/Linux необходимо выполнить отдельно: наличие кода, тестов или Docker-файлов не означает production-деплой. WSL не гарантирует круглосуточную работу при выключении Windows, остановке WSL или гибернации.

## Быстрый запуск с существующим PostgreSQL

Требуется Python 3.11+ и PostgreSQL 16+ с отдельно созданной базой и ролью. Команды не создают роли и не меняют чужие базы.

```bash
cd /path/to/awe-tool-intelligence
python3 -m venv .venv
.venv/bin/pip install -e .
cp .env.example .env
chmod 600 .env
# Отредактировать DATABASE_URL и сгенерировать разные API_TOKEN/ADMIN_API_TOKEN.
.venv/bin/python -m awe_ti.cli init
.venv/bin/python -m awe_ti.cli serve
# В другом терминале:
.venv/bin/python -m awe_ti.cli worker
```

`.env` загружается без перезаписи уже заданного окружения. Если файл уже предоставлен, **не перезаписывайте его**. `DATABASE_URL` по умолчанию — `postgresql://awe_ti@localhost:5432/awe_ti`. Секреты не хранятся в базе реестра и не включаются в экспорты. Для токенов используйте случайные длинные значения, например `secrets.token_urlsafe(32)`, и храните их только в приватном окружении.

`API_TOKEN` предоставляет чтение. `ADMIN_API_TOKEN` разрешает импорт, постановку задач, регистрацию источников, ручные тесты и решения. Без административного токена HTTP-запись запрещена; локальный CLI использует права роли PostgreSQL и предназначен для администратора. Все маршруты, включая `/health`, `/docs` и `/openapi.json`, требуют Bearer-токен. Стандартная Swagger-страница не передаёт автоматически токен при загрузке схемы; получайте OpenAPI через авторизованный запрос либо используйте curl/HTTP-клиент. Не выставляйте API наружу без TLS, сетевого контроля доступа и отдельной операционной проверки.

```bash
# TOKEN задаётся приватно; не помещайте его в примеры, историю Git или отчёты.
curl -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:8000/health
curl -G -H "Authorization: Bearer $API_TOKEN" \
  --data-urlencode 'q=локальный векторный поиск' \
  http://127.0.0.1:8000/v1/search
```

## Импорт и происхождение

```bash
.venv/bin/python -m awe_ti.cli ingest-posts research/posts/channel.jsonl
.venv/bin/python -m awe_ti.cli ingest-coverage evidence/coverage/channel.json
.venv/bin/python -m awe_ti.cli ingest-resources research/resources.jsonl
.venv/bin/python -m awe_ti.cli export --out exports
```

Основной формат — UTF-8 JSONL, одна запись на строку. Пустые строки игнорируются. Файл импортируется транзакционно: ошибка разбора или модели откатывает весь файл. Дополнительно поддерживается JSON с массивом или объектом `resources`; неизвестные поля сохраняются в исходном импортном payload. Отсутствующие сведения остаются `null` или отсутствуют — ядро не придумывает цены, лицензии и результаты тестирования.

Пост соответствует [CONTRACT.md](CONTRACT.md):

```json
{"source_handle":"example_channel","source_url":"https://t.me/example_channel","source_title":"Example","message_id":"42","url":"https://t.me/example_channel/42","published_at":"2026-11-12T05:00:00Z","text":"Model2Vec: local embeddings","links":["https://github.com/minishlab/model2vec"],"media":[],"forwarded_from":null,"raw_hash":null,"collected_at":"2026-11-12T06:00:00Z","raw":{"method":"public_web","html":"original fragment"}}
```

Пара `(source_id, message_id)` уникальна. Повторный сбор не создаёт второй пост; изменённый контент создаёт новую `post_versions`. Более старое наблюдение не перезаписывает текущий пост. Исходный `raw` сохраняется; медиа — метаданные, не обещание скачанных файлов. Хэши вычисляются независимо от времени повторного сбора. URL и медиа дедуплицируются, история связей сохраняется.

Карточка ресурса:

```json
{"name":"Example tool","official_url":"https://example.com","repository_url":"https://github.com/example/tool","resource_type":"library","description":"Описание из источника","capabilities":["text embedding"],"integrations":["python"],"verification_status":"DOCUMENTED","claims":[{"field":"supports_python","value":true,"evidence_url":"https://example.com/docs","checked_at":"2026-11-12T06:00:00Z"}],"pricing":{"category":null,"details":null,"evidence_url":null,"checked_at":null},"license":{"spdx":null,"details":null,"evidence_url":null},"provenance":[{"source_url":"https://t.me/example_channel","post_url":"https://t.me/example_channel/42","message_id":"42"}],"decision":null,"limitations":["Не установлен и не проверен живым тестом"]}
```

Канонические official/repository URL используются как общие уникальные идентичности: удаляются tracking-параметры, фрагмент и лишний завершающий `/`; репозиторий GitHub приводится к единой форме. Карточки без URL дедуплицируются по имени; одноимённые разные продукты без идентификаторов требуют ручного уточнения. Если два URL уже принадлежат разным карточкам, импорт останавливается вместо небезопасного автоматического слияния. Повтор точно такой же ресурсной записи не меняет новые данные.

Нормализованные таблицы: `sources`, `posts`, `post_versions`, `post_links`, `post_media`, `source_cursors`, `collection_runs`, `resources`, `resource_urls`, `capabilities`, `resource_capabilities`, `integrations`, `resource_integrations`, `assertions`, `resource_provenance`, `pricing_snapshots`, `license_evidence`, `resource_imports`, `verification_runs`, `live_tests`, `approvals`, `stage_events`, `queue_jobs`, `extraction_candidates`. Миграции версионированы и защищены checksum; их нельзя менять после применения.

Каждое импортированное заявление сохраняется в `assertions` с полем, значением, URL-доказательством, временем проверки и типом доказательства. Лицензии и цены имеют отдельную историю. Telegram-пост — доказательство упоминания, а не истинности возможностей ресурса. `verification_status` из файла сохраняется как заявленный факт, но не повышает внутренний статус или этап.

## Извлечение и поиск по задаче

Импорт выполняет только безопасные эвристики: находит HTTP(S) URL, именованные упоминания и, если ничего не распознано, создаёт `unresolved_text`. Кандидаты находятся в `extraction_candidates` со статусом `pending`; наличие кандидата не означает завершённого семантического извлечения. `GET /v1/candidates` показывает незавершённую работу. Администратор связывает кандидата с ресурсом или отклоняет его через `/resolve`. Автоматическое совпадение точного URL добавляет происхождение, но не объявляет все упоминания обработанными.

По умолчанию поиск — **lexical fallback**, а не embedding similarity: поиск терминов в имени, описании, типе, capabilities и integrations, с небольшим документированным русско-английским словарём. Например «векторный поиск» добавляет `vector`, `embedding`, `search`. Возвращаются `search_mode=lexical_fallback`, `expanded_terms` и `lexical_score`. Это базовый поиск по формулировке задачи, не доказательство пригодности инструмента. Его ограничения: нет полноценной морфологии, анализа длинных требований и гарантированной синонимии.

Опциональный модуль `awe_ti/semantic.py` использует только локальную Model2Vec-модель с `SEMANTIC_MODEL_PATH`. Для установки зависимостей: `.venv/bin/pip install -e '.[semantic]'`. Загрузка проверенных весов — отдельная явная операция, см. `scripts/setup_semantic_model.py` и созданный им manifest. API не скачивает модель при старте и не включает remote model code. `GET /v1/search?q=...&semantic=true` использует cosine ranking, если модель доступна; иначе честно возвращает lexical fallback и безопасное `fallback_reason`. Семантический поиск ранжирует первые 5000 подходящих записей по ID, а не глобальный ANN-индекс; модуль ограничивает выдачу 100 результатами. Similarity означает релевантность, не разрешение на выполнение и не подтверждение утверждений.

## Источники, сборщик и очередь

```bash
.venv/bin/python -m awe_ti.cli register-source example_channel --enabled
.venv/bin/python -m awe_ti.cli enqueue collect --handle example_channel --max-pages 5 --dedup-key initial-example
.venv/bin/python -m awe_ti.cli worker --once
```

Источники, появившиеся из импорта постов, **не включаются автоматически**. Администратор разрешает сбор отдельно. HTTP-регистрация принимает `handle`, `title`, `method`, `enabled`, `auto_enroll`, `evidence_urls`, оценки `authority/relevance/activity/diversity` 0–100. Балл = `0.35×authority + 0.35×relevance + 0.20×activity + 0.10×diversity`; это оценка администратора, а не вычисленная вероятность истинности. Auto-enroll разрешён только при явном запросе администратора, public_web, балле ≥80 и минимум двух различных URL-доказательствах. Оценка не даёт одобрения интеграции; authorized_api никогда не включается этим правилом автоматически.

`awe_ti/adapters.py` — расширяемый реестр доверенного локального кода. Предусмотрены public_web и authorized_api. Задача не может задавать исполняемый файл, модуль, произвольные argv, рабочий каталог или путь сессии. Worker запускает только поставляемый `scripts/collect_history.py` с `shell=False`, закрытым stdin, ограниченными аргументами и временем. Строки постов, README ресурсов, инструкции сайтов и найденный код никогда не исполняются. API/DB-токены не передаются дочернему процессу сборщика.

Каждый реальный результат сборщика импортируется в PostgreSQL; coverage и курсоры сохраняются независимо от того, достигнута ли граница доступной истории. Возврат сборщика `1` означает частичный результат, не вымышленную полную историю. `public_web_only` означает только доступные публичные HTML-превью; API-история не обещается. На диске сохраняются дополнительная SQLite-состояние сборщика, сырые HTML и JSONL; БД хранит очередь, импортированные версии, coverage и зеркальные курсоры. Удаление collector state требует повторного безопасного сканирования, а не автоматического объявления полноты.

Очередь использует `FOR UPDATE SKIP LOCKED`, уникальные dedup keys, ограниченные попытки, backoff и lease token. После аварийного остановa истёкшая аренда снова доступна; устаревший worker не может завершить задачу с новой арендой. Worker каждый час планирует повторное сканирование последних страниц для новых постов и правок. Неполная история продолжается отдельными resume-пакетами. После перезапуска пропущенные интервалы не эмулируются один за другим: выполняется очередной catch-up от сохранённого состояния. Доступность всё равно зависит от сети и от того, работает ли WSL/сервер.

Авторизованный Telegram-сбор требует отдельного пользовательского аккаунта и локальной интерактивной авторизации. Нужны опциональные зависимости `.venv/bin/pip install -e '.[telegram]'`, приватные `API_ID`, `API_HASH` и `TELEGRAM_SESSION_PATH`. Сессия должна лежать вне research/evidence/exports и cleanroom, каталог 0700, файл 0600.

```bash
# Только локально, с введёнными пользователем данными — не в worker/HTTP.
.venv/bin/python scripts/collect_history.py authorize --session /private/path/ti-account
.venv/bin/python -m awe_ti.cli register-source example_channel --enabled --method authorized_api
.venv/bin/python -m awe_ti.cli enqueue collect --handle example_channel --method authorized_api
```

Никакие учётные данные RouterCheap или других обнаруженных сервисов здесь не предполагаются. При отсутствии авторизации задача остаётся повторяемой/ошибочной; фиктивная проверка не записывается.

## Проверка, этапы и разрешение интеграции

```bash
.venv/bin/python -m awe_ti.cli verify --limit 10
.venv/bin/python -m awe_ti.cli verify --resource-id 1
```

Для произвольного official URL HTTP-запрос проверяет **только достижимость**. HTTP 200 не подтверждает функции, владельца, лицензию, безопасность, установку или живой тест. Для точного GitHub repository URL используется официальный `api.github.com/repos/owner/repo`: отдельно записываются метаданные репозитория, `source_hosting` и `/license` evidence. Наличие репозитория не доказывает связь владельца с продуктом, GitHub-звёзды не доказывают качество, license metadata не заменяет юридическую проверку. `NOASSERTION` остаётся неизвестной лицензией. Недоступность/лимит API сохраняются в журнале.

Сетевой клиент запрещает credentials в URL, неподдерживаемые схемы/порты, private/loopback/link-local/metadata/непубличные IP, включая смешанные DNS-ответы и IPv4-mapped IPv6. На каждом hop фиксируется проверенный публичный IP с сохранением Host/SNI и TLS hostname verification; редиректы перепроверяются, Authorization не пересылается на другой host. Ограничены число редиректов, время и размер ответа; environment proxy не применяется. Это программная защита базового уровня, не замена отдельной egress policy и операционного security review.

`resources.stage` представляет полный процесс:

`DISCOVERED → SOURCE_VERIFIED → DOCUMENTED → INSTALLABLE → INSTALLED_IN_SANDBOX → LIVE_TESTED → APPROVED → INTEGRATED`.

Отдельные состояния: `BROKEN`, `DEPRECATED`, `BLOCKED`, `REQUIRES_AUTH`, `REQUIRES_APPROVAL`, `REJECTED`. Возврат из исключения — через `DISCOVERED` с явным решением. Последовательные этапы нельзя пропускать. SOURCE_VERIFIED/DOCUMENTED/INSTALLABLE/INSTALLED_IN_SANDBOX фиксируются администратором с доказательством; автоматический HTTP 200 или импорт не устанавливают их. Независимое внутреннее `verification_status` имеет значения `research_only`, `official_metadata_observed`, `live_tested`, `rejected`, `deprecated` и описывает класс имеющихся наблюдений, не весь lifecycle.

```bash
# Каждый шаг требует реального соответствующего доказательства, не копируйте
# один URL механически для разных смыслов этапа.
.venv/bin/python -m awe_ti.cli stage 1 SOURCE_VERIFIED --actor operator --reason 'Владелец сверён' --evidence-url https://official.example/about
.venv/bin/python -m awe_ti.cli stage 1 DOCUMENTED --actor operator --reason 'Документация изучена' --evidence-url https://official.example/docs
.venv/bin/python -m awe_ti.cli stage 1 INSTALLABLE --actor operator --reason 'Условия и безопасный план проверены' --evidence-url https://official.example/install
.venv/bin/python -m awe_ti.cli stage 1 INSTALLED_IN_SANDBOX --actor operator --reason 'Установлен отдельно вручную' --evidence-url file:///path/to/evidence/install.json
# Ядро не выполняет установку. Только регистрирует выполненный отдельно тест:
.venv/bin/python -m awe_ti.cli record-live-test 1 --name 'Isolated functional smoke' --result passed --evidence-file evidence/live/test.json --actor operator
# Используйте ID реально записанного теста из результата предыдущей команды.
.venv/bin/python -m awe_ti.cli approve 1 --live-test-id 1 --actor operator --reason 'Разрешена отдельная интеграция'
.venv/bin/python -m awe_ti.cli export --out exports
```

Живой тест — явно зарегистрированное администратором наблюдение, не автоматическое доказательство, добытое этим ядром. CLI требует существующий файл в независимом `evidence/` и вычисляет SHA256. API принимает URL/хэш и означает human attestation. `passed` переводит этап в LIVE_TESTED только после INSTALLED_IN_SANDBOX; запись теста раньше сохраняет факт, но не перескакивает этапы. `failed` переводит в BROKEN. Для одобрения нужен последний по времени свежий passed-тест, принадлежащий именно ресурсу и текущей конфигурации, а также этап LIVE_TESTED.

`exports/research_registry.jsonl` — полный исследовательский каталог; **он не предназначен для автоматического выполнения**. `exports/approved_integration_registry.json` и административный API-экспорт содержат только явно одобренные ресурсы с последним согласованным passed-тестом, не старше `LIVE_TEST_MAX_AGE_DAYS` — по умолчанию 30. Изменение URL/типа/integrations меняет fingerprint и закрывает допуск; новый failed/inconclusive тест, отозванное approval или исключающий этап также закрывают его. Экспорт не исполняет код, не устанавливает пакет и не означает INTEGRATED. Последний этап записывается только после отдельного доказательства фактической интеграции через `/integration-ack`.

## HTTP API

Везде используется `Authorization: Bearer …`. Читатель может получать `/health`, `/v1/resources`, `/v1/resources/{id}`, `/v1/search`, `/v1/posts`, `/v1/sources`, `/v1/sources/{id}/coverage`, `/v1/candidates`, `/v1/jobs`. Фильтры ресурсов: `q`, `limit` 1–200, `offset`, `stage`, `resource_type`, `semantic`. Посты фильтруются `source_handle`. Сырые посты доступны только администратору через `include_raw=true` и `/v1/posts/{id}/versions`.

Административные операции:

- `POST /v1/import/posts` и `/v1/import/resources`: JSON-массив контрактных записей, максимум 1000.
- `POST /v1/sources`: регистрация и разрешение безопасного сбора.
- `POST /v1/jobs`: `{kind,payload,dedup_key}`; kind только `collect` или `verify_resource`.
- `POST /v1/candidates/{id}/resolve`: `{resource_id:123}` либо `{discard:true}`.
- `POST /v1/resources/{id}/stage`: `{stage,actor,reason,evidence_url,evidence_hash}`.
- `POST /v1/resources/{id}/live-tests`: `{test_name,result,evidence_url,evidence_hash,tested_at,recorded_by,notes}`.
- `POST /v1/resources/{id}/approvals`: `{approved,actor,reason,live_test_id}`; `approved:false` отзывает разрешение.
- `POST /v1/resources/{id}/integration-ack`: `{stage:"INTEGRATED",actor,reason,evidence_url,evidence_hash}`.
- `GET /v1/exports/integration`: только разрешённый интеграционный манифест.

Без токена: 401. Нужен административный токен: 403. Ошибочный контракт/недопустимый этап: 422. Не найдено: 404. Недоступная БД: безопасное 503 без DSN. Тело запроса ограничено 5 MB; дополнительный gateway/rate limiting — задача реального размещения. Endpoint не принимает пути локальных файлов для HTTP-импорта и не предоставляет произвольное выполнение заданий.

## Docker Compose

```bash
# В приватном .env задайте POSTGRES_PASSWORD URL-safe, API_TOKEN,
# ADMIN_API_TOKEN. Compose создаёт СВОЮ PostgreSQL volume, не использует
# существующую localhost-базу из DATABASE_URL.
mkdir -p research/posts evidence/coverage exports
docker compose build
docker compose up -d
# Проверка без печати секретов:
docker compose ps
docker compose exec api python -m awe_ti.cli init
```

Сервисы: PostgreSQL 16, API и worker. PostgreSQL наружу не опубликован; порт API только `127.0.0.1`. Процессы работают без root/capabilities, root filesystem read-only, writable data подключены отдельно. Для Linux host bind mounts установите `TI_UID/TI_GID` своего владельца каталогов; по умолчанию 1000. Секреты и данные не попадают в image. Опциональные extras: `INSTALL_EXTRAS=telegram,semantic`. Модель и Telegram session монтируются только явным отдельным compose override в приватные пути; `CONTAINER_SEMANTIC_MODEL_PATH` / `CONTAINER_TELEGRAM_SESSION_PATH` должны указывать внутрь этих mount, сами веса/сессии не включаются в image. Авторизованная сессия writable для Telethon — не read-only. Docker/Compose надо установить на выбранном хосте отдельно.

## WSL Ubuntu и перенос на Linux-сервер

Шаблоны `deploy/awe-ti-api.service` и `deploy/awe-ti-worker.service` используют отдельного пользователя `awe-ti`, каталог `/opt/awe-tool-intelligence`, приватное окружение `/etc/awe-tool-intelligence/env` и состояние `/var/lib/awe-tool-intelligence`. Они не обращаются к `/home/nox/awe-group-cleanroom-20261112`. Файлы являются шаблонами, не установлены автоматически.

```bash
# На выбранном пользователем WSL/Linux-хосте после переноса только этого проекта:
sudo useradd --system --home /var/lib/awe-tool-intelligence --create-home --shell /usr/sbin/nologin awe-ti
sudo install -d -m 0700 -o awe-ti -g awe-ti /var/lib/awe-tool-intelligence
sudo install -d -m 0750 -o root -g awe-ti /etc/awe-tool-intelligence
# Создайте env приватно, затем chmod 0640 и chown root:awe-ti.
# Установите Python venv и проект под /opt/awe-tool-intelligence.
sudo chown -R awe-ti:awe-ti /opt/awe-tool-intelligence/research /opt/awe-tool-intelligence/evidence /opt/awe-tool-intelligence/exports
sudo cp deploy/awe-ti-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now awe-ti-api awe-ti-worker
systemctl status awe-ti-api awe-ti-worker
```

Перед запуском подготовьте отдельно PostgreSQL и доступ роли; systemd не создаёт БД. В WSL systemd должен быть включён и фактически работать. Шаблоны перезапускают процессы после ошибки и догоняют работу очереди при запуске WSL, но не удерживают выключенный Windows/WSL в сети. Для переноса на обычный Linux остаются те же Python, PostgreSQL, env и service files; пользователь сам переносит приватные ключи/сессию и проверяет network/permissions. Нет необходимости в покупке нового сервера ради первоначального запуска.

## Резервное копирование и восстановление

```bash
# Выполняется на хосте с pg_dump/pg_restore той же или совместимой версии.
# Остановить worker на время согласованного snapshot файлов и БД.
sudo systemctl stop awe-ti-worker
.venv/bin/python deploy/backup.py --out /private/backup/location
sudo systemctl start awe-ti-worker
# На ОТДЕЛЬНОЙ пустой базе, DATABASE_URL задан приватно для НОВОГО target:
.venv/bin/python deploy/restore.py /private/backup/location/TIMESTAMP --confirm-empty-target --restore-files
.venv/bin/python -m awe_ti.cli init
```

Backup содержит custom-format `registry.dump`, `evidence.tar.gz` с research/evidence/exports и SHA256 manifest. `.env`, Telegram session и веса модели исключены; приватную авторизацию резервируйте отдельно вручную в зашифрованном хранилище. Файлы backup создаются с ограниченными правами. Пароль PostgreSQL передаётся утилитам через окружение PG*, не argv. Restore проверяет checksum, требует пустую целевую базу и защищает файловый архив от traversal/symlinks. Не восстановляйте непроверенный чужой backup. Для Compose используйте PostgreSQL-утилиты внутри контейнера или соответствующий host client с доступом к внутреннему PostgreSQL; приведённые скрипты ориентированы на локальный/systemd-вариант.

## Тесты и границы готовности

```bash
.venv/bin/python -m pytest -q
# Только ядро:
.venv/bin/python -m pytest -q tests/test_core_unit.py tests/test_core_postgres.py tests/test_core_worker.py
```

PostgreSQL-тесты используют отдельные случайные схемы с автоматическим удалением, не очищают обычные таблицы. Если БД недоступна, интеграционные тесты явно skipped; это не считается подтверждённым PostgreSQL-тестированием. Проверяются миграции, идемпотентность, edits/raw, происхождение, неопределённые факты, lexical search, auth/admin, lease/retry, coverage, worker-ingestion, SSRF и отсутствие повышения статуса на HTTP 200, раздельные GitHub/license/source evidence, допуск экспорта.

Базовый backend реализован, но реальная доступность источников, учетная авторизация, корректность каждой human attestation, безопасность конкретного инструмента и пользовательский WSL/systemd/Docker deployment требуют отдельных наблюдений. Ядро не содержит runner обнаруженного кода и не подменяет sandbox/live тест HTTP-достижимостью.

## Технические источники

[PostgreSQL SELECT / SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html) объясняет механизм конкурентной очереди. [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) описывает проверки DNS, фиксацию адреса и контролируемые редиректы. Эти ссылки относятся к дизайну ядра, а не к проверке найденных ресурсов.
