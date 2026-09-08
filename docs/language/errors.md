# Errors

Errors use JS-like syntax:

```ts
throw new Error('bad config')

try {
  loadConfig()
} catch (err) {
  console.error(err.message)
} finally {
  cleanup()
}
```

The source language supports `Error`, `throw`, `try`, `catch` and `finally`.
`new Error(message, { code, cause })` is a structured error value with readonly
`name`, `message`, `code` and nullable `cause` fields. Ordinary objects with
`name`/`message` fields are not treated as `Error` values.

Unsupported throw forms report `INOX_C_THROW`.

## Error

```ts
class Error {
  readonly name: string
  readonly message: string
  readonly code: string?
  readonly cause: Error?

  constructor(message: string, options?: ErrorOptions)
}

type ErrorOptions = {
  code: string?
  cause: Error?
}
```

`stack` is optional and target-dependent.

Stack traces are target-dependent and not required by the portable runtime.

## Lowering

C++ target should not use real exceptions.

```text
throw error -> compiler-generated error path
try block -> region with catch target
catch -> receives Error
finally -> emitted on both success and error paths
```

C++ lowering:

```text
throw -> inox::throw_value(error)
throwing helper -> ordinary return value plus pending runtime exception
throwing helper call -> inox::thrown() check at the propagation boundary
throwing helper call inside try -> jump to catch/finally while preserving the pending exception
catch (err) -> runtime string or Error binding
finally -> emitted for normal flow, throw, return, break and continue
```

Ordinary generated functions and methods never use a separate status return or
error out-parameter for language exceptions. If an exception escapes, the
function returns its normal fallback value while leaving the exception pending.
The caller checks `inox::thrown()` before consuming that value.

The C callback ABI may translate a pending exception to `INOX_ERR_THROW`, but it
does not extract and reinstall the exception. This status is only a bridge
signal; it is not the language-level exception transport.

Async:

```text
throw inside async coroutine -> pending runtime exception
coroutine settlement -> take pending exception and reject the async result
rejected co_await -> restore the rejection as a pending exception
try/catch around await -> catches rejection
```

This uses the same language exception channel as synchronous generated code;
it does not use C++ exceptions for ordinary `throw`.
