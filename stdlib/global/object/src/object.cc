#include "inox/object_global.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>

#include "inox/loop.h"
#include "inox/object.h"
#include "inox/string.h"

namespace {

using ObjectOperation = inox_status (*)(inox_allocator*, inox_value, inox_value*);
using ClassInstanceOperation = inox_status (*)(
  inox_allocator*,
  const inox_class_descriptor*,
  const void*,
  inox_value*
);

Array object_result(inox_status status, inox_value value, const char* message) {
  if (status == INOX_OK) {
    return Array(inox::adopt(value));
  }

  inox_release(value);
  inox::throw_value(inox::String(message));
  return Array();
}

Array object_operation(
  inox_value value,
  ObjectOperation object_operation,
  ClassInstanceOperation class_instance_operation,
  const char* message
) {
  if (inox::thrown()) {
    return Array();
  }

  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_TYPE;

  if (value.tag == INOX_TAG_CLASS_INSTANCE && value.as.ref != nullptr) {
    const auto* instance = reinterpret_cast<const inox_class_instance_ref*>(value.as.ref);
    status = class_instance_operation(
      &inox_default_allocator,
      instance->descriptor,
      instance->instance,
      &out
    );
  } else {
    status = object_operation(&inox_default_allocator, value, &out);
  }

  return object_result(status, out, message);
}

bool property_equals(inox::StringView property, const char* expected) {
  const size_t length = std::strlen(expected);
  return property.len == length && std::memcmp(property.bytes, expected, length) == 0;
}

bool property_array_index(inox::StringView property, size_t* result) {
  if (result == nullptr || property.bytes == nullptr || property.len == 0) {
    return false;
  }

  if (property.len > 1 && property.bytes[0] == '0') {
    return false;
  }

  size_t value = 0;

  for (size_t index = 0; index < property.len; index += 1) {
    const char digit = property.bytes[index];

    if (digit < '0' || digit > '9') {
      return false;
    }

    const size_t number = static_cast<size_t>(digit - '0');

    if (value > (std::numeric_limits<size_t>::max() - number) / 10) {
      return false;
    }

    value = value * 10 + number;
  }

  *result = value;
  return true;
}

bool named_field_exists(const inox_field_info* fields, uint32_t count, inox::StringView property) {
  for (uint32_t index = 0; index < count; index += 1) {
    const char* name = fields[index].name;

    if (name != nullptr && property_equals(property, name)) {
      return true;
    }
  }

  return false;
}

bool named_class_field_exists(
  const inox_class_field_descriptor* fields,
  uint32_t count,
  inox::StringView property
) {
  for (uint32_t index = 0; index < count; index += 1) {
    const char* name = fields[index].name;

    if (name != nullptr && property_equals(property, name)) {
      return true;
    }
  }

  return false;
}

} // namespace

Array Object::keys(inox_value value) const {
  return object_operation(value, inox_object_keys, inox_class_instance_keys, "Object.keys failed");
}

Array Object::values(inox_value value) const {
  return object_operation(value, inox_object_values, inox_class_instance_values, "Object.values failed");
}

Array Object::entries(inox_value value) const {
  return object_operation(value, inox_object_entries, inox_class_instance_entries, "Object.entries failed");
}

bool Object::hasOwn(inox_value value, inox::StringView property) const {
  if (inox::thrown()) {
    return false;
  }

  if (value.tag == INOX_TAG_OBJECT && value.as.ref != nullptr) {
    const auto* object = reinterpret_cast<const inox_object*>(value.as.ref);
    return named_field_exists(object->shape->fields, object->shape->field_count, property);
  }

  if (value.tag == INOX_TAG_CLASS_INSTANCE && value.as.ref != nullptr) {
    const auto* instance = reinterpret_cast<const inox_class_instance_ref*>(value.as.ref);
    const inox_class_descriptor* descriptor = instance->descriptor;

    if (descriptor == nullptr || (descriptor->field_count > 0 && descriptor->fields == nullptr)) {
      inox::fatal("Object.hasOwn class descriptor invariant failed");
    }

    return named_class_field_exists(descriptor->fields, descriptor->field_count, property);
  }

  if (value.tag == INOX_TAG_ARRAY && value.as.ref != nullptr) {
    if (property_equals(property, "length")) {
      return true;
    }

    size_t index = 0;
    return property_array_index(property, &index) && index < Array(inox::Value(value)).length();
  }

  if (value.tag == INOX_TAG_STRING && value.as.ref != nullptr) {
    if (property_equals(property, "length")) {
      return true;
    }

    size_t index = 0;
    return property_array_index(property, &index) &&
      index < inox::String(inox::Value(value)).codeUnitLength();
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    inox::throw_value(inox::String("TypeError: Object.hasOwn called on null or undefined"));
  }

  return false;
}

bool Object::hasOwn(inox_value value, double property) const {
  char buffer[64];
  int length = std::snprintf(buffer, sizeof(buffer), "%.17g", property);

  if (length < 0 || static_cast<size_t>(length) >= sizeof(buffer) || !std::isfinite(property)) {
    return false;
  }

  return hasOwn(value, inox::StringView(buffer, static_cast<size_t>(length)));
}

class Object Object;
