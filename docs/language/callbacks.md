# Callbacks

Callbacks are first-class function values.

## Function Types

```ts
type OnMessage = (text: string) => void

function listen(callback: OnMessage): void {
  callback('hello')
}

listen((text) => {
  console.log(`message ${text}`)
})
```

Named callbacks:

```ts
function onTick(): void {
  console.log('tick')
}

setInterval(onTick, 1000)
```

Capturing callbacks:

```ts
const name = 'Ada'

setTimeout(() => {
  console.log(`hello ${name}`)
}, 1000)
```

## C++ Lowering

```text
direct non-escaping callback -> function pointer optimization
first-class function value   -> retained runtime callback value
capturing callback           -> runtime callback value + owned context
mutable escaping capture     -> shared boxed storage
```

Runtime callback object shape:

```c
typedef inox_status (*inox_callback_call_fn)(
  void* context,
  const inox_value* args,
  size_t arg_count,
  inox_value* out
);

typedef inox_status (*inox_callback_async_call_fn)(
  void* context,
  const inox_value* args,
  size_t arg_count,
  void* out
);

typedef struct inox_callback {
  inox_ref header;
  inox_callback_call_fn call;
  inox_callback_async_call_fn async_call;
  void* context;
  inox_callback_finalizer_fn finalizer;
} inox_callback;
```

The runtime callback value is the canonical ABI whenever a function crosses a
storage or lifetime boundary: object fields, sequences, maps, return values,
async suspension or a package callback contract. Its context owns captured
values and releases them from the callback finalizer.

Synchronous and async callbacks share the same retained runtime value. Exactly
one call entry is configured for a callback. The async entry uses an opaque
output pointer because the concrete awaitable facade belongs to the selected
package profile, not to the runtime callback ABI. Generated code passes the
package-provided native awaitable type at that boundary.

Companion C function pointers are not part of the semantic representation of
objects. The compiler may use a direct function pointer only as a local calling
optimization when it can prove that the function does not escape. Removing the
optimization must not change program behaviour.

## Rules

- Non-capturing, non-escaping callbacks may lower to cheap function pointers
  when the target signature allows it.
- Stored, returned and asynchronously retained callbacks use the runtime
  callback ABI regardless of whether they capture values.
- Function values can be passed through ordinary arguments, object fields,
  sequences, maps and return values without a side channel.
- A mutable binding captured by an escaping callback is boxed once; the
  declaring scope and all closures observe the same value.
- A package callback contract declares `call` or `event-loop` lifetime. The
  package receives the same runtime callback value in both cases and must retain
  it when the callback outlives the call.
- A package operation may accept an async callback only when the active package
  set provides an async-result intrinsic. The callback result is lowered through
  that intrinsic without teaching compiler core the package or facade name.
- Implicit method binding is not supported; use a closure.

```ts
setTimeout(() => user.greet(), 1000)
```

## Embedded Notes

- Captured closures and materialized function values require allocation or a
  configured closure arena.
- Profiles without closure allocation must report a capability diagnostic.
- Async callbacks use the same runtime callback value and lifetime rules as
  synchronous callbacks. The compiler does not know package names such as
  `Promise` or timer functions; awaitability and callback lifetime come from
  universal package contracts.
