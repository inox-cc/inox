# fs

`fs` is a capability-based filesystem module. If the selected target/platform
has no filesystem implementation, importing or using `fs` is a compile-time
diagnostic.

## MVP API

```ts
import fs from 'node:fs'

fs.promises.readFile(path: string): Promise<Buffer>
fs.promises.readFile(path: string, encoding: 'utf8'): Promise<string>
fs.promises.writeFile(path: string, data: string | Buffer | Uint8Array, encoding?: 'utf8'): Promise<void>
fs.promises.readdir(path: string, encoding?: 'utf8'): Promise<Array<string>>
fs.promises.readdir(path: string, options: { withFileTypes: true }): Promise<Array<Dirent>>
fs.promises.stat(path: string): Promise<Stats>
fs.promises.lstat(path: string): Promise<Stats>
fs.promises.access(path: string, mode?: number): Promise<void>
fs.promises.mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
fs.promises.unlink(path: string): Promise<void>
fs.promises.rm(path: string, options?: { force?: boolean, recursive?: boolean }): Promise<void>
fs.promises.rename(oldPath: string, newPath: string): Promise<void>
fs.promises.appendFile(path: string, data: string | Buffer | Uint8Array, encoding?: 'utf8'): Promise<void>
fs.promises.copyFile(src: string, dest: string): Promise<void>
fs.promises.realpath(path: string): Promise<string>
fs.promises.readlink(path: string): Promise<string>
fs.promises.symlink(target: string, path: string): Promise<void>

fs.readFile(path: string, callback: (error: Error | null, data: Buffer) => void): void
fs.readFile(path: string, encoding: 'utf8', callback: (error: Error | null, data: string) => void): void
fs.writeFile(path: string, data: string | Buffer | Uint8Array, callback: (error: Error | null) => void): void
fs.readdir(path: string, callback: (error: Error | null, files: string[]) => void): void
fs.stat(path: string, callback: (error: Error | null, stats: Stats) => void): void

fs.readFileSync(path: string): Buffer
fs.readFileSync(path: string, encoding: 'utf8'): string
fs.writeFileSync(path: string, data: string | Buffer | Uint8Array, encoding?: 'utf8'): void
fs.readdirSync(path: string, encoding?: 'utf8'): Array<string>
fs.readdirSync(path: string, options: { withFileTypes: true }): Array<Dirent>
fs.statSync(path: string): Stats
fs.lstatSync(path: string): Stats
fs.accessSync(path: string, mode?: number): void
fs.mkdirSync(path: string, options?: { recursive?: boolean }): void
fs.unlinkSync(path: string): void
fs.rmSync(path: string, options?: { force?: boolean, recursive?: boolean }): void
fs.renameSync(oldPath: string, newPath: string): void
fs.appendFileSync(path: string, data: string | Buffer | Uint8Array, encoding?: 'utf8'): void
fs.copyFileSync(src: string, dest: string): void
fs.existsSync(path: string): boolean
fs.realpathSync(path: string): string
fs.readlinkSync(path: string): string
fs.symlinkSync(target: string, path: string): void

fs.constants.F_OK: number
fs.constants.R_OK: number
fs.constants.W_OK: number
fs.constants.X_OK: number

type Stats = {
  readonly size: number
  readonly mode: number
  readonly mtimeMs: number
  isFile(): boolean
  isDirectory(): boolean
}

type Dirent = {
  readonly name: string
  isFile(): boolean
  isDirectory(): boolean
}
```

The compiler also accepts `import fs from 'node:fs/promises'` and
`import { promises as fs } from 'node:fs'` for the namespace-shaped Promise API.
Bare `fs` is intentionally not an alias for `node:fs`. Relative module imports
still use the normal static module graph; these Node fs imports are treated as
runtime built-ins.

Compiler-side Node-to-runtime mapping is owned by
`stdlib/node/fs/compiler/index.ts`. The generic compiler extension pipeline
discovers that package entrypoint and does not keep a separate list of `fs`
methods in the compiler core.

Text APIs use UTF-8. The only accepted encoding option is the string literal
`'utf8'`.
`fs.promises.mkdir` / `fs.mkdirSync` support object-literal
`{ recursive: true }`, and `fs.promises.rm` / `fs.rmSync` support
object-literal `{ force: true, recursive: true }`. These booleans must be
literal values. `fs.promises.readFile(path)` and
`fs.readFileSync(path)` follow Node semantics and return bytes when no encoding
is supplied.

## Behavior

```ts
import fs from 'node:fs'

await fs.promises.writeFile('config.json', '{"ok":true}')
const text = await fs.promises.readFile('config.json', 'utf8')

const bytes = await fs.promises.readFile('image.bin')
await fs.promises.writeFile('image.copy.bin', bytes)

const entries = await fs.promises.readdir('.')
const dirents = await fs.promises.readdir('.', { withFileTypes: true })
const stats = await fs.promises.stat('config.json')
if (stats.isFile()) {
  await fs.promises.access('config.json', fs.constants.R_OK)
}
if (dirents[0].isFile()) {
  await fs.promises.copyFile(dirents[0].name, 'first-file.copy')
}

await fs.promises.mkdir('cache/images', { recursive: true })
await fs.promises.rename('image.copy.bin', 'cache/images/image.bin')
await fs.promises.unlink('cache/images/image.bin')
await fs.promises.appendFile('cache/log.txt', 'ready\n')
await fs.promises.copyFile('cache/log.txt', 'cache/log.copy.txt')
await fs.promises.symlink('cache/log.txt', 'cache/log.link')
const linkTarget = await fs.promises.readlink('cache/log.link')
const realTarget = await fs.promises.realpath('cache/log.link')
await fs.promises.rm('cache', { recursive: true, force: true })
```

Promise functions return `Promise<T>`. Callback functions use Node's
error-first convention and remain alive until their filesystem request
completes. Both forms share the same native request and completion path. Sync
functions block the current task and should be unavailable on targets that do
not support blocking IO.

Use the Node-compatible `fs.promises.readdir`, `fs.promises.readFile`,
`fs.promises.writeFile`, `fs.promises.stat`, `fs.promises.lstat`,
`fs.promises.access`, `fs.promises.mkdir`, `fs.promises.unlink`,
`fs.promises.rm`, `fs.promises.rename`, `fs.promises.appendFile`,
`fs.promises.copyFile`, `fs.promises.realpath`, `fs.promises.readlink`,
`fs.promises.symlink`, `fs.readdirSync`, `fs.readFileSync`, `fs.writeFileSync`,
`fs.statSync`, `fs.lstatSync`, `fs.accessSync`, `fs.mkdirSync`,
`fs.existsSync`,
`fs.unlinkSync`, `fs.rmSync`, `fs.renameSync`, `fs.appendFileSync`,
`fs.copyFileSync`, `fs.realpathSync`, `fs.readlinkSync` and
`fs.symlinkSync` spellings. The same asynchronous operations are also available
through Node-compatible callbacks on `node:fs`.

## Targets

```text
node: node:fs host implementation
cc + libuv: uv_fs implementation
c + hosted without libuv: stdio/POSIX fallback
c + embedded without libuv: hosted fallback only if intentionally left enabled
c + freestanding: no by default
browser: no by default
```

## Native Facade Slice

Generated C++ calls the object-shaped facade directly. The public surface uses
standard Node names and overloads instead of encoding result types in helper
names:

```cpp
auto bytes = fs.readFileSync(path);
auto text = fs.readFileSync(path, "utf8");
auto entries = fs.readdirSync(dir);
auto dirents = fs.readdirSync(dir, FsReadDirOptions{true});
fs.accessSync(path, fs.constants.R_OK);
fs.writeFileSync(path, bytes);
fs.appendFileSync(path, suffix);
fs.mkdirSync(dir, true);
fs.unlinkSync(path);
fs.rmSync(dir, true, true);
```

Low-level `const char*, size_t`, `inox_status` and `out`-parameter calls remain
private runtime implementation details, not the public generated C++ surface.

The non-libuv C++ build uses the small stdio/POSIX fallback unless
`INOX_FS_DISABLE_HOST` is defined. `INOX_LOOP_BACKEND=libuv` uses `uv_fs_*` for
sync helpers too.

Async methods return RAII `inox::Promise` values:

```cpp
auto bytes = fs.promises.readFile(path);
auto text = fs.promises.readFile(path, "utf8");
auto write = fs.promises.writeFile(path, data);
auto entries = fs.promises.readdir(dir);
auto dirents = fs.promises.readdir(dir, FsReadDirOptions{true});
auto stats = fs.promises.stat(path);
auto real = fs.promises.realpath(path);
auto access = fs.promises.access(path, fs.constants.R_OK);
auto mkdir = fs.promises.mkdir(dir, true);
auto rm = fs.promises.rm(dir, true, true);
auto renamed = fs.promises.rename(old_path, new_path);
auto copied = fs.promises.copyFile(src_path, dest_path);
```

With `INOX_LOOP_BACKEND=libuv`, async helpers run real
`uv_fs_open`, `uv_fs_read`, `uv_fs_write`, `uv_fs_close` and
`uv_fs_scandir` requests for file contents and directory entries. `stat`,
`lstat` and `access` use `uv_fs_stat`, `uv_fs_lstat` and `uv_fs_access` request
callbacks, mutation helpers use `uv_fs_mkdir`, `uv_fs_unlink`,
`uv_fs_rename`, `uv_fs_rmdir` and `uv_fs_scandir` where needed for recursive
removal, and append/copy helpers use `uv_fs_write` with append positioning and
`uv_fs_copyfile`. Link helpers use `uv_fs_realpath`, `uv_fs_readlink` and
`uv_fs_symlink`. The libuv loop tracks pending filesystem requests so generated
`await` and `main` drain loops keep polling until the request settles.

Default embedded or hosted builds without libuv schedule the built-in
stdio/POSIX implementation through the loop's immediate queue when available.

If neither a libuv backend nor a hosted fallback is available, sync helpers
throw an unsupported-operation error and async helpers reject their promise
with a lightweight `FsError`.

## Errors

Filesystem operations reject, throw, or pass an `Error` as the first callback
argument. Successful callbacks receive `null` as their first argument.

Common error fields:

```text
name: "FsError"
message: target-provided short message
code: target-provided code when available
```

The current runtime maps native status failures into:

```text
name: "FsError"
code: "ERR_FS_*"
message: short stable English message
```

## MVP Limits

- object options are limited to boolean literals for `mkdir` / `rm`; only
  `'utf8'` string encoding is accepted, and `access` accepts a numeric mode
- `copyFile` mode flags such as `COPYFILE_EXCL` are not implemented yet
- `symlink` type options such as `'dir'` / `'file'` are not implemented yet
- no streams
- no watchers
- no permissions API
- `node:path` has a basic POSIX-oriented slice; full platform-specific path
  parity remains separate planned work
- `Dirent` is minimal: `name`, `isFile()` and `isDirectory()` only
