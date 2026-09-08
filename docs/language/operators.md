# Operators

The main equality operators are:

```ts
a === b
a !== b
```

`===` and `!==` are strict equality operators. They never perform JS-style type coercion.

```ts
1 === 1 // true
1 === '1' // compile error
null === null // true
user.email === null // ok if email: string?
```

## Unsupported Loose Equality

`==` and `!=` are not supported. Use `===` and `!==` instead.

The compiler reports a stable diagnostic for either loose equality operator.
They are not aliases for strict equality and never lower to backend code.

## Allowed Comparisons

```text
same primitive type
compatible numeric types after explicit/common numeric typing
T | null with null
T | null with T
string by content
bool by value
```

String `===` and `!==` compare UTF-8 byte content.

Records/classes are not comparable by `===`, except nullable checks:

```ts
user === otherUser // compile error
maybeUser === null // ok
```

Identity equality for records/classes is not supported.

## Number Equality

```text
NaN !== NaN for ===
-0 === 0
```

Map/Set primitive equality can use SameValueZero-inspired rules internally, where `NaN` equals `NaN`. Collection lookup semantics are separate from `===`.
