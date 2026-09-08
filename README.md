# Inox

Inox compiles a supported subset of TypeScript to native C++20 executables.
It provides two equivalent compiler drivers:

- `node compiler/index.ts` runs the hosted compiler from TypeScript sources;
- `dist/inox` is the self-hosted native compiler produced by `pnpm run build`.

Inox is under development. See the
[supported language subset](docs/language/README.md) and
[known limitations](docs/compiler-limitations.md) before using it for a project.

## Requirements

- Node.js 24 or newer
- pnpm
- CMake 3.20 or newer
- a C++20 toolchain

## Quick start

```bash
pnpm install
node compiler/index.ts run examples/simple/index.ts
```

Build an executable without running it:

```bash
node compiler/index.ts build src/index.ts --out-dir dist/app
```

Build and use the self-hosted compiler:

```bash
pnpm run build
./dist/inox run src/index.ts
```

The CLI generates C++, creates an internal CMake project, and builds a native
executable. It also provides `inox_add_executable` for existing CMake projects.
See the [CLI guide](docs/cli.md) for commands and output layout.

## Development

```bash
pnpm run typecheck
pnpm run test:architecture
pnpm test
pnpm run build
pnpm run test:inox
```

`pnpm test` uses the hosted compiler and does not require `dist/inox`.
`pnpm run test:inox` validates a freshly built self-hosted compiler. Test logs
are written under `dist/`.

Run one feature test by name or path:

```bash
pnpm test ternary-expression
pnpm run test:features -- tests/features/cases/ternary-expression.test.ts
```

## Examples

```bash
pnpm run example:simple
pnpm run example:simple:inox
pnpm run example:http-server
pnpm run example:http-server:inox
```

Commands ending in `:inox` use the native compiler and require `pnpm run build`
first. Each example has its own README with usage notes.

## Repository layout

```text
compiler/       portable compiler and C++ backend
runtime/        shared C/C++ runtime
stdlib/         discoverable global and node:* packages
cmake/          reusable CMake integration
examples/       example programs
tests/          feature, integration, and architecture tests
scripts/        build and test tooling
third_party/    vendored dependencies
```

## Documentation

- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [Inox-specific language features](docs/features.md)
- [Language subset](docs/language/README.md)
- [Known compiler limitations](docs/compiler-limitations.md)
- [Standard library packages](docs/stdlib.md)
- [Tests](docs/tests.md)
- [Runtime value layout](docs/runtime/c-value-layout.md)
- [Runtime event loop](docs/runtime/event-loop.md)
- [Embedded profiles](docs/runtime/embedded-profiles.md)
- [Russian version](docs/ru/README.md)

## License

Apache-2.0. See [LICENSE](LICENSE).
