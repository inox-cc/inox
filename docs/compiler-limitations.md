# Compiler limitations

This document records current compiler and self-hosting limitations. Update an
entry as behavior changes; do not use this page as a historical changelog.

## Self-hosted compiler

- A full self-hosted bootstrap with recursive `TypeRef` data has a per-module
  memory peak above Node's default heap while compiling
  `compiler/backends/cpp/module-emission.ts`. The supported `pnpm run build`
  entry point sets a 6 GB heap and releases temporary graph, AST, and HIR data
  after each source module. Running `scripts/build.ts` without those Node flags
  is unsupported.
- The self-hosted type resolver does not support `ReadonlySet<T>`. Use `Set<T>`
  for immutable compiler tables and do not mutate it after initialization, or
  add the utility type to the parser and checker first.
- A single-pass self-hosted build uses declaration contracts from the previous
  successful build for dependent modules. A new exported descriptor field is
  therefore not visible to its consumer during the same pass. Until contracts
  update in two phases, declare a narrow local structural projection in the
  consumer.
- Self-hosted C++ storage for dynamic `AnyNode` values uses a predefined
  fallback shape. When the checker adds a structural field to an AST or HIR
  node, also add it to the matching string, boolean, array, object, or unknown
  group in `compiler/backends/cpp/values/any-node-fields.ts`. An arbitrary new
  field name cannot otherwise be written through the runtime object API.
- Do not pass `this` as an ordinary argument to an imported compiler helper.
  Self-hosted lowering may emit a reference to a nonexistent `inox_this`. Use a
  data-only helper or keep a thin wrapper method on the class.
- Self-hosted lowering cannot always pass a structural object's string field
  directly to a helper after a lookup with a nullable fallback. Store the
  stable field in a local string variable and use that variable in every
  lookup branch.
- Narrowing a discriminated descriptor union does not always remove nullability
  from the selected variant's numeric field. Store the field locally and check
  `typeof value === 'number'` before passing it to a helper.
- Do not use `async` as a local variable name in compiler code. The self-hosted
  parser interprets it as a modifier.
- Regular expression literals in the default stdlib support only the `i` flag.
  Compiler code must not use `g` until the package provides its full runtime
  semantics.
- Do not use spread calls such as `fn(...items)` in code that must self-host.
  The current parser rejects `...` in call arguments. Use an explicit helper
  such as `pushAll(target, items)`.
- Each `${...}` placeholder in a template literal is parsed as a separate
  expression and stored in AST/IR. It is currently limited to one expression
  supported by the ordinary parser. Package operations inside a placeholder
  pass checker validation; compatibility validation for other expressions
  remains in the C++ backend. Lowering supports strings, numbers, booleans,
  `null`, and values with a library string-conversion operation. Other types
  produce `INOX_C_STRING_EXPR`.
- C++ lowering can choose an incompatible physical representation for an
  explicitly typed top-level `string` initialized by a user function returning
  a managed string. Until top-level storage matches the function result ABI,
  materialize the value inside a function.

## Language and modules

- `var` is unsupported. Use `const` or `let`.
- `==` and `!=` are unsupported. Use `===`, `!==`, truthy/falsy checks, or an
  explicit comparison with `null`.
- Arithmetic compound assignment (`+=`, `-=`, `*=`, `/=`, `%=`) works for
  direct mutable numeric bindings. Field and indexed compound assignment is
  unsupported because the receiver or index must not be evaluated twice.
- Only static ESM is supported. There is no `import()`, `await import()`,
  CommonJS, runtime module loader, or conditional runtime import.
- Modular C++ output supports runtime imports of exported functions and
  top-level variables. Runtime imports of user class declarations are not yet
  supported.
- Ambient library declarations accept the standard
  `export {}; declare global { ... }` wrapper with type/interface, function,
  `const`/`let`, class, and nested namespace function declarations. Generic
  type and interface declarations, their applications, and generic methods can
  substitute type arguments in fields, parameters, and results. Generic-class
  instance method specialization, namespace-local types, values, and classes,
  dotted namespaces, enums, `var`, and declaration merging are unsupported.
- Parameterized `TypeRef` templates work in native type descriptors, library
  operations, user generic functions, and generic classes. Generic function
  and constructor arguments may be explicit or inferred from argument
  `TypeRef` values. Exact instance types survive fields and module boundaries.
  Generic callback annotations and object methods receive substituted
  parameter and result types.
- An explicit inline object type used as a user generic function type argument,
  such as `identity<{ name: string }>(value)`, can lose return-type-parameter
  substitution. Use a named type alias.
- The self-hosted parser does not accept an empty `export {}` marker in an
  implementation `.ts` file. Leave a module with no exports empty or export a
  real named binding. This does not affect the ambient wrapper above.
- Bare Node imports are not aliases for `node:*`; write `node:fs`, `node:http`,
  and similar exact sources.
- Labels and `for...in` are unsupported.
- `for...of` does not implement the general JavaScript iterator protocol. It
  works only with package-provided types that declare an iterable contract; the
  default stdlib provides one for `Array<T>`, `Set<T>`, and `Map<K, V>`.
- Generators, async iteration, and string iteration through the iterator
  protocol are unsupported. `for...of` accepts a flat array binding pattern for
  homogeneous arrays and `Map` entries. Positional typing for heterogeneous
  tuples, nested or object patterns, rest elements, and default bindings is
  unsupported.
- In self-hosted compiler code, destructuring a generic `Map` entry in
  `for...of` can lose the value type. Iterate over `map.keys()` and call
  `map.get(key)` instead.
- Array destructuring in arrow-function parameters is limited to flat
  identifier elements and omissions in homogeneous arrays. Nested patterns,
  heterogeneous tuples, rest elements, and defaults are unsupported.
- `switch` has no implicit fallthrough, and fallthrough is unsupported. Case
  values must be compile-time constants.
- Some C/C++ `switch` lowering paths accept only numeric and boolean case
  literals even where the language accepts more general values.

## Classes and objects

- Classes compile as sealed nominal records. There are no JavaScript
  prototypes, inheritance, monkey patching, virtual dispatch, or runtime shape
  changes.
- `extends`, `static`, decorators, and method overrides are unsupported.
- Class fields cannot be added or removed at runtime. Unknown or dynamic field
  writes and `delete instance.field` are diagnosed.
- Unbound method extraction is unsupported. A method cannot be removed from its
  receiver and called separately without an explicit closure wrapper.
- Nullable and optional package-native C++ values use `std::optional<T>`.
  Descriptor reflection and serialization of a non-null value require a
  package `cRuntimeValueExpression`. A value-only facade reports an unsupported
  status at a generic runtime boundary while preserving direct native field
  access.
- Constructors accept a limited statement set: local declarations and
  assignments, `if`/`else`, ordinary `for`, calls on `this` and its fields, and
  assignments to `this.field`. More complex control flow may not lower.
- Weak fields support runtime-managed objects, class instances, and
  package-native types with `cRuntimeValueExpression`. Scalar, function, and
  value-only native targets produce `INOX_WEAK_TYPE`.
- A direct native-lowered user class instance inside an array literal is not
  always materialized through the class descriptor: `[instance]` can retain a
  C++ value instead of `inox::Value`. Object-literal fields and fields of
  another class support this runtime boundary.

## Errors, async functions, and callbacks

- A callback inside a local variable initializer cannot capture that variable,
  as in `const server = createServer(() => server.close())`. This recursive
  closure requires a pre-created managed binding cell. Attach the listener
  after initialization instead.
- `Promise.all` and `Promise.race` accept only `Array`, not arbitrary iterables.
  `Promise.finally` accepts a synchronous callback and does not await a returned
  promise. Arbitrary thenable assimilation and host-level unhandled rejection
  events are unsupported.
- The same local `Promise` cannot be passed to `then` inside `Promise.race` and
  then reused in another async aggregate. Ownership lowering rejects the
  repeated object-field expression.
- `new Promise` supports a restricted arrow-function executor. Resolve and
  reject handlers accept at most one argument.

## C++ backend

- Dynamic `.length` on an `AnyNode` primitive field narrowed with
  `typeof node.field === 'number'` does not have complete JavaScript semantics;
  generic fallback can select array lowering. String lowering is handled
  separately.
- Generic object types with numeric index signatures, such as
  `{ [index: number]: T }`, are not supported end to end. Dynamic object shapes
  are string-keyed. Specialized runtime facades such as `process.argv` support
  numeric indexing only for direct access; materialize them as `Array<T>`
  before passing them to generic compiler code.
- Object spread supports plain objects with compiler-known shapes and
  source-order precedence for explicit and spread fields. For dynamic shapes,
  only compiler-known fields are copied. Unknown enumerable keys, getters,
  symbol keys, and exact side-effect ordering between spread expressions and
  explicit initializers do not have full JavaScript semantics.
- Array methods are partially lowered. `filter`, `map`, and `find` support
  limited arrow callback shapes and homogeneous arrays. `map` results are
  currently limited to number, boolean, string, and runtime values.
- `global:error` supports `new Error()`, `new Error(message: string)`, and
  `new Error(message: string, options)`. `options` must be an object literal;
  `code` must be a string and `cause` an object or `null`.
- `global:console` supports `log`, `info`, `warn`, and `error` with at most 16
  values per call. The C++ backend cannot format every value type; unsupported
  forms produce `INOX_C_*` diagnostics.
- Timer and hash handles are not arbitrary runtime values. Pass them only to
  APIs that explicitly expect them.
- RSA-OAEP options for `node:crypto.publicEncrypt` and `privateDecrypt` must be
  inline object literals. An options object stored in a variable and containing
  a value-only native `KeyObject` cannot be materialized through generic
  runtime `Value`; direct key variables are supported.

## Collections

- `Map` and `Set` preserve insertion order and support JavaScript-like mutation
  during iteration. Their constructors accept only package-declared sources:
  arrays of entries or values, or another `Map` or `Set`, not arbitrary
  iterators.

## Runtime capabilities and stdlib

- Compiler core contains no list of stdlib APIs. Packages are discovered from
  the registry and declare their own operations, native types, dependencies,
  and target constraints. Removing a package must remove both its API and its
  native plan.
- Exact supported APIs and behavior are documented in each package README.
  This page records only boundaries shared by multiple APIs.
- Global `Number` remains a narrow string-to-number conversion. `Math` does not
  promise complete JavaScript semantics for `NaN`, infinity, signed zero, and
  very large values. `Date` lacks setters, callable string form, and full time
  zone/parser compatibility.
- [`fetch`](../stdlib/global/fetch/README.md),
  [`node:http`](../stdlib/node/http/README.md),
  [`node:https`](../stdlib/node/https/README.md),
  [`node:net`](../stdlib/node/net/README.md),
  [`node:dgram`](../stdlib/node/dgram/README.md), and
  [`node:dns`](../stdlib/node/dns/README.md) require the hosted/libuv network
  runtime. HTTPS also requires a TLS backend. HTTP is limited to HTTP/1.1,
  `net` to TCP4, and `dgram` to UDP4. `fetch` has no body streams,
  `arrayBuffer`, `blob`, or `formData`.
- `node:dns` implements callback and Promise `lookup`, `{ all, order }`, and
  `lookupService`. Protocol-level `resolve*`, `reverse`, custom `Resolver`,
  lookup hints, and DNS server configuration are unsupported.
- [`node:fs`](../stdlib/node/fs/README.md) provides synchronous and Promise
  APIs. Callback APIs, streams, watchers, most encodings other than literal
  `utf8`, and extended option forms are unsupported.
- [`node:crypto`](../stdlib/node/crypto/README.md) provides random values,
  SHA-family hash and HMAC, KDF, AES-GCM, RSA/EC key, signature, and RSA-OAEP
  operations. Callback variants, stream facades, additional algorithms, and
  key formats are outside the current API.
- [`node:zlib`](../stdlib/node/zlib/README.md) provides synchronous one-shot
  gzip, deflate, and raw compression. Streaming `create*()` facades are
  unsupported.
- [`node:buffer`](../stdlib/node/buffer/README.md) supports `utf8`, `hex`,
  `base64`, and `base64url`. `ArrayBuffer`, `DataView`, and other typed arrays
  are unavailable.
- [`node:child_process`](../stdlib/node/child_process/README.md) is limited to
  synchronous `execSync`, `execFileSync`, and `spawnSync`; live stdio and
  asynchronous process lifecycle are unsupported.
- [`node:process`](../stdlib/node/process/README.md) does not expose signals,
  stdio streams, events, or the complete mutable Node process API.
- [`node:stream`](../stdlib/node/stream/README.md) provides a managed
  `PassThrough`. Custom Readable, Writable, Duplex, and Transform hooks,
  pull-mode `read`, `pipeline`, and `finished` are unsupported. `node:events`
  is limited to synchronous string events, while `node:timers/promises`
  provides timeout and immediate without AbortSignal or an async interval
  iterator.

## Declaration-only Node modules

The default-profile `node:tls` and `node:worker_threads` packages currently
provide mostly declarations and diagnostics rather than complete runtimes.
Their presence is determined by the selected registry, not by a list in
compiler core.
