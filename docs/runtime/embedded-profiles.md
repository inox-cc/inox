# Embedded Profiles

inox keeps runtime capabilities explicit. Small targets should not link OS,
thread, libuv, POSIX, filesystem or TLS code unless the program uses an API that
requires it.

## Profiles

Minimal runtime foundation:

- primitive values, ownership and status/error boundaries
- explicit `inox_allocator`
- no filesystem, timers or hosted fallback requirement

Target objects such as collections, promises and filesystem handles are added
only by the selected compiler-library profile and its generated native plan.

Async:

- core profile
- `Promise`
- microtask queue
- C++20 coroutine support and allocator-backed coroutine frames

Hosted:

- async profile
- default filesystem, stdio, wall-clock and monotonic-clock adapters

Embedded:

- core or async profile
- board, RTOS or firmware-provided adapters
- optional filesystem, timers, clocks and fixed arenas

## Capability Rules

For C++ target, `CompileOptions.profile: 'embedded'` enables compile-time
capability checks. Missing capabilities report `INOX_CAPABILITY`.

```ts
compileFile('index.ts', {
  target: 'cc',
  profile: 'embedded',
  capabilities: {
    entropy: true,
    fs: true,
    heap: true,
    monotonicClock: true,
    'node:os': true,
    timers: true,
    wallClock: true
  }
})
```

Config file shape:

```json
{
  "profile": "embedded",
  "capabilities": {
    "entropy": true,
    "fs": true,
    "heap": true,
    "monotonicClock": true,
    "node:os": true,
    "timers": true,
    "wallClock": true
  },
  "budgets": {
    "maxFeatures": 8,
    "maxRuntimeRequirements": 6
  }
}
```

Capability examples:

- filesystem APIs require `fs`;
- timers require `timers`;
- `Date.now()` requires `wallClock`;
- `performance.now()` requires `monotonicClock`;
- `node:os` requires `node:os`;
- OS randomness and `crypto.getRandomValues()` require `entropy`;
- allocating array transforms such as `filter`/`map` require `heap`;
- feature/runtime budgets report `INOX_BUDGET`.

Hosted fallbacks must stay behind compile-time boundaries such as
`INOX_FS_DISABLE_HOST` or `INOX_CONSOLE_DISABLE_HOST`. Embedded builds should be
able to provide adapters without linking hosted fallback code.

IR runtime requirements and the generated native plan describe the package
sources and include roots required by a target. The self-hosted compiler build
passes that generated plan to CMake. Ordinary Node-hosted example builds
regenerate the default profile plan during CMake configuration; native example
builds consume the plan produced with `dist/inox`. A caller may set
`INOX_STDLIB_NATIVE_PLAN` before including
`cmake/InoxCompilerLibraries.cmake` to select another generated profile.

`runtime/CMakeLists.txt` requires an explicit plan and never discovers the
whole stdlib tree. Removing a package from a generated profile therefore also
removes its `src/*` and `include/*` paths from the native target without a
central CMake edit.

Capability keys and target options are opaque strings declared by selected
package descriptors. Portable compiler code validates and carries them through
generic maps; it does not contain a fixed list of stdlib capabilities or
backend option names.
