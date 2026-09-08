# Object

Global `Object` provides `keys`, `values`, `entries`, and `hasOwn` for runtime
objects, arrays, strings, and supported class instances.

```ts
Object.hasOwn(value: unknown, property: string | number): boolean
```

The native implementation uses a declarations-only C++ facade in
`include/inox/object_global.h` and keeps its implementation in the single
package-named `src/object.cc` source file.
