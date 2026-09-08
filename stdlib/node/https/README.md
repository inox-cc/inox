# https / node:https

`node:https` provides the Inox HTTPS client and server facade. It reuses the
HTTP/1.1 request, response, parsing and keep-alive implementation from
`node:http` and selects the runtime TLS transport; the package does not contain
a second HTTP implementation.

## Supported API

- `https.createServer({ cert, key }, listener?)`
- `ServerOptions.cert` and `ServerOptions.key` as PEM `string` or `Uint8Array`
- the `node:http` `Server`, `IncomingMessage` and `ServerResponse` APIs
- `https.get(url | options, listener?)`
- `https.request(url | options, listener?)`
- `new https.Agent({ keepAlive?, maxSockets?, maxFreeSockets?, timeout? })`
- `https.globalAgent`
- `RequestOptions.agent` with an `https.Agent`, compatible `http.Agent`, or
  `false`
- the common `node:http` header, host, path, signal and timeout request fields
- `rejectUnauthorized?: boolean` (defaults to `true`)
- `servername?: string`
- the `node:http` `ClientRequest` and `IncomingMessage` APIs

This includes shared client cancellation, inactivity timeouts, `destroy(error?)`
and server connection timeouts; HTTPS does not implement a separate lifecycle.

HTTPS agents use the common `node:http` pool implementation. Socket limits and
FIFO queues are maintained per origin. The HTTPS origin identity also includes
certificate verification and SNI server-name policy, so connections with
different TLS settings are never mixed. `https.globalAgent` has its own TLS
pool, separate from `http.globalAgent`; `agent: false` disables pooling for a
request, and `agent.destroy()` closes the agent's idle and active connections.

`get()` sends immediately. `request.write()` uses the shared `node:http`
streaming path: the first write is sent after the TLS handshake and selects
chunked framing unless an explicit `Content-Length` is present.

HTTPS servers accept TCP connections with `node:net`, complete a server-side
TLS handshake in the generic runtime backend, and pass the decrypted stream to
the shared `node:http` server transport contract. Request body streaming,
response framing, keep-alive and connection shutdown therefore have the same
behavior as plain HTTP.
The shared API also provides `IncomingMessage.pause()` / `resume()` and
high-water `write()` results with `drain` events. Streaming bodies do not have a
fixed total-size limit; only headers, framing metadata and paused in-flight data
remain bounded.

The C++ facade is declared in `include/inox/https.h` and implemented entirely
in `src/https.cc`. The compiler package descriptor owns all
TypeScript-to-facade bindings and requests the libuv and TLS runtime
capabilities.

## Limits

- HTTP/1.1 only
- libuv plus BoringSSL or OpenSSL is required
- the server accepts one PEM certificate and matching PEM private key; no SNI,
  certificate selection, client-certificate authentication or custom TLS
  policy
- no configurable scheduling, `maxTotalSockets`, custom connection factory or
  public socket maps on `https.Agent`
- no client certificates or custom CA options for outgoing requests
- response bodies use the same bounded framing as `node:http`, including
  incremental decoding of a single `Transfer-Encoding: chunked` coding;
  response trailers are validated but not exposed
