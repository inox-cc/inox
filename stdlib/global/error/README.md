# Error

This package owns the ambient `Error` declaration, its nominal TypeRef, the
constructor operation, exception semantic identity, and the native C++ facade.

The compiler resolves exception values through the generic `exception-value`
intrinsic role. Removing this package therefore removes the target `Error`
global, its native source, runtime requirement, and exception-object shape
without a compiler-core edit.

Generated C++ constructs `Error` directly. The facade materializes the managed
object used by generic boundaries such as `throw`, Promise rejection, and
console formatting. Its public header contains declarations only; object
allocation and option handling remain private to `src/error.cc`.

The supported constructor follows the standard JavaScript contract:

```ts
new Error(message?, { cause }?)
```

`cause` accepts any language value. The non-standard base `Error.code` field is
not provided; Node packages that produce coded errors must declare that field
on their own error type.
