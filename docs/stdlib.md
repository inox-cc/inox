# Stdlib

Each stdlib library is a self-contained package under `stdlib/global/`,
`stdlib/node/` or `stdlib/packages/`.

```text
stdlib/<kind>/<name>/
  index.ts or index.d.ts
  compiler/index.ts       optional descriptor
  include/                public C++ declarations
  src/<name>.cc           native implementation
  tests/                  small package tests
    integration/          discovered compiler/runtime acceptance tests
    architecture/         discovered package architecture tests
  README.md               public API notes
```

Global packages expose APIs such as `console`, `JSON` and `Math`. Node packages
are imported with exact sources such as `node:fs`; bare aliases such as `fs`
are not added automatically. Packages under `stdlib/packages/` use their exact
relative path as a bare import, for example `stdlib/packages/database` owns
`import ... from 'database'`. Scoped directories are supported in the same way.

## Package contract

- `index.ts` is used for an implementation written in supported TypeScript.
- `index.d.ts` is used when the implementation crosses a native/runtime
  boundary.
- Declarations are the source of globals, imports, members and signatures.
- Optional `compiler/index.ts` describes only semantics that declarations
  cannot express: type operators, intrinsic roles, native mappings,
  requirements, capabilities and target options.
- Descriptors are deterministic data. Side-effect registration and callback
  hooks are not allowed.
- A native package may export `compilerLibraryNativeBuild` from the same
  entrypoint. It contains only generic CMake package, link-target and direct
  linker arguments; these dependencies are selected with the package native
  unit and disappear from the native plan when the package is removed.
- A package entrypoint imports only the public API under
  `compiler/extensions/`.

Discovery builds the selected immutable `CompilerLibrarySet`, generated
registry and native plan. There is no package manifest or central package
list. Removing a package and regenerating the registry must remove its API,
requirements, includes and sources without editing `compiler/`.

## Compiler boundary

Portable compiler code must not contain package-specific:

- global, import or member names;
- diagnostics or operation variants;
- runtime requirement or capability ids;
- C++ types, symbols, headers or source paths;
- checker or lowering branches.

The compiler works with opaque binding identities, semantic roles, `TypeRef`
and generic lowering descriptors. An operation descriptor cannot create a
value/type symbol missing from package declarations. A type-operator descriptor
may register a type-only name and one of the universal compiler operations; it
does not create a runtime binding.

Runtime requirements are added only when the compiled IR uses the relevant
binding, not merely because a module was imported.

An option descriptor may declare one recommended automatic primitive value
with `automaticStringValue`, `automaticNumberValue` or
`automaticBooleanValue`. The checker selects it only when a used operation or
runtime requirement reaches a constraint for that option. Explicit target or
CLI selections take precedence.

## Native implementation

A native package has one implementation file:

```text
strings/src/strings.cc
child_process/src/child_process.cc
```

The generated native plan associates this file with the package runtime
requirements. A program build compiles it only when the requirement closure
uses the package; the complete source list is reserved for the self-hosted
compiler and other full-toolchain targets.

Rules:

- The file is named `src/<package-name>.cc`; `_impl` is not used.
- Additional implementation units and `.c` files are not added.
- Shared implementation logic may use private functions inside the package
  `.cc` file.
- Public `.h` files contain declarations only.
- Function bodies, `inline` implementations and template definitions do not
  live in headers. Use a non-template facade or explicit instantiation in the
  `.cc` file.
- Do not keep wrapper-only functions for old names or a legacy C ABI.
- Low-level `inox_*` helpers may remain private implementation details while a
  runtime boundary still needs them.
- New native code uses C++20 or newer.

## C++ facade

Generated C++ should resemble the TypeScript API:

```cpp
console.log("message");
auto value = JSON.parse("{\"ok\":true}");
auto cwd = process.cwd();
auto parts = inox::String("a,b").split(",");
```

Use C++ objects, fields, methods and RAII ownership. `inox_value`, status/out
parameters and manual retain/release are private bridges, not the public stdlib
surface.

Additional rules:

- Facades live in their package, not in compiler core.
- Cross-package native inheritance is declared with `baseTypeIds`. An internal
  native interface may be exposed through the generic class-descriptor
  `query_interface` hook; its opaque id and C++ contract stay in the provider
  package, and every consumer declares that package as a dependency.
- Nested JavaScript objects use nested facade values with explicit ownership.
- Every non-function field of a native type declares exactly one typed C++
  access path: `cMember` for a public data member or `cGetter` for a
  non-throwing facade method. Missing and ambiguous mappings are rejected while
  building the library set; generated code never falls back to dynamic
  `inox::get` for such a field.
- A `cGetter` returns the field's declared facade/scalar type. An impossible
  stored runtime value is a facade invariant failure, not a language exception.
  Throwing field access is modeled as an operation instead.
- Materialization into generic runtime values is described by the package.
- A package can use `optional-string-record-or-value` to pass a spread-free
  `Record<string, string>` literal as a C++ initializer list. Strings are passed
  directly; non-literal objects and literals with spreads or duplicate keys keep
  the generic runtime-value path.
- Native argument adapters declare their target type identity. The backend uses
  nominal assignability to skip an adapter when the prepared C++ value is
  already compatible; it does not infer types from C++ template text.
- Sequence materialization keeps its append expression separate from an
  optional value adapter and its target type identity, so native spread values
  are not wrapped again.
- String parameters use `inox::String`, `inox::StringView` or a package type;
  raw `const char*` stays at OS/C library boundaries.
- Generated code calls the facade directly instead of constructing temporary
  legacy C values.
- `cFailureMode: 'thrown'` is used only when the facade can set a language
  exception. Pure predicates and scalar queries do not request a redundant
  `inox::thrown()` check.
- `cHasObservableSideEffects: true` materializes the result of a non-throwing
  operation before later expressions, preserving source evaluation order
  without inventing a language-exception contract.
- `cPreservesPendingException: true` allows an argument or receiver to be
  passed directly from a throwing runtime expression and checked after the
  preserving outer operation. The facade must return without replacing an
  already pending exception.
- Formatted calls may defer that check only for direct native or scalar
  results whose inlined operations declare `cPreservesPendingException`.
  Boxed runtime values are still materialized, checked, and adapted first.
- A native runtime-value adapter declares `cValueAdapterFailureMode: 'thrown'`
  when conversion can set a language exception. A pure facade wrapper can
  independently declare `cValueAdapterPreservesPendingException: true`; this
  allows a throwing producer and the wrapper to share one delayed exception
  check.
- Primitive runtime facades may provide the same contract directly. Their
  runtime-value constructors must preserve a pending exception and set one
  when the value has the wrong runtime type.
- `cAwaitHandlesInvalidSource: true` removes a separate validity guard only
  when the package await facade handles an invalid async source itself.
- An `async-result` provider defines `cValidExpression` and
  `cCoroutineAwaitExpression`. Its C++ facade implements the C++20 coroutine
  return/awaiter protocol. The compiler does not know the facade name,
  scheduler or event-loop backend and does not generate a provider-specific
  state machine.
- Native iteration describes creation and advancement separately with
  `creationFailureMode` and `nextFailureMode`. Set only the phase that can set
  a language exception. `preservesPendingException: true` allows iterator
  creation to receive a throwing runtime expression directly.
  `managedValue: true` preserves RAII ownership of the step value without a
  raw-value round trip.
- `rangeBased: true` lets a package expose a C++ range from its iterator
  method. The backend emits a range-based `for` and keeps package-specific
  iterator mechanics out of generated code.
- An allocating facade returns a valid result or sets an exception. On
  allocation failure it uses the non-allocating `inox::throw_out_of_memory()`
  boundary.
- An impossible native-facade state is a runtime invariant failure and uses
  `inox::fatal(...)`; it is not exposed as a catchable language exception.

## Tests and docs

- Keep every test in a separate small `.test.ts` file.
- Feature tests live directly under the package `tests/` tree. Integration
  modules under `tests/integration/` export the generic
  `libraryIntegrationTest` contract. Package architecture tests live under
  `tests/architecture/`. Test runners discover both categories by walking the
  stdlib tree; central runners do not import or list individual packages.
- Cover the public behavior, important errors and ownership/lifetime paths.
- Add deletion/no-tail coverage when introducing a new semantic role or native
  boundary.
- Package README files are written in English and describe supported API,
  behavior, errors and known limitations. Add C++ notes only when ownership or
  platform behavior is not obvious.

Package documentation lives next to the code:

- [Global packages](../stdlib/global/)
- [Node packages](../stdlib/node/)

## Checklist

Before merging a stdlib change:

1. Check declarations, descriptor, public headers and generated C++ together.
2. Confirm that implementation remains in the single package `.cc` file.
3. Confirm that compiler core contains no new package names or branches.
4. Run the focused feature test.
5. Run architecture, hosted and self-hosted gates for a completed slice.

Do not add import aliases, package manifests, central source lists, public
legacy C APIs, wrapper-only functions or implementation code in headers.
