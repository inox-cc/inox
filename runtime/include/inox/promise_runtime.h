#ifndef INOX_PROMISE_RUNTIME_H
#define INOX_PROMISE_RUNTIME_H

#include <stdbool.h>

#include "inox/loop.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_promise inox_promise;

typedef enum inox_promise_state {
  INOX_PROMISE_PENDING,
  INOX_PROMISE_FULFILLED,
  INOX_PROMISE_REJECTED
} inox_promise_state;

typedef inox_status (*inox_promise_reaction_fn)(void* context, inox_value value);
typedef inox_status (*inox_promise_chain_fn)(void* context, inox_value value, inox_value* out);
typedef void (*inox_promise_reaction_finalizer_fn)(void* context);

inox_status inox_promise_new(inox_loop* loop, inox_promise** out);
void inox_promise_retain(inox_promise* promise);
void inox_promise_release(inox_promise* promise);
inox_promise_state inox_promise_get_state(const inox_promise* promise);
bool inox_promise_is_unhandled_rejection(const inox_promise* promise);
bool inox_promise_has_unhandled_rejection(void);
void inox_promise_clear_unhandled_rejection(void);
inox_status inox_promise_get_result(inox_promise* promise, inox_value* out);
inox_status inox_promise_await(
  inox_loop* loop,
  inox_promise* promise,
  bool read_rejection,
  inox_value* out,
  inox_promise_state* out_state
);
inox_status inox_promise_then(
  inox_promise* promise,
  inox_promise_reaction_fn on_fulfilled,
  inox_promise_reaction_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer
);
inox_status inox_promise_chain(
  inox_promise* promise,
  inox_promise_chain_fn on_fulfilled,
  inox_promise_chain_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer,
  inox_promise** out
);
inox_status inox_promise_catch(
  inox_promise* promise,
  inox_promise_chain_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer,
  inox_promise** out
);
inox_status inox_promise_resolved(inox_loop* loop, inox_value value, inox_promise** out);
inox_status inox_promise_rejected(inox_loop* loop, inox_value error, inox_promise** out);
inox_status inox_promise_resolve(inox_promise* promise, inox_value value);
inox_status inox_promise_reject(inox_promise* promise, inox_value error);

#ifdef __cplusplus
}
#endif

#endif
