#ifndef CCJS_LOOP_H
#define CCJS_LOOP_H

#include <stddef.h>
#include <stdint.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_loop ccjs_loop;
typedef struct ccjs_timer_handle ccjs_timer_handle;

typedef ccjs_status (*ccjs_microtask_fn)(void* context);
typedef void (*ccjs_microtask_finalizer_fn)(void* context);
typedef ccjs_status (*ccjs_loop_callback_fn)(void* context);
typedef void (*ccjs_loop_callback_finalizer_fn)(void* context);

struct ccjs_loop {
  ccjs_allocator* allocator;
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
  ccjs_number now_ms;
};

ccjs_status ccjs_loop_init(ccjs_loop* loop, ccjs_allocator* allocator);
void ccjs_loop_dispose(ccjs_loop* loop);
ccjs_status ccjs_loop_queue_microtask(
  ccjs_loop* loop,
  ccjs_microtask_fn run,
  void* context,
  ccjs_microtask_finalizer_fn finalizer
);
ccjs_status ccjs_loop_drain_microtasks(ccjs_loop* loop);
ccjs_status ccjs_loop_queue_immediate(
  ccjs_loop* loop,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
);
ccjs_status ccjs_loop_set_timeout(
  ccjs_loop* loop,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
);
ccjs_status ccjs_loop_set_interval(
  ccjs_loop* loop,
  ccjs_number delay_ms,
  ccjs_loop_callback_fn run,
  void* context,
  ccjs_loop_callback_finalizer_fn finalizer,
  ccjs_timer_handle** out
);
void ccjs_loop_clear_timer(ccjs_timer_handle* handle);
ccjs_status ccjs_loop_poll(ccjs_loop* loop, ccjs_number now_ms);
int ccjs_loop_has_work(const ccjs_loop* loop);
size_t ccjs_loop_pending_microtasks(const ccjs_loop* loop);
size_t ccjs_loop_pending_immediates(const ccjs_loop* loop);
size_t ccjs_loop_pending_timers(const ccjs_loop* loop);
int ccjs_loop_next_timer_due_ms(const ccjs_loop* loop, ccjs_number* out);

#endif
