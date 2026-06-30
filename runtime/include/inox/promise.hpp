#ifndef INOX_PROMISE_HPP
#define INOX_PROMISE_HPP

#include <memory>
#include "inox/promise.h"

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
