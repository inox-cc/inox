#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/promise.h"

typedef enum inox_promise_reaction_kind {
  INOX_PROMISE_REACTION_OBSERVER,
  INOX_PROMISE_REACTION_CHAIN
} inox_promise_reaction_kind;

typedef struct inox_promise_reaction {
  inox_promise_reaction_kind kind;
  inox_promise_reaction_fn on_fulfilled;
  inox_promise_reaction_fn on_rejected;
  inox_promise_chain_fn chain_fulfilled;
  inox_promise_chain_fn chain_rejected;
  void* context;
  inox_promise_reaction_finalizer_fn finalizer;
  inox_promise* child;
  struct inox_promise_reaction* next;
} inox_promise_reaction;

struct inox_promise {
  inox_loop* loop;
  unsigned int ref_count;
  inox_promise_state state;
  bool handled;
  inox_value result;
  inox_promise_reaction* head;
  inox_promise_reaction* tail;
};

typedef struct inox_promise_reaction_task {
  inox_promise* promise;
  inox_promise_reaction* reaction;
} inox_promise_reaction_task;

static inox_status inox_promise_settle(inox_promise* promise, inox_promise_state state, inox_value value);
static inox_status inox_promise_add_reaction(inox_promise* promise, inox_promise_reaction* reaction);
static inox_status inox_promise_schedule_reaction(inox_promise* promise, inox_promise_reaction* reaction);
static bool inox_promise_reaction_tracks_rejection(const inox_promise_reaction* reaction);
static inox_status inox_promise_run_observer_reaction(inox_promise_reaction_task* task);
static inox_status inox_promise_run_chain_reaction(inox_promise_reaction_task* task);
static inox_status inox_promise_run_reaction(void* context);
static void inox_promise_reaction_task_finalizer(void* context);
static void inox_promise_free_reaction(inox_promise* promise, inox_promise_reaction* reaction);

inox_status inox_promise_new(inox_loop* loop, inox_promise** out) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_promise* promise = loop->allocator->alloc(loop->allocator->user, sizeof(inox_promise), _Alignof(inox_promise));

  if (promise == 0) {
    *out = 0;
    return INOX_ERR_OOM;
  }

  promise->loop = loop;
  promise->ref_count = 1;
  promise->state = INOX_PROMISE_PENDING;
  promise->handled = false;
  promise->result = inox_undefined_value();
  promise->head = 0;
  promise->tail = 0;
  *out = promise;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_promise_created();
#endif

  return INOX_OK;
}

void inox_promise_retain(inox_promise* promise) {
  if (promise != 0) {
    promise->ref_count += 1;
  }
}

void inox_promise_release(inox_promise* promise) {
  if (promise == 0 || promise->ref_count == 0) {
    return;
  }

  promise->ref_count -= 1;

  if (promise->ref_count > 0) {
    return;
  }

  inox_promise_reaction* reaction = promise->head;

  while (reaction != 0) {
    inox_promise_reaction* next = reaction->next;
    inox_promise_free_reaction(promise, reaction);
    reaction = next;
  }

  inox_release(promise->result);
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_promise_destroyed();
#endif
  promise->loop->allocator->free(promise->loop->allocator->user, promise, sizeof(inox_promise), _Alignof(inox_promise));
}

inox_promise_state inox_promise_get_state(const inox_promise* promise) {
  return promise == 0 ? INOX_PROMISE_REJECTED : promise->state;
}

bool inox_promise_is_unhandled_rejection(const inox_promise* promise) {
  return promise != 0 && promise->state == INOX_PROMISE_REJECTED && !promise->handled;
}

inox_status inox_promise_get_result(inox_promise* promise, inox_value* out) {
  if (promise == 0 || out == 0 || promise->state == INOX_PROMISE_PENDING) {
    return INOX_ERR_TYPE;
  }

  if (promise->state == INOX_PROMISE_REJECTED) {
    promise->handled = true;
  }

  *out = promise->result;
  inox_retain(*out);

  return INOX_OK;
}

inox_status inox_promise_then(
  inox_promise* promise,
  inox_promise_reaction_fn on_fulfilled,
  inox_promise_reaction_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer
) {
  if (promise == 0 || (on_fulfilled == 0 && on_rejected == 0)) {
    return INOX_ERR_TYPE;
  }

  inox_promise_reaction* reaction = promise->loop->allocator->alloc(
    promise->loop->allocator->user, sizeof(inox_promise_reaction), _Alignof(inox_promise_reaction)
  );

  if (reaction == 0) {
    return INOX_ERR_OOM;
  }

  reaction->kind = INOX_PROMISE_REACTION_OBSERVER;
  reaction->on_fulfilled = on_fulfilled;
  reaction->on_rejected = on_rejected;
  reaction->chain_fulfilled = 0;
  reaction->chain_rejected = 0;
  reaction->context = context;
  reaction->finalizer = finalizer;
  reaction->child = 0;
  reaction->next = 0;

  return inox_promise_add_reaction(promise, reaction);
}

inox_status inox_promise_chain(
  inox_promise* promise,
  inox_promise_chain_fn on_fulfilled,
  inox_promise_chain_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer,
  inox_promise** out
) {
  if (promise == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  inox_promise* child = 0;
  inox_status status = inox_promise_new(promise->loop, &child);

  if (status != INOX_OK) {
    return status;
  }

  inox_promise_reaction* reaction = promise->loop->allocator->alloc(
    promise->loop->allocator->user, sizeof(inox_promise_reaction), _Alignof(inox_promise_reaction)
  );

  if (reaction == 0) {
    inox_promise_release(child);
    return INOX_ERR_OOM;
  }

  reaction->kind = INOX_PROMISE_REACTION_CHAIN;
  reaction->on_fulfilled = 0;
  reaction->on_rejected = 0;
  reaction->chain_fulfilled = on_fulfilled;
  reaction->chain_rejected = on_rejected;
  reaction->context = context;
  reaction->finalizer = finalizer;
  reaction->child = child;
  reaction->next = 0;
  inox_promise_retain(child);

  status = inox_promise_add_reaction(promise, reaction);

  if (status != INOX_OK) {
    inox_promise_release(child);
    return status;
  }

  *out = child;

  return INOX_OK;
}

inox_status inox_promise_catch(
  inox_promise* promise,
  inox_promise_chain_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer,
  inox_promise** out
) {
  return inox_promise_chain(promise, 0, on_rejected, context, finalizer, out);
}

inox_status inox_promise_resolved(inox_loop* loop, inox_value value, inox_promise** out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_status status = inox_promise_new(loop, out);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_promise_resolve(*out, value);

  if (status != INOX_OK) {
    inox_promise_release(*out);
    *out = 0;
  }

  return status;
}

inox_status inox_promise_rejected(inox_loop* loop, inox_value error, inox_promise** out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  inox_status status = inox_promise_new(loop, out);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_promise_reject(*out, error);

  if (status != INOX_OK) {
    inox_promise_release(*out);
    *out = 0;
  }

  return status;
}

inox_status inox_promise_resolve(inox_promise* promise, inox_value value) {
  return inox_promise_settle(promise, INOX_PROMISE_FULFILLED, value);
}

inox_status inox_promise_reject(inox_promise* promise, inox_value error) {
  return inox_promise_settle(promise, INOX_PROMISE_REJECTED, error);
}

static inox_status inox_promise_settle(inox_promise* promise, inox_promise_state state, inox_value value) {
  if (promise == 0 || promise->state != INOX_PROMISE_PENDING) {
    return INOX_ERR_TYPE;
  }

  promise->state = state;
  promise->result = value;
  inox_retain(value);

  inox_promise_reaction* reaction = promise->head;
  promise->head = 0;
  promise->tail = 0;
  inox_status first_error = INOX_OK;

  while (reaction != 0) {
    inox_promise_reaction* next = reaction->next;
    reaction->next = 0;
    inox_status status = inox_promise_schedule_reaction(promise, reaction);

    if (first_error == INOX_OK && status != INOX_OK) {
      first_error = status;
    }

    reaction = next;
  }

  return first_error;
}

static inox_status inox_promise_add_reaction(inox_promise* promise, inox_promise_reaction* reaction) {
  if (promise == 0 || reaction == 0) {
    return INOX_ERR_TYPE;
  }

  bool tracks_rejection = inox_promise_reaction_tracks_rejection(reaction);

  if (promise->state != INOX_PROMISE_PENDING) {
    inox_status status = inox_promise_schedule_reaction(promise, reaction);

    if (status == INOX_OK && tracks_rejection) {
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

  return INOX_OK;
}

static inox_status inox_promise_schedule_reaction(inox_promise* promise, inox_promise_reaction* reaction) {
  inox_promise_reaction_task* task = promise->loop->allocator->alloc(
    promise->loop->allocator->user, sizeof(inox_promise_reaction_task), _Alignof(inox_promise_reaction_task)
  );

  if (task == 0) {
    inox_promise_free_reaction(promise, reaction);
    return INOX_ERR_OOM;
  }

  task->promise = promise;
  task->reaction = reaction;
  inox_promise_retain(promise);

  inox_status status =
    inox_loop_queue_microtask(promise->loop, inox_promise_run_reaction, task, inox_promise_reaction_task_finalizer);

  if (status != INOX_OK) {
    inox_promise_reaction_task_finalizer(task);
  }

  return status;
}

static bool inox_promise_reaction_tracks_rejection(const inox_promise_reaction* reaction) {
  if (reaction == 0) {
    return false;
  }

  if (reaction->kind == INOX_PROMISE_REACTION_CHAIN) {
    return true;
  }

  return reaction->on_rejected != 0;
}

static inox_status inox_promise_run_reaction(void* context) {
  inox_promise_reaction_task* task = (inox_promise_reaction_task*)context;

  if (task == 0 || task->promise == 0 || task->reaction == 0) {
    return INOX_ERR_TYPE;
  }

  return task->reaction->kind == INOX_PROMISE_REACTION_CHAIN ? inox_promise_run_chain_reaction(task) :
                                                               inox_promise_run_observer_reaction(task);
}

static inox_status inox_promise_run_observer_reaction(inox_promise_reaction_task* task) {
  if (task == 0 || task->promise == 0 || task->reaction == 0) {
    return INOX_ERR_TYPE;
  }

  inox_promise_reaction_fn callback = task->promise->state == INOX_PROMISE_FULFILLED ? task->reaction->on_fulfilled :
                                                                                       task->reaction->on_rejected;

  if (callback == 0) {
    return INOX_OK;
  }

  return callback(task->reaction->context, task->promise->result);
}

static inox_status inox_promise_run_chain_reaction(inox_promise_reaction_task* task) {
  if (task == 0 || task->promise == 0 || task->reaction == 0 || task->reaction->child == 0) {
    return INOX_ERR_TYPE;
  }

  inox_promise_state state = task->promise->state;
  inox_promise_chain_fn callback = state == INOX_PROMISE_FULFILLED ? task->reaction->chain_fulfilled :
                                                                     task->reaction->chain_rejected;

  if (callback == 0) {
    return state == INOX_PROMISE_FULFILLED ? inox_promise_resolve(task->reaction->child, task->promise->result) :
                                             inox_promise_reject(task->reaction->child, task->promise->result);
  }

  inox_value next = inox_undefined_value();
  inox_status status = callback(task->reaction->context, task->promise->result, &next);

  if (status == INOX_OK) {
    inox_status resolve_status = inox_promise_resolve(task->reaction->child, next);
    inox_release(next);
    return resolve_status;
  }

  inox_status reject_status = inox_promise_reject(task->reaction->child, inox_number_value((inox_number)status));

  return reject_status == INOX_OK ? INOX_OK : reject_status;
}

static void inox_promise_reaction_task_finalizer(void* context) {
  inox_promise_reaction_task* task = (inox_promise_reaction_task*)context;

  if (task == 0 || task->promise == 0) {
    return;
  }

  inox_promise_free_reaction(task->promise, task->reaction);
  inox_allocator* allocator = task->promise->loop->allocator;
  inox_promise* promise = task->promise;
  allocator->free(allocator->user, task, sizeof(inox_promise_reaction_task), _Alignof(inox_promise_reaction_task));
  inox_promise_release(promise);
}

static void inox_promise_free_reaction(inox_promise* promise, inox_promise_reaction* reaction) {
  if (promise == 0 || reaction == 0) {
    return;
  }

  if (reaction->finalizer != 0) {
    reaction->finalizer(reaction->context);
  }

  inox_promise_release(reaction->child);

  promise->loop->allocator->free(
    promise->loop->allocator->user, reaction, sizeof(inox_promise_reaction), _Alignof(inox_promise_reaction)
  );
}
