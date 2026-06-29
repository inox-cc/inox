#ifndef INOX_CLASS_DESCRIPTOR_H
#define INOX_CLASS_DESCRIPTOR_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

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
} inox_class_descriptor;

#ifdef __cplusplus
}
#endif

#endif
