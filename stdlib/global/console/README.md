# console

`console` is a global debugging and logging API. The default registry discovers
it from this package; a compiler library set without `global:console` does not
declare or lower the global.

## Signature

```ts
const console: {
  log(...values: unknown[]): void
  info(...values: unknown[]): void
  warn(...values: unknown[]): void
  error(...values: unknown[]): void
}
```

`index.d.ts` owns the ambient `Console` interface and global value.
`compiler/index.ts` owns the four operation descriptors, their runtime
requirement, C++ facade expressions and variadic formatting plan.

## Behavior

```ts
const user = {
  id: 1,
  name: 'Ada'
}

console.log('user', user)
console.log(`user ${user.name} id ${user.id}`)
console.error('failed')
```

Multiple values are separated by one space. Each call writes a trailing newline.

Template literals use string conversion. Native JS targets use inspect-like
conversion so sealed records, arrays, maps, sets and errors are readable.

The package supplies a generic `variadic-format-values` argument plan. The C++
backend uses that metadata to emit ABI-safe numeric/boolean arguments and calls
the facade expression declared by the package. It does not contain console
method names or a console-specific runtime flag.

Generated C++ includes `inox/console.h` only after a console operation is used.
`log` and `info` write to stdout; `warn` and `error` write to stderr. Runtime
value formatting covers primitives, arrays, objects, maps, sets, bytes,
lightweight Error-shaped objects and class instances. Direct Error logging
prints `name: message`. Class instances with a runtime `toString()` hook use
its string result both directly and when nested in arrays or objects. Other
class instances keep inspect-like reflected-field formatting; opaque classes
without fields are shown as `ClassName {}`.

C template literals are lowered as runtime strings. Placeholders use string
conversion for supported string, number, boolean and null expressions, including
calls like `String(value)`.

## Targets

```text
node: native console
browser: native console
c + hosted-libuv: stdout/stderr through uv_fs_write
c + embedded: adapter override, or stdio fallback when host I/O is enabled
c + freestanding: no by default
```

## Native Runtime

`stdlib/global/console/include/inox/console.h` exposes the C++ `console`
facade. Generated C++ should keep the JavaScript object shape:

```cpp
console.log("value %d", 7);
console.error("Error", error);
```

`stdlib/global/console/src/console.cc` contains all facade method bodies,
format dispatch, value formatting and stdout/stderr writes. The public header
contains declarations only. When
`INOX_LOOP_BACKEND=libuv`, console uses synchronous `uv_fs_write`; otherwise it
falls back to hosted `fwrite` unless `INOX_CONSOLE_DISABLE_HOST` is defined.

There is no public `inox_console_*` C ABI contract. Low-level helpers are
package-private implementation details behind the C++ facade.

## MVP Limits

- no `console.dir`
- no `console.time`
- no `console.assert`
- no colors by default
- at most 16 values per call in the current C++ backend
- no dynamic `*` width or precision in generated printf-shaped formats
