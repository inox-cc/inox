#ifndef INOX_OBJECT_H
#define INOX_OBJECT_H

#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/class_descriptor.h"
#include "inox/value.h"
#include "inox/weak.h"

#ifdef __cplusplus
extern "C" {
#endif

enum { INOX_FIELD_READONLY = 1u << 0, INOX_OBJECT_OWNED_SHAPE = 1u << 1, INOX_FIELD_WEAK = 1u << 2 };

typedef struct inox_field_info {
  const char* name;
  uint32_t flags;
} inox_field_info;

typedef struct inox_shape {
  uint32_t field_count;
  const inox_field_info* fields;
} inox_shape;

typedef union inox_object_field {
  inox_value strong;
  inox_weak_ref weak;
} inox_object_field;

typedef struct inox_object {
  inox_ref header;
  const inox_shape* shape;
  inox_object_field fields[];
} inox_object;

inox_status inox_object_new(inox_allocator* allocator, const inox_shape* shape, inox_value* out);
inox_status inox_object_get_known(inox_value object, uint32_t index, inox_value* out);
inox_status inox_object_init_known(inox_value object, uint32_t index, inox_value value);
inox_status inox_object_set_known(inox_value object, uint32_t index, inox_value value);
inox_status inox_object_get(inox_value object, const char* name, size_t len, inox_value* out);
inox_status inox_object_set(inox_value object, const char* name, size_t len, inox_value value);
inox_status inox_object_value_at(inox_value object, size_t index, inox_value* out);
inox_status inox_object_entry_at(inox_allocator* allocator, inox_value object, size_t index, inox_value* out);
inox_status inox_object_entries(inox_allocator* allocator, inox_value object, inox_value* out);
inox_status inox_object_keys(inox_allocator* allocator, inox_value object, inox_value* out);
inox_status inox_object_values(inox_allocator* allocator, inox_value object, inox_value* out);
inox_status inox_class_instance_entries(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);
inox_status inox_class_instance_keys(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);
inox_status inox_class_instance_values(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);
void inox_object_dispose_fields(inox_object* object);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
#include <stdio.h>
#include "inox/loop.h"
#include "inox/string.h"

namespace inox {

inline inox_status object_get(inox_value object, const char* name, size_t len, Value& out) {
  return inox_object_get(object, name, len, out.out());
}

inline inox_status object_get_known(inox_value object, uint32_t index, Value& out) {
  return inox_object_get_known(object, index, out.out());
}

inline inox_status object_value_at(inox_value object, size_t index, Value& out) {
  return inox_object_value_at(object, index, out.out());
}

inline inox_status object_entry_at(inox_value object, size_t index, Value& out) {
  return inox_object_entry_at(&inox_default_allocator, object, index, out.out());
}

inline Value finish_object_index_read(inox_status status, inox_value out, const char* message) {
  if (status == INOX_OK) {
    return adopt(out);
  }

  inox_release(out);

  if (status == INOX_ERR_FIELD) {
    return Value();
  }

  throw_value(String(message));

  return Value();
}

inline Value object_value_at(inox_value object, size_t index) {
  if (thrown()) {
    return Value();
  }

  inox_value out = inox_undefined_value();

  return finish_object_index_read(
    inox_object_value_at(object, index, &out),
    out,
    "Object.values index failed"
  );
}

inline Value object_value_at(const Value& object, size_t index) {
  return object_value_at(object.raw(), index);
}

inline Value object_entry_at(inox_value object, size_t index) {
  if (thrown()) {
    return Value();
  }

  inox_value out = inox_undefined_value();

  return finish_object_index_read(
    inox_object_entry_at(&inox_default_allocator, object, index, &out),
    out,
    "Object.entries index failed"
  );
}

inline Value object_entry_at(const Value& object, size_t index) {
  return object_entry_at(object.raw(), index);
}

inline inox_status object_entries(inox_value object, Value& out) {
  return inox_object_entries(&inox_default_allocator, object, out.out());
}

inline inox_status object_keys(inox_value object, Value& out) {
  return inox_object_keys(&inox_default_allocator, object, out.out());
}

inline inox_status object_values(inox_value object, Value& out) {
  return inox_object_values(&inox_default_allocator, object, out.out());
}

inline void throw_property_read_type_error(StringView name, const char* receiver) {
  char message[192];
  int written = snprintf(
    message,
    sizeof(message),
    "TypeError: Cannot read properties of %s (reading '%.*s')",
    receiver,
    (int)name.len,
    name.bytes
  );

  if (written > 0) {
    throw_value(String(message));
    return;
  }

  throw_value(String("TypeError: Cannot read property"));
}

inline Value get(inox_value object, StringView name) {
  if (thrown()) {
    return Value();
  }

  if (object.tag == INOX_TAG_NULL) {
    throw_property_read_type_error(name, "null");
    return Value();
  }

  if (object.tag == INOX_TAG_ARRAY) {
    return Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_object_get(object, name.bytes, name.len, &out);

  if (status == INOX_OK) {
    return adopt(out);
  }

  inox_release(out);

  if (status == INOX_ERR_FIELD) {
    return Value();
  }

  return Value();
}

inline Value get(const Value& object, StringView name) {
  return get(object.raw(), name);
}

inline Value get(inox_value object, const char* name) {
  return get(object, StringView(name));
}

inline Value get(const Value& object, const char* name) {
  return get(object.raw(), name);
}

} // namespace inox

class Object {
private:
  using RuntimeObjectMethod = inox_status (*)(inox_allocator*, inox_value, inox_value*);
  using ClassInstanceMethod = inox_status (*)(
    inox_allocator*,
    const inox_class_descriptor*,
    const void*,
    inox_value*
  );

  static inox::Value finish(inox_status status, inox_value out, const char* message) {
    if (status == INOX_OK) {
      return inox::adopt(out);
    }

    inox_release(out);
    inox::throw_value(inox::String(message));

    return inox::Value();
  }

  static inox::Value collect(inox_value value, RuntimeObjectMethod method, const char* message) {
    if (inox::thrown()) {
      return inox::Value();
    }

    inox_value out = inox_undefined_value();

    return finish(method(&inox_default_allocator, value, &out), out, message);
  }

  static inox::Value collect(
    const inox_class_descriptor* descriptor,
    const void* instance,
    ClassInstanceMethod method,
    const char* message
  ) {
    if (inox::thrown()) {
      return inox::Value();
    }

    inox_value out = inox_undefined_value();

    return finish(method(&inox_default_allocator, descriptor, instance, &out), out, message);
  }

public:
  inox::Value keys(inox_value value) const {
    return collect(value, inox_object_keys, "Object.keys failed");
  }

  inox::Value keys(const inox::Value& value) const {
    return keys(value.raw());
  }

  inox::Value keys(const inox_class_descriptor& descriptor, const void* instance) const {
    return collect(&descriptor, instance, inox_class_instance_keys, "Object.keys failed");
  }

  inox::Value values(inox_value value) const {
    return collect(value, inox_object_values, "Object.values failed");
  }

  inox::Value values(const inox::Value& value) const {
    return values(value.raw());
  }

  inox::Value values(const inox_class_descriptor& descriptor, const void* instance) const {
    return collect(&descriptor, instance, inox_class_instance_values, "Object.values failed");
  }

  inox::Value entries(inox_value value) const {
    return collect(value, inox_object_entries, "Object.entries failed");
  }

  inox::Value entries(const inox::Value& value) const {
    return entries(value.raw());
  }

  inox::Value entries(const inox_class_descriptor& descriptor, const void* instance) const {
    return collect(&descriptor, instance, inox_class_instance_entries, "Object.entries failed");
  }
};

inline Object Object;
#endif

#endif
