#include "inox/promise.h"

#include <memory>
#include <utility>

#include "inox/loop.h"
#include "inox/promise_runtime.h"

namespace inox {

Promise::Promise() : promise_(nullptr) {}

Promise::Promise(inox_promise* promise) : promise_(promise) {
  inox_promise_retain(promise_);
}

Promise::Promise(const Promise& other) : promise_(other.promise_) {
  inox_promise_retain(promise_);
}

Promise::Promise(Promise&& other) noexcept : promise_(other.promise_) {
  other.promise_ = nullptr;
}

Promise& Promise::operator=(const Promise& other) {
  if (this != std::addressof(other)) {
    inox_promise_retain(other.promise_);
    inox_promise_release(promise_);
    promise_ = other.promise_;
  }

  return *this;
}

Promise& Promise::operator=(Promise&& other) noexcept {
  if (this != std::addressof(other)) {
    inox_promise_release(promise_);
    promise_ = other.promise_;
    other.promise_ = nullptr;
  }

  return *this;
}

Promise& Promise::operator=(inox_promise* promise) {
  inox_promise_retain(promise);
  inox_promise_release(promise_);
  promise_ = promise;

  return *this;
}

Promise::~Promise() {
  inox_promise_release(promise_);
}

Promise Promise::adopt(inox_promise* promise) {
  Promise result;
  result.promise_ = promise;
  return result;
}

Promise Promise::create() {
  inox_promise* promise = nullptr;

  if (inox_promise_new(loop(), &promise) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return adopt(promise);
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

  return adopt(promise);
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

  return adopt(promise);
}

Promise Promise::then(
  PromiseChainCallback onFulfilled,
  void* context,
  PromiseCallbackFinalizer finalizer
) const {
  inox_promise* child = nullptr;

  if (inox_promise_chain(promise_, onFulfilled, nullptr, context, finalizer, &child) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return adopt(child);
}

Promise Promise::catchError(
  PromiseChainCallback onRejected,
  void* context,
  PromiseCallbackFinalizer finalizer
) const {
  inox_promise* child = nullptr;

  if (inox_promise_catch(promise_, onRejected, context, finalizer, &child) != INOX_OK) {
    throw_value(Value());
    return {};
  }

  return adopt(child);
}

Value Promise::awaitValue() const {
  Value value;
  inox_promise_state state = INOX_PROMISE_PENDING;
  const inox_status status = inox_promise_await(loop(), promise_, true, value.out(), &state);

  if (status != INOX_OK) {
    throw_value(Value());
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

void Promise::fulfill(Value value) const {
  if (inox_promise_resolve(promise_, value.raw()) != INOX_OK) {
    throw_value(Value());
  }
}

void Promise::rejectWith(Value error) const {
  if (inox_promise_reject(promise_, error.raw()) != INOX_OK) {
    throw_value(Value());
  }
}

inox_promise* Promise::raw() const {
  return promise_;
}

bool Promise::valid() const {
  return promise_ != nullptr;
}

bool Promise::hasUnhandledRejection() const {
  return inox_promise_is_unhandled_rejection(promise_);
}

Promise::operator inox_promise*() const {
  return promise_;
}

inox_promise** Promise::operator&() {
  return out();
}

const inox_promise* const* Promise::operator&() const {
  return &promise_;
}

inox_promise** Promise::out() {
  reset();
  return &promise_;
}

void Promise::reset() {
  inox_promise_release(promise_);
  promise_ = nullptr;
}

inox_promise* Promise::release() {
  return std::exchange(promise_, nullptr);
}

} // namespace inox
