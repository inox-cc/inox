#ifndef INOX_STDLIB_PROMISE_H
#define INOX_STDLIB_PROMISE_H

#include <cstddef>
#include <coroutine>

#include "inox/value.h"

namespace inox {

namespace detail {
class PromiseRuntimeBridge;
}

using PromiseReactionCallback = inox_status (*)(void* context, inox_value value);
using PromiseChainCallback = inox_status (*)(void* context, inox_value value, inox_value* out);
using PromiseCallbackFinalizer = void (*)(void* context);

class Promise {
private:
  friend class detail::PromiseRuntimeBridge;

  void* promise_;

public:
  class Awaiter;
  class promise_type;

  Promise();
  explicit Promise(const Value& value);
  Promise(const Promise& other);
  Promise(Promise&& other) noexcept;
  Promise& operator=(const Promise& other);
  Promise& operator=(Promise&& other) noexcept;
  ~Promise();

  static Promise create();
  static Promise all(const Value& values);
  static Promise race(const Value& values);
  static Promise resolve();
  static Promise resolve(Value value);
  static Promise reject();
  static Promise reject(Value error);

  Promise then(
    PromiseChainCallback onFulfilled,
    void* context,
    PromiseCallbackFinalizer finalizer
  ) const;
  Promise catchError(
    PromiseChainCallback onRejected,
    void* context,
    PromiseCallbackFinalizer finalizer
  ) const;
  Promise finallyDo(const Value& callback) const;
  inox_status observe(
    PromiseReactionCallback onFulfilled,
    PromiseReactionCallback onRejected,
    void* context,
    PromiseCallbackFinalizer finalizer
  ) const;
  Value awaitValue() const;
  inox_status fulfill(Value value) const;
  inox_status rejectWith(Value error) const;

  Value raw() const;
  static bool isPromise(const Value& value);

  bool valid() const;
  Awaiter operator co_await() const;
};

class Promise::Awaiter {
private:
  Promise source_;
  std::coroutine_handle<> continuation_;
  Value result_;
  bool rejected_;
  bool failed_;

  static inox_status fulfill(void* context, inox_value value);
  static inox_status reject(void* context, inox_value value);
  inox_status settle(inox_value value, bool rejected);

public:
  explicit Awaiter(Promise source);

  bool await_ready() const noexcept;
  bool await_suspend(std::coroutine_handle<> continuation) noexcept;
  Value await_resume();
};

class Promise::promise_type {
private:
  Promise result_;

public:
  promise_type();

  static void* operator new(std::size_t size) noexcept;
  static void operator delete(void* pointer, std::size_t size) noexcept;
  static Promise get_return_object_on_allocation_failure() noexcept;

  Promise get_return_object() const;
  std::suspend_never initial_suspend() const noexcept;
  std::suspend_never final_suspend() const noexcept;
  void return_value(Value value);
  void unhandled_exception() noexcept;
};

} // namespace inox

#endif
