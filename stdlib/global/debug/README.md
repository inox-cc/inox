# Debug

Internal global debug API:

```ts
inox.__debug.memory()
```

The source-level API is not a standard JavaScript global and stays under the
`inox.__debug` namespace. Its ambient declaration and compiler operation are
owned by this package.

`inox.__debug.memory()` returns a sealed object with numeric memory counters
when `INOX_DEBUG_MEMORY` is enabled. In normal builds the native implementation is
safe to compile and returns zeroed counters.

Package contents:

- `index.d.ts` declares the nested ambient namespace and readonly memory stats.
- `compiler/index.ts` describes the operation, native result fields, runtime
  requirement and pre-runtime allocator initializer.
- `src/debug.cc` implements the debug memory facade, allocator and counters.
- `include/inox/debug.h` declares the C++ `inox::debugMemory` facade and
  allocator initializer; all bodies remain in `src/debug.cc`.
- `runtime/include/inox/debug_bridge.h` and `runtime/src/core/debug_bridge.cc`
  are a narrow C bridge for runtime core files that have not moved to C++ yet;
  new stdlib code should not use them.
