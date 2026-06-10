#ifndef CCJS_LOOP_H
#define CCJS_LOOP_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_loop ccjs_loop;

typedef ccjs_status (*ccjs_microtask_fn)(void* context);
typedef void (*ccjs_microtask_finalizer_fn)(void* context);

struct ccjs_loop {
  ccjs_allocator* allocator;
  void* head;
  void* tail;
  size_t microtask_count;
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
size_t ccjs_loop_pending_microtasks(const ccjs_loop* loop);

#endif
