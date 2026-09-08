# TypeScript-to-C++ compiler

- The architectural rules are defined in `docs/architecture.md` and
  `docs/stdlib.md`.
- The main compiler code lives in `compiler/`.
- `third_party/` contains external dependencies.
- The compiler is written in TypeScript. Keep it as strict as possible.
- Do not use `==` or `!=` in TypeScript. Use truthy/falsy checks or strict
  equality operators.
- Do not replace simple language features with helpers. Add support for those
  features to the compiler instead.
- If a feature is unsupported, add compiler support instead of rewriting code
  to avoid the feature.
- Add new files to Git immediately.
- Do not leave unused functions, variables, or imports in the codebase.
- When you discover a new compiler or self-hosting limitation, immediately add
  or update it in `docs/compiler-limitations.md`.
- Keep every test in a separate small file. Write tests in English.
- While fixing a failure, run the focused test by name instead of the complete
  suite, for example `pnpm test object-field-boolean`.
- Do not add non-standard methods to the stdlib.
- The stdlib style is defined in `docs/stdlib.md`. For any change to the
  stdlib, runtime, or generated C++, verify public headers, library
  implementation, and generated code against that document.
- Backward compatibility with the old C ABI is not required. Design new
  runtime and stdlib APIs as C++ facades with RAII. Keep legacy C helpers as
  private implementation details or replace them during migration.
- Do not use directories outside the project for temporary files. Keep all
  temporary output under `dist/`.
- `pnpm run example:*:inox` commands build with `dist/inox`; corresponding
  commands without `:inox` use `node compiler/index.ts`.
- Write commit messages in English.
- If a compiler built by `pnpm run build` fails `pnpm run test:inox` while
  `pnpm test` passes, consider adding coverage to the hosted test suite.
- When a test failure is reported, inspect its existing log before rerunning
  it. Logs are stored in `dist/test.log` and `dist/test-inox.log`.
- Generated declarations of unrelated functions and variables must not appear
  between a class declaration and its method definitions.
- Use C++20 or newer.
