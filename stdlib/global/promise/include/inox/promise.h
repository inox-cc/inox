#ifndef INOX_STDLIB_PROMISE_H
#define INOX_STDLIB_PROMISE_H

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
  Promise();
  Promise(const Promise& other);
  Promise(Promise&& other) noexcept;
  Promise& operator=(const Promise& other);
  Promise& operator=(Promise&& other) noexcept;
  ~Promise();

  static Promise create();
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
  inox_status observe(
    PromiseReactionCallback onFulfilled,
    PromiseReactionCallback onRejected,
    void* context,
    PromiseCallbackFinalizer finalizer
  ) const;
  Value awaitValue() const;
  inox_status fulfill(Value value) const;
  inox_status rejectWith(Value error) const;

  bool valid() const;
};

} // namespace inox

#endif
