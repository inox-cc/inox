#ifndef INOX_LOOP_H
#define INOX_LOOP_H

#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

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
inox_status inox_loop_run_once(inox_loop* loop);
inox_status inox_loop_run(inox_loop* loop);
int inox_loop_has_work(const inox_loop* loop);
size_t inox_loop_pending_microtasks(const inox_loop* loop);
size_t inox_loop_pending_immediates(const inox_loop* loop);
size_t inox_loop_pending_timers(const inox_loop* loop);
int inox_loop_next_timer_due_ms(const inox_loop* loop, inox_number* out);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

namespace inox {

class Runtime;

inline Runtime*& current_runtime_slot() {
  static thread_local Runtime* current = nullptr;

  return current;
}

class Loop {
private:
  inox_loop loop_;
  bool active_;

public:
  Loop() : loop_(), active_(false) {}

  Loop(const Loop&) = delete;
  Loop& operator=(const Loop&) = delete;
  Loop(Loop&&) = delete;
  Loop& operator=(Loop&&) = delete;

  ~Loop() {
    reset();
  }

  inox_status init(inox_allocator* allocator) {
    reset();
    inox_status status = inox_loop_init(&loop_, allocator);

    if (status == INOX_OK) {
      active_ = true;
    }

    return status;
  }

  inox_status run_once() {
    return inox_loop_run_once(&loop_);
  }

  inox_status run() {
    return inox_loop_run(&loop_);
  }

  void reset() {
    if (active_) {
      inox_loop_dispose(&loop_);
      active_ = false;
    }
  }

  bool active() const {
    return active_;
  }

  inox_loop* raw() {
    return &loop_;
  }

  const inox_loop* raw() const {
    return &loop_;
  }

  inox_loop* operator->() {
    return &loop_;
  }

  const inox_loop* operator->() const {
    return &loop_;
  }

  operator inox_loop*() {
    return &loop_;
  }

  operator const inox_loop*() const {
    return &loop_;
  }
};

class Runtime {
private:
  Loop loop_;

public:
  Runtime() : loop_() {}

  Runtime(const Runtime&) = delete;
  Runtime& operator=(const Runtime&) = delete;
  Runtime(Runtime&&) = delete;
  Runtime& operator=(Runtime&&) = delete;

  inox_status init(inox_allocator* allocator) {
    return loop_.init(allocator);
  }

  inox_status run() {
    return loop_.run();
  }

  void reset() {
    loop_.reset();
  }

  bool active() const {
    return loop_.active();
  }

  Loop& loop() {
    return loop_;
  }

  const Loop& loop() const {
    return loop_;
  }

  inox_loop* raw_loop() {
    return loop_.raw();
  }

  const inox_loop* raw_loop() const {
    return loop_.raw();
  }
};

class RuntimeScope {
private:
  Runtime* previous_;

public:
  explicit RuntimeScope(Runtime& runtime) : previous_(current_runtime_slot()) {
    current_runtime_slot() = &runtime;
  }

  RuntimeScope(const RuntimeScope&) = delete;
  RuntimeScope& operator=(const RuntimeScope&) = delete;
  RuntimeScope(RuntimeScope&&) = delete;
  RuntimeScope& operator=(RuntimeScope&&) = delete;

  ~RuntimeScope() {
    current_runtime_slot() = previous_;
  }
};

inline Runtime* current_runtime() {
  return current_runtime_slot();
}

inline inox_loop* loop() {
  Runtime* runtime = current_runtime_slot();

  if (runtime == nullptr || !runtime->active()) {
    return nullptr;
  }

  return runtime->raw_loop();
}

inline inox_status run() {
  Runtime* runtime = current_runtime_slot();

  if (runtime == nullptr || !runtime->active()) {
    return INOX_ERR_TYPE;
  }

  return runtime->run();
}

} // namespace inox

#endif

#endif
