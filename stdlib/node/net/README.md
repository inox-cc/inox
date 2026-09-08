# net

`net` is the TCP networking module. In inox it is currently a C++/libuv-only
runtime module; embedded networking remains out of scope until a concrete board
adapter is designed.

Compile-time imports from `node:net` must lower to the inox target runtime. They
must not remain host Node imports in generated C++ output. Bare `net` is
intentionally not an alias for `node:net`. When the C++ compile does not select
`--loop-backend libuv`, `node:net` imports are rejected
with `INOX_NOT_IMPLEMENTED`.

## Supported Node-Style Slice

```ts
import net from 'node:net'

const server = net.createServer((socket) => {
  socket.end('hello')
})

server.on('listening', () => {
  const address = server.address()
  console.log(address.address, address.family, address.port)
})

server.listen({
  host: '127.0.0.1',
  port: 9000,
  backlog: 16
})

console.log(server.listening)
```

Client example:

```ts
import net from 'node:net'

const client = net.createConnection(9000, '127.0.0.1', () => {
  console.log('connected')
})

client.setEncoding('utf8')
client.pause()
console.log(client.isPaused(), client.readyState)
client.resume()
client.on('ready', () => {
  client.setNoDelay()
  client.setKeepAlive(true, 10)
  client.write('ping')
})
client.on('data', (chunk) => {
  const remoteAddress = client.remoteAddress
  const remotePort = client.remotePort
  const bytesRead = client.bytesRead
  console.log(remoteAddress, remotePort, bytesRead)
  console.log(chunk)
  client.end()
})
```

The C++ backend currently lowers:

- `import net from 'node:net'`
- `import { createServer } from 'node:net'`
- `import { connect, createConnection } from 'node:net'`
- `net.createServer(listener?)`
- `createServer(listener?)`
- chained `net.createServer(...).listen(...)`
- `server.on('connection' | 'listening' | 'close' | 'error', listener)`
- `server.listen(port?, host?, backlog?, callback?)`
- `server.listen({ port?, host?, backlog? }, callback?)`
- `server.address()` with `address`, `family` and `port`
- `server.close(callback?)`
- `server.getConnections(callback)`
- `server.maxConnections`
- `server.listening`
- `server.ref()` and `server.unref()`
- `net.connect(port, host?, callback?)`
- `net.connect({ port, host }, callback?)`
- `net.createConnection(...)` and named `createConnection(...)` as aliases
- `socket.on('connect' | 'ready' | 'data' | 'end' | 'close' | 'error' |
  'drain' | 'timeout', listener)`
- `socket.write(text, callback?)`
- `socket.end(text?, callback?)`
- `socket.destroy()`
- `socket.setEncoding('utf8')` / `socket.setEncoding('utf-8')`
- `socket.address()` with `address`, `family` and `port`
- client socket address locals: `socket.remoteAddress`, `socket.remotePort`,
  `socket.localAddress` and `socket.localPort`
- client socket byte-counter locals: `socket.bytesRead` and
  `socket.bytesWritten`
- client socket lifecycle properties: `socket.connecting`, `socket.pending`,
  `socket.destroyed` and `socket.readyState`
- `socket.pause()`, `socket.resume()` and `socket.isPaused()`
- `socket.setNoDelay(enabled?)`
- `socket.setKeepAlive(enabled?, initialDelay?)`
- `socket.setTimeout(milliseconds, callback?)`
- `socket.ref()` and `socket.unref()`
- connection listeners receive the same `Socket` facade and support the full
  slice above

## Targets

```text
node: node:net adapter
cc + libuv: uv_tcp adapter via stdlib/node/net/src/net.cc
c + embedded: no
c + freestanding: no by default
browser: no
```

## Native Facade

`stdlib/node/net/include/inox/net.h` exposes `NetServer` and `NetSocket` for TCP
server/client operations. Generated C++ should call the facade directly:

```cpp
NetServer server = net.createServer(connection_listener);
if (inox::thrown()) return;

server.listen(8080, "127.0.0.1", 128, listening_callback);
if (inox::thrown()) return;

NetAddress address = server.address();
if (inox::thrown()) return;

NetSocket socket = net.connect(8080, "127.0.0.1", connect_callback);
if (inox::thrown()) return;

socket.on("data", data_listener);
socket.write("ping");
if (inox::thrown()) return;
```

Host parameters use the `inox::StringView` facade surface; string literals are
accepted through overload construction, while null-terminated `const char*`
handling stays inside the native implementation.

`NetServer` and `NetSocket` are managed `inox::Value` class instances. They can
cross generic callback and formatting boundaries without exposing native
handles. Generated user code keeps facade objects and calls their methods
directly. Runtime errors use `inox::thrown()` / `inox::take_exception()`.

Older public `inox_net_*` and status/out-parameter wrappers are not part of the
current facade surface.

The libuv implementation uses `uv_tcp_t`, `uv_listen`, `uv_accept`,
`uv_read_start`, `uv_write`, `uv_shutdown`, `uv_close`, `uv_tcp_getsockname`,
`uv_tcp_getpeername`, `uv_tcp_nodelay`, `uv_tcp_keepalive`, `uv_getaddrinfo`,
`uv_ref` and `uv_unref`. Runtime server callbacks and pending socket operations
are registered as external loop handles so generated programs stay alive until
the TCP handles close. The non-libuv fallback throws an unsupported-operation
runtime error.

`Socket.setTimeout()` measures transport inactivity and resets after successful
reads and writes. A timeout emits `timeout` but does not close the socket;
closing remains the listener's responsibility. Passing `0` disables the
timer. The optional callback is registered for the next timeout only.

`Server.getConnections()` reports the current accepted-socket count
asynchronously. `maxConnections` is `undefined` until assigned; a configured
non-negative integer limits newly accepted sockets, including `0`, which drops
all new connections. `Server.close()` stops accepting immediately and emits
`close` only after every previously accepted socket has closed.

## Current Limits

- TCP4 only; numeric IPv4 hosts and hostnames that resolve to IPv4 are
  supported through libuv. IPv6 and IPC sockets are planned later.
- Socket data callbacks currently expose the received bytes as text for the
  supported lowering paths. Full Buffer-mode stream parity is planned later.
- Advanced Duplex stream behavior beyond flowing text, pause/resume and
  high-water `write()`/`drain` backpressure is planned later.
- `server.listen({ exclusive })` reports a `INOX_NET_SERVER` diagnostic because
  libuv reuse semantics are not exposed in this slice.
