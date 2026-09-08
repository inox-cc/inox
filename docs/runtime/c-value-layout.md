# Runtime Value Layout

This document describes the native runtime ABI for values, references,
containers and ownership. Generated output is C++, but the runtime ABI stays
C-compatible.

## Goals

- keep generated C++ debuggable;
- keep embedded builds possible with custom allocators;
- make object literal shapes sealed after construction;
- make `const` affect bindings, not nested fields;
- keep strings UTF-8 length-aware;
- keep checker metadata and C++ lowering aligned.

## Core Value

```c
typedef double inox_number;

typedef enum {
  INOX_TAG_UNDEFINED,
  INOX_TAG_NULL,
  INOX_TAG_BOOL,
  INOX_TAG_NUMBER,
  INOX_TAG_STRING,
  INOX_TAG_OBJECT,
  INOX_TAG_ARRAY,
  INOX_TAG_BYTES,
  INOX_TAG_FUNCTION,
  INOX_TAG_MAP,
  INOX_TAG_SET
} inox_tag;

typedef struct inox_ref inox_ref;

typedef struct {
  inox_tag tag;
  union {
    bool boolean;
    inox_number number;
    inox_ref* ref;
  } as;
} inox_value;
```

Scalars are plain values. Ref-backed values share the common `inox_ref` header.

```c
typedef enum {
  INOX_REF_STRING,
  INOX_REF_OBJECT,
  INOX_REF_ARRAY,
  INOX_REF_BYTES,
  INOX_REF_FUNCTION,
  INOX_REF_MAP,
  INOX_REF_SET
} inox_ref_kind;

struct inox_ref {
  inox_ref_kind kind;
  uint32_t ref_count;
  uint32_t flags;
  size_t size;
  size_t align;
  inox_allocator* allocator;
#ifdef INOX_ENABLE_WEAK
  inox_weak_cell* weak_cell;
#endif
};
```

The runtime uses reference counting. Cycle collection is not part of the core
runtime.

## Ownership

Creation APIs return owned values through out parameters. The caller releases
the returned value exactly once.

Examples:

- `inox_string_from_*`
- `inox_bytes_*`
- `inox_object_new`
- `inox_array_new`
- `inox_map_new`
- `inox_set_new`
- `inox_callback_new`

Borrowed views are valid only while the owning `inox_value` stays alive. Casting
`inox_value.as.ref` to `inox_string*`, `inox_object*`, `inox_array*`,
`inox_map*`, `inox_set*` or `inox_callback*` does not transfer ownership.

Container setters retain incoming managed values and release replaced values:

- `inox_object_init_known`, `inox_object_set_known`, `inox_object_set`
- `inox_array_set`, `inox_array_push`
- `inox_map_set`
- `inox_set_add`

Container getters return owned retained values:

- `inox_object_get_known`, `inox_object_get`
- `inox_array_get`
- `inox_map_get`
- `inox_promise_get_result`

The caller owns getter results. Missing map entries and empty array pops return
`null`.

`inox_array_pop` transfers the stored element ownership to the caller instead of
retaining a borrowed slot. The caller releases the popped value.

Promises are not `inox_value` refs. They use `inox_promise_retain` and
`inox_promise_release`. A promise retains its settled result and reactions own
their context through finalizers.

## Allocator

Core runtime files use `inox_allocator`; they do not call `malloc` directly.

```c
typedef struct {
  void* user;
  void* (*alloc)(void* user, size_t size, size_t align);
  void* (*realloc)(void* user, void* ptr, size_t old_size, size_t new_size, size_t align);
  void (*free)(void* user, void* ptr, size_t size, size_t align);
} inox_allocator;
```

Profiles may provide a libc heap allocator, arena, fixed-block pool or
host-owned embedded allocator.

## Strings

Strings are immutable UTF-8 byte slices.

```c
typedef struct {
  inox_ref header;
  size_t len;
  char bytes[];
} inox_string;
```

String values do not promise NUL termination. APIs that call C libraries must
copy or use length-aware functions.

Source functions returning `string` return an owned `inox_value`, not `char*`.
The caller may borrow an `inox_string*` view while the returned `inox_value`
stays alive.

## Runtime Objects

Runtime objects are sealed shape objects for object literals, dynamic JSON-like
values and APIs that intentionally materialize generic objects. TS classes
should lower to native C++ classes with descriptors, not to `inox_object`.

```c
typedef struct {
  const char* name;
  uint32_t flags;
} inox_field_info;

typedef struct {
  uint32_t field_count;
  const inox_field_info* fields;
} inox_shape;

typedef struct {
  inox_ref header;
  const inox_shape* shape;
  inox_value fields[];
} inox_object;
```

Field order is source/declaration order. Readonly nested fields are represented
in `inox_field_info.flags`, not by `const` bindings.

Known field access should use known-field indexes. Dynamic access is allowed
only for values that are actually dynamic/runtime objects; statically known
sealed shapes should prefer compile-time diagnostics for unknown fields.

## Arrays

```c
typedef struct {
  inox_ref header;
  size_t len;
  size_t cap;
  inox_value* items;
} inox_array;
```

Arrays are variable-length runtime values. Collection methods live in the
collections package, not in the core value module.

## Weak References

Weak support is gated by `INOX_ENABLE_WEAK`. The public API lives in
`inox/weak.h`.

```c
typedef struct inox_weak_ref {
  inox_weak_cell* cell;
} inox_weak_ref;

inox_status inox_weak_from_value(inox_value value, inox_weak_ref* out);
void inox_weak_retain(inox_weak_ref weak);
void inox_weak_release(inox_weak_ref weak);
inox_status inox_weak_upgrade(inox_weak_ref weak, inox_value* out);
```

`inox_weak_from_value` does not retain the target. `inox_weak_upgrade` returns
`null` if the target was destroyed; otherwise it returns a retained strong
`inox_value`.

Weak object fields store `inox_weak_ref` and upgrade on reads. Generated C++
treats weak reads as nullable values.

## Debug Memory

`INOX_DEBUG_MEMORY=1` enables runtime memory counters and OOM injection. The
C++ debug facade lives in `inox/debug.h`; the source-level intrinsic is
`inox.__debug.memory()`. The remaining C runtime core uses
`inox/debug_bridge.h` only as an internal bridge.

Snapshot shape:

```ts
type InoxDebugMemoryStats = {
  readonly allocCount: number
  readonly reallocCount: number
  readonly freeCount: number
  readonly liveAllocCount: number
  readonly liveBytes: number
  readonly peakLiveBytes: number
  readonly retainCount: number
  readonly releaseCount: number
  readonly livePromises: number
  readonly liveCallbacks: number
  readonly liveWeakCells: number
  readonly oomFailureCount: number
}
```

Tests should snapshot before and after runtime work and assert live counters
return to baseline. Debug memory is a diagnostics tool, not a production garbage
collector.

## Runtime status ABI

Low-level C runtime helpers may return a status plus out parameter where a C
boundary needs explicit success or failure reporting.

```c
typedef enum {
  INOX_OK,
  INOX_ERR_OOM,
  INOX_ERR_TYPE,
  INOX_ERR_THROW,
  INOX_ERR_FIELD,
  INOX_ERR_READONLY
} inox_status;
```

Generated C++ values release owned runtime references through RAII, so ordinary
functions and methods return directly and do not need a shared cleanup label.
Language exceptions use the runtime pending-exception channel:
`inox::throw_value()`, `inox::thrown()` and `inox::take_exception()`.

`INOX_ERR_THROW` is used only when a C callback/runtime bridge must report that
the pending channel is set. It is not used as the return ABI of ordinary
generated functions. A cleanup label is emitted only for a resource that still
requires explicit teardown, such as the raw storage of a boxed captured local.
