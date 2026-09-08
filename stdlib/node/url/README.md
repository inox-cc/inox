# node:url

Reference: <https://nodejs.org/api/url.html>

The C++ backend supports a narrow `node:url` slice for file URL conversion,
basic URL objects and minimal `URLSearchParams`. Imports use the standard Node
spelling and lower to `inox/url.h`.

Supported imports:

```ts
import url from 'node:url'
import { URL, URLSearchParams, fileURLToPath, pathToFileURL } from 'node:url'
```

Supported APIs:

```ts
fileURLToPath(url: string | URL): string
pathToFileURL(path: string): URL
new URL(input: string, base?: string | URL): URL
url.toJSON(): string
url.toString(): string
new URLSearchParams(init?: string | Record<string, string>): URLSearchParams
params.get(name: string): string | null
params.getAll(name: string): string[]
params.has(name: string, value?: string): boolean
params.size: number
params.set(name: string, value: string): void
params.sort(): void
params.append(name: string, value: string): void
params.delete(name: string, value?: string): void
params.entries(): URLSearchParamsIterator<string[]>
params.forEach(callback): void
params.keys(): URLSearchParamsIterator<string>
params.toString(): string
params.values(): URLSearchParamsIterator<string>
```

Supported `URL` fields:

```ts
url.href
url.protocol
url.hostname
url.port
url.pathname
url.search
url.hash
```

Supported mutable `URL` fields:

```ts
url.pathname = value
url.search = value
url.hash = value
```

Targets:

```text
c embedded: yes
c libuv: yes
node: yes
browser: no by default
```

Unsupported APIs:

- `domainToASCII`
- `domainToUnicode`
- `format`
- `parse`
- `resolve`
- `urlToHttpOptions`
- full WHATWG URL edge-case conformance
- `URLSearchParams` array initialization and duplicate-preserving object
  initialization beyond the documented string/object slice

Unsupported methods are rejected by the checker with `INOX_NOT_IMPLEMENTED`.
They are not emitted as C stubs and do not increase binary size.

`node:url` import binding metadata comes from `stdlib/node/url/index.d.ts`.
Runtime method/constructor diagnostics and C++ lowering live in this package's
`compiler/` files.

C++ target notes:

- `fileURLToPath` accepts a string or a supported `URL` object.
- `pathToFileURL` supports POSIX paths and percent-encodes path bytes outside a
  small unreserved set.
- `new URL(input, base?)` supports absolute `scheme://host[:port]/path?query#hash`
  URLs and simple relative paths with an absolute string or URL base.
- Assigning `pathname`, `search` or `hash` updates the stored field and rebuilds
  `href`. `search` and `hash` add `?` / `#` when the assigned value omits it.
- `URLSearchParams` normalizes string input to form-query encoding. `get()`
  decodes `%XX` and `+`; `toString()` returns the normalized serialized query
  string without a leading `?`. The optional `value` filters of `has()` and
  `delete()` compare decoded values. The object and its `entries()`, `keys()`
  and `values()` results are iterable; `forEach()` uses the standard
  `(value, key, searchParams)` callback order and observes appended pairs.
- Store returned URL and URLSearchParams objects in local variables before
  reading fields or calling methods.

Example:

```ts
import { URL, URLSearchParams, fileURLToPath, pathToFileURL } from 'node:url'

const file = pathToFileURL('/tmp/a b')
console.log(file.href)
console.log(fileURLToPath(new URL('file:///tmp/a%20b')))

const base = new URL('https://example.com/root/file')
const page = new URL('next?q=1', base)
page.hash = 'top'
console.log(page.href)

const params = new URLSearchParams({ q: 'hello world' })
params.set('page', '1')
console.log(params.toString())
```
