#ifndef INOX_CLASS_DESCRIPTOR_H
#define INOX_CLASS_DESCRIPTOR_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include "inox/value.h"

typedef inox_status (*inox_class_field_read_fn)(const void* instance, uint32_t index, inox_value* out);
typedef inox_status (*inox_class_instance_copy_fn)(inox_allocator* allocator, const void* instance, void** out);
typedef void (*inox_class_instance_destroy_fn)(inox_allocator* allocator, void* instance);

enum {
  INOX_CLASS_FIELD_READONLY = 1u << 0,
  INOX_CLASS_FIELD_OPTIONAL = 1u << 1,
  INOX_CLASS_FIELD_NULLABLE = 1u << 2,
  INOX_CLASS_FIELD_WEAK = 1u << 3,
  INOX_CLASS_FIELD_ENUMERABLE = 1u << 4
};

typedef struct inox_class_field_descriptor {
  const char* name;
  const char* value_type;
  const char* declared_type;
  const char* ownership;
  uint32_t flags;
} inox_class_field_descriptor;

typedef struct inox_class_descriptor {
  const char* name;
  uint32_t field_count;
  const inox_class_field_descriptor* fields;
  inox_class_field_read_fn read_field;
  inox_class_instance_copy_fn copy_instance;
  inox_class_instance_destroy_fn destroy_instance;
} inox_class_descriptor;

typedef struct inox_class_instance_ref {
  inox_ref header;
  const inox_class_descriptor* descriptor;
  const void* instance;
  bool owns_instance;
} inox_class_instance_ref;

inox_status inox_class_instance_ref_new(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);

inox_status inox_class_instance_ref_copy(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);

#ifdef __cplusplus
}
#endif

#endif
