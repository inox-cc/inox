# JSON

`JSON` is provided by the discoverable `global:json` package. Compiler core
does not recognize the global name or its methods.

Supported API:

```ts
interface JSON {
  parse(text: string): unknown
  stringify(value: unknown, replacer?: null, space?: number): string
}
```

`parse()` accepts standard JSON values and decodes `\uXXXX` escapes, including
surrogate pairs, to UTF-8. Repeated object keys keep the last value without
changing the key's original enumeration position. Invalid input throws.

For literal JSON source, the package-owned result-inference provider preserves
known scalar, array and object-field types. Contextual annotations can also
request a typed result:

```ts
type User = { name: string; score: number }

const user: User = JSON.parse(text)
const score: number = JSON.parse('7')
```

`stringify()` supports null, booleans, finite numbers, strings, arrays, objects
and reflected class fields. Non-finite numbers become `null`, and `-0` becomes
`0`. Undefined and callback-valued object fields are omitted; the same values
inside arrays become `null`. A class instance with a runtime `toJSON()` hook is
serialized from the hook result, including when nested in arrays or objects.
Classes without that hook use their enumerable reflected fields; opaque classes
without fields become `{}`. Cycles and unsupported root values throw.

The optional numeric `space` is truncated and clamped to 0–10 spaces. Function
and array replacers are intentionally not part of the current subset; pass
`null` when using `space`.

Generated C++ calls the declarations-only `Json` facade. Parsing, allocation,
UTF decoding, cycle detection and formatting remain private to `src/json.cc`.
The current nesting limit is 64.
