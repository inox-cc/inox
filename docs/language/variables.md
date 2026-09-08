# Variables And Scope

`var` is not supported.

```ts
var value = 1 // compile error
```

Only `let`, `const`, parameters, imports and named declarations create bindings.

## Binding Kinds

`let` creates a mutable local binding.

```ts
let count = 0
count += 1
```

`const` creates an immutable binding. It prevents reassignment of the binding,
but it does not make nested fields immutable.

```ts
const user = {
  id: 1,
  name: 'Ada'
}

user.name = 'Grace' // ok
user = { id: 2, name: 'Linus' } // compile error
```

`const` must have an initializer.

```ts
const port: u16 // compile error
```

`let` may omit an initializer only with an explicit type. The variable must be
definitely assigned before it is read or captured.

```ts
let port: u16

if (useDefault) {
  port = 8080
} else {
  port = readPort()
}

console.log(port)
```

## Scope

Bindings are block-scoped.

```ts
if (enabled) {
  const message = 'enabled'
  console.log(message)
}

console.log(message) // compile error
```

Blocks that create scopes:

- module body
- function body
- class method body
- constructor body
- `{ ... }`
- `if` and `else` blocks
- loop bodies
- `try`, `catch` and `finally` blocks
- each `switch` case branch

Classic `for` header bindings are scoped to the loop.

```ts
for (let i = 0; i < items.length; i += 1) {
  console.log(i)
}

console.log(i) // compile error
```

`for...of` bindings are scoped to the loop body.

```ts
for (const item of items) {
  console.log(item)
}

console.log(item) // compile error
```

Each `switch` case is its own branch scope because switch has no implicit
fallthrough.

```ts
switch (status) {
  case 200:
    const text = 'ok'
    console.log(text)

  case 404:
    const text = 'not found'
    console.log(text)
}
```

## Shadowing

Redeclaring a binding in the same scope is a compile error.

```ts
const port = 8080
const port = 3000 // compile error
```

Inner scopes may shadow outer bindings.

```ts
const name = 'Ada'

if (debug) {
  const name = 'debug'
  console.log(name)
}

console.log(name)
```

This is useful for small blocks, but style tooling may warn when shadowing hurts
readability.

## Use Before Declaration

`let` and `const` bindings are not usable before their declaration.

```ts
console.log(name) // compile error

const name = 'Ada'
```

The compiler should report this statically instead of emulating JavaScript TDZ
runtime errors.

Named declarations are collected before checking a scope, so function, class and
type declarations may be referenced before their textual declaration when there
is no initialization cycle.

```ts
console.log(formatName('Ada'))

function formatName(name: string): string {
  return `[${name}]`
}
```

## Parameters

Function parameters are local bindings in the function body. They behave like
`let` bindings: reassignment is allowed, and it does not affect the caller.

```ts
function clamp(value: number): number {
  if (value < 0) {
    value = 0
  }

  return value
}
```

## Imports And Module Scope

Imports are module-scoped readonly bindings.

```ts
import http from 'node:http'

http = null // compile error
```

Top-level `let` and `const` are module-scoped. They do not become global object
properties.

## Closures

Closures capture lexical bindings.

```ts
let count = 0

const next = () => {
  count += 1
  return count
}
```

C++ target lowering:

```text
non-capturing closure -> function pointer
capturing closure -> function pointer + context pointer
captured mutable binding -> boxed storage if the closure escapes
```

If a target profile has no allocation strategy for escaping captured mutable
bindings, the compiler must report a capability diagnostic.
