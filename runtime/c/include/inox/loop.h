#ifndef INOX_LOOP_H
#define INOX_LOOP_H

#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef struct inox_loop inox_loop;
typedef struct inox_timer_handle inox_timer_handle;

typedef inox_status (*inox_microtask_fn)(void* context);
typedef void (*inox_microtask_finalizer_fn)(void* context);
typedef inox_status (*inox_loop_callback_fn)(void* context);
typedef void (*inox_loop_callback_finalizer_fn)(void* context);

struct inox_loop {
  inox_allocator* allocator;
  void* backend;
  void* microtask_head;
  void* microtask_tail;
  void* immediate_head;
  void* immediate_tail;
  void* timer_head;
  void* timer_tail;
  size_t microtask_count;
  size_t immediate_count;
  size_t timer_count;
  uint64_t turn;
  inox_number now_ms;
};

inox_status inox_loop_init(inox_loop* loop, inox_allocator* allocator);
void inox_loop_dispose(inox_loop* loop);
inox_status
inox_loop_queue_microtask(inox_loop* loop, inox_microtask_fn run, void* context, inox_microtask_finalizer_fn finalizer);
inox_status inox_loop_drain_microtasks(inox_loop* loop);
inox_status inox_loop_queue_immediate(
  inox_loop* loop,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
);
inox_status inox_loop_set_timeout(
  inox_loop* loop,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
);
inox_status inox_loop_set_interval(
  inox_loop* loop,
  inox_number delay_ms,
  inox_loop_callback_fn run,
  void* context,
  inox_loop_callback_finalizer_fn finalizer,
  inox_timer_handle** out
);
void inox_loop_clear_timer(inox_timer_handle* handle);
inox_status inox_loop_poll(inox_loop* loop, inox_number now_ms);
int inox_loop_has_work(const inox_loop* loop);
size_t inox_loop_pending_microtasks(const inox_loop* loop);
size_t inox_loop_pending_immediates(const inox_loop* loop);
size_t inox_loop_pending_timers(const inox_loop* loop);
int inox_loop_next_timer_due_ms(const inox_loop* loop, inox_number* out);

#endif
