#ifndef INOX_LOOP_H
#define INOX_LOOP_H

#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/time_bridge.h"
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

#include <stdio.h>
#include <stdlib.h>

namespace inox {

class Runtime;

struct FatalInfo {
  const char* message;
};

using FatalHandler = void (*)(const FatalInfo& info);

inline FatalHandler& fatal_handler_slot() {
  static FatalHandler handler = nullptr;

  return handler;
}

inline void set_fatal_handler(FatalHandler handler) {
  fatal_handler_slot() = handler;
}

[[noreturn]] inline void fatal(const char* message) {
  FatalInfo info = { message == nullptr ? "fatal runtime error" : message };
  FatalHandler handler = fatal_handler_slot();

  if (handler != nullptr) {
    handler(info);
  } else {
    fprintf(stderr, "Inox fatal: %s\n", info.message);
  }

  abort();
}

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
  Value exception_;
  bool thrown_;

public:
  Runtime() : loop_(), exception_(), thrown_(false) {}

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
    clear_exception();
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

  bool thrown() const {
    return thrown_;
  }

  void throw_value(inox_value value) {
    exception_ = value;
    thrown_ = true;
  }

  void throw_value(const Value& value) {
    throw_value(value.raw());
  }

  Value take_exception() {
    thrown_ = false;
    return std::move(exception_);
  }

  void clear_exception() {
    thrown_ = false;
    exception_.reset();
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

class RuntimeContext {
private:
  Runtime runtime_;
  RuntimeScope scope_;
  inox_status status_;

public:
  explicit RuntimeContext(inox_allocator* allocator)
    : RuntimeContext(allocator, inox_monotonic_now_ms()) {}

  RuntimeContext(inox_allocator* allocator, inox_number now_ms)
    : runtime_(), scope_(runtime_), status_(runtime_.init(allocator)) {
    if (status_ == INOX_OK) {
      runtime_.raw_loop()->now_ms = now_ms;
    }
  }

  RuntimeContext(const RuntimeContext&) = delete;
  RuntimeContext& operator=(const RuntimeContext&) = delete;
  RuntimeContext(RuntimeContext&&) = delete;
  RuntimeContext& operator=(RuntimeContext&&) = delete;

  inox_status status() const {
    return status_;
  }

  bool ok() const {
    return status_ == INOX_OK;
  }

  explicit operator bool() const {
    return ok();
  }

  Runtime& runtime() {
    return runtime_;
  }

  const Runtime& runtime() const {
    return runtime_;
  }
};

inline Runtime* current_runtime() {
  return current_runtime_slot();
}

inline bool thrown() {
  Runtime* runtime = current_runtime_slot();

  return runtime != nullptr && runtime->thrown();
}

inline void throw_value(inox_value value) {
  Runtime* runtime = current_runtime_slot();

  if (runtime != nullptr) {
    runtime->throw_value(value);
  }
}

inline void throw_value(const Value& value) {
  Runtime* runtime = current_runtime_slot();

  if (runtime != nullptr) {
    runtime->throw_value(value);
  }
}

inline Value take_exception() {
  Runtime* runtime = current_runtime_slot();

  if (runtime == nullptr) {
    return Value();
  }

  return runtime->take_exception();
}

inline void clear_exception() {
  Runtime* runtime = current_runtime_slot();

  if (runtime != nullptr) {
    runtime->clear_exception();
  }
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
