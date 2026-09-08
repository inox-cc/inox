# time

Time APIs are split into wall-clock time and monotonic time.

Use `Date.now()` for timestamps. Use `performance.now()` for durations.

## Signatures

```ts
new Date(): Date
new Date(value: number | string | Date): Date
new Date(
  year: number,
  month: number,
  day?: number,
  hour?: number,
  minute?: number,
  second?: number,
  millisecond?: number
): Date

Date.now(): number
Date.parse(value: string): number
Date.UTC(
  year: number,
  month: number,
  day?: number,
  hour?: number,
  minute?: number,
  second?: number,
  millisecond?: number
): number

Date.prototype.getTime(): number
Date.prototype.valueOf(): number
Date.prototype.getFullYear(): number
Date.prototype.getMonth(): number
Date.prototype.getDate(): number
Date.prototype.getDay(): number
Date.prototype.getHours(): number
Date.prototype.getMinutes(): number
Date.prototype.getSeconds(): number
Date.prototype.getMilliseconds(): number
Date.prototype.getTimezoneOffset(): number
Date.prototype.getUTCFullYear(): number
Date.prototype.getUTCMonth(): number
Date.prototype.getUTCDate(): number
Date.prototype.getUTCDay(): number
Date.prototype.getUTCHours(): number
Date.prototype.getUTCMinutes(): number
Date.prototype.getUTCSeconds(): number
Date.prototype.getUTCMilliseconds(): number
Date.prototype.toISOString(): string
Date.prototype.toJSON(): string
Date.prototype.toUTCString(): string
Date.prototype.toString(): string
Date.prototype.toDateString(): string
Date.prototype.toTimeString(): string

const performance: {
  now(): number
}
```

`Date` and `performance` are global prelude APIs.

The package owns all compiler and native integration for these globals:

- `index.d.ts` declares the source API;
- `compiler/index.ts` describes the native type, operations, runtime
  requirements, and C++ lowering;
- `include/inox/time.h` is the declarations-only public C++ facade;
- `src/time.cc` contains the complete facade implementation.

The compiler discovers `global:time` through the generated library registry.
There are no `Date` or `performance` rules in the compiler core. Removing this
package removes its declarations, operations, native type, native source, and
runtime requirements without a central compiler edit.

The C++ backend represents a source `Date` as the package-owned `DateValue`
native object. Parameters and return values use the native C++ type across
generated function and method boundaries. Operation recognition uses only the
standard source-level JavaScript names; generated C++ method names remain an
implementation detail.

`Date.parse` currently supports ISO-like strings such as `YYYY-MM-DD`,
`YYYY-MM-DDTHH:mm:ss.sssZ`, and timezone offsets in `+HH:mm` or `-HH:mm`
form. Unsupported or invalid date strings return `NaN`.

## Date.now

`Date.now()` returns integer wall-clock milliseconds since Unix epoch.

```ts
const startedAt = Date.now()
console.log(`started at ${startedAt}`)
```

Rules:

- wall-clock time
- not monotonic
- can move backwards if system time changes
- requires wall-clock capability

The current hosted implementation reads `std::chrono::system_clock` on each
`Date.now()` call. It does not derive wall time from a cached monotonic base.
Targets that need an RTC or another wall-clock provider should implement that
behind this package's C++ facade.

The `Date.now` operation declares a wall-clock runtime requirement. `Date.parse`
and the string-producing instance methods declare the string runtime
requirement. These requirements are package metadata consumed by the generic
compiler runtime planner.

## performance.now

`performance.now()` returns monotonic milliseconds since runtime start. Fractional milliseconds are allowed.

Rules:

- monotonic time
- intended for durations
- does not move backwards
- requires monotonic-clock capability

The package implementation consumes the runtime-owned monotonic primitive from
`runtime/include/inox/time_bridge.h`. The event loop and runtime core do not
include or call the stdlib time facade, so deleting `global:time` does not break
unrelated async compilation or runtime code.

Hosted C++20 builds use `std::chrono::steady_clock` for the runtime monotonic
primitive. `performance.now()` converts that value to milliseconds. It is
monotonic and intended for measuring durations, but its zero point is an
internal runtime detail.

## Embedded Notes

`Date.now()` must not silently fall back to uptime. If a target has no wall-clock
provider, its capability configuration must reject `Date.now()`.

If a target uses `number: f32`, `Date.now()` may be too imprecise. The compiler should warn or error unless lossy time is explicitly allowed.

Known JavaScript conformance gaps are tracked in
[`docs/compiler-limitations.md`](../../../docs/compiler-limitations.md); they
are not exposed as non-standard stdlib APIs.
