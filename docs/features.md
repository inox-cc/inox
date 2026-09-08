# Inox-specific language features

This document describes syntax and semantics added by Inox beyond standard
TypeScript.

## `weak<T>` fields

`weak<T>` marks a field as a weak reference. It does not keep the referenced
object alive and can therefore break ownership cycles.

```ts
class Parent {
  name: string

  constructor(name: string) {
    this.name = name
  }
}

class Child {
  parent: weak<Parent | null>

  constructor(parent: Parent | null) {
    this.parent = parent
  }
}
```

`weak<T>` is an Inox type marker, not a comment. Ordinary fields use strong
ownership by default.

Reading a weak field always produces a nullable value because the referenced
object may already have been destroyed. Use optional chaining:

```ts
console.log(child.parent?.name ?? 'no parent')
```

Or retain the value locally and narrow it:

```ts
const parent = child.parent

if (parent !== null) {
  console.log(parent.name)
}
```

Unchecked access is rejected:

```ts
child.parent.name // INOX_WEAK_ACCESS
```

Current restrictions:

- `weak<T>` is valid only on fields;
- the target must be a runtime-managed object, class instance, or
  package-native type with a runtime representation;
- scalar, function, and value-only native types are unsupported;
- unsupported field types produce `INOX_WEAK_TYPE`.

## `@inline` declarations

Place `@inline` in the JSDoc immediately before a declaration:

```ts
/** @inline */
export function add(left: number, right: number): number {
  return left + right
}
```

Multiline JSDoc is supported:

```ts
/**
 * Adds two numbers.
 * @inline
 */
export function add(left: number, right: number): number {
  return left + right
}
```

The annotation is valid on function declarations, methods, and `const`
declarations initialized with a function or arrow function. Other placements
produce `INOX_INLINE_PLACEMENT`.

An exported inline function, or an inline method of an exported class, is
defined in the generated `.h` file so every C++ translation unit can see its
body. Non-exported inline declarations remain in the generated `.cc` file.

Exported inline code may reference:

- imported declarations;
- exported declarations from the current module;
- declarations whose definitions are available from the header;
- global functions and variables from selected packages.

It cannot reference private declarations from the current module. Such a
reference produces `INOX_INLINE_PRIVATE_REFERENCE`; the compiler does not move
private code into a public header automatically.
