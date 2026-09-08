# Simple Example

This example exercises the Inox compiler and several stdlib packages.

Build and run it with the hosted compiler:

```bash
pnpm run example:simple
```

The package script uses the regular CLI flow:

```bash
node compiler/index.ts run examples/simple/index.ts
```

Use the self-hosted compiler with:

```bash
pnpm run build
pnpm run example:simple:inox
```

The source uses asynchronous network APIs, so their packages automatically
select and prepare libuv. It only fetches an `http://` URL, therefore TLS stays
disabled. Generated C++, the internal CMake project and the executable are
placed under `dist/simple/`.

Vendored dependencies are cached under `dist/third_party/cmake/` and reused
across builds.
