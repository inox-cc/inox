# Classes

Classes are nominal sealed records with constructors and methods.

No inheritance, prototypes, monkey patching or virtual dispatch.

## Example

```ts
class User {
  name: string

  constructor(name: string) {
    this.name = name
  }

  greet(): void {
    console.log(this.name)
  }
}

const user = new User('Ada')
user.greet()
```

## Rules

- Source class syntax must remain valid TypeScript.
- Class fields are fixed by declarations and constructor initialization.
- Constructors may declare and update local values before assigning declared
  fields.
- Constructors may use `if`/`else` around supported constructor statements.
- Constructors may call instance methods through `this.method(...)`.
- Methods may assign class-valued fields to local aliases and call methods
  through those aliases.
- Fields cannot be added to or removed from an existing instance.
- Unknown-field writes, dynamic property writes and `delete instance.field`
  must be rejected before C++ emission.
- `readonly` fields may be initialized by `constructor` and cannot be assigned
  after construction.
- `weak` fields are supported for object/class targets and read as nullable
  values.
- Fields declared as `object` are stored in the native class as managed runtime
  values; they do not make the class instance itself a generic `inox_object`.
- Non-null strong fields with a package-native type use the C++ storage selected
  by that package's type descriptor. The compiler does not recognize container
  names when choosing field storage.
- Nullable and optional package-native fields use `std::optional<T>` around the
  package-selected C++ type.
- Weak package-native fields require the package to provide
  `cRuntimeValueExpression`; reads upgrade the runtime weak cell to a temporary
  strong value.
- Materialized native class instances expose declared fields through descriptor
  reads when they cross generic runtime-value boundaries.
- `extends`, `static`, decorators and method override are not supported.
- Extracting an unbound method is not part of the supported slice.

Diagnostics:

- `extends` -> `INOX_CLASS_EXTENDS`
- `static` fields or methods -> `INOX_CLASS_STATIC`
- unsupported class lowering form -> `INOX_C_CLASS`

## C++ Lowering Target

TS classes should lower to native C++ `class`/`struct`, not to generic
`inox_object`.

```text
class instance -> C++ class/struct
field read     -> direct field access
method call    -> C++ member call
constructor    -> direct field initialization
destructor     -> release owned runtime refs
object field   -> native inox::Value field
map field      -> native inox::Value field
set field      -> native inox::Value field
class alias    -> native C++ class local
```

Each generated class has one descriptor for generic operations. The descriptor
describes class name, field order, field types, ownership and nullable metadata.
It is not a dynamic object table and is not stored per instance.

Descriptor users:

- `console.log(instance)` / inspect
- `Object.keys`, `Object.values`, `Object.entries`
- `JSON.stringify(instance)`

`JSON.stringify(instance)` calls user-defined callable `toJSON()` first. If the
class has no `toJSON()`, it serializes descriptor fields. Class methods are not
JSON fields.

`String(instance)` and template strings use the `string-conversion` intrinsic
provider selected by the compiler-library profile. The default stdlib provider
may call a user-defined `toString()`, but the portable compiler neither knows
that member name nor adds real `toString` or `toJSON` methods to every class.

## Weak Fields

Use `weak<T>` for back-references that must not keep their target alive:

```ts
class Parent {
  child: Child | null
}

class Child {
  parent: weak<Parent | null>
}
```

Rules:

- fields are strong by default;
- weak fields must target runtime-managed object/class values;
- runtime-backed package-native values can be weak; value-only native values,
  scalars and functions are rejected with `INOX_WEAK_TYPE`;
- weak reads return `T | null`;
- direct dereference requires a prior null check;
- optional chaining is allowed over weak reads.

```ts
const parent = child.parent

if (parent !== null) {
  console.log(parent.child)
}

console.log(child.parent?.child)
```

Direct access without narrowing is rejected:

```ts
child.parent.child // INOX_WEAK_ACCESS
```

Use a closure when a method is needed as a callback:

```ts
setTimeout(() => user.greet(), 1000)
```
