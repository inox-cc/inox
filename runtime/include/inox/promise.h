#ifndef INOX_PROMISE_H
#define INOX_PROMISE_H

#include <stdbool.h>
#include "inox/loop.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_promise inox_promise;

typedef enum inox_promise_state { INOX_PROMISE_PENDING, INOX_PROMISE_FULFILLED, INOX_PROMISE_REJECTED } inox_promise_state;

typedef inox_status (*inox_promise_reaction_fn)(void* context, inox_value value);
typedef inox_status (*inox_promise_chain_fn)(void* context, inox_value value, inox_value* out);
typedef void (*inox_promise_reaction_finalizer_fn)(void* context);

inox_status inox_promise_new(inox_loop* loop, inox_promise** out);
void inox_promise_retain(inox_promise* promise);
void inox_promise_release(inox_promise* promise);
inox_promise_state inox_promise_get_state(const inox_promise* promise);
bool inox_promise_is_unhandled_rejection(const inox_promise* promise);
bool inox_promise_has_unhandled_rejection(void);
void inox_promise_clear_unhandled_rejection(void);
inox_status inox_promise_get_result(inox_promise* promise, inox_value* out);
inox_status inox_promise_await(
  inox_loop* loop,
  inox_promise* promise,
  bool read_rejection,
  inox_value* out,
  inox_promise_state* out_state
);
inox_status inox_promise_then(
  inox_promise* promise,
  inox_promise_reaction_fn on_fulfilled,
  inox_promise_reaction_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer
);
inox_status inox_promise_chain(
  inox_promise* promise,
  inox_promise_chain_fn on_fulfilled,
  inox_promise_chain_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer,
  inox_promise** out
);
inox_status inox_promise_catch(
  inox_promise* promise,
  inox_promise_chain_fn on_rejected,
  void* context,
  inox_promise_reaction_finalizer_fn finalizer,
  inox_promise** out
);
inox_status inox_promise_resolved(inox_loop* loop, inox_value value, inox_promise** out);
inox_status inox_promise_rejected(inox_loop* loop, inox_value error, inox_promise** out);
inox_status inox_promise_resolve(inox_promise* promise, inox_value value);
inox_status inox_promise_reject(inox_promise* promise, inox_value error);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

#include <memory>
#include <utility>

namespace inox {

struct AdoptPromise {
};

inline constexpr AdoptPromise adopt_promise = {};

class Promise {
private:
  inox_promise* promise_;

public:
  Promise() : promise_(nullptr) {}

  Promise(inox_promise* promise) : promise_(promise) {
    inox_promise_retain(promise_);
  }

  Promise(AdoptPromise, inox_promise* promise) : promise_(promise) {}

  Promise(const Promise& other) : promise_(other.promise_) {
    inox_promise_retain(promise_);
  }

  Promise(Promise&& other) noexcept : promise_(other.promise_) {
    other.promise_ = nullptr;
  }

  Promise& operator=(const Promise& other) {
    if (this != std::addressof(other)) {
      inox_promise_retain(other.promise_);
      inox_promise_release(promise_);
      promise_ = other.promise_;
    }

    return *this;
  }

  Promise& operator=(Promise&& other) noexcept {
    if (this != std::addressof(other)) {
      inox_promise_release(promise_);
      promise_ = other.promise_;
      other.promise_ = nullptr;
    }

    return *this;
  }

  Promise& operator=(inox_promise* promise) {
    inox_promise_retain(promise);
    inox_promise_release(promise_);
    promise_ = promise;

    return *this;
  }

  ~Promise() {
    inox_promise_release(promise_);
  }

  inox_promise* raw() const {
    return promise_;
  }

  operator inox_promise*() const {
    return promise_;
  }

  inox_promise** operator&() {
    return out();
  }

  const inox_promise* const* operator&() const {
    return &promise_;
  }

  inox_promise** out() {
    reset();
    return &promise_;
  }

  void reset() {
    inox_promise_release(promise_);
    promise_ = nullptr;
  }

  inox_promise* release() {
    inox_promise* promise = promise_;
    promise_ = nullptr;

    return promise;
  }

  bool has_unhandled_rejection() const {
    return inox_promise_is_unhandled_rejection(promise_);
  }
};

inline Promise adopt(inox_promise* promise) {
  return Promise(adopt_promise, promise);
}

template <typename T>
class AwaitResult {
private:
  inox_status status_;
  bool fulfilled_;
  T value_;
  Value error_;

  AwaitResult(inox_status status, bool fulfilled, T value, Value error)
    : status_(status), fulfilled_(fulfilled), value_(std::move(value)), error_(std::move(error)) {}

  template <typename U>
  static auto value_valid(const U& value, int) -> decltype(value.valid(), bool()) {
    return value.valid();
  }

  template <typename U>
  static bool value_valid(const U&, long) {
    return true;
  }

public:
  static AwaitResult fulfilled(T value) {
    return AwaitResult(INOX_OK, true, std::move(value), Value());
  }

  static AwaitResult rejected(Value error) {
    return AwaitResult(INOX_OK, false, T(), std::move(error));
  }

  static AwaitResult failed(inox_status status) {
    return AwaitResult(status, false, T(), Value());
  }

  inox_status status() const {
    return status_;
  }

  bool ok() const {
    return status_ == INOX_OK && fulfilled_ && value_valid(value_, 0);
  }

  bool rejected() const {
    return status_ == INOX_OK && !fulfilled_;
  }

  T& value() {
    return value_;
  }

  const T& value() const {
    return value_;
  }

  T* operator->() {
    return &value_;
  }

  const T* operator->() const {
    return &value_;
  }

  T& operator*() {
    return value_;
  }

  const T& operator*() const {
    return value_;
  }

  const Value& error() const {
    return error_;
  }

  Value error_value() const {
    if (rejected()) {
      return error_;
    }

    return Value();
  }

  explicit operator bool() const {
    return ok();
  }
};

template <typename T>
AwaitResult<T> await(inox_loop* loop, inox_promise* promise) {
  Value value;
  inox_promise_state state = INOX_PROMISE_PENDING;
  inox_status status = inox_promise_await(loop, promise, true, value.out(), &state);

  if (status != INOX_OK) {
    throw_value(Value());
    return AwaitResult<T>::failed(status);
  }

  if (state == INOX_PROMISE_FULFILLED) {
    return AwaitResult<T>::fulfilled(T(std::move(value)));
  }

  if (state == INOX_PROMISE_REJECTED) {
    throw_value(value);
    return AwaitResult<T>::rejected(std::move(value));
  }

  throw_value(Value());
  return AwaitResult<T>::failed(INOX_ERR_TYPE);
}

template <typename T>
AwaitResult<T> await(inox_loop* loop, const Promise& promise) {
  return await<T>(loop, promise.raw());
}

template <typename T>
AwaitResult<T> await(inox_promise* promise) {
  return await<T>(loop(), promise);
}

template <typename T>
AwaitResult<T> await(const Promise& promise) {
  return await<T>(loop(), promise.raw());
}

inline int return_code(int success_code) {
  return !inox_promise_has_unhandled_rejection() ? success_code : 1;
}

} // namespace inox

#endif

#endif
