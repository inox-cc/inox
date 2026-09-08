# node:stream

References:

- <https://nodejs.org/api/stream.html>

The C++ backend provides a small Node-compatible stream foundation. It is
implemented as a managed C++ facade and does not depend on a host Node runtime.

## Supported API

- `new PassThrough()`
- string, `Buffer`, and `Uint8Array` chunks
- `write(chunk, callback?)`
- `end(chunk?, callback?)`
- `destroy()`
- `pipe(destination)` between supported streams
- `pause()`, `resume()`, and `isPaused()`
- `on()` and `once()` for `data`, `end`, `finish`, `close`, `drain`, and `error`
- inherited `EventEmitter` listener management such as `addListener()`,
  `off()`, `removeListener()`, `removeAllListeners()`, and `listenerCount()`
- `destroyed`, `readable`, `readableEnded`, `readableLength`, `writable`,
  `writableEnded`, and `writableLength`
- a 16 KiB default high-water mark and `drain` notification after buffered
  data starts flowing

`data` listeners receive `Buffer` chunks. `PassThrough` preserves bytes and
forwards them unchanged.

## Explicitly Unsupported

The following APIs still produce `INOX_NOT_IMPLEMENTED` diagnostics:

- direct construction of `Stream`, `Readable`, `Writable`, `Duplex`, or
  `Transform`
- custom `_read`, `_write`, and `_transform` hooks and constructor options
- `Readable.from()` and pull-mode `read()`
- `pipeline()` and `stream.promises.pipeline()`
- `finished()` and `stream.promises.finished()`

These areas need additional runtime semantics; they are not silently emulated
with behavior that differs from Node.

## Targets

```text
cc embedded: PassThrough core
cc libuv: PassThrough core
node: native node:stream
browser: no
```

## Native Facade

`include/inox/stream.h` contains declarations only. The implementation lives in
`src/stream.cc`. `Stream` derives from the `node:events` facade and exposes its
shared event state through the generic native-class interface hook. Stream
instances are managed `inox::Value` objects, and generated code calls the C++
facade directly.
