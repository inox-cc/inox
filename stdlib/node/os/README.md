# node:os

The C++ backend supports a narrow hosted `node:os` slice for read-only operating
system metadata. Imports lower to the C++ `os` facade; they are not emitted as
host Node imports.

Supported imports:

```ts
import os from 'node:os'
import { EOL, arch, homedir, hostname, platform, release, tmpdir, type as osType } from 'node:os'
```

Supported APIs:

- `os.EOL`
- `os.devNull`
- `os.availableParallelism()`
- `os.arch()`
- `os.endianness()`
- `os.freemem()`
- `os.homedir()`
- `os.hostname()`
- `os.loadavg()`
- `os.machine()`
- `os.platform()`
- `os.release()`
- `os.tmpdir()`
- `os.totalmem()`
- `os.type()`
- `os.uptime()`
- `os.version()`

Targets:

```text
c hosted embedded loop: yes
c hosted libuv loop: yes
c embedded profile: requires capabilities['node:os']
node: native Node os module
browser: no
```

Behavior:

- `platform()` and `arch()` return Node-style strings for common targets
  (`darwin`, `linux`, `win32`, `arm64`, `x64`, etc.) and `"unknown"` for
  unrecognized compile targets.
- `tmpdir()` reads `TMPDIR`, `TMP` or `TEMP`, then falls back to `/tmp` on POSIX.
- `homedir()` reads `HOME` and returns an empty string when unavailable.
- `hostname()`, `type()` and `release()` use POSIX `gethostname` / `uname`
  where available and return an empty string on unsupported hosted platforms.
- `EOL` and `devNull` use the target platform's Node-compatible values.
- `availableParallelism()` uses the C++ runtime's hardware concurrency estimate
  and clamps an unavailable estimate to `1`.
- `endianness()` is determined at compile time; `machine()` and `version()` use
  `uname` on POSIX.
- `freemem()` and `totalmem()` report physical memory in bytes. `uptime()` is
  measured with the platform monotonic boot clock.
- `loadavg()` returns the POSIX 1, 5 and 15 minute load averages. Windows has
  no equivalent system API, so it returns three zeroes as Node does.

Native Runtime:

`stdlib/node/os/include/inox/os.h` exposes the C++ `os` object facade. Generated
C++ uses direct calls such as `os.platform()` and `os.tmpdir()`; there is no
public `inox_os_*` C ABI contract.

Embedded C profile:

```json
{
  "profile": "embedded",
  "capabilities": {
    "node:os": true
  }
}
```

Without `capabilities['node:os']`, `node:os` reports `INOX_CAPABILITY` during
compilation. The current runtime implementation is hosted/POSIX; a later
embedded adapter should provide board-specific values without linking hosted OS
fallback code.

Unsupported:

- `cpus`
- `getPriority`
- `networkInterfaces`
- `setPriority`
- `userInfo`
- OS constants beyond `EOL`

Known unsupported methods report `INOX_NOT_IMPLEMENTED` in the checker before C
emission, so no C fallback stub is generated for them.

Example:

```ts
import os from 'node:os'

console.log(os.platform(), os.arch(), os.tmpdir())
```
