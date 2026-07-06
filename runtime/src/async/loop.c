#include "inox/loop.h"
#include "inox/time_bridge.h"

typedef struct inox_microtask {
  inox_microtask_fn run;
  void* context;
  inox_microtask_finalizer_fn finalizer;
  struct inox_microtask* next;
} inox_microtask;

typedef enum inox_timer_kind { INOX_TIMER_IMMEDIATE, INOX_TIMER_TIMEOUT, INOX_TIMER_INTERVAL } inox_timer_kind;

struct inox_timer_handle {
  inox_loop* loop;
  inox_timer_kind kind;
  inox_loop_callback_fn run;
  void* context;
  inox_loop_callback_finalizer_fn finalizer;
  inox_number due_ms;
  inox_number interval_ms;
  uint64_t created_turn;
  int active;
  int finalized;
  int running;
  struct inox_timer_handle* next;
};

static inox_number inox_loop_clamp_delay(inox_number delay_ms);
static inox_status inox_loop_new_handle(
  inox_loop* loop,
  inox_timer_kind kind,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
);
static void inox_loop_finalize_handle(inox_timer_handle* handle);
static void inox_loop_deactivate_handle(inox_timer_handle* handle);
static inox_status inox_loop_run_handle(inox_timer_handle* handle, inox_number now_ms);
static inox_status inox_loop_run_immediates(inox_loop* loop, uint64_t turn);
static inox_status inox_loop_run_timers(inox_loop* loop, uint64_t turn, inox_number now_ms);
static inox_status inox_loop_keep_first_error(inox_status current, inox_status next);

inox_status inox_loop_init(inox_loop* loop, inox_allocator* allocator) {
  if (loop == 0 || allocator == 0 || allocator->alloc == 0 || allocator->free == 0) {
    return INOX_ERR_TYPE;
  }

  loop->allocator = allocator;
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
  loop->turn = 0;
  loop->now_ms = 0;

  return INOX_OK;
}

void inox_loop_dispose(inox_loop* loop) {
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

  inox_timer_handle* immediate = (inox_timer_handle*)loop->immediate_head;

  while (immediate != 0) {
    inox_timer_handle* next = immediate->next;
    inox_loop_finalize_handle(immediate);
    loop->allocator->free(loop->allocator->user, immediate, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));
    immediate = next;
  }

  inox_timer_handle* timer = (inox_timer_handle*)loop->timer_head;

  while (timer != 0) {
    inox_timer_handle* next = timer->next;
    inox_loop_finalize_handle(timer);
    loop->allocator->free(loop->allocator->user, timer, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));
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
  return inox_loop_new_handle(loop, INOX_TIMER_IMMEDIATE, 0, run, context, finalizer, out);
}

inox_status inox_loop_set_timeout(
  inox_loop* loop,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
) {
  return inox_loop_new_handle(loop, INOX_TIMER_TIMEOUT, delay_ms, run, context, finalizer, out);
}

inox_status inox_loop_set_interval(
  inox_loop* loop,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
) {
  return inox_loop_new_handle(loop, INOX_TIMER_INTERVAL, delay_ms, run, context, finalizer, out);
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

  loop->now_ms = now_ms;
  loop->turn += 1;
  uint64_t turn = loop->turn;

  inox_status first_error = inox_loop_drain_microtasks(loop);
  first_error = inox_loop_keep_first_error(first_error, inox_loop_run_immediates(loop, turn));
  first_error = inox_loop_keep_first_error(first_error, inox_loop_run_timers(loop, turn, now_ms));

  return first_error;
}

inox_status inox_loop_run_once(inox_loop* loop) {
  if (loop == 0) {
    return INOX_ERR_TYPE;
  }

  inox_number next_due_ms = 0;
  inox_number now_ms = inox_performance_now();

  if (
    inox_loop_pending_microtasks(loop) == 0 && inox_loop_pending_immediates(loop) == 0 &&
    inox_loop_next_timer_due_ms(loop, &next_due_ms) && next_due_ms > now_ms
  ) {
    inox_time_sleep_ms(next_due_ms - now_ms);
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
  return loop != 0 && (loop->microtask_count > 0 || loop->immediate_count > 0 || loop->timer_count > 0);
}

size_t inox_loop_pending_microtasks(const inox_loop* loop) {
  return loop == 0 ? 0 : loop->microtask_count;
}

size_t inox_loop_pending_immediates(const inox_loop* loop) {
  return loop == 0 ? 0 : loop->immediate_count;
}

size_t inox_loop_pending_timers(const inox_loop* loop) {
  return loop == 0 ? 0 : loop->timer_count;
}

int inox_loop_next_timer_due_ms(const inox_loop* loop, inox_number* out) {
  if (loop == 0 || out == 0) {
    return 0;
  }

  int found = 0;
  inox_number next_due_ms = 0;
  inox_timer_handle* handle = (inox_timer_handle*)loop->timer_head;

  while (handle != 0) {
    if (handle->active && (!found || handle->due_ms < next_due_ms)) {
      next_due_ms = handle->due_ms;
      found = 1;
    }

    handle = handle->next;
  }

  if (found) {
    *out = next_due_ms;
  }

  return found;
}

static inox_number inox_loop_clamp_delay(inox_number delay_ms) {
  return delay_ms != delay_ms || delay_ms < 0 ? 0 : delay_ms;
}

static inox_status inox_loop_new_handle(
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

  inox_timer_handle* handle =
    loop->allocator->alloc(loop->allocator->user, sizeof(inox_timer_handle), _Alignof(inox_timer_handle));

  if (handle == 0) {
    if (out != 0) {
      *out = 0;
    }
    return INOX_ERR_OOM;
  }

  inox_number delay = inox_loop_clamp_delay(delay_ms);
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

  if (kind == INOX_TIMER_IMMEDIATE) {
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

  if (out != 0) {
    *out = handle;
  }

  return INOX_OK;
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

  if (handle->loop != 0) {
    if (handle->kind == INOX_TIMER_IMMEDIATE && handle->loop->immediate_count > 0) {
      handle->loop->immediate_count -= 1;
    } else if (handle->kind != INOX_TIMER_IMMEDIATE && handle->loop->timer_count > 0) {
      handle->loop->timer_count -= 1;
    }
  }
}

static inox_status inox_loop_run_handle(inox_timer_handle* handle, inox_number now_ms) {
  if (handle == 0 || !handle->active || handle->run == 0) {
    return INOX_OK;
  }

  handle->running = 1;
  inox_status status = handle->run(handle->context);
  handle->running = 0;

  if (handle->kind == INOX_TIMER_INTERVAL && handle->active) {
    inox_number next_due_ms = handle->due_ms + handle->interval_ms;

    if (handle->interval_ms > 0 && next_due_ms < now_ms) {
      next_due_ms = now_ms + handle->interval_ms;
    }

    handle->due_ms = next_due_ms;
  } else {
    inox_loop_deactivate_handle(handle);
    inox_loop_finalize_handle(handle);
  }

  if (handle->loop != 0) {
    status = inox_loop_keep_first_error(status, inox_loop_drain_microtasks(handle->loop));
  }

  return status;
}

static inox_status inox_loop_run_immediates(inox_loop* loop, uint64_t turn) {
  inox_status first_error = INOX_OK;
  inox_timer_handle* handle = (inox_timer_handle*)loop->immediate_head;

  while (handle != 0) {
    inox_timer_handle* next = handle->next;

    if (handle->active && handle->created_turn < turn) {
      first_error = inox_loop_keep_first_error(first_error, inox_loop_run_handle(handle, loop->now_ms));
    }

    handle = next;
  }

  return first_error;
}

static inox_status inox_loop_run_timers(inox_loop* loop, uint64_t turn, inox_number now_ms) {
  inox_status first_error = INOX_OK;
  inox_timer_handle* handle = (inox_timer_handle*)loop->timer_head;

  while (handle != 0) {
    inox_timer_handle* next = handle->next;

    if (handle->active && handle->created_turn < turn && handle->due_ms <= now_ms) {
      first_error = inox_loop_keep_first_error(first_error, inox_loop_run_handle(handle, now_ms));
    }

    handle = next;
  }

  return first_error;
}

static inox_status inox_loop_keep_first_error(inox_status current, inox_status next) {
  return current == INOX_OK ? next : current;
}
