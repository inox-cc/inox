# http / node:http

`node:http` provides the bounded Inox HTTP/1.1 server and client API. It is an imported
stdlib package; bare `http` is intentionally not an alias.

The C++ implementation is libuv-only and lives in the package's single native
source:

- `include/inox/http.h` — declarations-only public facade;
- `include/inox/http_server_transport.h` — declarations-only transport contract
  shared with HTTPS;
- `src/http.cc` — parser, lifecycle state and response implementation.

The compiler reports `INOX_NOT_IMPLEMENTED` when `node:http` is used without
the libuv loop backend.

## Supported API

```ts
import http from 'node:http'

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end('{"ok":true}')
})

server.listen(8080, '127.0.0.1')
```

Request fields:

- `request.headers`
- `request.httpVersion`
- `request.method`
- `request.socket`
- `request.statusCode` and `request.statusMessage` for client responses
- `request.url`

Incoming message API:

- `request.setEncoding('utf8')`
- `request.pause()`, `request.resume()` and `request.isPaused()`
- `request.on('data', listener)`
- `request.on('end' | 'close', listener)`
- `request.on('error', listener)`

Response API:

- `response.statusCode`
- `response.headersSent`
- `response.writableEnded`
- `response.getHeader(name)`
- `response.getHeaderNames()`
- `response.hasHeader(name)`
- `response.removeHeader(name)`
- `response.setHeader(name, value)` (chainable)
- `response.on('drain', listener)`
- `response.writeHead(statusCode, headers?)`
- `response.write(string | Uint8Array)`
- `response.end(string | Uint8Array)` and `response.end()`

Server API:

- `http.createServer(listener?)`
- `server.on('request', listener)`
- `server.address()`
- `server.listen(port?, host?, callback?)`
- `server.listen(options, callback?)`
- `server.close(callback?)`
- `server.setTimeout(milliseconds?, callback?)`
- `server.on('timeout', listener)`

Client API:

- `new http.Agent({ keepAlive?, maxSockets?, maxFreeSockets?, timeout? })`
- `http.globalAgent`
- `RequestOptions.agent` as an `Agent` or `false`
- `agent.destroy()`
- `http.request(url | options, listener?)`
- `http.get(url | options, listener?)`
- `request.setHeader()`, `getHeader()`, `getHeaderNames()`, `hasHeader()` and `removeHeader()`
- `request.write(string | Uint8Array)`
- `request.end(string | Uint8Array)` and `request.end()`
- `request.destroy(error?)` and `request.destroyed`
- `request.setTimeout(milliseconds, callback?)`
- `request.on('response' | 'finish' | 'close' | 'error' | 'timeout', listener)`
- `request.on('drain', listener)`
- `request.headersSent` and `request.writableEnded`

`get()` sends the request immediately. `request.write()` sends headers and body
chunks as soon as the transport is connected; `request.end()` completes the
message. The response listener receives an `IncomingMessage`; its body is
consumed through the same `data` and `end` events as a server request body.

Request listeners are additive. Listener iteration uses a snapshot, so adding a
listener while dispatching a request does not mutate the current dispatch.
Listen and close callbacks are invoked by the underlying network completion,
not synchronously by the facade call.

## C++ facade

Generated C++ follows the JS-shaped API directly:

```cpp
auto server = http.createServer(listener);
server.on("request", second_listener);
server.listen(8080, "127.0.0.1", listening_callback);

auto headers = HttpRequest(request).headers();
auto method = HttpRequest(request).method();
auto socket = HttpRequest(request).socket();
HttpResponse(response).setStatusCode(404);
HttpResponse(response).setHeader("Content-Type", "text/plain");
HttpResponse(response).end("not found");

auto request = http.request(HttpRequestOptions(options), response_listener);
request.setHeader("X-Inox", "yes");
request.write("request body");
request.end();
```

`HttpAgent`, `HttpServer`, `HttpRequest`, `HttpClientRequest` and `HttpResponse` are managed `inox::Value`
facades. Native state is retained by class instances and shared internal state;
the public header does not expose raw server, socket or callback handles.

`node:http` keeps its native runtime independent from fetch and filesystem
implementations. Its declarations refer to the shared `Error` and `AbortSignal`
types, while cancellation reads only the signal's public `aborted` field.
Reading a file for
a response is ordinary user code: `node:fs` produces a `Buffer`, which is a
`Uint8Array` and can be passed to `response.write` or `response.end`. HTTP does
not contain a filesystem-specific fast path.

## Runtime behavior

The plain implementation uses `node:net` as its transport. HTTPS supplies a TLS
transport through the declarations-only server transport contract; both paths
use this package's one parser and request/response lifecycle. Each accepted
connection validates a bounded request header, dispatches the request listener,
and then delivers framed body bytes as they arrive. Bytes after a completed
request remain available for the next request, including HTTP/1.1 pipelining,
while only one user response is active at a time.
Headers remain bounded, but flowing request and response bodies have no fixed
total-size limit. Consumed server bytes are released incrementally. A paused
`IncomingMessage` pauses the underlying TCP socket; plaintext already decoded
from the current TLS record is retained in a bounded 256 KiB in-flight buffer
until `resume()`.
Incoming header names are normalized to lowercase and repeated values are
joined with `, `, matching the ordinary Node request-header view.
An outgoing request or response written only through `end(body)` receives an
implicit `Content-Length`. Calling `write()` first sends headers immediately and
selects `Transfer-Encoding: chunked` unless the user supplied a valid
`Content-Length`; subsequent writes are delivered without retaining the whole
body. The final `end()` validates fixed-length framing or writes the terminating
chunk. Conflicting framing, unsupported transfer codings and mismatched lengths
are rejected and the connection is not reused.

HTTP/1.0 responses preserve their protocol version. A response that starts
with `write()` and has no explicit `Content-Length` uses close-delimited
framing, because HTTP/1.0 does not support chunked transfer coding.

HTTP/1.1 uses keep-alive by default. `Connection: close` is honored; HTTP/1.0
connections close by default and accept explicit `Connection: keep-alive`.
`Server.close()` also closes a connection once its active response is complete.
Server requests accept either `Content-Length` or a single
`Transfer-Encoding: chunked` coding.
Chunked request extensions and trailers are validated, and trailers are not
exposed by the current facade. Incoming server
body fragments are delivered through `data` events as transport bytes arrive,
followed by `end` when framing is complete. A response may start before the
request body has completed; keep-alive advances only after both sides complete.
Client responses accept either `Content-Length`, connection-close framing, or a
single `Transfer-Encoding: chunked` coding. Chunk boundaries may span transport
reads; extensions and trailers are validated, while only decoded body bytes are
delivered to listeners. Response trailers are not exposed by the current facade.

Framed client responses return their transport to the request's `Agent`. A
matching sequential request may reuse it; the origin key also includes the
plain/TLS transport and TLS verification settings. Idle transports are
unreferenced, so a pool cannot keep an Inox program alive.

`maxSockets` limits active and connecting transports independently for each
origin. Requests above that limit wait in FIFO order. Their writes remain
buffered until a transport becomes available, and a released keep-alive
transport is handed directly to the oldest matching request. A busy origin does
not block requests to another origin.

`http.globalAgent` keeps connections alive, retains at most 256 free transports
per origin, has no finite `maxSockets` limit and expires inactive transports
after 5 seconds. A newly constructed `Agent` follows Node's non-persistent
default (`keepAlive: false`) and accepts `keepAlive`, positive-integer
`maxSockets`, `maxFreeSockets` and inactivity `timeout` controls. An explicit
request timeout overrides the agent timeout. `agent: false` sends
`Connection: close` and never pools the transport. `agent.destroy()` closes
both active and idle transports owned by that agent without preventing later
requests from using it. Connection-close-delimited responses and messages
carrying `Connection: close` are never reused.

Status codes and header names/values are validated before serialization. Header
values containing CR or LF are rejected.

Outgoing `write()` returns the underlying `node:net` high-water result. HTTP
and HTTPS emit `drain` after the TCP queue becomes writable again; TLS uses an
ordered zero-byte completion behind the encrypted records, so it has the same
completion semantics as plain HTTP.

`ClientRequest.setTimeout()` and `RequestOptions.timeout` measure transport
inactivity. A timeout emits `timeout` but does not close the request; user code
may call `destroy()`. `RequestOptions.signal` cancels through `AbortSignal` and
emits one error followed by one close. `Server.setTimeout()` applies to newly
accepted connections. With timeout listeners the listener owns the socket
decision; without them an idle connection is closed. HTTP and HTTPS share this
lifecycle implementation.

## Limits

- bounded HTTP/1.0 and HTTP/1.1 message framing; no later protocol versions
- libuv backend only
- public `Agent` supports keep-alive, per-origin `maxSockets` FIFO queues,
  free-socket limits, inactivity timeout and `destroy()`; configurable queue
  scheduling, `maxTotalSockets`, custom connection factories and public socket
  maps are not implemented
- `node:http` accepts only `http://`; HTTPS client calls are provided by
  `node:https` over the same HTTP/1.1 implementation
- no HTTP/2
- outgoing request and response writes are delivered incrementally with
  `Content-Length` or chunked framing and expose `drain`, but not the rest of
  the full Node Writable stream API
- server request and client response bodies accept bounded framing metadata and
  stream without a fixed total-body limit; `pause`/`resume` are supported, but
  the rest of the full Node Readable API and public trailers are not
- no WebSocket upgrade
- bounded request/response headers and paused in-flight buffers

Replacing the bounded parser with a full HTTP parser must not change the public
facade or introduce package-specific compiler lowering.
