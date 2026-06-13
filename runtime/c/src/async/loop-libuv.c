#include "ccjs/loop.h"
#include "ccjs/time.h"

#include <stdint.h>
#include <uv.h>

typedef struct ccjs_microtask {
  ccjs_microtask_fn run;
  void* context;
  ccjs_microtask_finalizer_fn finalizer;
  struct ccjs_microtask* next;
} ccjs_microtask;

typedef enum ccjs_timer_kind {
  CCJS_TIMER_IMMEDIATE,
  CCJS_TIMER_TIMEOUT,
  CCJS_TIMER_INTERVAL
} ccjs_timer_kind;

typedef struct ccjs_libuv_loop_backend {
  uv_loop_t uv_loop;
  size_t closing_count;
  ccjs_status callback_status;
} ccjs_libuv_loop_backend;

struct ccjs_timer_handle {
  ccjs_loop* loop;
  ccjs_timer_kind kind;
  ccjs_loop_callback_fn run;
  void* context;
  ccjs_loop_callback_finalizer_fn finalizer;
  ccjs_number interval_ms;
  int active;
  int finalized;
  int running;
  int closing;
  int closed;
  uv_timer_t timer;
  struct ccjs_timer_handle* next;
};

static ccjs_libuv_loop_backend* ccjs_libuv_backend(const ccjs_loop* loop);
static uint64_t ccjs_libuv_delay_ms(ccjs_number delay_ms);
static ccjs_status ccjs_libuv_new_handle(
  ccjs_loop* loop,
  ccjs_timer_kind kind,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
);
static void ccjs_libuv_append_handle(ccjs_loop* loop, ccjs_timer_handle* handle);
static void ccjs_libuv_timer_cb(uv_timer_t* timer);
static void ccjs_libuv_close_cb(uv_handle_t* handle);
static void ccjs_libuv_close_handle(ccjs_timer_handle* handle);
static void ccjs_loop_finalize_handle(ccjs_timer_handle* handle);
static void ccjs_loop_deactivate_handle(ccjs_timer_handle* handle);
static ccjs_status ccjs_loop_run_handle(ccjs_timer_handle* handle);
static ccjs_status ccjs_loop_keep_first_error(ccjs_status current, ccjs_status next);
static void ccjs_libuv_keep_callback_status(ccjs_loop* loop, ccjs_status status);
static void ccjs_libuv_dispose_handle_list(ccjs_timer_handle* handle);
static void ccjs_libuv_free_handle_list(ccjs_loop* loop, ccjs_timer_handle* handle);

ccjs_status ccjs_loop_init(ccjs_loop* loop, ccjs_allocator* allocator) {
  if (loop == 0 || allocator == 0 || allocator->alloc == 0 || allocator->free == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_libuv_loop_backend* backend = allocator->alloc(
    allocator->user,
    sizeof(ccjs_libuv_loop_backend),
    _Alignof(ccjs_libuv_loop_backend)
  );

  if (backend == 0) {
    return CCJS_ERR_OOM;
  }

  backend->closing_count = 0;
  backend->callback_status = CCJS_OK;

  if (uv_loop_init(&backend->uv_loop) != 0) {
    allocator->free(allocator->user, backend, sizeof(ccjs_libuv_loop_backend), _Alignof(ccjs_libuv_loop_backend));
    return CCJS_ERR_UNSUPPORTED;
  }

  backend->uv_loop.data = backend;
  uv_update_time(&backend->uv_loop);

  loop->allocator = allocator;
  loop->backend = backend;
  loop->microtask_head = 0;
  loop->microtask_tail = 0;
  loop->immediate_head = 0;
  loop->immediate_tail = 0;
  loop->timer_head = 0;
  loop->timer_tail = 0;
  loop->microtask_count = 0;
  loop->immediate_count = 0;
  loop->timer_count = 0;
  loop->turn = 0;
  loop->now_ms = 0;

  return CCJS_OK;
}

void ccjs_loop_dispose(ccjs_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(loop);
  ccjs_microtask* task = (ccjs_microtask*)loop->microtask_head;

  while (task != 0) {
    ccjs_microtask* next = task->next;

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    allocator->free(allocator->user, task, sizeof(ccjs_microtask), _Alignof(ccjs_microtask));
    task = next;
  }

  ccjs_libuv_dispose_handle_list((ccjs_timer_handle*)loop->immediate_head);
  ccjs_libuv_dispose_handle_list((ccjs_timer_handle*)loop->timer_head);

  if (backend != 0) {
    while (backend->closing_count > 0) {
      uv_run(&backend->uv_loop, UV_RUN_DEFAULT);
    }

    (void)uv_loop_close(&backend->uv_loop);
  }

  ccjs_libuv_free_handle_list(loop, (ccjs_timer_handle*)loop->immediate_head);
  ccjs_libuv_free_handle_list(loop, (ccjs_timer_handle*)loop->timer_head);

  if (backend != 0) {
    allocator->free(allocator->user, backend, sizeof(ccjs_libuv_loop_backend), _Alignof(ccjs_libuv_loop_backend));
  }

  loop->allocator = 0;
  loop->backend = 0;
  loop->microtask_head = 0;
  loop->microtask_tail = 0;
  loop->immediate_head = 0;
  loop->immediate_tail = 0;
  loop->timer_head = 0;
  loop->timer_tail = 0;
  loop->microtask_count = 0;
  loop->immediate_count = 0;
  loop->timer_count = 0;
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

  if (loop->microtask_tail == 0) {
    loop->microtask_head = task;
    loop->microtask_tail = task;
  } else {
    ((ccjs_microtask*)loop->microtask_tail)->next = task;
    loop->microtask_tail = task;
  }

  loop->microtask_count += 1;

  return CCJS_OK;
}

ccjs_status ccjs_loop_drain_microtasks(ccjs_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status first_error = CCJS_OK;

  while (loop->microtask_head != 0) {
    ccjs_microtask* task = (ccjs_microtask*)loop->microtask_head;
    loop->microtask_head = task->next;

    if (loop->microtask_head == 0) {
      loop->microtask_tail = 0;
    }

    if (loop->microtask_count > 0) {
      loop->microtask_count -= 1;
    }

    first_error = ccjs_loop_keep_first_error(first_error, task->run(task->context));

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    loop->allocator->free(loop->allocator->user, task, sizeof(ccjs_microtask), _Alignof(ccjs_microtask));
  }

  return first_error;
}

ccjs_status ccjs_loop_queue_immediate(
  ccjs_loop* loop,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
) {
  return ccjs_libuv_new_handle(loop, CCJS_TIMER_IMMEDIATE, 0, run, context, finalizer, out);
}

ccjs_status ccjs_loop_set_timeout(
  ccjs_loop* loop,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
) {
  return ccjs_libuv_new_handle(loop, CCJS_TIMER_TIMEOUT, delay_ms, run, context, finalizer, out);
}

ccjs_status ccjs_loop_set_interval(
  ccjs_loop* loop,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
) {
  return ccjs_libuv_new_handle(loop, CCJS_TIMER_INTERVAL, delay_ms, run, context, finalizer, out);
}

void ccjs_loop_clear_timer(ccjs_timer_handle* handle) {
  if (handle == 0) {
    return;
  }

  ccjs_loop_deactivate_handle(handle);

  if (!handle->running) {
    ccjs_loop_finalize_handle(handle);
  }
}

ccjs_status ccjs_loop_poll(ccjs_loop* loop, ccjs_number now_ms) {
  if (loop == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(loop);

  if (backend == 0) {
    return CCJS_ERR_TYPE;
  }

  loop->now_ms = now_ms;
  loop->turn += 1;
  backend->callback_status = CCJS_OK;

  ccjs_status first_error = ccjs_loop_drain_microtasks(loop);
  uv_run(&backend->uv_loop, UV_RUN_NOWAIT);
  first_error = ccjs_loop_keep_first_error(first_error, backend->callback_status);

  return first_error;
}

int ccjs_loop_has_work(const ccjs_loop* loop) {
  return loop != 0 && (loop->microtask_count > 0 || loop->immediate_count > 0 || loop->timer_count > 0);
}

size_t ccjs_loop_pending_microtasks(const ccjs_loop* loop) {
  return loop == 0 ? 0 : loop->microtask_count;
}

size_t ccjs_loop_pending_immediates(const ccjs_loop* loop) {
  return loop == 0 ? 0 : loop->immediate_count;
}

size_t ccjs_loop_pending_timers(const ccjs_loop* loop) {
  return loop == 0 ? 0 : loop->timer_count;
}

int ccjs_loop_next_timer_due_ms(const ccjs_loop* loop, ccjs_number* out) {
  if (loop == 0 || out == 0) {
    return 0;
  }

  int found = 0;
  uint64_t next_due_in_ms = 0;
  ccjs_timer_handle* handle = (ccjs_timer_handle*)loop->timer_head;
  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(loop);

  if (backend != 0) {
    uv_update_time(&backend->uv_loop);
  }

  while (handle != 0) {
    if (handle->active) {
      uint64_t due_in_ms = uv_timer_get_due_in(&handle->timer);

      if (!found || due_in_ms < next_due_in_ms) {
        next_due_in_ms = due_in_ms;
        found = 1;
      }
    }

    handle = handle->next;
  }

  if (found) {
    *out = ccjs_performance_now() + (ccjs_number)next_due_in_ms;
  }

  return found;
}

static ccjs_libuv_loop_backend* ccjs_libuv_backend(const ccjs_loop* loop) {
  return loop == 0 ? 0 : (ccjs_libuv_loop_backend*)loop->backend;
}

static uint64_t ccjs_libuv_delay_ms(ccjs_number delay_ms) {
  if (delay_ms != delay_ms || delay_ms <= 0) {
    return 0;
  }

  if (delay_ms >= (ccjs_number)UINT64_MAX) {
    return UINT64_MAX;
  }

  return (uint64_t)delay_ms;
}

static ccjs_status ccjs_libuv_new_handle(
  ccjs_loop* loop,
  ccjs_timer_kind kind,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || run == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(loop);

  if (backend == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_timer_handle* handle = loop->allocator->alloc(
    loop->allocator->user,
    sizeof(ccjs_timer_handle),
    _Alignof(ccjs_timer_handle)
  );

  if (handle == 0) {
    if (out != 0) {
      *out = 0;
    }
    return CCJS_ERR_OOM;
  }

  handle->loop = loop;
  handle->kind = kind;
  handle->run = run;
  handle->context = context;
  handle->finalizer = finalizer;
  handle->interval_ms = delay_ms;
  handle->active = 1;
  handle->finalized = 0;
  handle->running = 0;
  handle->closing = 0;
  handle->closed = 0;
  handle->next = 0;

  if (uv_timer_init(&backend->uv_loop, &handle->timer) != 0) {
    loop->allocator->free(loop->allocator->user, handle, sizeof(ccjs_timer_handle), _Alignof(ccjs_timer_handle));
    if (out != 0) {
      *out = 0;
    }
    return CCJS_ERR_UNSUPPORTED;
  }

  handle->timer.data = handle;
  uv_update_time(&backend->uv_loop);

  if (uv_timer_start(&handle->timer, ccjs_libuv_timer_cb, ccjs_libuv_delay_ms(delay_ms), 0) != 0) {
    handle->active = 0;
    ccjs_libuv_close_handle(handle);

    while (backend->closing_count > 0) {
      uv_run(&backend->uv_loop, UV_RUN_DEFAULT);
    }

    loop->allocator->free(loop->allocator->user, handle, sizeof(ccjs_timer_handle), _Alignof(ccjs_timer_handle));
    if (out != 0) {
      *out = 0;
    }
    return CCJS_ERR_UNSUPPORTED;
  }

  ccjs_libuv_append_handle(loop, handle);

  if (out != 0) {
    *out = handle;
  }

  return CCJS_OK;
}

static void ccjs_libuv_append_handle(ccjs_loop* loop, ccjs_timer_handle* handle) {
  if (handle->kind == CCJS_TIMER_IMMEDIATE) {
    if (loop->immediate_tail == 0) {
      loop->immediate_head = handle;
      loop->immediate_tail = handle;
    } else {
      ((ccjs_timer_handle*)loop->immediate_tail)->next = handle;
      loop->immediate_tail = handle;
    }

    loop->immediate_count += 1;
  } else {
    if (loop->timer_tail == 0) {
      loop->timer_head = handle;
      loop->timer_tail = handle;
    } else {
      ((ccjs_timer_handle*)loop->timer_tail)->next = handle;
      loop->timer_tail = handle;
    }

    loop->timer_count += 1;
  }
}

static void ccjs_libuv_timer_cb(uv_timer_t* timer) {
  if (timer == 0 || timer->data == 0) {
    return;
  }

  ccjs_timer_handle* handle = (ccjs_timer_handle*)timer->data;
  ccjs_libuv_keep_callback_status(handle->loop, ccjs_loop_run_handle(handle));
}

static void ccjs_libuv_close_cb(uv_handle_t* uv_handle) {
  if (uv_handle == 0 || uv_handle->data == 0) {
    return;
  }

  ccjs_timer_handle* handle = (ccjs_timer_handle*)uv_handle->data;
  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(handle->loop);

  handle->closing = 0;
  handle->closed = 1;

  if (backend != 0 && backend->closing_count > 0) {
    backend->closing_count -= 1;
  }
}

static void ccjs_libuv_close_handle(ccjs_timer_handle* handle) {
  if (handle == 0 || handle->closed || handle->closing) {
    return;
  }

  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(handle->loop);

  if (backend != 0) {
    backend->closing_count += 1;
  }

  handle->closing = 1;
  uv_timer_stop(&handle->timer);
  uv_close((uv_handle_t*)&handle->timer, ccjs_libuv_close_cb);
}

static void ccjs_loop_finalize_handle(ccjs_timer_handle* handle) {
  if (handle == 0 || handle->finalized) {
    return;
  }

  if (handle->finalizer != 0) {
    handle->finalizer(handle->context);
  }

  handle->context = 0;
  handle->finalizer = 0;
  handle->finalized = 1;
}

static void ccjs_loop_deactivate_handle(ccjs_timer_handle* handle) {
  if (handle == 0 || !handle->active) {
    return;
  }

  handle->active = 0;
  uv_timer_stop(&handle->timer);

  if (handle->loop != 0) {
    if (handle->kind == CCJS_TIMER_IMMEDIATE && handle->loop->immediate_count > 0) {
      handle->loop->immediate_count -= 1;
    } else if (handle->kind != CCJS_TIMER_IMMEDIATE && handle->loop->timer_count > 0) {
      handle->loop->timer_count -= 1;
    }
  }
}

static ccjs_status ccjs_loop_run_handle(ccjs_timer_handle* handle) {
  if (handle == 0 || !handle->active || handle->run == 0) {
    return CCJS_OK;
  }

  handle->running = 1;
  ccjs_status status = handle->run(handle->context);
  handle->running = 0;

  if (handle->kind == CCJS_TIMER_INTERVAL && handle->active) {
    if (uv_timer_start(&handle->timer, ccjs_libuv_timer_cb, ccjs_libuv_delay_ms(handle->interval_ms), 0) != 0) {
      ccjs_loop_deactivate_handle(handle);
      ccjs_loop_finalize_handle(handle);
      status = ccjs_loop_keep_first_error(status, CCJS_ERR_UNSUPPORTED);
    }
  } else {
    ccjs_loop_deactivate_handle(handle);
    ccjs_loop_finalize_handle(handle);
  }

  if (handle->loop != 0) {
    status = ccjs_loop_keep_first_error(status, ccjs_loop_drain_microtasks(handle->loop));
  }

  return status;
}

static ccjs_status ccjs_loop_keep_first_error(ccjs_status current, ccjs_status next) {
  return current == CCJS_OK ? next : current;
}

static void ccjs_libuv_keep_callback_status(ccjs_loop* loop, ccjs_status status) {
  ccjs_libuv_loop_backend* backend = ccjs_libuv_backend(loop);

  if (backend != 0) {
    backend->callback_status = ccjs_loop_keep_first_error(backend->callback_status, status);
  }
}

static void ccjs_libuv_dispose_handle_list(ccjs_timer_handle* handle) {
  while (handle != 0) {
    ccjs_timer_handle* next = handle->next;
    ccjs_loop_deactivate_handle(handle);
    ccjs_loop_finalize_handle(handle);
    ccjs_libuv_close_handle(handle);
    handle = next;
  }
}

static void ccjs_libuv_free_handle_list(ccjs_loop* loop, ccjs_timer_handle* handle) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return;
  }

  while (handle != 0) {
    ccjs_timer_handle* next = handle->next;
    loop->allocator->free(loop->allocator->user, handle, sizeof(ccjs_timer_handle), _Alignof(ccjs_timer_handle));
    handle = next;
  }
}
