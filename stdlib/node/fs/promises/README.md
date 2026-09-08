# node:fs/promises

`node:fs/promises` is a strict builtin subpath package. It should not be treated
as an alias of `node:fs`; implementation may share lower-level helpers, but
resolver and tests should navigate through this package path.

The package owns its compiler entrypoint at `compiler/index.ts`. It depends on
the native `node:fs` runtime implementation, while the generic compiler
extension pipeline resolves its named and default-export bindings independently
from the parent package.
