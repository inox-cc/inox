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

} // namespace inox

#endif

#endif
