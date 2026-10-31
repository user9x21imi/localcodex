LocalCodex 0.2.0 preview: OpenCode 2.1.4, gpt-oss-20b, local vision, Windows desktop tools, adaptive reasoning, GPU status and animation, optional bidirectional agent channel, swap diagnostics and an experimental Apple Silicon installer.

Windows components were exercised on RTX 5070 Ti 16 GB / RAM 32 GB. This is a preview: macOS runtime, Claude/Gemini adapters and installation on a completely clean machine are not yet verified. Read README.md and VALIDATION.md before installation. Model weights are downloaded separately with integrity checks.

macOS installer: download LocalCodex-macOS-v0.2.0.zip and open Install-macOS.command. Portable Node and OpenCode 2 install automatically; Apple Silicon only, 16GB minimum, 24GB+ recommended. macOS ARM runtime is validated separately in CI; full model inference and GUI remain device-specific preview tests.

Apple Silicon backend: MLX GPU for GPT-OSS; Core ML CPU_AND_NE adapter for compatible local models, with device discovery and numerical self-test. MLX does not run on Neural Engine; no ANE utilization percentage or GPT-OSS-on-NPU claim is made.

## Graphical installers
Windows: LocalCodex-Windows-Setup-v0.2.0.exe. macOS Apple Silicon: LocalCodex-macOS-v0.2.0.dmg, containing LocalCodex Installer.app. Choose folder, mode and optional agent communication / YOLO. Models download during setup. These preview installers have no commercial code-signing certificate or Apple notarization; OS warnings may appear. Existing ZIP installers remain available. Native macOS GUI interaction and a full model download are not automated by CI.


## Исправление языка и повторов (31 октября)
- Постоянный config-v2/AGENTS.md: русский язык, проверка источников, запрет выдуманных URL.
- Раздельная политика основных ответов и сжатия истории, фактическая русская контрольная сводка без отдельного вызова модели и резерв токенов для ответа.
- Сохранение последней просьбы и кратких веб-результатов после сжатия; устранение повторов служебных сводок.
- Рабочий адаптер актуального MCP Exa, обработка ошибок поиска, чтение первоисточника между сериями поисков.
- Сокращение больших ответов веб-инструментов, включая массивы текстовых частей.


- Проверка конечного ответа: русский язык, отсутствие выдуманных GitHub-репозиториев и чтение первоисточника; до двух локальных попыток исправления. При провале возвращается честное сообщение о невозможности проверки.

## Принудительная остановка и ограничение циклов
Windows: внешний Ctrl+Alt+F12, llm-stop, STOP LocalCodex; перехват слова стоп, /stop, Ctrl+G и Esc. Ограничения действий, повторов, ошибок и времени работают вне решений модели. Отмена завершает дерево PowerShell-процессов. После остановки нужен явный новый сеанс -Resume. Запрос других сайтов исключает прежние домены. Уже выполненные изменения не откатываются.

