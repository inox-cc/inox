#include "inox/callback.h"

#include <new>
#include <utility>
#include <vector>

#include "inox/loop.h"
#include "inox/string.h"

namespace inox {

Callback::Callback() : value_() {}

Callback::Callback(inox_value value) : value_(value) {}

Callback::Callback(const Value& value) : value_(value) {}

Callback::Callback(Value&& value) : value_(std::move(value)) {}

Callback::Callback(const Callback& other) : value_(other.value_) {}

Callback::Callback(Callback&& other) noexcept : value_(std::move(other.value_)) {}

Callback& Callback::operator=(const Callback& other) {
  value_ = other.value_;
  return *this;
}

Callback& Callback::operator=(Callback&& other) noexcept {
  value_ = std::move(other.value_);
  return *this;
}

Callback::~Callback() {}

bool Callback::valid() const {
  return value_.tag == INOX_TAG_FUNCTION && value_.as.ref != nullptr &&
         value_.as.ref->kind == INOX_REF_FUNCTION;
}

Value Callback::call() const {
  return call(std::span<const Value>());
}

Value Callback::call(std::span<const Value> args) const {
  if (!valid()) {
    throw_value(String("TypeError: callback is not callable"));
    return Value();
  }

  std::vector<inox_value> raw_args;

  try {
    raw_args.reserve(args.size());

    for (const Value& argument : args) {
      raw_args.push_back(argument.raw());
    }
  } catch (const std::bad_alloc&) {
    throw_value(String("TypeError: callback argument allocation failed"));
    return Value();
  }

  Value result;
  const inox_value* data = raw_args.empty() ? nullptr : raw_args.data();
  inox_status status = inox_callback_call(value_.raw(), data, raw_args.size(), result.out());

  if (status != INOX_OK) {
    if (!thrown()) {
      throw_value(String("callback invocation failed"));
    }

    return Value();
  }

  return result;
}

} // namespace inox
