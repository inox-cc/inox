# Architecture

## Core principle

The compiler core understands the language, but it does not know individual
libraries.

All stdlib globals, imports, types, operations, diagnostics, and native
dependencies belong to discoverable packages. Removing a package and
regenerating the registry must remove its API and native code without changes
to `compiler/` or central build files.

## Boundaries

### Compiler

`compiler/` owns:

- lexical analysis, parsing, and syntax;
- primitive types and the general type system;
- functions, classes, and control flow;
- module resolution;
- checking, HIR, IR, and C++ lowering;
- ownership and runtime-value boundaries;
- generic package and backend extension mechanisms.

The portable compiler works only with general `TypeRef` values, semantic
roles, and opaque package, binding, operation, requirement, and capability
identities.

A recursive type is not inherently an ownership cycle. Strong fields use
regular RAII retain/release. Nullable package-native values store the package's
C++ type in `std::optional<T>`. Weak fields use the common runtime weak cell and
are available to a package-native type only when its descriptor provides a
runtime-value mapping. The compiler core never chooses storage from a library
type name.

`compiler/` must not contain knowledge of concrete stdlib globals, `node:*`
modules, methods, diagnostics, C++ facades, headers, or source files.

### C++ backend

The public generator entry point is `compiler/codegen-cpp.ts`; its
implementation lives in `compiler/backends/cpp/`. Public backend types and
functions use the `Cpp` or `emitCpp` prefix. The directory name does not depend
on generated file extensions.

The CLI value `--emit cc` selects `.cc` output. It does not select the C
language: Inox generates C++20.

The backend receives native types, expressions, includes, and sources only
from the selected `CompilerLibrarySet`. Adding or removing an stdlib package
must not require a package-specific backend branch.

Package-native inheritance is declared through `baseTypeIds` and resolved
while building the library set. A native package may publish an opaque
interface id when another package needs an internal C++ interface. A generic
class descriptor exposes the implementation through `query_interface`. The id
and C++ contract belong to the provider; the compiler core knows only the
generic hook and package dependency graph.

`async` functions become C++20 coroutines. The compiler core knows the
`async-result` semantic role and the selected provider's generic coroutine
contract: C++ return type, validity expression, and `co_await` expression.
Names such as `Promise`, libuv, and the embedded loop do not appear in
lowering. The selected package/runtime backend schedules and resumes the
coroutine.

Language exceptions use one runtime pending-exception channel. Ordinary
generated functions and methods return values directly. A separate
`inox_status`, result out-parameter, or error out-parameter is forbidden for
language `throw`; status values are reserved for external C callback and
runtime bridge boundaries.

Non-null managed values cross ordinary generated function boundaries through
RAII: `inox::String` for strings, `inox::ObjectValue` for concrete structural
objects, and `inox::Value` for heterogeneous object unions. Known structural
fields are read and written by shape index. Simple object and array literals
are materialized in one aggregate operation. Raw `inox_value`, manual
retain/release, and element-by-element assembly remain only where a dynamic or
callback/runtime boundary requires them.

### Runtime

`runtime/` is not part of the compiler core. It is generic C/C++ support linked
into generated programs:

- values and ownership;
- allocation and status/error boundaries;
- callbacks, async scheduling, and platform adapters;
- generic network transports, including TCP and TLS;
- generic object/runtime-value bridges.

The runtime does not define the public stdlib API and does not scan the library
tree. Package-specific C++ code is selected only through the generated native
plan.

### Stdlib packages

Each package below `stdlib/` provides its own:

- public declarations in `index.ts` or `index.d.ts`;
- optional deterministic data descriptor in `compiler/index.ts`;
- semantic roles, type operators, and operations declarations cannot express;
- runtime requirements, capabilities, and target options;
- native sources, include roots, and C++ mappings.

Globals live in `stdlib/global/`, `node:*` modules in `stdlib/node/`, and exact
bare imports such as `database` in `stdlib/packages/`. Discovery walks all
three trees generically. No bare package name appears in compiler core or a
central build file.

A package entry point depends only on public contracts from
`compiler/extensions/`. The reverse dependency from compiler to stdlib is
forbidden.

## Package discovery

The host/build boundary discovers packages and builds an immutable
`CompilerLibrarySet`, generated registry, and native plan.

The generated registry includes the validated result of parsing ambient
declarations. Hosted and self-hosted compilers consume the same result, so the
native binary does not parse unchanged stdlib declarations on every start. The
registry is a derived cache of the selected library set, not a second API
definition, and is always regenerated after package changes.

Declarations are the only source of ordinary value/type symbols and
signatures. A descriptor cannot create a symbol absent from declarations. A
type-only operator is a separate extension category: its descriptor supplies
the public name and generic semantics, such as `function-result`, without
creating a value binding.

Compiler dispatch uses resolved binding identities rather than API name
comparisons. The native plan is tied to the selected library-set fingerprint
and associates each package's sources with its runtime requirements. It is
metadata, not an instruction to build the entire library set.

Platform configuration is supplied through a separate target profile and a
generic option protocol. It is neither an stdlib package nor a global API.

A package or target option may declare a recommended automatic value. The
checker records it only when a used operation or runtime requirement reaches
the corresponding option constraint. The host driver combines inferred
values, profile defaults, and explicit CLI overrides in that order. Concrete
backend names, CMake mappings, and native dependency preparation stay outside
`compiler/`.

## Program builds

The portable compiler core ends with generated C++ and resolved generic
package/target option values. It does not know about CMake, the installed
toolchain, or executable launch mechanics.

The host driver can package the result in a build manifest containing
TypeScript inputs, C++ outputs, the closure of used runtime requirements, and
target-profile mappings. `inox build` and `inox run` map those requirements to
the generic native plan, and CMake compiles only the required package sources.

The standard driver generates C++ and a manifest with either compiler mode,
then creates the internal CMake project. Hosted and self-hosted commands share
one build tree. The driver stores the exact CMake project and manifest used for
the last configuration and explicitly reconfigures CMake when either changes;
native dependency changes do not depend on timestamp resolution.

For existing CMake projects, `inox_add_executable` integrates code generation
and dependency tracking. This remains a host/build boundary: the compiler
command, target profile, and native plan arrive from outside compiler core.

## Independence criterion

After physically removing a package:

1. its declarations and API are unavailable;
2. API use produces the normal unknown or unsupported diagnostic;
3. its requirements, includes, and sources disappear from the native plan;
4. the remaining valid profile still compiles;
5. `compiler/` and central build files remain unchanged.

Provider packages are tested with the same rule applied to their dependency
closure.

## Executable contracts

The architecture is protected by executable checks:

- a bare profile validates the language without stdlib;
- declaration-first tests reject descriptor-only admission;
- renamed providers prove independence from names such as `Array` and
  `Promise`;
- coroutine-provider tests validate async lowering with a renamed
  `async-result` type and reject manual state-machine output;
- semantic no-tail scans find package knowledge in portable compiler code;
- a full-tree deletion matrix physically removes every discoverable package;
- hosted/self-hosted parity compares diagnostics, normalized IR, generated
  C++, and the build-scoped native plan;
- HTTP and HTTPS acceptance builds and launches a separate server for each
  compiler mode. HTTPS reuses the HTTP state machine through a common transport
  contract. Large request and response bodies cover backpressure, `drain`,
  pause/resume, inactivity timeout, `destroy(error)`, and cancellation through
  a package-provided `AbortSignal`.

Normative package and C++ facade rules are in [`stdlib.md`](stdlib.md).
