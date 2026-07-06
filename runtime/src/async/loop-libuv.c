#include "loop-libuv-internal.h"
#include "inox/time_bridge.h"

#include <stdint.h>

typedef struct inox_microtask {
  inox_microtask_fn run;
  void* context;
  inox_microtask_finalizer_fn finalizer;
  struct inox_microtask* next;
} inox_microtask;

typedef enum inox_timer_kind { INOX_TIMER_IMMEDIATE, INOX_TIMER_TIMEOUT, INOX_TIMER_INTERVAL } inox_timer_kind;

typedef struct inox_libuv_loop_backend {
  uv_loop_t uv_loop;
  size_t request_count;
  size_t closing_count;
  inox_status callback_status;
} inox_libuv_loop_backend;

struct inox_timer_handle {
  inox_loop* loop;
  inox_timer_kind kind;
  inox_loop_callback_fn run;
  void* context;
  inox_loop_callback_finalizer_fn finalizer;
  inox_number interval_ms;
  int active;
  int finalized;
  int running;
  int closing;
  int closed;
  uv_timer_t timer;
  struct inox_timer_handle* next;
};

static inox_libuv_loop_backend* inox_libuv_backend(const inox_loop* loop);
static uint64_t inox_libuv_delay_ms(inox_number delay_ms);
static inox_status inox_libuv_new_handle(
  inox_loop* loop,
  inox_timer_kind kind,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
);
static void inox_libuv_append_handle(inox_loop* loop, inox_timer_handle* handle);
static void inox_libuv_timer_cb(uv_timer_t* timer);
static void inox_libuv_close_cb(uv_handle_t* handle);
static void inox_libuv_close_handle(inox_timer_handle* handle);
static void inox_loop_finalize_handle(inox_timer_handle* handle);
static void inox_loop_deactivate_handle(inox_timer_handle* handle);
static inox_status inox_loop_run_handle(inox_timer_handle* handle);
static inox_status inox_loop_keep_first_error(inox_status current, inox_status next);
static void inox_libuv_keep_callback_status(inox_loop* loop, inox_status status);
static void inox_libuv_dispose_microtasks(inox_loop* loop);
static void inox_libuv_dispose_handle_list(inox_timer_handle* handle);
static void inox_libuv_free_handle_list(inox_loop* loop, inox_timer_handle* handle);

inox_status inox_loop_init(inox_loop* loop, inox_allocator* allocator) {
  if (loop == 0 || allocator == 0 || allocator->alloc == 0 || allocator->free == 0) {
    return INOX_ERR_TYPE;
  }

  inox_libuv_loop_backend* backend =
    allocator->alloc(allocator->user, sizeof(inox_libuv_loop_backend), _Alignof(inox_libuv_loop_backend));

  if (backend == 0) {
    return INOX_ERR_OOM;
  }

  backend->closing_count = 0;
  backend->request_count = 0;
  backend->callback_status = INOX_OK;

  if (uv_loop_init(&backend->uv_loop) != 0) {
    allocator->free(allocator->user, backend, sizeof(inox_libuv_loop_backend), _Alignof(inox_libuv_loop_backend));
    return INOX_ERR_UNSUPPORTED;
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

  return INOX_OK;
}

void inox_loop_dispose(inox_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return;
  }

  inox_allocator* allocator = loop->allocator;
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);
  inox_libuv_dispose_microtasks(loop);

  inox_libuv_dispose_handle_list((inox_timer_handle*)loop->immediate_head);
  inox_libuv_dispose_handle_list((inox_timer_handle*)loop->timer_head);

  if (backend != 0) {
    while (backend->request_count > 0 || backend->closing_count > 0) {
      uv_run(&backend->uv_loop, UV_RUN_DEFAULT);
    }

    inox_libuv_dispose_microtasks(loop);
    (void)uv_loop_close(&backend->uv_loop);
  }

  inox_libuv_free_handle_list(loop, (inox_timer_handle*)loop->immediate_head);
  inox_libuv_free_handle_list(loop, (inox_timer_handle*)loop->timer_head);

  if (backend != 0) {
    allocator->free(allocator->user, backend, sizeof(inox_libuv_loop_backend), _Alignof(inox_libuv_loop_backend));
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

inox_status
inox_loop_queue_microtask(inox_loop* loop, inox_microtask_fn run, void* context, inox_microtask_finalizer_fn finalizer) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || run == 0) {
    return INOX_ERR_TYPE;
  }

  inox_microtask* task = loop->allocator->alloc(loop->allocator->user, sizeof(inox_microtask), _Alignof(inox_microtask));

  if (task == 0) {
    return INOX_ERR_OOM;
  }

  task->run = run;
  task->context = context;
  task->finalizer = finalizer;
  task->next = 0;

  if (loop->microtask_tail == 0) {
    loop->microtask_head = task;
    loop->microtask_tail = task;
  } else {
    ((inox_microtask*)loop->microtask_tail)->next = task;
    loop->microtask_tail = task;
  }

  loop->microtask_count += 1;

  return INOX_OK;
}

inox_status inox_loop_drain_microtasks(inox_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status first_error = INOX_OK;

  while (loop->microtask_head != 0) {
    inox_microtask* task = (inox_microtask*)loop->microtask_head;
    loop->microtask_head = task->next;

    if (loop->microtask_head == 0) {
      loop->microtask_tail = 0;
    }

    if (loop->microtask_count > 0) {
      loop->microtask_count -= 1;
    }

    first_error = inox_loop_keep_first_error(first_error, task->run(task->context));

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    loop->allocator->free(loop->allocator->user, task, sizeof(inox_microtask), _Alignof(inox_microtask));
  }

  return first_error;
}

inox_status inox_loop_queue_immediate(
  inox_loop* loop,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
) {
  return inox_libuv_new_handle(loop, INOX_TIMER_IMMEDIATE, 0, run, context, finalizer, out);
}

inox_status inox_loop_set_timeout(
  inox_loop* loop,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
) {
  return inox_libuv_new_handle(loop, INOX_TIMER_TIMEOUT, delay_ms, run, context, finalizer, out);
}

inox_status inox_loop_set_interval(
  inox_loop* loop,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
) {
  return inox_libuv_new_handle(loop, INOX_TIMER_INTERVAL, delay_ms, run, context, finalizer, out);
}

void inox_loop_clear_timer(inox_timer_handle* handle) {
  if (handle == 0) {
    return;
  }

  inox_loop_deactivate_handle(handle);

  if (!handle->running) {
    inox_loop_finalize_handle(handle);
  }
}

inox_status inox_loop_poll(inox_loop* loop, inox_number now_ms) {
  if (loop == 0) {
    return INOX_ERR_TYPE;
  }

  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  if (backend == 0) {
    return INOX_ERR_TYPE;
  }

  loop->now_ms = now_ms;
  loop->turn += 1;
  backend->callback_status = INOX_OK;

  const int had_microtasks = loop->microtask_count > 0;
  inox_status first_error = inox_loop_drain_microtasks(loop);
  uv_run_mode run_mode = had_microtasks || !uv_loop_alive(&backend->uv_loop) ? UV_RUN_NOWAIT : UV_RUN_ONCE;
  uv_run(&backend->uv_loop, run_mode);
  first_error = inox_loop_keep_first_error(first_error, backend->callback_status);

  return first_error;
}

inox_status inox_loop_run_once(inox_loop* loop) {
  if (loop == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_loop_poll(loop, inox_performance_now());
}

inox_status inox_loop_run(inox_loop* loop) {
  if (loop == 0) {
    return INOX_ERR_TYPE;
  }

  while (inox_loop_has_work(loop)) {
    inox_status status = inox_loop_run_once(loop);

    if (status != INOX_OK) {
      return status;
    }
  }

  return INOX_OK;
}

int inox_loop_has_work(const inox_loop* loop) {
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  return loop != 0 &&
         (loop->microtask_count > 0 || loop->immediate_count > 0 || loop->timer_count > 0 ||
          (backend != 0 && (backend->request_count > 0 || uv_loop_alive(&backend->uv_loop))));
}

size_t inox_loop_pending_microtasks(const inox_loop* loop) {
  return loop == 0 ? 0 : loop->microtask_count;
}

size_t inox_loop_pending_immediates(const inox_loop* loop) {
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  return loop == 0 ? 0 : loop->immediate_count + (backend == 0 ? 0 : backend->request_count);
}

size_t inox_loop_pending_timers(const inox_loop* loop) {
  return loop == 0 ? 0 : loop->timer_count;
}

int inox_loop_next_timer_due_ms(const inox_loop* loop, inox_number* out) {
  if (loop == 0 || out == 0) {
    return 0;
  }

  int found = 0;
  uint64_t next_due_in_ms = 0;
  inox_timer_handle* handle = (inox_timer_handle*)loop->timer_head;
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

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
    *out = inox_performance_now() + (inox_number)next_due_in_ms;
  }

  return found;
}

static inox_libuv_loop_backend* inox_libuv_backend(const inox_loop* loop) {
  return loop == 0 ? 0 : (inox_libuv_loop_backend*)loop->backend;
}

uv_loop_t* inox_libuv_loop_handle(inox_loop* loop) {
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  return backend == 0 ? 0 : &backend->uv_loop;
}

inox_status inox_libuv_loop_retain_request(inox_loop* loop) {
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  if (backend == 0) {
    return INOX_ERR_TYPE;
  }

  backend->request_count += 1;

  return INOX_OK;
}

void inox_libuv_loop_release_request(inox_loop* loop) {
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  if (backend != 0 && backend->request_count > 0) {
    backend->request_count -= 1;
  }
}

void inox_libuv_loop_report_status(inox_loop* loop, inox_status status) {
  inox_libuv_keep_callback_status(loop, status);
}

static uint64_t inox_libuv_delay_ms(inox_number delay_ms) {
  if (delay_ms != delay_ms || delay_ms <= 0) {
    return 0;
  }

  if (delay_ms >= (inox_number)UINT64_MAX) {
    return UINT64_MAX;
  }

  return (uint64_t)delay_ms;
}

static inox_status inox_libuv_new_handle(
  inox_loop* loop,
  inox_timer_kind kind,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || run == 0) {
    return INOX_ERR_TYPE;
  }

  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  if (backend == 0) {
    return INOX_ERR_TYPE;
  }

  inox_timer_handle* handle =
    loop->allocator->alloc(loop->allocator->user, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));

  if (handle == 0) {
    if (out != 0) {
      *out = 0;
    }
    return INOX_ERR_OOM;
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
    loop->allocator->free(loop->allocator->user, handle, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));
    if (out != 0) {
      *out = 0;
    }
    return INOX_ERR_UNSUPPORTED;
  }

  handle->timer.data = handle;
  uv_update_time(&backend->uv_loop);

  if (uv_timer_start(&handle->timer, inox_libuv_timer_cb, inox_libuv_delay_ms(delay_ms), 0) != 0) {
    handle->active = 0;
    inox_libuv_close_handle(handle);

    while (backend->closing_count > 0) {
      uv_run(&backend->uv_loop, UV_RUN_DEFAULT);
    }

    loop->allocator->free(loop->allocator->user, handle, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));
    if (out != 0) {
      *out = 0;
    }
    return INOX_ERR_UNSUPPORTED;
  }

  inox_libuv_append_handle(loop, handle);

  if (out != 0) {
    *out = handle;
  }

  return INOX_OK;
}

static void inox_libuv_append_handle(inox_loop* loop, inox_timer_handle* handle) {
  if (handle->kind == INOX_TIMER_IMMEDIATE) {
    if (loop->immediate_tail == 0) {
      loop->immediate_head = handle;
      loop->immediate_tail = handle;
    } else {
      ((inox_timer_handle*)loop->immediate_tail)->next = handle;
      loop->immediate_tail = handle;
    }

    loop->immediate_count += 1;
  } else {
    if (loop->timer_tail == 0) {
      loop->timer_head = handle;
      loop->timer_tail = handle;
    } else {
      ((inox_timer_handle*)loop->timer_tail)->next = handle;
      loop->timer_tail = handle;
    }

    loop->timer_count += 1;
  }
}

static void inox_libuv_timer_cb(uv_timer_t* timer) {
  if (timer == 0 || timer->data == 0) {
    return;
  }

  inox_timer_handle* handle = (inox_timer_handle*)timer->data;
  inox_libuv_keep_callback_status(handle->loop, inox_loop_run_handle(handle));
}

static void inox_libuv_close_cb(uv_handle_t* uv_handle) {
  if (uv_handle == 0 || uv_handle->data == 0) {
    return;
  }

  inox_timer_handle* handle = (inox_timer_handle*)uv_handle->data;
  inox_libuv_loop_backend* backend = inox_libuv_backend(handle->loop);

  handle->closing = 0;
  handle->closed = 1;

  if (backend != 0 && backend->closing_count > 0) {
    backend->closing_count -= 1;
  }
}

static void inox_libuv_close_handle(inox_timer_handle* handle) {
  if (handle == 0 || handle->closed || handle->closing) {
    return;
  }

  inox_libuv_loop_backend* backend = inox_libuv_backend(handle->loop);

  if (backend != 0) {
    backend->closing_count += 1;
  }

  handle->closing = 1;
  uv_timer_stop(&handle->timer);
  uv_close((uv_handle_t*)&handle->timer, inox_libuv_close_cb);
}

static void inox_loop_finalize_handle(inox_timer_handle* handle) {
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

static void inox_loop_deactivate_handle(inox_timer_handle* handle) {
  if (handle == 0 || !handle->active) {
    return;
  }

  handle->active = 0;
  uv_timer_stop(&handle->timer);

  if (handle->loop != 0) {
    if (handle->kind == INOX_TIMER_IMMEDIATE && handle->loop->immediate_count > 0) {
      handle->loop->immediate_count -= 1;
    } else if (handle->kind != INOX_TIMER_IMMEDIATE && handle->loop->timer_count > 0) {
      handle->loop->timer_count -= 1;
    }
  }
}

static inox_status inox_loop_run_handle(inox_timer_handle* handle) {
  if (handle == 0 || !handle->active || handle->run == 0) {
    return INOX_OK;
  }

  handle->running = 1;
  inox_status status = handle->run(handle->context);
  handle->running = 0;

  if (handle->kind == INOX_TIMER_INTERVAL && handle->active) {
    if (uv_timer_start(&handle->timer, inox_libuv_timer_cb, inox_libuv_delay_ms(handle->interval_ms), 0) != 0) {
      inox_loop_deactivate_handle(handle);
      inox_loop_finalize_handle(handle);
      status = inox_loop_keep_first_error(status, INOX_ERR_UNSUPPORTED);
    }
  } else {
    inox_loop_deactivate_handle(handle);
    inox_loop_finalize_handle(handle);
  }

  if (handle->loop != 0) {
    status = inox_loop_keep_first_error(status, inox_loop_drain_microtasks(handle->loop));
  }

  return status;
}

static inox_status inox_loop_keep_first_error(inox_status current, inox_status next) {
  return current == INOX_OK ? next : current;
}

static void inox_libuv_keep_callback_status(inox_loop* loop, inox_status status) {
  inox_libuv_loop_backend* backend = inox_libuv_backend(loop);

  if (backend != 0) {
    backend->callback_status = inox_loop_keep_first_error(backend->callback_status, status);
  }
}

static void inox_libuv_dispose_microtasks(inox_loop* loop) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return;
  }

  inox_microtask* task = (inox_microtask*)loop->microtask_head;

  while (task != 0) {
    inox_microtask* next = task->next;

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    loop->allocator->free(loop->allocator->user, task, sizeof(inox_microtask), _Alignof(inox_microtask));
    task = next;
  }

  loop->microtask_head = 0;
  loop->microtask_tail = 0;
  loop->microtask_count = 0;
}

static void inox_libuv_dispose_handle_list(inox_timer_handle* handle) {
  while (handle != 0) {
    inox_timer_handle* next = handle->next;
    inox_loop_deactivate_handle(handle);
    inox_loop_finalize_handle(handle);
    inox_libuv_close_handle(handle);
    handle = next;
  }
}

static void inox_libuv_free_handle_list(inox_loop* loop, inox_timer_handle* handle) {
  if (loop == 0 || loop->allocator == 0 || loop->allocator->free == 0) {
    return;
  }

  while (handle != 0) {
    inox_timer_handle* next = handle->next;
    loop->allocator->free(loop->allocator->user, handle, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));
    handle = next;
  }
}
