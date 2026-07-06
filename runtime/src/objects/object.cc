#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/string.h"
#ifdef INOX_ENABLE_WEAK
#include "inox/weak.h"
#endif

static void inox_object_dispose_ref(inox_ref* ref);
static bool inox_class_descriptor_is_valid(const inox_class_descriptor* descriptor);

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
  inox_object* object = (inox_object*)allocator->alloc(allocator->user, size, alignof(inox_object));

  if (object == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  object->header.kind = INOX_REF_OBJECT;
  object->header.ref_count = 1;
  object->header.flags = 0;
  object->header.size = size;
  object->header.align = alignof(inox_object);
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
  inox::debugMemory.recordRefCreated(INOX_REF_OBJECT);
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
  if (out == 0 || object.as.ref == 0 || name == 0) {
    return INOX_ERR_TYPE;
  }

  if (object.tag == INOX_TAG_CLASS_INSTANCE) {
    inox_class_instance_ref* ref = (inox_class_instance_ref*)object.as.ref;
    const inox_class_descriptor* descriptor = ref->descriptor;

    if (ref->instance == 0 || !inox_class_descriptor_is_valid(descriptor)) {
      return INOX_ERR_TYPE;
    }

    for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
      const char* field = descriptor->fields[index].name;

      if (strlen(field) == len && strncmp(field, name, len) == 0) {
        return descriptor->read_field(ref->instance, index, out);
      }
    }

    *out = inox_undefined_value();

    return INOX_ERR_FIELD;
  }

  if (object.tag != INOX_TAG_OBJECT) {
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
      object->header.allocator->free(object->header.allocator->user, (void*)name, strlen(name) + 1, alignof(char));
    }
  }

  if (object->shape->fields != 0) {
    object->header.allocator->free(
      object->header.allocator->user, (void*)object->shape->fields,
      sizeof(inox_field_info) * object->shape->field_count, alignof(inox_field_info)
    );
  }

  object->header.allocator->free(
    object->header.allocator->user, (void*)object->shape, sizeof(inox_shape), alignof(inox_shape)
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
  ArrayClass result = ArrayClass::create(allocator, instance->length);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  for (size_t index = 0; index < instance->length; index += 1) {
    result.set(index, instance->items[index]);

    if (inox::thrown()) {
      inox::take_exception();
      *out = inox_undefined_value();
      return INOX_ERR_TYPE;
    }
  }

  *out = result.release();

  return INOX_OK;
}

static inox_status inox_array_object_keys(inox_allocator* allocator, inox_value array, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  ArrayClass result = ArrayClass::create(allocator, instance->length);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  for (size_t index = 0; index < instance->length; index += 1) {
    char key_bytes[64];
    int key_len = snprintf(key_bytes, sizeof(key_bytes), "%zu", index);
    inox_value key = inox_undefined_value();
    inox_status status = INOX_OK;

    if (key_len < 0 || (size_t)key_len >= sizeof(key_bytes)) {
      status = INOX_ERR_TYPE;
    } else {
      status = inox::String::fromLiteral(allocator, key_bytes, (size_t)key_len, &key);
    }

    if (status == INOX_OK) {
      result.set(index, key);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(key);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }
  }

  *out = result.release();

  return INOX_OK;
}

static inox_status inox_array_object_entries(inox_allocator* allocator, inox_value array, inox_value* out) {
  if (allocator == 0 || out == 0 || array.tag != INOX_TAG_ARRAY || array.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* instance = (inox_array*)array.as.ref;
  ArrayClass result = ArrayClass::create(allocator, instance->length);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  for (size_t index = 0; index < instance->length; index += 1) {
    char key_bytes[64];
    int key_len = snprintf(key_bytes, sizeof(key_bytes), "%zu", index);
    ArrayClass pair;
    inox_value key = inox_undefined_value();
    inox_status status = INOX_OK;

    if (key_len < 0 || (size_t)key_len >= sizeof(key_bytes)) {
      status = INOX_ERR_TYPE;
    } else {
      pair = ArrayClass::create(allocator, 2);

      if (inox::thrown() || !pair.valid()) {
        inox::take_exception();
        status = INOX_ERR_OOM;
      }
    }

    if (status == INOX_OK) {
      status = inox::String::fromLiteral(allocator, key_bytes, (size_t)key_len, &key);
    }

    if (status == INOX_OK) {
      pair.set(0, key);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    if (status == INOX_OK) {
      pair.set(1, instance->items[index]);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    if (status == INOX_OK) {
      result.set(index, pair.raw());

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(key);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }
  }

  *out = result.release();

  return INOX_OK;
}

static inox_status inox_object_entry_from_key_value(
  inox_allocator* allocator,
  const char* key_bytes,
  size_t key_len,
  inox_value value,
  inox_value* out
) {
  if (allocator == 0 || key_bytes == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  ArrayClass pair = ArrayClass::create(allocator, 2);
  inox_value key = inox_undefined_value();
  inox_status status = INOX_OK;

  if (inox::thrown() || !pair.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  if (status == INOX_OK) {
    status = inox::String::fromLiteral(allocator, key_bytes, key_len, &key);
  }

  if (status == INOX_OK) {
    pair.set(0, key);

    if (inox::thrown()) {
      inox::take_exception();
      status = INOX_ERR_TYPE;
    }
  }

  if (status == INOX_OK) {
    pair.set(1, value);

    if (inox::thrown()) {
      inox::take_exception();
      status = INOX_ERR_TYPE;
    }
  }

  inox_release(key);

  if (status != INOX_OK) {
    *out = inox_undefined_value();
    return status;
  }

  *out = pair.release();

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
  ArrayClass result = ArrayClass::create(allocator, field_count);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  uint32_t output_index = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    const char* name = field->name == 0 ? "" : field->name;
    inox_value key = inox_undefined_value();
    inox_status status = inox::String::fromLiteral(allocator, name, strlen(name), &key);

    if (status == INOX_OK) {
      result.set(output_index, key);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(key);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }

    output_index += 1;
  }

  *out = result.release();

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
  ArrayClass result = ArrayClass::create(allocator, field_count);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  uint32_t output_index = 0;
  inox_status status = INOX_OK;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    inox_value value = inox_undefined_value();
    status = descriptor->read_field(instance, index, &value);

    if (status == INOX_OK) {
      result.set(output_index, value);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(value);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }

    output_index += 1;
  }

  *out = result.release();

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
  ArrayClass result = ArrayClass::create(allocator, field_count);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  uint32_t output_index = 0;
  inox_status status = INOX_OK;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    const char* name = field->name == 0 ? "" : field->name;
    ArrayClass pair;
    inox_value key = inox_undefined_value();
    inox_value value = inox_undefined_value();

    pair = ArrayClass::create(allocator, 2);

    if (inox::thrown() || !pair.valid()) {
      inox::take_exception();
      status = INOX_ERR_OOM;
    }

    if (status == INOX_OK) {
      status = inox::String::fromLiteral(allocator, name, strlen(name), &key);
    }

    if (status == INOX_OK) {
      status = descriptor->read_field(instance, index, &value);
    }

    if (status == INOX_OK) {
      pair.set(0, key);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    if (status == INOX_OK) {
      pair.set(1, value);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    if (status == INOX_OK) {
      result.set(output_index, pair.raw());

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(value);
    inox_release(key);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }

    output_index += 1;
  }

  *out = result.release();

  return INOX_OK;
}

inox_status inox_object_value_at(inox_value object, size_t index, inox_value* out) {
  if (out == 0 || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (object.tag == INOX_TAG_ARRAY) {
    inox_array* instance = (inox_array*)object.as.ref;

    if (index >= instance->length) {
      *out = inox_undefined_value();
      return INOX_ERR_FIELD;
    }

    *out = instance->items[index];
    inox_retain(*out);

    return INOX_OK;
  }

  if (object.tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  if (index > UINT32_MAX) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

  return inox_object_get_known(object, (uint32_t)index, out);
}

inox_status inox_object_entry_at(inox_allocator* allocator, inox_value object, size_t index, inox_value* out) {
  if (allocator == 0 || out == 0 || object.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (object.tag == INOX_TAG_ARRAY) {
    inox_array* instance = (inox_array*)object.as.ref;

    if (index >= instance->length) {
      *out = inox_undefined_value();
      return INOX_ERR_FIELD;
    }

    char key_bytes[64];
    int key_len = snprintf(key_bytes, sizeof(key_bytes), "%zu", index);
    inox_value value = inox_undefined_value();
    inox_status status = INOX_OK;

    if (key_len < 0 || (size_t)key_len >= sizeof(key_bytes)) {
      status = INOX_ERR_TYPE;
    } else {
      value = instance->items[index];
      inox_retain(value);
    }

    if (status == INOX_OK) {
      status = inox_object_entry_from_key_value(allocator, key_bytes, (size_t)key_len, value, out);
    }

    inox_release(value);

    return status;
  }

  if (object.tag != INOX_TAG_OBJECT) {
    return INOX_ERR_TYPE;
  }

  if (index > UINT32_MAX) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

  inox_object* instance = (inox_object*)object.as.ref;

  if (index >= instance->shape->field_count) {
    *out = inox_undefined_value();
    return INOX_ERR_FIELD;
  }

  const char* name = instance->shape->fields[index].name == 0 ? "" : instance->shape->fields[index].name;
  inox_value value = inox_undefined_value();
  inox_status status = inox_object_get_known(object, (uint32_t)index, &value);

  if (status == INOX_OK) {
    status = inox_object_entry_from_key_value(allocator, name, strlen(name), value, out);
  }

  inox_release(value);

  return status;
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
  ArrayClass result = ArrayClass::create(allocator, instance->shape->field_count);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  for (uint32_t index = 0; index < instance->shape->field_count; index += 1) {
    const char* name = instance->shape->fields[index].name == 0 ? "" : instance->shape->fields[index].name;
    inox_value key = inox_undefined_value();
    inox_status status = inox::String::fromLiteral(allocator, name, strlen(name), &key);

    if (status == INOX_OK) {
      result.set(index, key);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(key);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }
  }

  *out = result.release();

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
  ArrayClass result = ArrayClass::create(allocator, instance->shape->field_count);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  for (uint32_t index = 0; index < instance->shape->field_count; index += 1) {
    inox_value value = inox_undefined_value();

    inox_status status = inox_object_get_known(object, index, &value);

    if (status == INOX_OK) {
      result.set(index, value);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(value);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }
  }

  *out = result.release();

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
  ArrayClass result = ArrayClass::create(allocator, instance->shape->field_count);

  if (inox::thrown() || !result.valid()) {
    inox::take_exception();
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  for (uint32_t index = 0; index < instance->shape->field_count; index += 1) {
    const char* name = instance->shape->fields[index].name == 0 ? "" : instance->shape->fields[index].name;
    ArrayClass pair;
    inox_value key = inox_undefined_value();
    inox_value value = inox_undefined_value();
    inox_status status = INOX_OK;

    pair = ArrayClass::create(allocator, 2);

    if (inox::thrown() || !pair.valid()) {
      inox::take_exception();
      status = INOX_ERR_OOM;
    }

    if (status == INOX_OK) {
      status = inox::String::fromLiteral(allocator, name, strlen(name), &key);
    }

    if (status == INOX_OK) {
      status = inox_object_get_known(object, index, &value);
    }

    if (status == INOX_OK) {
      pair.set(0, key);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    if (status == INOX_OK) {
      pair.set(1, value);

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    if (status == INOX_OK) {
      result.set(index, pair.raw());

      if (inox::thrown()) {
        inox::take_exception();
        status = INOX_ERR_TYPE;
      }
    }

    inox_release(value);
    inox_release(key);

    if (status != INOX_OK) {
      *out = inox_undefined_value();
      return status;
    }
  }

  *out = result.release();

  return INOX_OK;
}

namespace inox {

static Value finish_object_index_read(inox_status status, inox_value out, const char* message) {
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

Value object_value_at(inox_value object, size_t index) {
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

Value object_entry_at(inox_value object, size_t index) {
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

void throw_property_read_type_error(StringView name, const char* receiver) {
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

Value get(inox_value object, StringView name) {
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

Value get(inox_value object, const char* name) {
  return get(object, StringView(name));
}

} // namespace inox

inox::Value Object::keys(inox_value value) const {
  if (inox::thrown()) {
    return inox::Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_object_keys(&inox_default_allocator, value, &out);

  if (status == INOX_OK) {
    return inox::adopt(out);
  }

  inox_release(out);
  inox::throw_value(inox::String("Object.keys failed"));

  return inox::Value();
}

inox::Value Object::keys(const inox_class_descriptor& descriptor, const void* instance) const {
  if (inox::thrown()) {
    return inox::Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_class_instance_keys(&inox_default_allocator, &descriptor, instance, &out);

  if (status == INOX_OK) {
    return inox::adopt(out);
  }

  inox_release(out);
  inox::throw_value(inox::String("Object.keys failed"));

  return inox::Value();
}

inox::Value Object::values(inox_value value) const {
  if (inox::thrown()) {
    return inox::Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_object_values(&inox_default_allocator, value, &out);

  if (status == INOX_OK) {
    return inox::adopt(out);
  }

  inox_release(out);
  inox::throw_value(inox::String("Object.values failed"));

  return inox::Value();
}

inox::Value Object::values(const inox_class_descriptor& descriptor, const void* instance) const {
  if (inox::thrown()) {
    return inox::Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_class_instance_values(&inox_default_allocator, &descriptor, instance, &out);

  if (status == INOX_OK) {
    return inox::adopt(out);
  }

  inox_release(out);
  inox::throw_value(inox::String("Object.values failed"));

  return inox::Value();
}

inox::Value Object::entries(inox_value value) const {
  if (inox::thrown()) {
    return inox::Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_object_entries(&inox_default_allocator, value, &out);

  if (status == INOX_OK) {
    return inox::adopt(out);
  }

  inox_release(out);
  inox::throw_value(inox::String("Object.entries failed"));

  return inox::Value();
}

inox::Value Object::entries(const inox_class_descriptor& descriptor, const void* instance) const {
  if (inox::thrown()) {
    return inox::Value();
  }

  inox_value out = inox_undefined_value();
  inox_status status = inox_class_instance_entries(&inox_default_allocator, &descriptor, instance, &out);

  if (status == INOX_OK) {
    return inox::adopt(out);
  }

  inox_release(out);
  inox::throw_value(inox::String("Object.entries failed"));

  return inox::Value();
}

class Object Object;
