# Promise

This package owns the ambient `Promise<T>` declaration, its compiler-visible
native identity and its `awaitable` semantic TypeRef. `compiler/index.ts`
provides the package data descriptor for constructor, static and receiver
operations, the `async-result` intrinsic provider and the native runtime plan.
Its TypeRef factory is the package-owned source of fulfilled and rejected type
relationships used by dependent stdlib descriptors.

Supported APIs:

- `new Promise(executor)`
- `Promise.resolve(value?)` and `Promise.reject(reason?)`
- `Promise.all(values)` and `Promise.race(values)`
- `promise.then(callback)`, `promise.catch(callback)` and
  `promise.finally(callback?)`

`Promise.all()` accepts plain values and promises, preserves input order and
rejects with the first rejection. `Promise.race()` settles with the first input
to settle. `finally()` preserves the source value or rejection unless its
callback throws.

The public declarations-only C++ RAII facade lives in
`include/inox/promise.h`, and all of its definitions live in
`src/promise.cc`. The raw `inox_promise*` implementation remains a private
runtime bridge behind that facade.

Promises use the standard runtime class-instance boundary when stored in an
`Array` or passed through another dynamic value boundary. The package owns the
wrapper and its type identity; portable compiler code only applies the native
type's generic `cRuntimeValueExpression` contract.

Portable compiler code must use the generic `async-result` role and `awaitable`
trait rather than the package id, the `Promise` name or facade symbols. Provider,
deletion and semantic no-tail coverage are audited separately before the wider
compiler/stdlib decoupling goal is considered complete.
