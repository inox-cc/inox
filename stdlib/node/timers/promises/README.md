# node:timers/promises

Promise-based timers run on the same target-neutral event loop as `node:timers`.

## Signatures

```ts
function setTimeout(delay?: number): Promise<void>
function setTimeout<T>(delay: number, value: T): Promise<T>
function setImmediate(): Promise<void>
function setImmediate<T>(value: T): Promise<T>
```

Named and default imports are supported. The promise is fulfilled with the
optional value on a future loop turn. Timeout delays use the same normalization
as `node:timers`: the default is `1` millisecond, fractional values are
truncated, and values outside Node's timer range become `1`.

Abort signals, timer options and the async-iterator form of `setInterval` are
not supported yet.

The package owns its compiler metadata and C++ facade. It depends only on the
generic Promise and event-loop runtime mechanisms; compiler core has no timer
promise names or lowering branches.
