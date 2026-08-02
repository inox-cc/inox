#include "inox/promise.h"

#include <limits>
#include <memory>

#include "inox/loop.h"
#include "inox/promise_runtime.h"

namespace inox {

static inox_promise* rawPromise(void* promise) {
  return static_cast<inox_promise*>(promise);
}

struct alignas(std::max_align_t) PromiseCoroutineAllocation {
  inox_allocator* allocator;
  std::size_t size;
};

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

Promise::Awaiter Promise::operator co_await() const {
  return Awaiter(*this);
}

Promise::Awaiter::Awaiter(Promise source)
  : source_(std::move(source)), continuation_(), result_(), rejected_(false), failed_(false) {}

bool Promise::Awaiter::await_ready() const noexcept {
  return false;
}

bool Promise::Awaiter::await_suspend(std::coroutine_handle<> continuation) noexcept {
  continuation_ = continuation;

  if (!source_.valid()) {
    failed_ = true;
    return false;
  }

  const inox_status status = source_.observe(fulfill, reject, this, nullptr);

  if (status == INOX_OK) {
    return true;
  }

  failed_ = true;

  if (status == INOX_ERR_OOM) {
    throw_out_of_memory();
  } else if (!thrown()) {
    throw_value(Value());
  }

  return false;
}

Value Promise::Awaiter::await_resume() {
  if (failed_) {
    if (!thrown()) {
      throw_value(Value());
    }

    return {};
  }

  if (rejected_) {
    throw_value(result_);
    return {};
  }

  return std::move(result_);
}

inox_status Promise::Awaiter::fulfill(void* context, inox_value value) {
  return static_cast<Awaiter*>(context)->settle(value, false);
}

inox_status Promise::Awaiter::reject(void* context, inox_value value) {
  return static_cast<Awaiter*>(context)->settle(value, true);
}

inox_status Promise::Awaiter::settle(inox_value value, bool rejected) {
  result_ = value;
  rejected_ = rejected;
  const std::coroutine_handle<> continuation = continuation_;
  continuation_ = {};
  continuation.resume();
  return INOX_OK;
}

Promise::promise_type::promise_type() : result_(Promise::create()) {}

void* Promise::promise_type::operator new(std::size_t size) noexcept {
  inox_loop* currentLoop = loop();

  if (currentLoop == nullptr || currentLoop->allocator == nullptr || currentLoop->allocator->alloc == nullptr) {
    throw_value(Value());
    return nullptr;
  }

  if (size > std::numeric_limits<std::size_t>::max() - sizeof(PromiseCoroutineAllocation)) {
    throw_out_of_memory();
    return nullptr;
  }

  const std::size_t allocationSize = sizeof(PromiseCoroutineAllocation) + size;
  inox_allocator* allocator = currentLoop->allocator;
  void* memory = allocator->alloc(
    allocator->user,
    allocationSize,
    alignof(PromiseCoroutineAllocation)
  );

  if (memory == nullptr) {
    throw_out_of_memory();
    return nullptr;
  }

  PromiseCoroutineAllocation* allocation = static_cast<PromiseCoroutineAllocation*>(memory);
  allocation->allocator = allocator;
  allocation->size = allocationSize;
  return allocation + 1;
}

void Promise::promise_type::operator delete(void* pointer, std::size_t size) noexcept {
  (void)size;

  if (pointer == nullptr) {
    return;
  }

  PromiseCoroutineAllocation* allocation = static_cast<PromiseCoroutineAllocation*>(pointer) - 1;
  inox_allocator* allocator = allocation->allocator;

  if (allocator != nullptr && allocator->free != nullptr) {
    allocator->free(
      allocator->user,
      allocation,
      allocation->size,
      alignof(PromiseCoroutineAllocation)
    );
  }
}

Promise Promise::promise_type::get_return_object_on_allocation_failure() noexcept {
  return {};
}

Promise Promise::promise_type::get_return_object() const {
  return result_;
}

std::suspend_never Promise::promise_type::initial_suspend() const noexcept {
  return {};
}

std::suspend_never Promise::promise_type::final_suspend() const noexcept {
  return {};
}

void Promise::promise_type::return_value(Value value) {
  if (!result_.valid()) {
    return;
  }

  if (thrown()) {
    result_.rejectWith(take_exception());
    return;
  }

  if (result_.fulfill(std::move(value)) != INOX_OK && !thrown()) {
    throw_value(Value());
  }
}

void Promise::promise_type::unhandled_exception() noexcept {
  if (result_.valid()) {
    result_.rejectWith(Value());
  }
}

} // namespace inox
