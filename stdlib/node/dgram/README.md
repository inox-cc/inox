# dgram

`dgram` is the UDP networking module. In inox it is a C++/libuv-only runtime
capability. Imports from `node:dgram` are compile-time stdlib imports for C++
targets and lower to the JS-shaped `dgram` and `Socket` facades; they are not
emitted as host Node imports. Bare `dgram` is intentionally not an alias for
`node:dgram`. When compilation does not select `--loop-backend libuv`, these
imports are rejected with `INOX_NOT_IMPLEMENTED`.

## Supported C++/libuv Slice

```ts
import dgram from 'node:dgram'

const server = dgram.createSocket('udp4')

server.on('message', (message, rinfo) => {
  server.send(message, rinfo.port, rinfo.address)
})

server.on('listening', () => {
  server.addMembership('224.0.0.251', '127.0.0.1')
})

server.bind(0, '127.0.0.1', () => {
  const address = server.address()
  console.log(address.port)
})
```

The current high-level compiler slice supports:

- `dgram.createSocket('udp4')`
- `dgram.createSocket({ type: 'udp4' }, callback?)`
- `socket.on('message', (message, rinfo) => { ... })`
- `socket.on('listening' | 'connect' | 'close', listener)`
- `socket.on('error', listener)`
- `socket.bind(port?, address?, callback?)`
- `socket.bind({ port?, address? }, callback?)`
- `socket.connect(port, address?, callback?)`
- `socket.disconnect()`
- `socket.address()` with `address`, `family` and `port`
- `socket.remoteAddress()` with `address`, `family` and `port`
- `socket.send(message, port, address, callback?)`
- `socket.send(message, callback?)` after `connect(...)`
- `socket.setBroadcast(flag)`
- `socket.addMembership(group, interface?)` / `socket.dropMembership(group, interface?)`
- `socket.setMulticastInterface(address)`
- `socket.setMulticastLoopback(flag)` / `socket.setMulticastTTL(ttl)`
- `socket.setTTL(ttl)`
- `socket.getSendBufferSize()` / `socket.setSendBufferSize(size)`
- `socket.getRecvBufferSize()` / `socket.setRecvBufferSize(size)`
- `socket.getSendQueueCount()` / `socket.getSendQueueSize()`
- `socket.ref()` / `socket.unref()`
- `socket.close(callback?)`

Incoming `message` values are owned `Buffer` objects. `rinfo.address`,
`rinfo.family`, `rinfo.port` and `rinfo.size` describe the received datagram;
the buffer and remote information remain valid for the whole listener call.
Outgoing `send()` accepts `string`, `Buffer` and `Uint8Array` values.
A send callback receives `(error, bytes)`: `error` is `null` on success and
`bytes` is the completed payload size.

The public C++ header contains declarations only. The generated form mirrors
the TypeScript API, for example `dgram.createSocket(...)`, `socket.on(...)`,
`socket.bind(...)`, `socket.send(...)` and `socket.close(...)`. Socket values
share RAII-managed state, so copied facade values refer to the same native
socket without exposing raw handles. The shared state owns registered runtime
callbacks and pending send payloads for as long as libuv can use them.

Callback timing follows the libuv lifecycle rather than the generated call
site:

- message listeners run from the UDP receive callback;
- message listeners are additive, and binding starts receive processing even
  before a listener is registered;
- bind and connect callbacks are queued for a later event-loop turn after the
  native operation succeeds;
- send callbacks run from the corresponding `uv_udp_send` completion;
- close callbacks registered before handle completion are retained and run only
  after the libuv handle has closed.

Callbacks are managed runtime values and may capture supported values. They are
retained by the socket or pending operation until delivery and are not invoked
inline merely because `bind()`, `connect()`, `send()` or `close()` returned.

## Targets

```text
node: node:dgram adapter
C++ + libuv: uv_udp adapter via stdlib/node/dgram/src/dgram.cc
C++ + embedded: no
freestanding: no
browser: no
```

## Current Limits

- UDP4 only
- numeric IPv4 hosts such as `127.0.0.1` and `0.0.0.0`
- no IPv6
- no source-specific multicast membership
- no `send()` offset/length lowering yet

Unsupported dgram socket methods and unsupported socket types such as `udp6`
are reported with `INOX_DGRAM_SOCKET` diagnostics for C++ targets.
