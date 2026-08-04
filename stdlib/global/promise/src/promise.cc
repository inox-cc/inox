#include "inox/promise.h"

#include <limits>
#include <memory>
#include <new>

#include "inox/array.h"
#include "inox/callback.h"
#include "inox/class_descriptor.h"
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

static inox_status promiseClassReadField(const void* instance, uint32_t index, inox_value* out) {
  (void)instance;
  (void)index;

  if (out != nullptr) {
    *out = inox_undefined_value();
  }

  return INOX_ERR_FIELD;
}

static inox_status promiseClassCopy(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(Promise), alignof(Promise));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  new (memory) Promise(*static_cast<const Promise*>(instance));
  *out = memory;
  return INOX_OK;
}

static void promiseClassDestroy(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  static_cast<Promise*>(instance)->~Promise();
  allocator->free(allocator->user, instance, sizeof(Promise), alignof(Promise));
}

static const inox_class_descriptor promiseClassDescriptor = {
  "Promise",
  0,
  nullptr,
  promiseClassReadField,
  promiseClassCopy,
  promiseClassDestroy
};

enum class PromiseCombinatorKind {
  all,
  race
};

struct PromiseCombinatorContext {
  PromiseCombinatorContext(Promise result, PromiseCombinatorKind kind, Array values, size_t remaining)
    : references(1),
      result(std::move(result)),
      kind(kind),
      values(std::move(values)),
      remaining(remaining),
      settled(false) {}

  size_t references;
  Promise result;
  PromiseCombinatorKind kind;
  Array values;
  size_t remaining;
  bool settled;
};

struct PromiseCombinatorReaction {
  PromiseCombinatorReaction(PromiseCombinatorContext* owner, size_t index, Promise source)
    : owner(owner), index(index), source(std::move(source)) {}

  PromiseCombinatorContext* owner;
  size_t index;
  Promise source;
};

struct PromiseFinallyContext {
  explicit PromiseFinallyContext(Callback callback) : callback(std::move(callback)) {}

  Callback callback;
};

static void promiseCombinatorRetain(PromiseCombinatorContext* context) {
  if (context != nullptr) {
    context->references += 1;
  }
}

static void promiseCombinatorRelease(PromiseCombinatorContext* context) {
  if (context == nullptr || context->references == 0) {
    return;
  }

  context->references -= 1;

  if (context->references == 0) {
    delete context;
  }
}

static inox_status promiseCombinatorReject(PromiseCombinatorContext* context, inox_value error) {
  if (context == nullptr || context->settled) {
    return INOX_OK;
  }

  context->settled = true;
  return context->result.rejectWith(Value(error));
}

static inox_status promiseCombinatorFulfill(void* rawContext, inox_value value) {
  auto* reaction = static_cast<PromiseCombinatorReaction*>(rawContext);

  if (reaction == nullptr || reaction->owner == nullptr) {
    return INOX_ERR_TYPE;
  }

  PromiseCombinatorContext* context = reaction->owner;

  if (context->settled) {
    return INOX_OK;
  }

  if (context->kind == PromiseCombinatorKind::race) {
    context->settled = true;
    return context->result.fulfill(Value(value));
  }

  context->values.set(reaction->index, Value(value));

  if (thrown()) {
    Value error = take_exception();
    return promiseCombinatorReject(context, error.raw());
  }

  context->remaining -= 1;

  if (context->remaining != 0) {
    return INOX_OK;
  }

  context->settled = true;
  return context->result.fulfill(context->values);
}

static inox_status promiseCombinatorReject(void* rawContext, inox_value error) {
  auto* reaction = static_cast<PromiseCombinatorReaction*>(rawContext);

  return reaction == nullptr ? INOX_ERR_TYPE : promiseCombinatorReject(reaction->owner, error);
}

static void promiseCombinatorFinalize(void* rawContext) {
  auto* reaction = static_cast<PromiseCombinatorReaction*>(rawContext);

  if (reaction == nullptr) {
    return;
  }

  PromiseCombinatorContext* owner = reaction->owner;
  delete reaction;
  promiseCombinatorRelease(owner);
}

static inox_status promiseFinallyInvoke(
  PromiseFinallyContext* context,
  inox_value value,
  inox_value* out,
  bool rejected
) {
  if (context == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  context->callback.call();

  if (thrown()) {
    Value error = take_exception();
    *out = error.release();
    return INOX_ERR_THROW;
  }

  *out = value;
  inox_retain(*out);
  return rejected ? INOX_ERR_THROW : INOX_OK;
}

static inox_status promiseFinallyFulfill(void* context, inox_value value, inox_value* out) {
  return promiseFinallyInvoke(static_cast<PromiseFinallyContext*>(context), value, out, false);
}

static inox_status promiseFinallyReject(void* context, inox_value value, inox_value* out) {
  return promiseFinallyInvoke(static_cast<PromiseFinallyContext*>(context), value, out, true);
}

static void promiseFinallyFinalize(void* context) {
  delete static_cast<PromiseFinallyContext*>(context);
}

Promise::Promise() : promise_(nullptr) {}

Promise::Promise(const Value& value) : promise_(nullptr) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_CLASS_INSTANCE || raw.as.ref == nullptr) {
    return;
  }

  const auto* instance = reinterpret_cast<const inox_class_instance_ref*>(raw.as.ref);

  if (instance->descriptor != &promiseClassDescriptor || instance->instance == nullptr) {
    return;
  }

  promise_ = static_cast<const Promise*>(instance->instance)->promise_;
  inox_promise_retain(rawPromise(promise_));
}

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

Value Promise::raw() const {
  Value result;

  if (!valid()) {
    return result;
  }

  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    &promiseClassDescriptor,
    this,
    result.out()
  );

  if (status == INOX_ERR_OOM) {
    throw_out_of_memory();
  } else if (status != INOX_OK) {
    throw_value(Value());
  }

  return result;
}

bool Promise::isPromise(const Value& value) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_CLASS_INSTANCE || raw.as.ref == nullptr) {
    return false;
  }

  const auto* instance = reinterpret_cast<const inox_class_instance_ref*>(raw.as.ref);
  return instance->descriptor == &promiseClassDescriptor && instance->instance != nullptr;
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

static Promise promiseCombinator(const Value& values, PromiseCombinatorKind kind) {
  Array sources(values);

  if (!sources.valid()) {
    throw_value(Value());
    return {};
  }

  Promise result = Promise::create();

  if (!result.valid()) {
    return {};
  }

  const size_t length = sources.length();
  Array output = kind == PromiseCombinatorKind::all ? Array::create(length) : Array();

  if (thrown()) {
    Value error = take_exception();
    result.rejectWith(std::move(error));
    return result;
  }

  if (kind == PromiseCombinatorKind::all && length == 0) {
    result.fulfill(output);
    return result;
  }

  auto* context = new (std::nothrow) PromiseCombinatorContext(result, kind, std::move(output), length);

  if (context == nullptr) {
    throw_out_of_memory();
    Value error = take_exception();
    result.rejectWith(std::move(error));
    return result;
  }

  for (size_t index = 0; index < length && !context->settled; index += 1) {
    Value value = sources.get(index);

    if (thrown()) {
      Value error = take_exception();
      promiseCombinatorReject(context, error.raw());
      break;
    }

    Promise source = Promise::isPromise(value) ? Promise(value) : Promise::resolve(value);

    if (!source.valid()) {
      Value error = thrown() ? take_exception() : Value();
      promiseCombinatorReject(context, error.raw());
      break;
    }

    auto* reaction = new (std::nothrow) PromiseCombinatorReaction(context, index, std::move(source));

    if (reaction == nullptr) {
      throw_out_of_memory();
      Value error = take_exception();
      promiseCombinatorReject(context, error.raw());
      break;
    }

    promiseCombinatorRetain(context);
    const inox_status status = reaction->source.observe(
      promiseCombinatorFulfill,
      promiseCombinatorReject,
      reaction,
      promiseCombinatorFinalize
    );

    if (status != INOX_OK) {
      promiseCombinatorFinalize(reaction);
      Value error = thrown() ? take_exception() : Value(inox_number_value(static_cast<double>(status)));
      promiseCombinatorReject(context, error.raw());
      break;
    }
  }

  promiseCombinatorRelease(context);
  return result;
}

Promise Promise::all(const Value& values) {
  return promiseCombinator(values, PromiseCombinatorKind::all);
}

Promise Promise::race(const Value& values) {
  return promiseCombinator(values, PromiseCombinatorKind::race);
}

Promise Promise::resolve() {
  return resolve(Value(inox_undefined_value()));
}

Promise Promise::resolve(Value value) {
  if (isPromise(value)) {
    return Promise(value);
  }

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

Promise Promise::finallyDo(const Value& callback) const {
  inox_promise* child = nullptr;

  if (callback.raw().tag == INOX_TAG_UNDEFINED || callback.raw().tag == INOX_TAG_NULL) {
    if (inox_promise_chain(rawPromise(promise_), nullptr, nullptr, nullptr, nullptr, &child) != INOX_OK) {
      throw_value(Value());
      return {};
    }

    return detail::PromiseRuntimeBridge::adopt(child);
  }

  Callback callable(callback);

  if (!callable.valid()) {
    throw_value(Value());
    return {};
  }

  auto* context = new (std::nothrow) PromiseFinallyContext(std::move(callable));

  if (context == nullptr) {
    throw_out_of_memory();
    return {};
  }

  const inox_status status = inox_promise_chain(
    rawPromise(promise_),
    promiseFinallyFulfill,
    promiseFinallyReject,
    context,
    promiseFinallyFinalize,
    &child
  );

  if (status != INOX_OK) {
    delete context;

    if (status == INOX_ERR_OOM) {
      throw_out_of_memory();
    } else {
      throw_value(Value());
    }

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
