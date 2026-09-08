# Control Flow

Supported control flow:

```ts
if (enabled) {
  console.log('enabled')
}

while (running) {
  step()
}

for (let i = 0; i < items.length; i += 1) {
  console.log(items[i])
}

for (const item of items) {
  console.log(item)
}
```

Conditions in `if`, `while` and classic `for` accept `bool` and
truthy-compatible values. This is intentionally a compact JS-like truthiness
slice for values the C++ backend can lower predictably:

```text
boolean
number
string
object / array / bytes / map / set
promise / function / timer
unknown runtime values
nullable runtime values
```

The false branch covers JS-like falsy values: `false`, `0`, an empty string,
`null` and `undefined`.

For nullable values, `if (value)` narrows the true branch to the present truthy
value. Use `if (!value)` for the missing/falsy branch or an early return guard:

```ts
function printName(user: User | null): void {
  if (!user) {
    return
  }

  console.log(user.name)
}
```

This truthiness is not type coercion for equality. Loose equality operators are
not supported; use `===` and `!==`.

## for...of

`for...of` iterates values whose selected library package provides the
`iterable` language trait. The portable compiler does not recognize collection
names and does not use the JS `Symbol.iterator` protocol.

```ts
for (const user of users) {
  console.log(user.name)
}
```

The default stdlib profile provides these iterable types:

```text
Array<T> -> T
Set<T> -> T
Map<K, V> -> MapEntry<K, V>
```

`MapEntry`:

```ts
type MapEntry<K, V> = {
  readonly key: K
  readonly value: V
}
```

Example:

```ts
for (const entry of usersById) {
  console.log(`${entry.key}: ${entry.value.name}`)
}
```

Limits:

- no `for...in`
- no generic `Symbol.iterator`
- no generators
- no string iteration
- no async iteration
- no destructuring in `for...of`
- mutating `Map`/`Set` while iterating is not guaranteed
- array `for...of` captures length at loop start
- C `Map`/`Set` iteration follows hash-table slot order, not JS insertion order yet

Unsupported iterable shapes report `INOX_C_FOR_OF`.

## classic for

Classic `for` uses JS-like header separators. Semicolons are part of the `for` header syntax, not statement terminators.

```ts
for (let i = 0; i < items.length; i += 1) {
  console.log(items[i])
}
```

## while

```ts
while (queue.length > 0) {
  const item = queue.pop()

  if (!item) {
    break
  }

  handle(item)
}
```

## break and continue

```ts
for (const item of items) {
  if (!item) {
    continue
  }

  if (item.done) {
    break
  }
}
```

Rules:

```text
break allowed in loops and switch
continue allowed only in loops
labels are not supported
```

## switch

`switch` uses JS-like syntax, but there is no implicit fallthrough.

```ts
switch (status) {
  case 200:
    console.log('ok')

  case 404:
    console.log('not found')

  default:
    console.log('unknown')
}
```

Each case is its own branch. `break` is allowed but not required.

Allowed switch types:

```text
bool
number
string
integer types
```

Case values must be compile-time constants compatible with the switch expression type.

Fallthrough is not supported:

```ts
fallthrough // compile error
```
