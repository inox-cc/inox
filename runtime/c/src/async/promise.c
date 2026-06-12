#include "ccjs/promise.h"

typedef enum ccjs_promise_reaction_kind {
  CCJS_PROMISE_REACTION_OBSERVER,
  CCJS_PROMISE_REACTION_CHAIN
} ccjs_promise_reaction_kind;

typedef struct ccjs_promise_reaction {
  ccjs_promise_reaction_kind kind;
  ccjs_promise_reaction_fn on_fulfilled;
  ccjs_promise_reaction_fn on_rejected;
  ccjs_promise_chain_fn chain_fulfilled;
  ccjs_promise_chain_fn chain_rejected;
  void* context;
  ccjs_promise_reaction_finalizer_fn finalizer;
  ccjs_promise* child;
  struct ccjs_promise_reaction* next;
} ccjs_promise_reaction;

struct ccjs_promise {
  ccjs_loop* loop;
  unsigned int ref_count;
  ccjs_promise_state state;
  bool handled;
  ccjs_value result;
  ccjs_promise_reaction* head;
  ccjs_promise_reaction* tail;
};

typedef struct ccjs_promise_reaction_task {
  ccjs_promise* promise;
  ccjs_promise_reaction* reaction;
} ccjs_promise_reaction_task;

static ccjs_status ccjs_promise_settle(ccjs_promise* promise, ccjs_promise_state state, ccjs_value value);
static ccjs_status ccjs_promise_add_reaction(ccjs_promise* promise, ccjs_promise_reaction* reaction);
static ccjs_status ccjs_promise_schedule_reaction(ccjs_promise* promise, ccjs_promise_reaction* reaction);
static bool ccjs_promise_reaction_tracks_rejection(const ccjs_promise_reaction* reaction);
static ccjs_status ccjs_promise_run_observer_reaction(ccjs_promise_reaction_task* task);
static ccjs_status ccjs_promise_run_chain_reaction(ccjs_promise_reaction_task* task);
static ccjs_status ccjs_promise_run_reaction(void* context);
static void ccjs_promise_reaction_task_finalizer(void* context);
static void ccjs_promise_free_reaction(ccjs_promise* promise, ccjs_promise_reaction* reaction);

ccjs_status ccjs_promise_new(ccjs_loop* loop, ccjs_promise** out) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise* promise = loop->allocator->alloc(loop->allocator->user, sizeof(ccjs_promise), _Alignof(ccjs_promise));

  if (promise == 0) {
    *out = 0;
    return CCJS_ERR_OOM;
  }

  promise->loop = loop;
  promise->ref_count = 1;
  promise->state = CCJS_PROMISE_PENDING;
  promise->handled = false;
  promise->result = ccjs_undefined_value();
  promise->head = 0;
  promise->tail = 0;
  *out = promise;

  return CCJS_OK;
}

void ccjs_promise_retain(ccjs_promise* promise) {
  if (promise != 0) {
    promise->ref_count += 1;
  }
}

void ccjs_promise_release(ccjs_promise* promise) {
  if (promise == 0 || promise->ref_count == 0) {
    return;
  }

  promise->ref_count -= 1;

  if (promise->ref_count > 0) {
    return;
  }

  ccjs_promise_reaction* reaction = promise->head;

  while (reaction != 0) {
    ccjs_promise_reaction* next = reaction->next;
    ccjs_promise_free_reaction(promise, reaction);
    reaction = next;
  }

  ccjs_release(promise->result);
  promise->loop->allocator->free(promise->loop->allocator->user, promise, sizeof(ccjs_promise), _Alignof(ccjs_promise));
}

ccjs_promise_state ccjs_promise_get_state(const ccjs_promise* promise) {
  return promise == 0 ? CCJS_PROMISE_REJECTED : promise->state;
}

bool ccjs_promise_is_unhandled_rejection(const ccjs_promise* promise) {
  return promise != 0 && promise->state == CCJS_PROMISE_REJECTED && !promise->handled;
}

ccjs_status ccjs_promise_get_result(ccjs_promise* promise, ccjs_value* out) {
  if (promise == 0 || out == 0 || promise->state == CCJS_PROMISE_PENDING) {
    return CCJS_ERR_TYPE;
  }

  if (promise->state == CCJS_PROMISE_REJECTED) {
    promise->handled = true;
  }

  *out = promise->result;
  ccjs_retain(*out);

  return CCJS_OK;
}

ccjs_status ccjs_promise_then(
  ccjs_promise* promise,
  ccjs_promise_reaction_fn on_fulfilled,
  ccjs_promise_reaction_fn on_rejected,
  void* context,
  ccjs_promise_reaction_finalizer_fn finalizer
) {
  if (promise == 0 || (on_fulfilled == 0 && on_rejected == 0)) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise_reaction* reaction = promise->loop->allocator->alloc(
    promise->loop->allocator->user,
    sizeof(ccjs_promise_reaction),
    _Alignof(ccjs_promise_reaction)
  );

  if (reaction == 0) {
    return CCJS_ERR_OOM;
  }

  reaction->kind = CCJS_PROMISE_REACTION_OBSERVER;
  reaction->on_fulfilled = on_fulfilled;
  reaction->on_rejected = on_rejected;
  reaction->chain_fulfilled = 0;
  reaction->chain_rejected = 0;
  reaction->context = context;
  reaction->finalizer = finalizer;
  reaction->child = 0;
  reaction->next = 0;

  return ccjs_promise_add_reaction(promise, reaction);
}

ccjs_status ccjs_promise_chain(
  ccjs_promise* promise,
  ccjs_promise_chain_fn on_fulfilled,
  ccjs_promise_chain_fn on_rejected,
  void* context,
  ccjs_promise_reaction_finalizer_fn finalizer,
  ccjs_promise** out
) {
  if (promise == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  ccjs_promise* child = 0;
  ccjs_status status = ccjs_promise_new(promise->loop, &child);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_promise_reaction* reaction = promise->loop->allocator->alloc(
    promise->loop->allocator->user,
    sizeof(ccjs_promise_reaction),
    _Alignof(ccjs_promise_reaction)
  );

  if (reaction == 0) {
    ccjs_promise_release(child);
    return CCJS_ERR_OOM;
  }

  reaction->kind = CCJS_PROMISE_REACTION_CHAIN;
  reaction->on_fulfilled = 0;
  reaction->on_rejected = 0;
  reaction->chain_fulfilled = on_fulfilled;
  reaction->chain_rejected = on_rejected;
  reaction->context = context;
  reaction->finalizer = finalizer;
  reaction->child = child;
  reaction->next = 0;
  ccjs_promise_retain(child);

  status = ccjs_promise_add_reaction(promise, reaction);

  if (status != CCJS_OK) {
    ccjs_promise_release(child);
    return status;
  }

  *out = child;

  return CCJS_OK;
}

ccjs_status ccjs_promise_catch(
  ccjs_promise* promise,
  ccjs_promise_chain_fn on_rejected,
  void* context,
  ccjs_promise_reaction_finalizer_fn finalizer,
  ccjs_promise** out
) {
  return ccjs_promise_chain(promise, 0, on_rejected, context, finalizer, out);
}

ccjs_status ccjs_promise_resolved(ccjs_loop* loop, ccjs_value value, ccjs_promise** out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_status status = ccjs_promise_new(loop, out);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_promise_resolve(*out, value);

  if (status != CCJS_OK) {
    ccjs_promise_release(*out);
    *out = 0;
  }

  return status;
}

ccjs_status ccjs_promise_rejected(ccjs_loop* loop, ccjs_value error, ccjs_promise** out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_status status = ccjs_promise_new(loop, out);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_promise_reject(*out, error);

  if (status != CCJS_OK) {
    ccjs_promise_release(*out);
    *out = 0;
  }

  return status;
}

ccjs_status ccjs_promise_resolve(ccjs_promise* promise, ccjs_value value) {
  return ccjs_promise_settle(promise, CCJS_PROMISE_FULFILLED, value);
}

ccjs_status ccjs_promise_reject(ccjs_promise* promise, ccjs_value error) {
  return ccjs_promise_settle(promise, CCJS_PROMISE_REJECTED, error);
}

static ccjs_status ccjs_promise_settle(ccjs_promise* promise, ccjs_promise_state state, ccjs_value value) {
  if (promise == 0 || promise->state != CCJS_PROMISE_PENDING) {
    return CCJS_ERR_TYPE;
  }

  promise->state = state;
  promise->result = value;
  ccjs_retain(value);

  ccjs_promise_reaction* reaction = promise->head;
  promise->head = 0;
  promise->tail = 0;
  ccjs_status first_error = CCJS_OK;

  while (reaction != 0) {
    ccjs_promise_reaction* next = reaction->next;
    reaction->next = 0;
    ccjs_status status = ccjs_promise_schedule_reaction(promise, reaction);

    if (first_error == CCJS_OK && status != CCJS_OK) {
      first_error = status;
    }

    reaction = next;
  }

  return first_error;
}

static ccjs_status ccjs_promise_add_reaction(ccjs_promise* promise, ccjs_promise_reaction* reaction) {
  if (promise == 0 || reaction == 0) {
    return CCJS_ERR_TYPE;
  }

  bool tracks_rejection = ccjs_promise_reaction_tracks_rejection(reaction);

  if (promise->state != CCJS_PROMISE_PENDING) {
    ccjs_status status = ccjs_promise_schedule_reaction(promise, reaction);

    if (status == CCJS_OK && tracks_rejection) {
      promise->handled = true;
    }

    return status;
  }

  if (tracks_rejection) {
    promise->handled = true;
  }

  if (promise->tail == 0) {
    promise->head = reaction;
    promise->tail = reaction;
  } else {
    promise->tail->next = reaction;
    promise->tail = reaction;
  }

  return CCJS_OK;
}

static ccjs_status ccjs_promise_schedule_reaction(ccjs_promise* promise, ccjs_promise_reaction* reaction) {
  ccjs_promise_reaction_task* task = promise->loop->allocator->alloc(
    promise->loop->allocator->user,
    sizeof(ccjs_promise_reaction_task),
    _Alignof(ccjs_promise_reaction_task)
  );

  if (task == 0) {
    ccjs_promise_free_reaction(promise, reaction);
    return CCJS_ERR_OOM;
  }

  task->promise = promise;
  task->reaction = reaction;
  ccjs_promise_retain(promise);

  ccjs_status status = ccjs_loop_queue_microtask(
    promise->loop,
    ccjs_promise_run_reaction,
    task,
    ccjs_promise_reaction_task_finalizer
  );

  if (status != CCJS_OK) {
    ccjs_promise_reaction_task_finalizer(task);
  }

  return status;
}

static bool ccjs_promise_reaction_tracks_rejection(const ccjs_promise_reaction* reaction) {
  if (reaction == 0) {
    return false;
  }

  if (reaction->kind == CCJS_PROMISE_REACTION_CHAIN) {
    return true;
  }

  return reaction->on_rejected != 0;
}

static ccjs_status ccjs_promise_run_reaction(void* context) {
  ccjs_promise_reaction_task* task = (ccjs_promise_reaction_task*)context;

  if (task == 0 || task->promise == 0 || task->reaction == 0) {
    return CCJS_ERR_TYPE;
  }

  return task->reaction->kind == CCJS_PROMISE_REACTION_CHAIN
    ? ccjs_promise_run_chain_reaction(task)
    : ccjs_promise_run_observer_reaction(task);
}

static ccjs_status ccjs_promise_run_observer_reaction(ccjs_promise_reaction_task* task) {
  if (task == 0 || task->promise == 0 || task->reaction == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise_reaction_fn callback = task->promise->state == CCJS_PROMISE_FULFILLED
    ? task->reaction->on_fulfilled
    : task->reaction->on_rejected;

  if (callback == 0) {
    return CCJS_OK;
  }

  return callback(task->reaction->context, task->promise->result);
}

static ccjs_status ccjs_promise_run_chain_reaction(ccjs_promise_reaction_task* task) {
  if (task == 0 || task->promise == 0 || task->reaction == 0 || task->reaction->child == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise_state state = task->promise->state;
  ccjs_promise_chain_fn callback = state == CCJS_PROMISE_FULFILLED
    ? task->reaction->chain_fulfilled
    : task->reaction->chain_rejected;

  if (callback == 0) {
    return state == CCJS_PROMISE_FULFILLED
      ? ccjs_promise_resolve(task->reaction->child, task->promise->result)
      : ccjs_promise_reject(task->reaction->child, task->promise->result);
  }

  ccjs_value next = ccjs_undefined_value();
  ccjs_status status = callback(task->reaction->context, task->promise->result, &next);

  if (status == CCJS_OK) {
    ccjs_status resolve_status = ccjs_promise_resolve(task->reaction->child, next);
    ccjs_release(next);
    return resolve_status;
  }

  ccjs_status reject_status = ccjs_promise_reject(task->reaction->child, ccjs_number_value((ccjs_number)status));

  return reject_status == CCJS_OK ? CCJS_OK : reject_status;
}

static void ccjs_promise_reaction_task_finalizer(void* context) {
  ccjs_promise_reaction_task* task = (ccjs_promise_reaction_task*)context;

  if (task == 0 || task->promise == 0) {
    return;
  }

  ccjs_promise_free_reaction(task->promise, task->reaction);
  ccjs_allocator* allocator = task->promise->loop->allocator;
  ccjs_promise* promise = task->promise;
  allocator->free(allocator->user, task, sizeof(ccjs_promise_reaction_task), _Alignof(ccjs_promise_reaction_task));
  ccjs_promise_release(promise);
}

static void ccjs_promise_free_reaction(ccjs_promise* promise, ccjs_promise_reaction* reaction) {
  if (promise == 0 || reaction == 0) {
    return;
  }

  if (reaction->finalizer != 0) {
    reaction->finalizer(reaction->context);
  }

  ccjs_promise_release(reaction->child);

  promise->loop->allocator->free(
    promise->loop->allocator->user,
    reaction,
    sizeof(ccjs_promise_reaction),
    _Alignof(ccjs_promise_reaction)
  );
}
