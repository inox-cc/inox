#ifndef INOX_STDLIB_PROMISE_H
#define INOX_STDLIB_PROMISE_H

#include "inox/value.h"

struct inox_promise;

namespace inox {

using PromiseReactionCallback = inox_status (*)(void* context, inox_value value);
using PromiseChainCallback = inox_status (*)(void* context, inox_value value, inox_value* out);
using PromiseCallbackFinalizer = void (*)(void* context);

class Promise {
private:
  inox_promise* promise_;

public:
  Promise();
  explicit Promise(inox_promise* promise);
  Promise(const Promise& other);
  Promise(Promise&& other) noexcept;
  Promise& operator=(const Promise& other);
  Promise& operator=(Promise&& other) noexcept;
  Promise& operator=(inox_promise* promise);
  ~Promise();

  static Promise adopt(inox_promise* promise);
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

  inox_promise* raw() const;
  bool valid() const;
  bool hasUnhandledRejection() const;
  operator inox_promise*() const;
  inox_promise** operator&();
  const inox_promise* const* operator&() const;
  inox_promise** out();
  void reset();
  inox_promise* release();
};

} // namespace inox

#endif
