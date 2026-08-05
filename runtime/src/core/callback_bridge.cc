#include "inox/callback.h"

#include <memory>
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

bool Callback::same(const Callback& other) const {
  return value_.tag == INOX_TAG_FUNCTION && other.value_.tag == INOX_TAG_FUNCTION &&
         value_.as.ref != nullptr && value_.as.ref == other.value_.as.ref;
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

SharedNumberBox::SharedNumberBox() : box_(nullptr) {}

SharedNumberBox::SharedNumberBox(inox_shared_number_box* box) : box_(box) {
  inox_shared_number_box_retain(box_);
}

SharedNumberBox::SharedNumberBox(const SharedNumberBox& other) : box_(other.box_) {
  inox_shared_number_box_retain(box_);
}

SharedNumberBox::SharedNumberBox(SharedNumberBox&& other) noexcept : box_(other.box_) {
  other.box_ = nullptr;
}

SharedNumberBox& SharedNumberBox::operator=(const SharedNumberBox& other) {
  if (this != std::addressof(other)) {
    inox_shared_number_box_retain(other.box_);
    inox_shared_number_box_release(box_);
    box_ = other.box_;
  }

  return *this;
}

SharedNumberBox& SharedNumberBox::operator=(SharedNumberBox&& other) noexcept {
  if (this != std::addressof(other)) {
    inox_shared_number_box_release(box_);
    box_ = other.box_;
    other.box_ = nullptr;
  }

  return *this;
}

SharedNumberBox::~SharedNumberBox() {
  inox_shared_number_box_release(box_);
}

inox_shared_number_box* SharedNumberBox::operator->() const {
  return box_;
}

bool SharedNumberBox::valid() const {
  return box_ != nullptr;
}

SharedValueBox::SharedValueBox() : box_(nullptr) {}

SharedValueBox::SharedValueBox(inox_shared_value_box* box) : box_(box) {
  inox_shared_value_box_retain(box_);
}

SharedValueBox::SharedValueBox(const SharedValueBox& other) : box_(other.box_) {
  inox_shared_value_box_retain(box_);
}

SharedValueBox::SharedValueBox(SharedValueBox&& other) noexcept : box_(other.box_) {
  other.box_ = nullptr;
}

SharedValueBox& SharedValueBox::operator=(const SharedValueBox& other) {
  if (this != std::addressof(other)) {
    inox_shared_value_box_retain(other.box_);
    inox_shared_value_box_release(box_);
    box_ = other.box_;
  }

  return *this;
}

SharedValueBox& SharedValueBox::operator=(SharedValueBox&& other) noexcept {
  if (this != std::addressof(other)) {
    inox_shared_value_box_release(box_);
    box_ = other.box_;
    other.box_ = nullptr;
  }

  return *this;
}

SharedValueBox::~SharedValueBox() {
  inox_shared_value_box_release(box_);
}

inox_shared_value_box* SharedValueBox::operator->() const {
  return box_;
}

bool SharedValueBox::valid() const {
  return box_ != nullptr;
}

} // namespace inox
