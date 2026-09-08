# node:process

Reference: <https://nodejs.org/api/process.html>

The package provides a portable subset of Node's `process` API. The global
`process` name and standard `node:process` imports share the same implementation.

Supported imports:

```ts
import process from 'node:process'
import {
  arch,
  argv,
  argv0,
  chdir,
  cpuUsage,
  cwd,
  env,
  execPath,
  exit,
  exitCode,
  hrtime,
  memoryUsage,
  nextTick,
  pid,
  platform,
  uptime,
  version,
  versions
} from 'node:process'
```

Supported APIs:

```ts
process.cwd(): string
process.chdir(directory: string): void
process.cpuUsage(previousValue?: ProcessCpuUsage): {
  user: number
  system: number
}
process.argv[index: number]: string
process.argv.length: number
process.argv0: string
process.execPath: string
process.env.NAME: string | undefined
process.exitCode: number
process.exitCode = code
process.exit(code?: number): void
process.hrtime(time?: [number, number]): [number, number]
process.memoryUsage(): {
  rss: number
  heapTotal: number
  heapUsed: number
  external: number
  arrayBuffers: number
}
process.nextTick(callback: () => void): void
process.pid: number
process.platform: string
process.arch: string
process.version: string
process.versions: {
  inox: string
}
process.versions.inox: string
process.uptime(): number
```

Targets:

```text
c embedded: yes
c libuv: yes
node: yes
browser: no by default
```

C++ target notes:

- Programs using `node:process` keep the JS-like global `process` object and
  initialize it through `inox::main(argc, argv, ..., app_main)`.
- Generated C++ uses the `process` facade directly, for example
  `process.version`, `process.cwd()` and `process.env["PATH"]`.
  Old `process_*` string/out wrappers are not part of the public contract.
- Missing `env` variables return `undefined`.
- `argv0` and `execPath` currently use `argv[0]` from generated `main`.
- `version` / `versions.inox` are the Inox version from repository `package.json`
  (`v${version}` / `${version}`), rather than the host Node version.
- The global `process` object is materialized as a compact runtime snapshot with
  `version` and `versions` fields when used as a value.
- Compiler metadata owns the semantic `Process`, `ProcessArgv`, `ProcessEnv`,
  `ProcessVersions`, and `ProcessMemoryUsage` identities. `hrtime()` is typed as
  the shared `Array<number>` identity; C++ facade types remain representation
  details rather than semantic result types.
- `process.exitCode` controls the generated program return code.
- `process.exit(code)` exits immediately through the C runtime.
- `process.hrtime(previous?)` returns `[seconds, nanoseconds]`; when `previous`
  is provided, the return value is the elapsed high-resolution time.
- `process.cpuUsage(previous?)` reports user and system CPU time in
  microseconds. Passing an earlier result returns the difference.
- `process.memoryUsage()` returns Node-shaped numeric fields. The native
  runtime currently reports RSS where available and zero for heap-specific
  counters it does not track yet.

Unsupported APIs:

- process events and signal APIs
- `process.stdin`, `process.stdout`, `process.stderr`
- env or argv mutation

Known unsupported methods are rejected by the checker with
`INOX_NOT_IMPLEMENTED`.

Example:

```ts
import process from 'node:process'

console.log(process.cwd())
console.log(process.argv[1])
console.log(process.platform, process.arch)
console.log(process.version, process.versions.inox)
process.exitCode = 1
```
