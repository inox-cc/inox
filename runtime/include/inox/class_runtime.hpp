#ifndef INOX_CLASS_RUNTIME_HPP
#define INOX_CLASS_RUNTIME_HPP

#include <new>
#include <stdint.h>
#include "inox/class_descriptor.h"

namespace inox {

template <typename T>
class Class {
public:
  static inox_status inox_copy_instance(inox_allocator* allocator, const void* instance, void** out) {
    if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
      return INOX_ERR_TYPE;
    }

    void* memory = allocator->alloc(allocator->user, sizeof(T), alignof(T));

    if (memory == nullptr) {
      *out = nullptr;
      return INOX_ERR_OOM;
    }

    new (memory) T(*(const T*)instance);
    *out = memory;
    return INOX_OK;
  }

  static void inox_destroy_instance(inox_allocator* allocator, void* instance) {
    if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
      return;
    }

    ((T*)instance)->~T();
    allocator->free(allocator->user, instance, sizeof(T), alignof(T));
  }
};

template <typename T>
static inox_status class_read_field(const void* instance, uint32_t index, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  return T::inox_read_field(*(const T*)instance, index, out);
}

template <typename T>
static inox_class_descriptor class_descriptor(const char* name) {
  inox_class_descriptor descriptor = {
    name,
    T::inox_field_count,
    T::inox_field_count == 0 ? nullptr : T::inox_fields,
    class_read_field<T>,
    Class<T>::inox_copy_instance,
    Class<T>::inox_destroy_instance
  };

  return descriptor;
}

} // namespace inox

#endif
