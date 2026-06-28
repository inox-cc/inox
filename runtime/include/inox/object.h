#ifndef INOX_OBJECT_H
#define INOX_OBJECT_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"
#include "inox/value.h"
#include "inox/weak.h"

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
inox_status inox_object_entries(inox_allocator* allocator, inox_value object, inox_value* out);
inox_status inox_object_keys(inox_allocator* allocator, inox_value object, inox_value* out);
inox_status inox_object_values(inox_allocator* allocator, inox_value object, inox_value* out);
void inox_object_dispose_fields(inox_object* object);

#ifdef __cplusplus
}
#endif

#endif
