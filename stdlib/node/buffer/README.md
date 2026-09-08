# Binary Data

Binary data follows a Node-like `Buffer` plus typed array model.

MVP:

```ts
class Uint8Array {
  readonly length: usize

  constructor(length: usize)
  slice(start: number, end?: number): Uint8Array
}

class Buffer extends Uint8Array {
  static from(value: string, encoding?: string): Buffer
  static from(value: Uint8Array): Buffer
  static alloc(size: usize): Buffer
  static byteLength(value: string, encoding?: string): number
  static compare(first: Uint8Array, second: Uint8Array): number
  static concat(list: Uint8Array[], totalLength?: number): Buffer
  static isBuffer(value: unknown): boolean

  compare(target: Uint8Array): number
  copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number
  equals(target: Uint8Array): boolean
  subarray(start?: number, end?: number): Buffer
  toString(encoding?: string): string
}
```

User-defined `extends` is not supported. The `Buffer extends Uint8Array`
relationship is declared by the `node:buffer` package metadata, not built into
compiler core.

Supported encodings:

```text
utf8
utf-8
hex
base64
base64url
```

## C++ Runtime Slice

The generated C++ backend uses the `Buffer` and `Uint8Array` facades directly.
`Uint8Array` and its hidden shared storage live in `stdlib/global/binary`.
`node:buffer` owns the derived `Buffer` facade. Native packages access bytes
through typed spans; the storage layout is not part of the public header.
Generated C++ uses facade construction, indexed access, `slice(...)` and
`toString(...)` directly. Static APIs and constants also lower directly to
`Buffer`; there is no native `BufferConstructor` or module forwarding layer.

Current source-level C++ support:

```ts
import buffer, { Buffer, constants } from 'node:buffer'

const bytes = Buffer.from('hi', 'utf8')
const view = buffer.Buffer.alloc(4)

view[0] = bytes[0]
view[1] = 7

const slice = view.slice(0, 2)
const text = bytes.toString()
const ok = Buffer.isBuffer(bytes)
const max = constants.MAX_LENGTH
```

`bytes.slice(start, end?)` follows JS-like numeric slice bounds: negative
indices count from the end, out-of-range indices clamp to byte length, and
`end < start` returns an empty byte view.

Supported MVP calls:

- `Buffer.from(value, encoding?)`
- `Buffer.from(bytes)` copies a `Uint8Array` or `Buffer`
- `Buffer.alloc(size)`
- `Buffer.byteLength(value, encoding?)`
- `Buffer.compare(first, second)` and `buffer.compare(target)`
- `Buffer.concat(list, totalLength?)`
- `buffer.copy(target, targetStart?, sourceStart?, sourceEnd?)`
- `buffer.equals(target)`
- `Buffer.isBuffer(value)`
- `import { Buffer, constants } from 'node:buffer'`
- `import buffer from 'node:buffer'` with `buffer.Buffer.from`,
  `buffer.Buffer.alloc`, `buffer.Buffer.isBuffer` and
  `buffer.constants.MAX_LENGTH`
- `new Uint8Array(size)`
- `new Uint8Array([number, ...])`
- `bytes.length`
- `bytes[index]`
- `bytes[index] = number`
- `bytes.slice(start, end?)`
- `bytes.subarray(start?, end?)`
- `bytes.toString(encoding?)`

Encoding names are case-insensitive. `base64` and `base64url` decoding accept
both the standard and URL-safe alphabets. `base64url` encoding omits padding.
Byte writes currently expect numeric byte values in the `0..255` range.

Unsupported `node:buffer` APIs, including `Blob`, `File`, `transcode`,
`isUtf8`, `isAscii`, `atob`, `btoa` and object URL helpers, are rejected by the
checker with `INOX_NOT_IMPLEMENTED`. They are not emitted as C stubs.

## Compiler Descriptor

The package-local `stdlib/node/buffer/compiler/index.ts` data descriptor owns
the `node:buffer` imports, `Buffer` native identity, constants and operations:

- `Buffer.from`;
- `Buffer.alloc`;
- `Buffer.isBuffer`;
- `node:buffer` import roots and constants;
- `Buffer` instance helpers `slice` and `toString`.

`Uint8Array` belongs to the separate `global:binary` package. `node:buffer`
declares that dependency and its package-defined native inheritance instead of
adding either type name to portable compiler core. Generic checker, IR and C++
lowering paths consume both descriptors through the selected library set.

Later:

```text
ArrayBuffer
DataView
other typed arrays
```
