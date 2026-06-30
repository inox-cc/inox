#ifndef INOX_VALUE_HPP
#define INOX_VALUE_HPP

#include <stddef.h>
#include <string.h>
#include "inox/allocator.h"
#include "inox/string_view.hpp"
#include "inox/string.h"
#include "inox/value.h"

namespace inox {

struct AdoptValue {
};

inline constexpr AdoptValue adopt_value = {};

class Value {
public:
  Value() : value_(inox_undefined_value()) {}

  Value(inox_value value) : value_(value) {
    inox_retain(value_);
  }

  Value(AdoptValue, inox_value value) : value_(value) {}

  Value(const Value& other) : value_(other.value_) {
    inox_retain(value_);
  }

  Value(Value&& other) noexcept : value_(other.value_) {
    other.value_ = inox_undefined_value();
  }

  Value& operator=(const Value& other) {
    if (this != &other) {
      inox_retain(other.value_);
      inox_release(value_);
      value_ = other.value_;
    }

    return *this;
  }

  Value& operator=(Value&& other) noexcept {
    if (this != &other) {
      inox_release(value_);
      value_ = other.value_;
      other.value_ = inox_undefined_value();
    }

    return *this;
  }

  Value& operator=(inox_value value) {
    inox_retain(value);
    inox_release(value_);
    value_ = value;

    return *this;
  }

  ~Value() {
    inox_release(value_);
  }

  inox_value raw() const {
    return value_;
  }

  operator inox_value() const {
    return value_;
  }

  inox_value* out() {
    reset();
    return &value_;
  }

  void reset() {
    inox_release(value_);
    value_ = inox_undefined_value();
  }

  inox_value release() {
    inox_value value = value_;
    value_ = inox_undefined_value();

    return value;
  }

  inox_status copy_to(inox_value* out) const {
    if (out == nullptr) {
      return INOX_ERR_TYPE;
    }

    *out = value_;
    inox_retain(*out);
    return INOX_OK;
  }

private:
  inox_value value_;
};

inline Value adopt(inox_value value) {
  return Value(adopt_value, value);
}

inline Value string(const char* bytes, size_t len) {
  inox_value value = inox_undefined_value();

  if (bytes == nullptr) {
    return Value();
  }

  if (inox_string_from_literal(&inox_default_allocator, bytes, len, &value) != INOX_OK) {
    return Value();
  }

  return adopt(value);
}

inline Value string(StringView view) {
  return string(view.bytes, view.len);
}

inline Value string(const char* bytes) {
  if (bytes == nullptr) {
    return Value();
  }

  return string(bytes, strlen(bytes));
}

} // namespace inox

#endif
