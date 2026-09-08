# node:events

Reference: <https://nodejs.org/api/events.html>

The C++ backend provides a native `EventEmitter` foundation without depending
on a host Node runtime.

## Supported API

- `new EventEmitter()` through named and default-module imports
- `addListener()` and `on()`
- `once()`
- `emit()` with runtime values
- `listenerCount()`
- `off()` and `removeListener()`
- `removeAllListeners()` with or without an event name

Listeners run synchronously in registration order. Duplicate listeners are
allowed, `removeListener()` removes the most recently registered matching
listener, and a `once()` listener is removed before it is called. Emitting an
`error` event without a listener throws its first argument.

Event names are currently strings. Symbol event names, `eventNames()`,
`listeners()`, max-listener controls, `EventEmitterAsyncResource`, abort helpers
and async iterator/listener helpers remain explicitly unsupported.

## Targets

```text
cc embedded: yes
cc libuv: yes
node: native node:events
browser: no
```

## Native facade

`include/inox/events.h` contains declarations only. `src/events.cc` owns the
listener storage and managed facade implementation. Other native packages can
inherit `EventEmitter` through package metadata and the generic native-class
interface hook; the compiler core has no `node:events` knowledge.
