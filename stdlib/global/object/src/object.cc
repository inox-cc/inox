#include "inox/object_global.h"

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

class Object Object;
