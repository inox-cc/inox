# node:assert

`node:assert` provides strict synchronous assertions without target-specific
capabilities.

Supported API:

- callable default `assert(value, message?)`
- `ok(value, message?)`
- `strictEqual(actual, expected, message?)`
- `notStrictEqual(actual, expected, message?)`
- `deepStrictEqual(actual, expected, message?)`
- `notDeepStrictEqual(actual, expected, message?)`
- `fail(message?)`
- `throws(block, message?)`
- `doesNotThrow(block, message?)`
- the equivalent `node:assert/strict` entrypoint

Failed assertions throw an object with the standard `AssertionError` fields
`name`, `message`, `actual`, `expected`, `operator` and `generatedMessage`.
Custom messages are strings. `strictEqual` uses SameValue behavior, including
equal `NaN` values and distinct positive and negative zero.

Deep equality supports cyclic arrays and plain objects, byte arrays, maps and
sets. Plain-object property order and map/set insertion order do not affect the
result. Functions and native class instances compare by identity.

The package owns its declarations, operation descriptors, C++ facade and
native implementation. Removing the package removes both assert entrypoints
and `assert.cc` without compiler-core changes.

## Limits

- legacy loose `equal`, `notEqual`, `deepEqual` and `notDeepEqual` are omitted
- `throws` and `doesNotThrow` do not yet accept error constructors, regular
  expressions or validation objects
- `rejects`, `doesNotReject`, `ifError`, `match` and `doesNotMatch` are not
  implemented
- direct construction and `instanceof AssertionError` are not implemented
