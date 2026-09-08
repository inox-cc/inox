# Optional Chaining

Optional chaining works with nullable values (`T | null`), weak fields, maps
and optional callbacks.

## Syntax

```ts
user?.email
usersById[id]?.name
headers?.['content-type']
callback?.()
```

Nullish coalescing:

```ts
const name = user?.name ?? 'Anonymous'
```

## Semantics

```text
a?.b
  if a is nullish -> null
  else -> a.b

a?.[key]
  if a is nullish -> null
  else -> a[key]

a?.()
  if a is nullish -> null
  else -> a()

a ?? b
  if a is nullish -> b
  else -> a
```

Optional chaining short-circuits only on `null`.

## Types

```text
Nullable<T>.field via ?. -> FieldType | null
Map<K, V>?.[key] -> V | null
((...) => R)?.(...) -> R | null
(T | null ?? T) -> T
```

Example:

```ts
type User = {
  id: u64
  profile: Profile | null
}

type Profile = {
  displayName: string | null
}

const displayName = user.profile?.displayName ?? 'Anonymous'
```

Weak fields also read as nullable values, so optional chaining is the direct
way to access a weak target without first storing and narrowing it:

```ts
type Node = {
  name: string
  parent: weak<Node | null>
}

const parentName = node.parent?.name ?? 'root'
```

## C++ Target

Optional chains lower to temporary variables and null checks.

```text
tmp = user.profile
if tmp is nullish:
  result = null
else:
  result = tmp->displayName
```

No runtime reflection is required.

## Limits

- no optional constructor call
- no optional tagged templates
- no dynamic fields on sealed objects
- assignment through optional chain is forbidden

```ts
user?.name = 'Ada' // compile error
```
