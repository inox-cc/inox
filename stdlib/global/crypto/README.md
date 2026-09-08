# Crypto

## crypto.getRandomValues

Signature:

```ts
function getRandomValues<T extends Buffer | Uint8Array>(value: T): T
```

Targets:

```text
cc: yes
```

Behavior:

- Fills the supplied byte array in place using operating-system entropy.
- Returns the same byte storage through the C++ `crypto` facade.
- Requires the `entropy` capability in the embedded profile.

Example:

```ts
const bytes = new Uint8Array(16)
crypto.getRandomValues(bytes)
console.log(bytes.length)
```
