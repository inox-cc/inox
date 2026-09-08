# Type Conversions

There is no JS coercion, so conversions are explicit.

MVP:

```ts
String(value)
Number(text)
Boolean(value)
i32(value)
u32(value)
u64(value)
f32(value)
f64(value)
```

Rules:

```text
Number(text) returns number?
i32/u32/u64 truncate toward zero, then check range
f32 rounds to IEEE-754 float32
f64 returns the number unchanged
unsafe/wrapping casts can come later
```

Example:

```ts
const port = Number(text) ?? 3000
const id = u64(port)
```

`Number(text)` does not throw on parse failure or overflow. It returns `null`
when the string cannot be parsed as a number. Numeric overflow follows
JavaScript-like string conversion and returns `Infinity` or `-Infinity`.
Leading and trailing ECMAScript-style Unicode whitespace is ignored.
Whitespace-only strings parse as `0`.

This intentionally differs from JavaScript `Number(value)` coercion. In inox,
`Number` is an explicit string-to-number conversion API, not a general coercion
hook. Invalid numeric text returns `null` instead of JavaScript `NaN`.

Numeric casts accept `number` values only. Integer casts truncate fractional
parts toward zero before checking the target range. `i32` accepts signed
32-bit results, `u32` accepts unsigned 32-bit results, and the number-backed
`u64` conversion accepts only JS-safe integer results (`0..2^53-1`)
until inox has native integer or bigint storage. Overflow, `NaN` and
`Infinity` fail checked integer casts. `f32` preserves fractional values and
rounds through IEEE-754 float32 semantics; `f64` is an identity cast for the
current `number` representation.

C++ backend status:

```text
String(value) supports primitive values, dynamically typed managed runtime
values and class instances with a zero-argument toString(): string method.
Number(text) supports non-null string input, trims ECMAScript-style Unicode
whitespace and returns number | null.
Numeric casts support i32/u32/u64/f32/f64 for number input.
Broad JavaScript-style coercion is intentionally not implemented.
```

The discoverable `global:conversions` compiler package owns the ambient
`Boolean`, `String`, `Number`, `i32`, `u32`, `u64`, `f32` and `f64`
declarations, argument checks, result types, runtime requirements and C++
lowering selection. Removing that package removes all of these globals from
the compiler library set; primitive boolean, string and number language types
remain available.
