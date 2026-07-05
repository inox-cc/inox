#include "inox/array.h"

#include <utility>

Array::Array() : inox::Value() {}

Array::Array(inox_value value) : inox::Value(value) {}

Array::Array(const inox::Value& value) : inox::Value(value) {}

Array::Array(inox::Value&& value) : inox::Value(std::move(value)) {}

Array::Array(inox::AdoptValue, inox_value value) : inox::Value(inox::adopt_value, value) {}

bool Array::valid() const {
  inox_value value = inox::Value::raw();

  return value.tag == INOX_TAG_ARRAY && value.as.ref != nullptr;
}

inox::String Array::join(inox::StringView separator) const {
  if (!valid()) {
    return inox::String();
  }

  inox_value out = inox_undefined_value();

  if (inox_array_join(&inox_default_allocator, inox::Value::raw(), separator.bytes, separator.len, &out) != INOX_OK) {
    return inox::String();
  }

  return inox::String(inox::adopt_value, out);
}

bool Array::isArray(inox_value value) const {
  return value.tag == INOX_TAG_ARRAY;
}

bool Array::isArray(const inox::Value& value) const {
  return isArray(value.raw());
}

inox_array* Array::raw(inox_value value) const {
  if (!isArray(value) || value.as.ref == nullptr) {
    return nullptr;
  }

  return (inox_array*)value.as.ref;
}

inox_array* Array::raw(const inox::Value& value) const {
  return raw(value.raw());
}

void Array::throwNotIterable() const {
  inox::throw_value(inox::string("TypeError: value is not iterable"));
}

namespace inox {

ArrayClass String::split(StringView separator) const {
  if (!valid()) {
    return ArrayClass();
  }

  inox_value out = inox_undefined_value();

  if (inox_string_split_parts(&inox_default_allocator, bytes(), length(), separator.bytes, separator.len, &out) != INOX_OK) {
    return ArrayClass();
  }

  return ArrayClass(inox::adopt_value, out);
}

} // namespace inox
