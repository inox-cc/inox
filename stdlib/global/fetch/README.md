# fetch

`fetch` is a JS-like HTTP API. It is available only when the selected
target/platform enables the `fetch` capability.

The current native slice is libuv-only. Generated C++ lowers global
`fetch(...)` to the `inox::fetch(...)` facade in
`stdlib/global/fetch/src/fetch.cc`; the same source contains the HTTP client
backend. The supported URL shapes are `http://host:port/path` and, when a TLS
backend is enabled, `https://host:port/path`; hostnames are resolved to IPv4
through the libuv TCP runtime. When targeting C without
`--loop-backend libuv`, any `fetch(...)` call is rejected by the compiler with
`INOX_NOT_IMPLEMENTED` before URL or TLS checks run.

The package-local `stdlib/global/fetch/compiler/index.ts` data descriptor owns
the ambient globals, native identities, operations, option checks, runtime
requirements and backend constraints for `fetch`, `Response`, `Headers` and
`AbortController`. Generic checker and C++ lowering paths consume that
descriptor through the selected library set instead of keeping fetch-specific
classification in compiler core.

## Signature

```ts
type FetchResponse = {
  readonly status: number
  readonly ok: boolean
  readonly url: string
  readonly statusText: string
  readonly redirected: boolean
  readonly headers: FetchHeaders
  bytes(): Promise<Uint8Array>
  json(): Promise<unknown>
  text(): Promise<string>
}

type FetchHeaders = {
  get(name: string): string | null
  has(name: string): boolean
}

type FetchInit = {
  readonly method?: string
  readonly headers?: {
    readonly [name: string]: string
  }
  readonly body?: string | Buffer | Uint8Array
  readonly signal?: AbortSignal
  readonly redirect?: 'follow' | 'manual' | 'error'
}

function fetch(url: string, init?: FetchInit): Promise<FetchResponse>

type AbortSignal = {
  readonly aborted: boolean
}

declare class AbortController {
  readonly signal: AbortSignal
  abort(): void
}
```

## Targets

```text
browser: native fetch
node: global fetch or undici adapter
cc + libuv: inox HTTP/HTTPS adapter via stdlib/global/fetch/src/fetch.cc
c + embedded: no
c + freestanding: no by default
```

## Behavior

`fetch` returns a `Promise<FetchResponse>`.

```ts
const res = await fetch('http://127.0.0.1:9000/api')

if (res.ok) {
  console.log(await res.text())
}
```

Supported request options and response fields:

```ts
const res = await fetch('http://127.0.0.1:9000/api', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: '{"name":"Ada"}'
})
const body = await res.text()
const contentType = res.headers.get('content-type') ?? 'missing'

console.log(res.status, res.statusText, res.ok, res.redirected, res.url, contentType, body)
```

Abort cancellation supports the Node/web `AbortController` shape:

```ts
const controller = new AbortController()

setTimeout(() => {
  controller.abort()
}, 100)

try {
  await fetch('http://127.0.0.1:9000/slow', {
    signal: controller.signal
  })
} catch (error) {
  console.log(error.name, error.code)
}
```

The compiler accepts object-literal `init` values with `method`, object-literal
string headers, string/`Buffer`/`Uint8Array` bodies, `signal` and
`redirect: 'follow' | 'manual' | 'error'`. Aborted requests reject with an
Error-like object whose `name` is `AbortError` and whose `code` is `ABORT_ERR`.
Follow redirects are supported for replayable GET-style requests without custom
headers or request bodies. Manual redirects return the redirect response and its
`Location` header, while `redirect: 'error'` rejects on redirect. Buffered
responses support both `Content-Length` and HTTP/1.1
`Transfer-Encoding: chunked` bodies. Unsupported
init options such as `cache`, unsupported `Headers` / `Request` constructors,
`https://` URLs without a configured TLS adapter, `response.body` streams, and
unsupported response body helpers such as `response.arrayBuffer()`,
`response.blob()` and `response.formData()` are reported with `INOX_FETCH`
after the C compile has selected the libuv loop backend. Buffered responses
support `text()`, `bytes()` and `json()`; invalid JSON rejects the returned
promise.

## HTTPS/TLS

C/libuv builds keep TLS disabled by default. Configure one TLS backend in CMake:

```sh
cmake -S examples/simple -B dist/examples/simple/build-libuv \
  -DINOX_LOOP_BACKEND=libuv \
  -DINOX_TLS_BACKEND=boringssl
```

Supported backend values are `none`, `boringssl` and `openssl`. BoringSSL uses
the submodule initialized by `pnpm run boringssl:bootstrap`; OpenSSL uses
CMake `find_package(OpenSSL)`. Both backends support explicit trust roots:

```sh
-DINOX_TLS_CA_BUNDLE=/path/to/cacert.pem
-DINOX_TLS_CA_PATH=/path/to/certs
```

BoringSSL consumers must enable CXX in the final CMake project and link the
final executable with the C++ linker because BoringSSL is built from C++ sources.
The repository example does this automatically for
`pnpm run example:simple:libuv-boringssl`.

## Embedded Notes

Embedded targets should avoid requiring a large runtime. The current network
plan does not include embedded `fetch`; a future embedded slice must use a
configured adapter such as lwIP, mbedTLS, wolfSSL, a vendor SDK HTTP client, an
RTOS network stack or a custom board transport.

MVP embedded builds may set a body limit:

```json
{
  "fetch": {
    "maxBodyBytes": 4096
  }
}
```

If the response is larger than the limit, body readers should reject or return
an error.

Streaming response bodies can be added after MVP:

```ts
const res = await fetch('http://device.local/stream')

for await (const chunk of res.body) {
  console.log(`chunk size ${chunk.length}`)
}
```

## MVP Limits

- `fetch` init supports only object literals with `method`, object-literal
  headers, buffered string/bytes bodies, `signal` and `redirect`
- response headers support `get(name)` and `has(name)` only
- `arrayBuffer()`, `blob()`, `formData()` and `body` streams are not implemented
  yet
- redirect following is limited to replayable GET-style requests
- URL support covers `http://`, `https://` with a TLS backend, explicit/default
  ports, query strings, fragments stripped from the request, `localhost`,
  IPv4-resolvable hostnames and root-relative `Location` redirects
- HTTP response parsing supports `Content-Length` and
  `Transfer-Encoding: chunked`
- cookies are not supported
- cache is not supported
- credentials are not supported
- streaming request/response bodies can come later
- HTTPS/TLS requires a configured C TLS backend and still reports `INOX_FETCH`
  for literal `https://` URLs when `--tls-backend none` /
  `INOX_TLS_BACKEND=none` is selected
