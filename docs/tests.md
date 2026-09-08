# Tests

Feature tests exercise the complete path:

```text
source/module graph -> compiler -> C++ -> executable -> stdout/stderr
```

## Commands

```bash
pnpm test                   # hosted feature tests
pnpm run test:architecture  # architecture contracts
pnpm run test:network       # focused hosted network acceptance
pnpm run build
pnpm run test:inox          # self-hosted compiler parity
pnpm run test:network:inox  # focused self-hosted network acceptance
pnpm run test:node          # Node-comparable cases
```

`pnpm test` uses the hosted compiler and does not need `dist/inox`.
`pnpm run test:inox` validates a freshly built self-hosted compiler.

Run one hosted test by name or path:

```bash
pnpm test ternary-expression
pnpm run test:features -- tests/features/cases/ternary-expression.test.ts
```

Logs are written to `dist/test.log`, `dist/test-architecture.log`, and
`dist/test-inox.log`.

## Feature cases

Each case is a small, independent `.test.ts` file:

- shared cases live in `tests/features/cases/`;
- Inox-only cases live in `tests/features/inox/`;
- helper modules live beside their cases without the `.test.ts` suffix.

A successful case:

```ts
// @targets cc
// @expect pass
// @stdout 2

console.log(1 + 1)
```

A diagnostic case:

```ts
// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

let value: number = 1
value = 'two'
```

Directives:

- `@targets cc` selects the C++ backend;
- `@expect pass` requires successful compilation, native build, and execution;
- `@expect diagnostics CODE ...` declares expected compiler diagnostics;
- `@stdout` and `@stderr` declare expected output lines.

Sources with relative imports or exports use `compileFile()`. Other cases use
`compileSource()`.

## Architecture and acceptance tests

`pnpm run test:architecture` validates:

- bare profiles and declaration-first admission;
- renamed providers and the absence of package-specific semantic tails;
- physical deletion of every stdlib package and its dependency closure;
- registry and native-plan determinism;
- the public compiler extension boundary;
- ownership, runtime boundaries, and generated C++ invariants.

`test:inox` additionally compares hosted and self-hosted diagnostics,
normalized IR, generated C++, and the build-scoped native plan.

HTTP example acceptance is separate:

```bash
pnpm run test:example:http-server
pnpm run test:example:http-server:inox
```

Each command creates an isolated `inox build`, starts the server on a temporary
port, validates status, content type, and body, then stops its process.

The shorter network acceptance suite is available through:

```bash
pnpm run test:network
pnpm run test:network:inox
```

The hosted command does not require `dist/inox`. The native command runs the
same contract after `pnpm run build`. One executable covers DNS lookup, HTTP
and HTTPS clients and servers, streaming and backpressure, inactivity timeout,
abort/destroy lifecycle, TCP connection behavior and limits, and UDP loopback
datagrams. This suite does not replace full `test:inox` coverage.

## Contribution rules

- Give each new language or stdlib feature a focused positive case.
- Give each new error a small diagnostic case.
- Do not replace required behavior with a diagnostic merely to pass tests.
- Do not use `examples/` as fixtures.
- Do not add manual case lists, `knownFail`, `flaky`, or broad smoke tests.
- If only `test:inox` fails, add the smallest hosted regression case when no
  equivalent case exists.
