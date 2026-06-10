#include "ccjs/loop.h"

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

struct ccjs_timer_handle {
  ccjs_loop* loop;
  ccjs_timer_kind kind;
  ccjs_loop_callback_fn run;
  void* context;
  ccjs_loop_callback_finalizer_fn finalizer;
  ccjs_number due_ms;
  ccjs_number interval_ms;
  uint64_t created_turn;
  int active;
  int finalized;
  int running;
  struct ccjs_timer_handle* next;
};

static ccjs_number ccjs_loop_clamp_delay(ccjs_number delay_ms);
static ccjs_status ccjs_loop_new_handle(
  ccjs_loop* loop,
  ccjs_timer_kind kind,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
);
static void ccjs_loop_finalize_handle(ccjs_timer_handle* handle);
static void ccjs_loop_deactivate_handle(ccjs_timer_handle* handle);
static ccjs_status ccjs_loop_run_handle(ccjs_timer_handle* handle, ccjs_number now_ms);
static ccjs_status ccjs_loop_run_immediates(ccjs_loop* loop, uint64_t turn);
static ccjs_status ccjs_loop_run_timers(ccjs_loop* loop, uint64_t turn, ccjs_number now_ms);
static ccjs_status ccjs_loop_keep_first_error(ccjs_status current, ccjs_status next);

ccjs_status ccjs_loop_init(ccjs_loop* loop, ccjs_allocator* allocator) {
  if (loop == 0 || allocator == 0 || allocator->alloc == 0 || allocator->free == 0) {
    return CCJS_ERR_TYPE;
  }

  loop->allocator = allocator;
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

  ccjs_microtask* task = (ccjs_microtask*)loop->microtask_head;

  while (task != 0) {
    ccjs_microtask* next = task->next;

    if (task->finalizer != 0) {
      task->finalizer(task->context);
    }

    loop->allocator->free(loop->allocator->user, task, sizeof(ccjs_microtask), _Alignof(ccjs_microtask));
    task = next;
  }

  ccjs_timer_handle* immediate = (ccjs_timer_handle*)loop->immediate_head;

  while (immediate != 0) {
    ccjs_timer_handle* next = immediate->next;
    ccjs_loop_finalize_handle(immediate);
    loop->allocator->free(loop->allocator->user, immediate, sizeof(ccjs_timer_handle), _Alignof(ccjs_timer_handle));
    immediate = next;
  }

  ccjs_timer_handle* timer = (ccjs_timer_handle*)loop->timer_head;

  while (timer != 0) {
    ccjs_timer_handle* next = timer->next;
    ccjs_loop_finalize_handle(timer);
    loop->allocator->free(loop->allocator->user, timer, sizeof(ccjs_timer_handle), _Alignof(ccjs_timer_handle));
    timer = next;
  }

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
  return ccjs_loop_new_handle(loop, CCJS_TIMER_IMMEDIATE, 0, run, context, finalizer, out);
}

ccjs_status ccjs_loop_set_timeout(
  ccjs_loop* loop,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
) {
  return ccjs_loop_new_handle(loop, CCJS_TIMER_TIMEOUT, delay_ms, run, context, finalizer, out);
}

ccjs_status ccjs_loop_set_interval(
  ccjs_loop* loop,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
) {
  return ccjs_loop_new_handle(loop, CCJS_TIMER_INTERVAL, delay_ms, run, context, finalizer, out);
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

  loop->now_ms = now_ms;
  loop->turn += 1;
  uint64_t turn = loop->turn;

  ccjs_status first_error = ccjs_loop_drain_microtasks(loop);
  first_error = ccjs_loop_keep_first_error(first_error, ccjs_loop_run_immediates(loop, turn));
  first_error = ccjs_loop_keep_first_error(first_error, ccjs_loop_run_timers(loop, turn, now_ms));

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

static ccjs_number ccjs_loop_clamp_delay(ccjs_number delay_ms) {
  return delay_ms != delay_ms || delay_ms < 0 ? 0 : delay_ms;
}

static ccjs_status ccjs_loop_new_handle(
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

  ccjs_timer_handle* handle = loop->allocator->alloc(loop->allocator->user, sizeof(ccjs_timer_handle), _Alignof(ccjs_timer_handle));

  if (handle == 0) {
    if (out != 0) {
      *out = 0;
    }
    return CCJS_ERR_OOM;
  }

  ccjs_number delay = ccjs_loop_clamp_delay(delay_ms);
  handle->loop = loop;
  handle->kind = kind;
  handle->run = run;
  handle->context = context;
  handle->finalizer = finalizer;
  handle->due_ms = loop->now_ms + delay;
  handle->interval_ms = delay;
  handle->created_turn = loop->turn;
  handle->active = 1;
  handle->finalized = 0;
  handle->running = 0;
  handle->next = 0;

  if (kind == CCJS_TIMER_IMMEDIATE) {
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

  if (out != 0) {
    *out = handle;
  }

  return CCJS_OK;
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

  if (handle->loop != 0) {
    if (handle->kind == CCJS_TIMER_IMMEDIATE && handle->loop->immediate_count > 0) {
      handle->loop->immediate_count -= 1;
    } else if (handle->kind != CCJS_TIMER_IMMEDIATE && handle->loop->timer_count > 0) {
      handle->loop->timer_count -= 1;
    }
  }
}

static ccjs_status ccjs_loop_run_handle(ccjs_timer_handle* handle, ccjs_number now_ms) {
  if (handle == 0 || !handle->active || handle->run == 0) {
    return CCJS_OK;
  }

  handle->running = 1;
  ccjs_status status = handle->run(handle->context);
  handle->running = 0;

  if (handle->kind == CCJS_TIMER_INTERVAL && handle->active) {
    handle->due_ms = now_ms + handle->interval_ms;
  } else {
    ccjs_loop_deactivate_handle(handle);
    ccjs_loop_finalize_handle(handle);
  }

  if (handle->loop != 0) {
    status = ccjs_loop_keep_first_error(status, ccjs_loop_drain_microtasks(handle->loop));
  }

  return status;
}

static ccjs_status ccjs_loop_run_immediates(ccjs_loop* loop, uint64_t turn) {
  ccjs_status first_error = CCJS_OK;
  ccjs_timer_handle* handle = (ccjs_timer_handle*)loop->immediate_head;

  while (handle != 0) {
    ccjs_timer_handle* next = handle->next;

    if (handle->active && handle->created_turn < turn) {
      first_error = ccjs_loop_keep_first_error(first_error, ccjs_loop_run_handle(handle, loop->now_ms));
    }

    handle = next;
  }

  return first_error;
}

static ccjs_status ccjs_loop_run_timers(ccjs_loop* loop, uint64_t turn, ccjs_number now_ms) {
  ccjs_status first_error = CCJS_OK;
  ccjs_timer_handle* handle = (ccjs_timer_handle*)loop->timer_head;

  while (handle != 0) {
    ccjs_timer_handle* next = handle->next;

    if (handle->active && handle->created_turn < turn && handle->due_ms <= now_ms) {
      first_error = ccjs_loop_keep_first_error(first_error, ccjs_loop_run_handle(handle, now_ms));
    }

    handle = next;
  }

  return first_error;
}

static ccjs_status ccjs_loop_keep_first_error(ccjs_status current, ccjs_status next) {
  return current == CCJS_OK ? next : current;
}
