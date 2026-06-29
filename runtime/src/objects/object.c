#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/object.h"
#include "inox/string.h"
#ifdef INOX_ENABLE_WEAK
#include "inox/weak.h"
#endif

static void inox_object_dispose_ref(inox_ref* ref);

static bool inox_object_field_is_weak(const inox_object* object, uint32_t index) {
  return object != 0 && index < object->shape->field_count && (object->shape->fields[index].flags & INOX_FIELD_WEAK) != 0;
}

static void inox_object_init_field(inox_object* object, uint32_t index) {
#ifdef INOX_ENABLE_WEAK
  if (inox_object_field_is_weak(object, index)) {
    object->fields[index].weak = inox_weak_null();
    return;
  }
#endif

  object->fields[index].strong = inox_undefined_value();
}

static void inox_object_release_field(inox_object* object, uint32_t index) {
#ifdef INOX_ENABLE_WEAK
  if (inox_object_field_is_weak(object, index)) {
    inox_weak_release(object->fields[index].weak);
    object->fields[index].weak = inox_weak_null();
    return;
  }
#endif

  inox_release(object->fields[index].strong);
  object->fields[index].strong = inox_undefined_value();
}

static inox_status inox_object_write_field(inox_object* object, uint32_t index, inox_value value) {
#ifdef INOX_ENABLE_WEAK
  if (inox_object_field_is_weak(object, index)) {
    inox_weak_ref weak = inox_weak_null();
    inox_status status = inox_weak_from_value(value, &weak);

    if (status != INOX_OK) {
      return status;
    }

    inox_weak_release(object->fields[index].weak);
    object->fields[index].weak = weak;
    return INOX_OK;
  }
#else
  if (inox_object_field_is_weak(object, index)) {
    return INOX_ERR_UNSUPPORTED;
  }
#endif

  inox_retain(value);
  inox_release(object->fields[index].strong);
  object->fields[index].strong = value;

  return INOX_OK;
}

inox_status inox_object_new(inox_allocator* allocator, const inox_shape* shape, inox_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || shape == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  const size_t size = sizeof(inox_object) + sizeof(inox_object_field) * shape->field_count;
  inox_object* object = allocator->alloc(allocator->user, size, _Alignof(inox_object));

  if (object == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  object->header.kind = INOX_REF_OBJECT;
  object->header.ref_count = 1;
  object->header.flags = 0;
  object->header.size = size;
  object->header.align = _Alignof(inox_object);
  object->header.allocator = allocator;
  object->header.dispose = inox_object_dispose_ref;
  inox_ref_init_weak(&object->header);
  object->shape = shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    inox_object_init_field(object, index);
  }

  out->tag = INOX_TAG_OBJECT;
  out->as.ref = &object->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_OBJECT);
#endif

  return INOX_OK;
}

inox_status inox_object_get_known(inox_value object, uint32_t index, inox_value* out) {
  if (out == 0 || object.tag != INOX_TAG_OBJECT || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

#ifdef INOX_ENABLE_WEAK
  if (inox_object_field_is_weak(instance, index)) {
    return inox_weak_upgrade(instance->fields[index].weak, out);
  }
#else
  if (inox_object_field_is_weak(instance, index)) {
    *out = inox_undefined_value();
    return INOX_ERR_UNSUPPORTED;
  }
#endif

  *out = instance->fields[index].strong;
  inox_retain(*out);

  return INOX_OK;
}

inox_status inox_object_init_known(inox_value object, uint32_t index, inox_value value) {
  if (object.tag != INOX_TAG_OBJECT || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    return INOX_ERR_FIELD;
  }

  return inox_object_write_field(instance, index, value);
}

inox_status inox_object_set_known(inox_value object, uint32_t index, inox_value value) {
  if (object.tag != INOX_TAG_OBJECT || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    return INOX_ERR_FIELD;
  }

  if ((instance->shape->fields[index].flags & INOX_FIELD_READONLY) != 0) {
    return INOX_ERR_READONLY;
  }

  return inox_object_write_field(instance, index, value);
}

inox_status inox_object_get(inox_value object, const char* name, size_t len, inox_value* out) {
  if (out == 0 || object.tag != INOX_TAG_OBJECT || object.as.ref == 0 || name == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;
  const inox_shape* shape = instance->shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    const char* field = shape->fields[index].name;

    if (strlen(field) == len && strncmp(field, name, len) == 0) {
      return inox_object_get_known(object, index, out);
    }
  }

  *out = inox_undefined_value();

  return INOX_ERR_FIELD;
}

void inox_object_dispose_fields(inox_object* object) {
  if (object == 0 || object->shape == 0) {
    return;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    inox_object_release_field(object, index);
  }
}

static void inox_object_dispose_ref(inox_ref* ref) {
  if (ref == 0) {
    return;
  }

  inox_object* object = (inox_object*)ref;

  inox_object_dispose_fields(object);

  if (
    (object->header.flags & INOX_OBJECT_OWNED_SHAPE) == 0 || object->header.allocator == 0 ||
    object->header.allocator->free == 0 || object->shape == 0
  ) {
    return;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    const char* name = object->shape->fields[index].name;

    if (name != 0) {
      object->header.allocator->free(object->header.allocator->user, (void*)name, strlen(name) + 1, _Alignof(char));
    }
  }

  if (object->shape->fields != 0) {
    object->header.allocator->free(
      object->header.allocator->user, (void*)object->shape->fields,
      sizeof(inox_field_info) * object->shape->field_count, _Alignof(inox_field_info)
    );
  }

  object->header.allocator->free(
    object->header.allocator->user, (void*)object->shape, sizeof(inox_shape), _Alignof(inox_shape)
  );
}

inox_status inox_object_set(inox_value object, const char* name, size_t len, inox_value value) {
  if (object.tag != INOX_TAG_OBJECT || object.as.ref == 0 || name == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;
  const inox_shape* shape = instance->shape;

  for (uint32_t index = 0; index < shape->field_count; index += 1) {
    const char* field = shape->fields[index].name;

    if (strlen(field) == len && strncmp(field, name, len) == 0) {
      return inox_object_set_known(object, index, value);
    }
  }

  return INOX_ERR_FIELD;
}

static inox_status inox_array_object_values(inox_allocator* allocator, inox_value array, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_new(allocator, instance->len, out);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < instance->len; index += 1) {
    inox_value value = inox_undefined_value();

    status = inox_array_get(array, index, &value);

    if (status == INOX_OK) {
      status = inox_array_set(*out, index, value);
    }

    inox_release(value);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }
  }

  return INOX_OK;
}

static inox_status inox_array_object_keys(inox_allocator* allocator, inox_value array, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_new(allocator, instance->len, out);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < instance->len; index += 1) {
    char key_bytes[64];
    int key_len = snprintf(key_bytes, sizeof(key_bytes), "%zu", index);
    inox_value key = inox_undefined_value();

    if (key_len < 0 || (size_t)key_len >= sizeof(key_bytes)) {
      status = INOX_ERR_TYPE;
    } else {
      status = inox_string_from_literal(allocator, key_bytes, (size_t)key_len, &key);
    }

    if (status == INOX_OK) {
      status = inox_array_set(*out, index, key);
    }

    inox_release(key);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }
  }

  return INOX_OK;
}

static inox_status inox_array_object_entries(inox_allocator* allocator, inox_value array, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  inox_status status = inox_array_new(allocator, instance->len, out);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < instance->len; index += 1) {
    char key_bytes[64];
    int key_len = snprintf(key_bytes, sizeof(key_bytes), "%zu", index);
    inox_value pair = inox_undefined_value();
    inox_value key = inox_undefined_value();
    inox_value value = inox_undefined_value();

    if (key_len < 0 || (size_t)key_len >= sizeof(key_bytes)) {
      status = INOX_ERR_TYPE;
    } else {
      status = inox_array_new(allocator, 2, &pair);
    }

    if (status == INOX_OK) {
      status = inox_string_from_literal(allocator, key_bytes, (size_t)key_len, &key);
    }

    if (status == INOX_OK) {
      status = inox_array_get(array, index, &value);
    }

    if (status == INOX_OK) {
      status = inox_array_set(pair, 0, key);
    }

    if (status == INOX_OK) {
      status = inox_array_set(pair, 1, value);
    }

    if (status == INOX_OK) {
      status = inox_array_set(*out, index, pair);
    }

    inox_release(value);
    inox_release(key);
    inox_release(pair);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }
  }

  return INOX_OK;
}

static bool inox_class_descriptor_is_valid(const inox_class_descriptor* descriptor) {
  if (descriptor == 0 || descriptor->read_field == 0) {
    return false;
  }

  return descriptor->field_count == 0 || descriptor->fields != 0;
}

static uint32_t inox_class_descriptor_enumerable_count(const inox_class_descriptor* descriptor) {
  uint32_t count = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    if ((descriptor->fields[index].flags & INOX_CLASS_FIELD_ENUMERABLE) != 0) {
      count += 1;
    }
  }

  return count;
}

inox_status inox_class_instance_keys(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
) {
  if (allocator == 0 || out == 0 || instance == 0 || !inox_class_descriptor_is_valid(descriptor)) {
    return INOX_ERR_TYPE;
  }

  uint32_t field_count = inox_class_descriptor_enumerable_count(descriptor);
  inox_status status = inox_array_new(allocator, field_count, out);

  if (status != INOX_OK) {
    return status;
  }

  uint32_t output_index = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    const char* name = field->name == 0 ? "" : field->name;
    inox_value key = inox_undefined_value();

    status = inox_string_from_literal(allocator, name, strlen(name), &key);

    if (status == INOX_OK) {
      status = inox_array_set(*out, output_index, key);
    }

    inox_release(key);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }

    output_index += 1;
  }

  return INOX_OK;
}

inox_status inox_class_instance_values(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
) {
  if (allocator == 0 || out == 0 || instance == 0 || !inox_class_descriptor_is_valid(descriptor)) {
    return INOX_ERR_TYPE;
  }

  uint32_t field_count = inox_class_descriptor_enumerable_count(descriptor);
  inox_status status = inox_array_new(allocator, field_count, out);

  if (status != INOX_OK) {
    return status;
  }

  uint32_t output_index = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    inox_value value = inox_undefined_value();
    status = descriptor->read_field(instance, index, &value);

    if (status == INOX_OK) {
      status = inox_array_set(*out, output_index, value);
    }

    inox_release(value);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }

    output_index += 1;
  }

  return INOX_OK;
}

inox_status inox_class_instance_entries(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
) {
  if (allocator == 0 || out == 0 || instance == 0 || !inox_class_descriptor_is_valid(descriptor)) {
    return INOX_ERR_TYPE;
  }

  uint32_t field_count = inox_class_descriptor_enumerable_count(descriptor);
  inox_status status = inox_array_new(allocator, field_count, out);

  if (status != INOX_OK) {
    return status;
  }

  uint32_t output_index = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    const char* name = field->name == 0 ? "" : field->name;
    inox_value pair = inox_undefined_value();
    inox_value key = inox_undefined_value();
    inox_value value = inox_undefined_value();

    status = inox_array_new(allocator, 2, &pair);

    if (status == INOX_OK) {
      status = inox_string_from_literal(allocator, name, strlen(name), &key);
    }

    if (status == INOX_OK) {
      status = descriptor->read_field(instance, index, &value);
    }

    if (status == INOX_OK) {
      status = inox_array_set(pair, 0, key);
    }

    if (status == INOX_OK) {
      status = inox_array_set(pair, 1, value);
    }

    if (status == INOX_OK) {
      status = inox_array_set(*out, output_index, pair);
    }

    inox_release(value);
    inox_release(key);
    inox_release(pair);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }

    output_index += 1;
  }

  return INOX_OK;
}

inox_status inox_object_keys(inox_allocator* allocator, inox_value object, inox_value* out) {
  if (allocator == 0 || out == 0 || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (object.tag == INOX_TAG_ARRAY) {
    return inox_array_object_keys(allocator, object, out);
  }

  if (object.tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;
  inox_status status = inox_array_new(allocator, instance->shape->field_count, out);

  if (status != INOX_OK) {
    return status;
  }

  for (uint32_t index = 0; index < instance->shape->field_count; index += 1) {
    const char* name = instance->shape->fields[index].name == 0 ? "" : instance->shape->fields[index].name;
    inox_value key = inox_undefined_value();

    status = inox_string_from_literal(allocator, name, strlen(name), &key);

    if (status == INOX_OK) {
      status = inox_array_set(*out, index, key);
    }

    inox_release(key);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }
  }

  return INOX_OK;
}

inox_status inox_object_values(inox_allocator* allocator, inox_value object, inox_value* out) {
  if (allocator == 0 || out == 0 || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (object.tag == INOX_TAG_ARRAY) {
    return inox_array_object_values(allocator, object, out);
  }

  if (object.tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;
  inox_status status = inox_array_new(allocator, instance->shape->field_count, out);

  if (status != INOX_OK) {
    return status;
  }

  for (uint32_t index = 0; index < instance->shape->field_count; index += 1) {
    inox_value value = inox_undefined_value();

    status = inox_object_get_known(object, index, &value);

    if (status == INOX_OK) {
      status = inox_array_set(*out, index, value);
    }

    inox_release(value);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }
  }

  return INOX_OK;
}

inox_status inox_object_entries(inox_allocator* allocator, inox_value object, inox_value* out) {
  if (allocator == 0 || out == 0 || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (object.tag == INOX_TAG_ARRAY) {
    return inox_array_object_entries(allocator, object, out);
  }

  if (object.tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  inox_object* instance = (inox_object*)object.as.ref;
  inox_status status = inox_array_new(allocator, instance->shape->field_count, out);

  if (status != INOX_OK) {
    return status;
  }

  for (uint32_t index = 0; index < instance->shape->field_count; index += 1) {
    const char* name = instance->shape->fields[index].name == 0 ? "" : instance->shape->fields[index].name;
    inox_value pair = inox_undefined_value();
    inox_value key = inox_undefined_value();
    inox_value value = inox_undefined_value();

    status = inox_array_new(allocator, 2, &pair);

    if (status == INOX_OK) {
      status = inox_string_from_literal(allocator, name, strlen(name), &key);
    }

    if (status == INOX_OK) {
      status = inox_object_get_known(object, index, &value);
    }

    if (status == INOX_OK) {
      status = inox_array_set(pair, 0, key);
    }

    if (status == INOX_OK) {
      status = inox_array_set(pair, 1, value);
    }

    if (status == INOX_OK) {
      status = inox_array_set(*out, index, pair);
    }

    inox_release(value);
    inox_release(key);
    inox_release(pair);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }
  }

  return INOX_OK;
}
