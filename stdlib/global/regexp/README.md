# RegExp

Regular expressions are available as a global runtime capability without an
import. Literal tokenization and parsing remain language syntax, while the
`regexp-literal` provider, type, diagnostics, `.test()` operation and native
runtime plan are owned by this package.

Supported surface:

- RegExp literals
- `regexp.test(value: string): boolean`
- the `i` flag

The C++ target includes the package only when IR contains its runtime
requirement. Removing this directory removes literal semantics and the native
plan without a compiler-core edit.

Generated C++ should use the `RegExp` facade:

```cpp
RegExp pattern("Ada", "i");
console.log("%d", pattern.test("Ada Lovelace"));
```

Package contents:

- `index.d.ts` declares the structural source type.
- `compiler/index.ts` provides the literal intrinsic, native type, operations,
  diagnostics and runtime requirement.
- `include/inox/regexp.h` is a declarations-only C++ facade.
- `src/regexp.cc` contains all implementation code and flag mapping.

There is no public `inox_regexp_*` C ABI for RegExp. The POSIX `regex.h`
adapter is an implementation detail inside `src/regexp.cc`.
