# Modules

Modules are static and compile-time only. The syntax follows ESM.

```ts
import { parseUser as parse } from './user'
import type { User } from './types'

export function parseUser(text: string): User {
  return parse(text)
}
```

Rules:

- imports are resolved at compile time
- relative imports use static ESM specifiers
- non-relative imports are admitted only by the selected compiler-library
  declarations; the portable compiler has no built-in list of `node:*` or any
  other package sources
- the default stdlib profile supplies declarations for its supported `node:*`
  packages, while another profile may use arbitrary source names
- native requirements are selected by actual IR usage of resolved bindings,
  not by the import statement alone
- an import absent from the selected profile produces the generic unsupported
  import diagnostic
- `import type` imports type aliases only and is erased from runtime output
- named imports may use keyword imported names when they are aliased, for
  example `import { type as osType } from 'node:os'`
- extensionless imports can resolve `./dir/index.ts` or `./dir/index.js`
- the full module graph is known before type checking
- no dynamic `import()`
- no `await import()`
- no runtime module loader
- no CommonJS
- no conditional runtime import

`import type` is compile-time only.

```ts
import type { User } from './user'
```

This keeps type checking static and embedded builds linkable.
