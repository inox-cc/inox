#ifndef CCJS_PROMISE_H
#define CCJS_PROMISE_H

#include <stdbool.h>
#include "ccjs/loop.h"
#include "ccjs/value.h"

typedef struct ccjs_promise ccjs_promise;

typedef enum ccjs_promise_state { CCJS_PROMISE_PENDING, CCJS_PROMISE_FULFILLED, CCJS_PROMISE_REJECTED } ccjs_promise_state;

typedef ccjs_status (*ccjs_promise_reaction_fn)(void* context, ccjs_value value);
typedef ccjs_status (*ccjs_promise_chain_fn)(void* context, ccjs_value value, ccjs_value* out);
typedef void (*ccjs_promise_reaction_finalizer_fn)(void* context);

ccjs_status ccjs_promise_new(ccjs_loop* loop, ccjs_promise** out);
void ccjs_promise_retain(ccjs_promise* promise);
void ccjs_promise_release(ccjs_promise* promise);
ccjs_promise_state ccjs_promise_get_state(const ccjs_promise* promise);
bool ccjs_promise_is_unhandled_rejection(const ccjs_promise* promise);
ccjs_status ccjs_promise_get_result(ccjs_promise* promise, ccjs_value* out);
ccjs_status ccjs_promise_then(
  ccjs_promise* promise,
  ccjs_promise_reaction_fn on_fulfilled,
  ccjs_promise_reaction_fn on_rejected,
  void* context,
  ccjs_promise_reaction_finalizer_fn finalizer
);
ccjs_status ccjs_promise_chain(
  ccjs_promise* promise,
  ccjs_promise_chain_fn on_fulfilled,
  ccjs_promise_chain_fn on_rejected,
  void* context,
  ccjs_promise_reaction_finalizer_fn finalizer,
  ccjs_promise** out
);
ccjs_status ccjs_promise_catch(
  ccjs_promise* promise,
  ccjs_promise_chain_fn on_rejected,
  void* context,
  ccjs_promise_reaction_finalizer_fn finalizer,
  ccjs_promise** out
);
ccjs_status ccjs_promise_resolved(ccjs_loop* loop, ccjs_value value, ccjs_promise** out);
ccjs_status ccjs_promise_rejected(ccjs_loop* loop, ccjs_value error, ccjs_promise** out);
ccjs_status ccjs_promise_resolve(ccjs_promise* promise, ccjs_value value);
ccjs_status ccjs_promise_reject(ccjs_promise* promise, ccjs_value error);

#endif
