# Event Loop

The event loop is a target-neutral scheduler for async/await, Promise
continuations, timers, async fs and user callbacks.

## Queues

```text
priority microtasks: provider callbacks that must run before normal microtasks
microtasks: promise continuations
immediates: callbacks for the next loop turn
timers: timeout/interval heap
fs wakeups: adapter callbacks or libuv uv_fs callbacks
```

## Execution Rule

```text
run one task
drain priority microtasks before normal microtasks
run due immediates/timers/fs callbacks
drain microtasks after each callback batch
stop when no referenced handles and no pending tasks
```

The model does not copy Node phases exactly. The goal is stable behavior across
libuv, hosted and embedded targets.

Priority is a generic scheduler facility. The `node:process` package uses it
for `nextTick`; the runtime itself does not know that API name.

## Backends

`INOX_LOOP_BACKEND=embedded` uses the lightweight poll-driven scheduler in
`runtime/src/async/loop.c`.

`INOX_LOOP_BACKEND=libuv` uses `runtime/src/async/loop-libuv.c` and links the
vendored `third_party/libuv`. `uv.h` is not part of public inox headers.

The public `inox_loop_*` API is the same for both backends.

## Runtime Contract

```c
inox_loop loop;
inox_promise* promise;
inox_timer_handle* timeout;

inox_loop_init(&loop, allocator);
inox_promise_new(&loop, &promise);
inox_promise_then(promise, on_fulfilled, on_rejected, context, finalizer);
inox_promise_resolve(promise, value);
inox_loop_drain_microtasks(&loop);
inox_loop_set_timeout(&loop, 1000, on_timeout, context, finalizer, &timeout);
inox_loop_clear_timer(timeout);
inox_loop_poll(&loop, now_ms);
inox_loop_run_once(&loop);
inox_loop_run(&loop);
```

`then`, chain and catch callbacks are never called synchronously. Settling a
promise queues reactions as microtasks. Adding a reaction to an already settled
promise also queues a microtask.

Timers created from Promise reactions follow the normal next-turn timer rule.
`clear` is idempotent. An uncleared interval is an explicit forever-running
program.

Libuv requests and active handles keep `inox_loop_has_work` true until their
callbacks settle or clear the work.

Generated hosted programs own one `inox::Loop` in `main`, pass its raw
`inox_loop*` through functions that may await or create async runtime work, and
finish by calling `inox::Loop::run()`. Await lowering may use
`inox_promise_await`, which advances the shared loop through
`inox_loop_run_once`; generated code should not emit its own
`while (inox_loop_has_work(...))` drain loops.

Unhandled promise rejection reporting is a runtime promise responsibility.
Generated code should only consult `inox_promise_has_unhandled_rejection()` when
choosing the final process status.

## Embedded Host

```c
while (1) {
  uint64_t now = board_millis();
  inox_loop_poll(loop, now);
  board_idle_until_next_tick();
}
```

Embedded loop support must not require threads, OS sleep, file descriptors,
signals, `select`, `poll`, `epoll`, `kqueue` or libuv.

## Limits

- public `queueMicrotask` is not supported;
- `ref()` and `unref()` on handles report
  `INOX_TIMER_REF_UNREF`.
