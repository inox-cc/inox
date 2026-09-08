# Math

Global `Math` provides the commonly used JavaScript numeric operations:

```ts
Math.E
Math.PI
Math.abs(x)
Math.acos(x)
Math.asin(x)
Math.atan(x)
Math.atan2(y, x)
Math.cbrt(x)
Math.ceil(x)
Math.cos(x)
Math.exp(x)
Math.floor(x)
Math.fround(x)
Math.hypot(...values)
Math.log(x)
Math.log10(x)
Math.log2(x)
Math.max(...values)
Math.min(...values)
Math.pow(base, exponent)
Math.random()
Math.round(x)
Math.sign(x)
Math.sin(x)
Math.sqrt(x)
Math.tan(x)
Math.trunc(x)
```

The public TypeScript contract lives in `index.d.ts`. Compiler operations,
random options and the single program-scope C++ object definition live in
`compiler/index.ts`; portable compiler code does not keep a separate Math
method table.

These operations are implemented by the C++ `Math` stdlib object and generated C++
should call the global `Math` object (`Math.min(...)`, `Math.random()`). There
is no public `inox_math_*` C ABI for Math.
`Math.random()` supports C++ backends selected at compile time. The default
`auto` backend uses hosted OS entropy when no seed was explicitly configured
and selects the deterministic `simple` backend when a seed was configured.
Explicit `simple`, `xorshift32` and `os` selections are also available. The
deterministic backends use the configured seed. The `os` backend reads
operating-system entropy where available and falls back to the seeded `simple`
backend if entropy is unavailable. `Math.random()` remains the general random
API and is not for secrets. Use
`crypto.getRandomValues(bytes)` for secure random bytes.

`Math.random()`:

```text
default: auto (OS entropy without an explicit seed, simple with one)
not cryptographic
seed configurable at compile-time config
backend configurable as auto, simple, xorshift32 or os
```

Example:

```json
--random-backend xorshift32 --random-seed 1
```
