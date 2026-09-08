# node:zlib

`node:zlib` provides synchronous DEFLATE and gzip compression backed by zlib.

Supported API:

- `deflateSync()` and `inflateSync()`
- `deflateRawSync()` and `inflateRawSync()`
- `gzipSync()` and `gunzipSync()`
- named exports and the equivalent default-module methods
- string, `Buffer`, and `Uint8Array` input; every operation returns a `Buffer`

Malformed or truncated compressed data throws. Output is limited to the
maximum supported `Buffer` length.

Compression options, asynchronous callbacks, Brotli, streaming classes, and
the `create*()` stream factories are not implemented yet.
