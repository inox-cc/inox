# Promise

`async`/`await` are language features. The source-level `Promise<T>` identity and
API are provided by the selected `global:promise` library package. A compiler
library set without that package does not expose the `Promise` global and must
provide another `async-result` provider before it can compile async functions.

## Semantics

```text
pending
fulfilled(value)
rejected(error)
```

Promise continuations run as microtasks. `then` and `catch` callbacks must not
run synchronously in the same stack.

`await promise` unwraps the fulfilled value or propagates rejection into
`try/catch`.

## Sources

- `async function`
- async stdlib APIs
- manual `new Promise`
- `Promise.resolve`
- `Promise.reject`

## API Slice

```ts
type Resolve<T> = (value: T) => void
type Reject = (reason: unknown) => void

class Promise<T> {
  constructor(executor: (resolve: Resolve<T>, reject: Reject) => void)

  then<U>(onFulfilled: (value: T) => U): Promise<U>
  catch(onRejected: (reason: unknown) => T): Promise<T>
  finally(onFinally?: () => void): Promise<T>

  static all<T>(values: Array<T | Promise<T>>): Promise<T[]>
  static race<T>(values: Array<T | Promise<T>>): Promise<T>
  static resolve<T>(value: T | Promise<T>): Promise<T>
  static resolve(): Promise<void>
  static reject<T>(reason: T): Promise<unknown>
  static reject(): Promise<unknown>
}
```

The package declaration and package-local compiler descriptor define this API.
The portable compiler handles the `async-result` intrinsic role and the
`awaitable` semantic trait without recognizing the name `Promise`. Support for
this static API does not imply general user-defined static methods.

## Example

```ts
async function loadName(): Promise<string> {
  const text = await fs.promises.readFile('name.txt', 'utf8')
  return text.trim()
}

const name = await loadName()
console.log(name)
```

Manual promise:

```ts
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}
```

## C++ Runtime

```text
Promise<T>          -> inox::Promise
resolve/reject      -> settle promise and enqueue reactions
then/catch          -> child promise plus reaction callback
async function      -> C++20 coroutine returning inox::Promise
await               -> co_await through the package facade
unhandled rejection -> runtime microtask check + non-zero process result
```

Generated C++ uses the package-local `inox::Promise` RAII facade. Its
`inox_promise*` representation and reference-counting API are a private runtime
bridge, not the source-facing generated C++ surface. `then`/`catch` return child
facade values. A settled promise retains its stored result, and reactions own
their context through a finalizer.

The facade owns coroutine allocation, settlement and suspension. Coroutine
frames use the active inox allocator. Awaiters subscribe through the selected
runtime scheduler, so the same generated coroutine works with the embedded and
libuv loop backends. The compiler does not create per-`await` loops or emit
per-function unhandled-rejection state.

Values that cross suspension are stored in the coroutine frame with RAII
ownership. Runtime callback captures use shared RAII boxes when mutation must
remain visible after suspension.

## Limits

- `Promise.all` and `Promise.race` accept `Array` inputs rather than arbitrary
  iterables.
- `Promise.finally` accepts a synchronous callback and does not await a promise
  returned by that callback.
- Arbitrary thenable assimilation is not supported. `Promise.resolve` does
  preserve an existing Inox `Promise`.
- Host-level unhandled rejection events are not supported.
- Unsupported callback shapes should fail with `INOX_C_ASYNC`, not emit broken
  C++.
