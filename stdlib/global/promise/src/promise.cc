#include "inox/promise.h"

#include <memory>

#include "inox/loop.h"
#include "inox/promise_runtime.h"

namespace inox {

static inox_promise* rawPromise(void* promise) {
  return static_cast<inox_promise*>(promise);
}

Promise::Promise() : promise_(nullptr) {}

Promise::Promise(const Promise& other) : promise_(other.promise_) {
  inox_promise_retain(rawPromise(promise_));
}

Promise::Promise(Promise&& other) noexcept : promise_(other.promise_) {
  other.promise_ = nullptr;
}

Promise& Promise::operator=(const Promise& other) {
  if (this != std::addressof(other)) {
    inox_promise_retain(rawPromise(other.promise_));
    inox_promise_release(rawPromise(promise_));
    promise_ = other.promise_;
  }

  return *this;
}

Promise& Promise::operator=(Promise&& other) noexcept {
  if (this != std::addressof(other)) {
    inox_promise_release(rawPromise(promise_));
    promise_ = other.promise_;
    other.promise_ = nullptr;
  }

  return *this;
}

Promise::~Promise() {
  inox_promise_release(rawPromise(promise_));
}

namespace detail {

Promise PromiseRuntimeBridge::adopt(inox_promise* promise) {
  Promise result;
  result.promise_ = promise;
  return result;
}

} // namespace detail

Promise Promise::create() {
  inox_promise* promise = nullptr;

  if (inox_promise_new(loop(), &promise) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return detail::PromiseRuntimeBridge::adopt(promise);
}

Promise Promise::resolve() {
  return resolve(Value(inox_undefined_value()));
}

Promise Promise::resolve(Value value) {
  inox_promise* promise = nullptr;

  if (inox_promise_resolved(loop(), value.raw(), &promise) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return detail::PromiseRuntimeBridge::adopt(promise);
}

Promise Promise::reject() {
  return reject(Value(inox_undefined_value()));
}

Promise Promise::reject(Value error) {
  inox_promise* promise = nullptr;

  if (inox_promise_rejected(loop(), error.raw(), &promise) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return detail::PromiseRuntimeBridge::adopt(promise);
}

Promise Promise::then(
  PromiseChainCallback onFulfilled,
  void* context,
  PromiseCallbackFinalizer finalizer
) const {
  inox_promise* child = nullptr;

  if (inox_promise_chain(rawPromise(promise_), onFulfilled, nullptr, context, finalizer, &child) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return detail::PromiseRuntimeBridge::adopt(child);
}

Promise Promise::catchError(
  PromiseChainCallback onRejected,
  void* context,
  PromiseCallbackFinalizer finalizer
) const {
  inox_promise* child = nullptr;

  if (inox_promise_catch(rawPromise(promise_), onRejected, context, finalizer, &child) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return detail::PromiseRuntimeBridge::adopt(child);
}

inox_status Promise::observe(
  PromiseReactionCallback onFulfilled,
  PromiseReactionCallback onRejected,
  void* context,
  PromiseCallbackFinalizer finalizer
) const {
  return inox_promise_then(rawPromise(promise_), onFulfilled, onRejected, context, finalizer);
}

Value Promise::awaitValue() const {
  if (thrown()) {
    return {};
  }

  if (!valid()) {
    throw_value(Value());
    return {};
  }

  Value value;
  inox_promise_state state = INOX_PROMISE_PENDING;
  const inox_status status = inox_promise_await(loop(), rawPromise(promise_), true, value.out(), &state);

  if (status != INOX_OK) {
    if (!thrown()) {
      throw_value(Value());
    }

    return {};
  }

  if (state == INOX_PROMISE_FULFILLED) {
    return value;
  }

  if (state == INOX_PROMISE_REJECTED) {
    throw_value(value);
    return {};
  }

  throw_value(Value());
  return {};
}

inox_status Promise::fulfill(Value value) const {
  return inox_promise_resolve(rawPromise(promise_), value.raw());
}

inox_status Promise::rejectWith(Value error) const {
  return inox_promise_reject(rawPromise(promise_), error.raw());
}

bool Promise::valid() const {
  return promise_ != nullptr;
}

} // namespace inox
