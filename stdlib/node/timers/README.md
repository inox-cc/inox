# timers

Timers are global prelude APIs available when the selected target/profile enables the `timers` capability.
The same runtime slice is also available through `node:timers` default and
named imports.

## Signatures

```ts
type TimeoutHandle
type IntervalHandle
type ImmediateHandle

handle.ref(): typeof handle
handle.unref(): typeof handle
handle.hasRef(): boolean

function setTimeout(callback: () => void, delay?: number): TimeoutHandle
function clearTimeout(handle: TimeoutHandle): void

function setInterval(callback: () => void, delay?: number): IntervalHandle
function clearInterval(handle: IntervalHandle): void

function setImmediate(callback: () => void): ImmediateHandle
function clearImmediate(handle: ImmediateHandle): void
```

Supported import forms:

```ts
import timers from 'node:timers'
import { setTimeout, clearTimeout, setImmediate } from 'node:timers'
import { setTimeout as delay } from 'node:timers'
```

`node:timers/promises` is a separate package implemented on the same event
loop. It provides Promise-based `setTimeout` and `setImmediate` functions.

`node:timers` import binding metadata comes from `stdlib/node/timers/index.d.ts`.
The package compiler entrypoint owns the global aliases, module bindings,
native handle types, diagnostics, runtime requirements, and C++ lowering
metadata. Removing this package therefore removes the timer API and its native
build inputs without compiler-core changes.

## Targets

```text
browser: native timers
node: native timers
cc + libuv: uv_timer_t plus next-turn queue
c + embedded: configured monotonic clock and poll/tick adapter
c + freestanding: no by default unless timers adapter is configured
```

The private native implementation uses two loop backends:

- `INOX_LOOP_BACKEND=embedded` uses `runtime/src/async/loop.c`, a
  deterministic poll-driven scheduler. The host passes monotonic milliseconds
  into `inox_loop_poll(loop, now_ms)`.
- `INOX_LOOP_BACKEND=libuv` uses `runtime/src/async/loop-libuv.c`, owns an
  internal `uv_loop_t`, and maps immediates, timeouts and intervals to
  `uv_timer_t`. Its `inox_loop_poll` call drives libuv with `UV_RUN_ONCE` when
  the turn did not start with microtasks, so non-zero timeouts wait on libuv
  time and can wake alongside network/fs events. Turns that start by draining
  microtasks stay non-blocking (`UV_RUN_NOWAIT`) so timers created from those
  microtasks keep the next-turn rule.

Generated C++ calls the JS-shaped `TimersModule` C++ facade in `inox/timers.h`.
Raw loop scheduling stays private to `timers.cc`; CMake selects the loop backend
without changing generated C++.

## Behavior

`setTimeout` runs the callback on a future loop turn.

```ts
setTimeout(() => {
  console.log('later')
}, 1000)
```

`setInterval` repeats until cleared.

```ts
const interval = setInterval(() => {
  console.log('tick')
}, 1000)

clearInterval(interval)
```

`setImmediate` runs after the current task and its microtasks, on the next loop turn.

```ts
setImmediate(() => {
  console.log('next turn')
})
```

`clear*` functions are idempotent.

```ts
const timeout = setTimeout(() => {
  console.log('later')
}, 1000)

clearTimeout(timeout)
clearTimeout(timeout)
```

`delay` is milliseconds and defaults to `1`. Values below `1`, non-finite
values and values above `2147483647` are normalized to `1`; fractional values
are truncated, matching Node's timer range.

Callbacks may be synchronous or async. Async callbacks are lowered through the
active async-result package intrinsic and continue on the same generated event
loop. Rejections follow the configured async-result provider's unhandled-error
semantics.

Timer handles are referenced by default. `unref()` allows the program to exit
when no other referenced work remains; `ref()` restores the default behavior,
and `hasRef()` reports the current state. An uncleared referenced interval is an
intentional forever-running program.

## Event Loop

The event loop has a small target-neutral model:

```text
run one task
drain microtasks
run due immediates/timers/fs callbacks
drain microtasks after each callback batch
stop when no referenced handles and no pending tasks
```

It does not need to copy Node phases exactly. The goal is stable semantics that can run on libuv, Node, browsers and embedded targets.

## Embedded Notes

Embedded timers use host-provided time:

```c
while (1) {
  uint64_t now = board_millis();
  inox_loop_poll(loop, now);
  board_idle_until_next_tick();
}
```

New immediates and timers never run in the same poll turn that creates them.
Callbacks may queue microtasks; the loop drains those microtasks after each
callback. Managed timer handles retain callback state across future turns, and
`clear` is safe to call more than once.

The timers capability must not require threads, OS sleep, file descriptors, signals, `select`, `poll`, `epoll`, `kqueue` or `libuv`.
That requirement applies to the embedded backend. The hosted libuv backend is
opt-in and should be covered by the feature matrix, including a
generated C++ timer program linked with `INOX_LOOP_BACKEND=libuv`. Generated C++
keeps the embedded sleep-until-next-timer helper behind
`#if !defined(INOX_LOOP_BACKEND_LIBUV)`; libuv builds rely on the owned
`uv_loop_t` for timer waiting.
