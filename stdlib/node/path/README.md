# node:path

Reference: <https://nodejs.org/api/path.html>

The C++ backend supports a POSIX-oriented `node:path` slice. Imports use the
standard Node spelling and are lowered to the `path` C++ facade from
`inox/path.h`; no host Node code is emitted into generated C++.

Supported imports:

```ts
import path from 'node:path'
import {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  posix,
  relative,
  resolve,
  sep
} from 'node:path'
```

Supported APIs:

```ts
path.join(...paths: string[]): string
path.resolve(...paths: string[]): string
path.relative(from: string, to: string): string
path.dirname(path: string): string
path.basename(path: string, suffix?: string): string
path.extname(path: string): string
path.parse(path: string): { root: string; dir: string; base: string; ext: string; name: string }
path.format(pathObject: object): string
path.normalize(path: string): string
path.isAbsolute(path: string): boolean
path.sep: string
path.delimiter: string
path.posix
```

`posix` exposes the same supported methods and constants.

Targets:

```text
c embedded: yes
c libuv: yes
node: yes
browser: no by default
```

Unsupported APIs:

- `path.matchesGlob`
- `path.toNamespacedPath`
- `path.win32`

Unsupported methods are rejected by the checker with `INOX_NOT_IMPLEMENTED`.
They are not emitted as C stubs and do not increase binary size.

C++ target notes:

- Generated C++ calls the global facade directly, for example
  `path.join(args, count)`, `path.basename(value, suffix, true)` and
  `path.sep`. Old `inox_path_*` C ABI wrappers are not part of the public
  contract.
- This slice is POSIX-oriented and uses `/` as `sep` and `:` as `delimiter`.
- `resolve()` uses the process current working directory when no absolute
  argument is provided, matching the supported Node behavior.
- `parse()` returns a readonly object with `root`, `dir`, `base`, `ext` and
  `name`.
- `format()` supports the common POSIX fields `dir`, `root`, `base`, `name`
  and `ext`; `base` takes precedence over `name` + `ext`.
- Full platform-specific Node edge cases remain planned work. Add tests before
  relying on behavior outside the documented methods above.

Example:

```ts
import path, { basename, relative } from 'node:path'

console.log(path.join('/tmp', 'a', '..', 'b'))
console.log(basename('/tmp/file.txt', '.txt'))
console.log(relative('/tmp/a', '/tmp/a/b/c'))
console.log(path.format(path.parse('/tmp/file.txt')))
```
