# node:crypto

The supported API is a libuv-gated random surface plus synchronous SHA-1,
SHA-2, KDF, AES-GCM and signature operations. Supported hash algorithm names are `sha1`,
`sha224`, `sha256`, `sha384` and `sha512`:

- default import: `import crypto from 'node:crypto'`
- named imports for supported random functions
- `crypto.getRandomValues(bytes)` / `getRandomValues(bytes)`
- `crypto.randomBytes(size)` / `randomBytes(size)`
- `crypto.randomFillSync(buffer[, offset][, size])` /
  `randomFillSync(buffer[, offset][, size])`
- `crypto.randomInt([min, ]max)` / `randomInt([min, ]max)`
- `crypto.randomUUID()` / `randomUUID()`
- `crypto.getHashes()` / `getHashes()`
- `crypto.createHash(algorithm)` / `createHash(algorithm)`
- `Hash.update(string | Buffer[, encoding])`
- `Hash.digest()` returning bytes
- `Hash.digest('hex' | 'base64' | 'base64url')` returning a string
- `crypto.hash(algorithm, string | Buffer[, 'hex' | 'base64' | 'base64url'])` returning a string
- `crypto.hash(algorithm, string | Buffer, 'buffer')` returning bytes
- `crypto.createHmac(algorithm, string | Buffer)` / `createHmac(...)`
- `crypto.createSecretKey(string | Buffer[, encoding])` / `createSecretKey(...)`
- secret `KeyObject` values in HMAC and AES-GCM operations
- `Hmac.update(string | Buffer[, encoding])`
- `Hmac.digest()` returning bytes
- `Hmac.digest('hex' | 'base64' | 'base64url')` returning a string
- `crypto.pbkdf2Sync(password, salt, iterations, keylen, digest)` returning a `Buffer`
- `crypto.hkdfSync(digest, ikm, salt, info, keylen)` returning a `Buffer`
- `crypto.scryptSync(password, salt, keylen[, options])` returning a `Buffer`
- `crypto.createCipheriv('aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm', key, iv[, options])`
- `crypto.createDecipheriv('aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm', key, iv[, options])`
- `Cipheriv.update(...)`, `Cipheriv.final(...)` and `Cipheriv.getAuthTag()`
- `Decipheriv.update(...)`, `Decipheriv.final(...)` and `Decipheriv.setAuthTag(...)`
- `Cipheriv.setAAD(...)` and `Decipheriv.setAAD(...)`
- `crypto.createPrivateKey(pem)` / `createPrivateKey(pem)`
- `crypto.createPublicKey(pemOrPrivateKey)` / `createPublicKey(...)`
- `crypto.generateKeyPairSync('rsa', { modulusLength[, publicExponent] })`
- `crypto.generateKeyPairSync('ec', { namedCurve })`
- `KeyObject.export({ format: 'pem', type: 'spki' | 'pkcs8' })`
- secret `KeyObject.export()` returning a raw `Buffer`
- `crypto.publicEncrypt(publicKey, bytes)` / `publicEncrypt(...)`
- `crypto.privateDecrypt(privateKey, bytes)` / `privateDecrypt(...)`
- RSA-OAEP key options with `key`, `oaepHash` and `oaepLabel`
- `crypto.sign('sha256' | 'sha384' | 'sha512', data, privateKey)` / `sign(...)`
- `crypto.verify('sha256' | 'sha384' | 'sha512', data, publicKey, signature)` / `verify(...)`
- `crypto.timingSafeEqual(Buffer, Buffer)` / `timingSafeEqual(...)`

The compiler contract describes every implemented result through `TypeRef`.
`getHashes()` uses the package-owned `Array<string>` identity, Hash and Hmac
are native identities owned by this package, and Uint8Array and Buffer remain
cross-package nominal types. String C++ representation is kept in the backend
result mapping rather than the semantic type.

`node:crypto` imports are libuv-only at compile time. Compiling them for C
without `--loop-backend libuv` reports `INOX_NOT_IMPLEMENTED`; no C fallback
stub is emitted for the unsupported import path. Global
`crypto.getRandomValues(bytes)` remains available for embedded C with the
`entropy` capability gate and is owned by `stdlib/global/crypto`.

The hash/HMAC API is synchronous like Node's `Hash`, `Hmac` and one-shot
`hash` APIs. Hashes, KDFs and ciphers require
`--tls-backend boringssl` or `--tls-backend openssl` at compile time and
`INOX_TLS_BACKEND_BORINGSSL=1` or `INOX_TLS_BACKEND_OPENSSL=1` in the C runtime
build. The runtime implementation uses the shared EVP/HMAC APIs exposed by
BoringSSL and OpenSSL. `INOX_TLS_BACKEND_NONE` builds keep the facade present
but report a runtime failure; the package descriptor rejects user code before
C++ emission when no hash-capable backend is configured.

String input supports `utf8`, `utf-8`, `hex`, `base64` and `base64url`.
Digest text is encoded by `Buffer`, so Buffer and crypto share one codec and
the same case-insensitive runtime encoding semantics. As in Node, an input
encoding passed with byte data is ignored.

`pbkdf2Sync` accepts string, `Buffer` and `Uint8Array` password and salt
values. `hkdfSync` accepts the same value types for IKM, salt and info. Node
returns an `ArrayBuffer` from `hkdfSync`; Inox returns a `Buffer` until the
stdlib has an `ArrayBuffer` identity. It contains the same derived bytes and
remains usable with `Buffer.from(...)`.

`scryptSync` supports Node's `cost`/`N`, `blockSize`/`r`,
`parallelization`/`p` and `maxmem` options. Alias pairs cannot be specified
together. Password and salt accept strings, `Buffer` and `Uint8Array` values.

AES-GCM accepts raw string, `Buffer` and `Uint8Array` keys and IVs. Key length
must match the selected AES algorithm. Authentication tags default to 16 bytes;
the Node-compatible `authTagLength` values 4, 8 and 12 through 16 are supported.
AAD must be supplied before the first `update()`. Authentication failure is
reported by `Decipheriv.final()`, so unauthenticated plaintext must be discarded.

`KeyObject` imports unencrypted PEM strings, `Buffer`s and `Uint8Array`s for RSA,
RSA-PSS and EC keys. `createPublicKey()` also derives a reusable public
`KeyObject` from a private one. Synchronous key generation supports RSA modulus
length and optional public exponent options, plus named EC curves. Generated and
imported keys export as unencrypted PEM: public keys use SPKI and private keys use
PKCS8. `createSecretKey()` copies raw string or byte input into an owned secret
`KeyObject`; string input accepts the Buffer encoding names. Secret keys report
their byte length through `symmetricKeySize`, export a copy of the raw bytes and
can be passed directly to HMAC and AES-GCM operations. Secret storage is cleared
before it is released. Creating, inspecting and exporting a secret key does not
select a TLS backend by itself; HMAC and AES-GCM still do. RSA public encryption
and private decryption accept `KeyObject` or direct PEM key values. Direct keys
use Node's default OAEP padding with SHA-1. Inline
key option objects also support `oaepHash` (`sha1`, `sha224`, `sha256`, `sha384`
or `sha512`) and a string or byte `oaepLabel`. Only OAEP is exposed; legacy
PKCS#1 v1.5 encryption padding is intentionally omitted. One-shot
signatures accept the same PEM values directly when a reusable key is not
needed. Signature algorithms are limited to SHA-256, SHA-384 and SHA-512; weak
SHA-1 signatures are intentionally excluded.

Example:

```ts
import { createHash, createHmac, hash } from 'node:crypto'

const hex = createHash('sha256').update('hello').digest('hex')
const oneShot = hash('sha256', 'hello')
const hmac = createHmac('sha256', 'secret').update('hello').digest('hex')
console.log(hex)
console.log(oneShot)
console.log(hmac)
```

Supported limitations:

- `randomFill(...)` with callback is not implemented yet.
- `randomInt(...)` callback form is not implemented yet.
- `randomUUID(options)` is not implemented yet.
- hash and HMAC algorithms outside the documented SHA family are not implemented yet.
- `Cipheriv` and `Decipheriv` currently expose the direct method API rather than
  their `stream.Transform` behavior.
- Encrypted PEM/passphrases, DER, JWK, X.509 certificate imports, key option
  objects and key-generation output encoding options are not implemented yet.
- Streaming `Sign` and `Verify`, signature callbacks, RSA padding options and
  ECDSA `dsaEncoding` options are not implemented yet.
- RSA encryption options must currently be an inline object literal. Custom
  padding is intentionally not exposed; only OAEP is supported.
- Cipher algorithms are currently limited to AES-128-GCM, AES-192-GCM and
  AES-256-GCM. Encryption string output supports `hex`; decryption string output
  supports `hex`, `utf8` and `utf-8`. Buffer output has no encoding restriction.
- `timingSafeEqual(...)` supports byte values only and reports a runtime error
  for unequal byte lengths, matching Node's throw-on-length-mismatch behavior.

Known unsupported `node:crypto` methods are rejected by the checker with
`INOX_NOT_IMPLEMENTED`, before C++ lowering, so they do not increase generated C++
binary size:

- signatures/key exchange: `createSign`, `createVerify`, `createDiffieHellman`,
  `createDiffieHellmanGroup`, `createECDH`, `diffieHellman`
- public/private crypto: `publicDecrypt`, `privateEncrypt`
- KDFs and key/prime generation: `pbkdf2`, `scrypt`, `hkdf`,
  `argon2`, `argon2Sync`, `generateKey`,
  `generateKeySync`, `generateKeyPair`,
  `generatePrime`, `generatePrimeSync`, `checkPrime`, `checkPrimeSync`
- encapsulation and FIPS/engine/heap controls: `encapsulate`, `decapsulate`,
  `getCipherInfo`, `getCiphers`, `getCurves`, `getDiffieHellman`, `getFips`,
  `setFips`, `setEngine`, `secureHeapUsed`
- unsupported random variants: `randomFill`, `randomUUIDv7`
