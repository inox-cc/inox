# node:child_process

Reference: <https://nodejs.org/api/child_process.html>

The C++ backend supports a narrow hosted `node:child_process` slice for
synchronous command execution with UTF-8 string output.

Supported imports:

```ts
import childProcess from 'node:child_process'
import { execFileSync, execSync, spawnSync } from 'node:child_process'
```

Supported APIs:

```ts
execSync(command: string, options: ChildProcessSyncOptions): string
execFileSync(file: string, args: string[], options: ChildProcessSyncOptions): string
execFileSync(file: string, options: ChildProcessSyncOptions): string
spawnSync(file: string, args: string[], options: ChildProcessSyncOptions): {
  status: number
  stdout: string
  stderr: string
}

type ChildProcessSyncOptions = {
  encoding: 'utf8'
  cwd?: string
  env?: Record<string, string>
  stdio?: 'pipe' | 'ignore' | 'inherit'
  timeout?: number
}
```

Targets:

```text
c hosted embedded loop: yes
c hosted libuv loop: yes
node: yes
browser: no
```

C++ target notes:

- The hosted runtime uses a synchronous POSIX `fork`/`exec` runner and captures
  stdout/stderr through pipes unless `stdio: 'ignore'` or `stdio: 'inherit'` is used.
- `execSync` runs through `/bin/sh -c`.
- `execFileSync` executes the file directly with literal string-array args.
  `spawnSync` also accepts an argument array stored in a variable.
- Non-zero status from `execSync` / `execFileSync` maps to
  `INOX_ERR_UNSUPPORTED`. `spawnSync` returns `status`, `stdout` and `stderr`.
- `env` replaces the child environment; include `PATH` when using non-absolute
  command names that need path lookup.
- `timeout` kills the child and reports `status: -1` for `spawnSync`.
- Buffer-return overloads are intentionally not emitted yet. Use
  `{ encoding: 'utf8' }` for supported string output.

Unsupported APIs:

- async `exec`, `execFile`, `spawn`, `fork`
- stdio arrays
- shell-specific advanced options
- streaming child process handles

Unsupported methods and non-UTF-8 output modes are rejected by the checker with
`INOX_NOT_IMPLEMENTED`.

`node:child_process` import binding metadata comes from
`stdlib/node/child_process/index.d.ts`. Runtime method diagnostics and C
lowering live in this package's `compiler/` files.

Example:

```ts
import { execFileSync, execSync, spawnSync } from 'node:child_process'

console.log(execSync('printf hello', { encoding: 'utf8' }))
console.log(execFileSync('printf', ['world'], { encoding: 'utf8' }))

const result = spawnSync('/bin/sh', ['-c', 'printf out; printf err >&2; exit 3'], {
  encoding: 'utf8'
})
console.log(result.status, result.stdout, result.stderr)
```
