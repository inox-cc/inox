# Binary

Global binary runtime package for `Uint8Array`.

The C++ facade owns byte-array construction, indexed access, copying slices,
shared subarrays and the native storage used by binary-aware stdlib packages.
Storage layout and reference-counting details are private to `src/binary.cc`.

The supported mutating operations are `fill()` and `set()`; `at()` provides
negative indexing. `set()` accepts another `Uint8Array` or an `Array<number>`
and preserves TypedArray overlap semantics.

`Uint8Array.slice()` copies bytes; `Uint8Array.subarray()` shares the source
storage. Node `Buffer` is implemented separately in `stdlib/node/buffer`.
