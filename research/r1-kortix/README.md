# AWE R1 итоговое исследование

**Сохранить AWE/Mastra и существующих владельцев; сначала воспроизводимый R0 и безопасность, затем один независимо квалифицируемый профессиональный цикл.** Исследование завершено с редакционными исправлениями независимого review. Внедрение не выполнялось и не разрешается этим пакетом.

## Чтение

1. [Executive summary](EXECUTIVE-SUMMARY.md) и [отчёт A–L](FINAL-REPORT-A-L.md).
2. [Evidence ledger](EVIDENCE-LEDGER.md) и [decision/reconciliation ledger](RECONCILIATION.md).
3. [Implementation cards](IMPLEMENTATION-TASK-CARDS.md), [аналитический контракт](ANALYTICS-CONTRACT.md), [test runbook](TEST-RUNBOOK.md).
4. [OpenCode handoff](OPENCODE-HANDOFF.md); GITHUB-HANDOFF.md — совместимое имя, публикации в GitHub не было.
5. [Review disposition / проверочный отчёт](REVIEW-DISPOSITION.md), [доступность источников](SOURCE-AVAILABILITY.md), [source index](SOURCE-INDEX.json).

Specialist annex: [BC](annex/BC.md), [DE](annex/DE.md), [F](annex/F.md), [G](annex/G.md), [M](annex/M.md). F/G имеют явные редакционные corrections; остальные сохранены как получены. [Полный аудит OpenCode](evidence/opencode-audit.md), [прежний сводный отчёт](evidence/previous/awe-nox-final-report.md), 22 прежних MD + handoff в evidence/previous/.

## Статус и границы

Independent draft verdict: CHANGES REQUIRED (3 major, 2 minor). Все пять замечаний обработаны выпускающим; независимого повторного PASS нет. Current-source feasibility conditional; application acceptance NOT_RUN. Подробности и будущие gates в REVIEW-DISPOSITION.md.

D = документальное свидетельство current аудитора, H = historical, U = upstream, P = документация, DESIGN = предложение, TEST-FILE = файловая проверка. Классы не превращаются в integrated PASS. Current cleanroom недоступен; computer access не менялся. Runtime/live/security/regression tests, deployment, покупки и GitHub-публикация не выполнялись.

Полный пакет не cleanroom-safe по умолчанию. Приватный raw evidence ZIP и исторические runtime sources не включены. Старые документы и сведения всё равно подчиняются ограничениям импорта; не обходить policy пересказом.

Выпускающий: worker, session `ae5a2f34-4215-4e82-a92e-80ac8463df65`. `/workspace/out/package/`, ZIP `/workspace/out/AWE-R1-FINAL-2026-11-13.zip`. Надёжная private Drive-копия: `/drives/me/Research/AWE-R1-final-2026-11-13/`. Ссылки Artifact и hash архива передаются в DELIVERY.json вне ZIP.

SHA256SUMS и verify_package.py проверяют исследовательские файлы, не истинность всех claims и не компетенцию AWE.
