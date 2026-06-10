#include "ccjs/loop.h"

typedef struct ccjs_microtask {
  ccjs_microtask_fn run;
  void* context;
  ccjs_microtask_finalizer_fn finalizer;
  struct ccjs_microtask* next;
} ccjs_microtask;

ccjs_status ccjs_loop_init(ccjs_loop* loop, ccjs_allocator* allocator) {
  if (loop == 0 || allocator == 0 || allocator->alloc == 0 || allocator->free == 0) {
    return CCJS_ERR_TYPE;
  }

  loop->allocator = allocator;
  loop->head = 0;
  loop->tail = 0;
  loop->microtask_count = 0;

  return CCJS_OK;
}

void ccjs_loop_dispose(ccjs_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return;
  }

  ccjs_microtask* task = (ccjs_microtask*)loop->head;

  while (task != 0) {
    ccjs_microtask* next = task->next;

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    loop->allocator->free(loop->allocator->user, task, sizeof(ccjs_microtask), _Alignof(ccjs_microtask));
    task = next;
  }

  loop->head = 0;
  loop->tail = 0;
  loop->microtask_count = 0;
}

ccjs_status ccjs_loop_queue_microtask(
  ccjs_loop* loop,
  ccjs_microtask_fn run,
  void* context,
  ccjs_microtask_finalizer_fn finalizer
) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || run == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_microtask* task = loop->allocator->alloc(loop->allocator->user, sizeof(ccjs_microtask), _Alignof(ccjs_microtask));

  if (task == 0) {
    return CCJS_ERR_OOM;
  }

  task->run = run;
  task->context = context;
  task->finalizer = finalizer;
  task->next = 0;

  if (loop->tail == 0) {
    loop->head = task;
    loop->tail = task;
  } else {
    ((ccjs_microtask*)loop->tail)->next = task;
    loop->tail = task;
  }

  loop->microtask_count += 1;

  return CCJS_OK;
}

ccjs_status ccjs_loop_drain_microtasks(ccjs_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status first_error = CCJS_OK;

  while (loop->head != 0) {
    ccjs_microtask* task = (ccjs_microtask*)loop->head;
    loop->head = task->next;

    if (loop->head == 0) {
      loop->tail = 0;
    }

    if (loop->microtask_count > 0) {
      loop->microtask_count -= 1;
    }

    ccjs_status status = task->run(task->context);

    if (first_error == CCJS_OK && status != CCJS_OK) {
      first_error = status;
    }

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    loop->allocator->free(loop->allocator->user, task, sizeof(ccjs_microtask), _Alignof(ccjs_microtask));
  }

  return first_error;
}

size_t ccjs_loop_pending_microtasks(const ccjs_loop* loop) {
  return loop == 0 ? 0 : loop->microtask_count;
}
