# Inox

Inox компилирует поддерживаемое подмножество TypeScript в нативные исполняемые
файлы на C++20. Доступны два равноправных запуска компилятора:

- `node compiler/index.ts` запускает hosted-компилятор из TypeScript-исходников;
- `dist/inox` — self-hosted нативный компилятор, создаваемый `pnpm run build`.

Перед использованием ознакомьтесь с [поддерживаемым подмножеством языка](../language/README.md) и
[известными ограничениями](../compiler-limitations.md).

## Требования

- Node.js 24 или новее
- pnpm
- CMake 3.20 или новее
- toolchain с поддержкой C++20

## Быстрый старт

```bash
pnpm install
node compiler/index.ts run examples/simple/index.ts
```

Собрать исполняемый файл без запуска:

```bash
node compiler/index.ts build src/index.ts --out-dir dist/app
```

Собрать и использовать self-hosted компилятор:

```bash
pnpm run build
./dist/inox run src/index.ts
```

CLI генерирует C++, создаёт внутренний CMake-проект и собирает нативный
исполняемый файл. Для существующих CMake-проектов доступна функция
`inox_add_executable`. Команды и структура результата описаны в
[руководстве по CLI](../cli.md).

## Разработка

```bash
pnpm run typecheck
pnpm run test:architecture
pnpm test
pnpm run build
pnpm run test:inox
```

`pnpm test` использует hosted-компилятор и не требует `dist/inox`.
`pnpm run test:inox` проверяет свежую сборку self-hosted компилятора. Логи
тестов сохраняются в `dist/`.

Запуск одного feature-теста по имени или пути:

```bash
pnpm test ternary-expression
pnpm run test:features -- tests/features/cases/ternary-expression.test.ts
```

## Примеры

```bash
pnpm run example:simple
pnpm run example:simple:inox
pnpm run example:http-server
pnpm run example:http-server:inox
```

Команды с суффиксом `:inox` используют нативный компилятор и требуют
предварительного запуска `pnpm run build`.

## Структура репозитория

```text
compiler/       переносимый компилятор и C++ backend
runtime/        общий C/C++ runtime
stdlib/         автоматически обнаруживаемые global и node:* packages
cmake/          интеграция с CMake
examples/       примеры программ
tests/          feature-, integration- и architecture-тесты
scripts/        инструменты сборки и тестирования
third_party/    внешние зависимости
```

## Документация

- [Architecture](../architecture.md)
- [CLI](../cli.md)
- [Возможности Inox](../features.md)
- [Подмножество языка](../language/README.md)
- [Ограничения компилятора](../compiler-limitations.md)
- [Стандартная библиотека](../stdlib.md)
- [Тесты](../tests.md)

## Лицензия

Apache-2.0. См. [LICENSE](../../LICENSE).
