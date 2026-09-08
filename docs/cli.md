# CLI

Inox has two equivalent compiler drivers:

- `node compiler/index.ts` runs the hosted compiler from TypeScript sources;
- `dist/inox` is the self-hosted native compiler produced by `pnpm run build`.

## Build and run

A project needs only an entry file:

```bash
node compiler/index.ts build src/index.ts
node compiler/index.ts run src/index.ts
```

The self-hosted compiler accepts the same commands:

```bash
pnpm run build
./dist/inox build src/index.ts
./dist/inox run src/index.ts
```

Common options:

```text
--out-dir <dir>   build directory; defaults to dist/<name>
--name <name>     executable name
--debug           unoptimized Debug build
--release         explicitly select the default optimized Release build
--                program arguments after inox run
```

For example:

```bash
./dist/inox run src/server.ts --out-dir dist/server --name server -- --port 8080
```

The output directory contains:

```text
bin/                 executable
build/               internal CMake build tree
generated/           generated C++
build-manifest.json  code-generation inputs and outputs
CMakeLists.txt        internal build project
```

The driver first generates C++ and a manifest, then creates a stable internal
CMake project and builds it. Hosted and self-hosted commands share the same
build tree. Switching compiler modes does not rewrite unchanged generated
files or rebuild unchanged C++.

The manifest records only used runtime requirements. CMake compiles only the
corresponding native stdlib files, so unused packages do not increase the
native build or executable. The driver compares exact CMake and manifest
content with the previous configuration and explicitly reconfigures CMake when
native dependencies change. Dependency preparation, configuration, and build
output is streamed directly to the terminal.

`inox run` launches the program with inherited stdin, stdout, and stderr, so it
supports both interactive and long-running programs.

Backend options are inferred from used library operations. A package that
requires an event loop can select its recommended backend automatically. TLS
stays disabled until a used operation requires it. Explicit options such as
`--loop-backend` and `--tls-backend` override inferred values. Package
descriptors add their own options to the CLI; the driver has no fixed list of
library or backend options.

## Existing CMake projects

Use the provided CMake API for a project that already owns its native targets:

```cmake
set(INOX_TOOLCHAIN_ROOT "/path/to/inox")
include("${INOX_TOOLCHAIN_ROOT}/cmake/Inox.cmake")

inox_add_executable(app
  ENTRY "src/index.ts"
)
```

`inox_add_executable` integrates code generation, TypeScript dependency
tracking, generated sources, and the required runtime/native plan. It uses
`dist/inox` when available and otherwise falls back to the hosted compiler.
Set `INOX_COMPILER_MODE=node|native` to choose explicitly.

## Generate C++ only

Low-level forms remain available for debugging and build integrations:

```bash
inox input.ts [output.cc]
inox input.ts --emit cc -o output.cc
inox input.ts --emit cc --out-dir generated --entry
```

The last form can also write `--build-manifest manifest.json`.

## Clean generated output

```bash
pnpm run clean
```

This removes `coverage/` and `dist/`. It never modifies `tmp/`.
