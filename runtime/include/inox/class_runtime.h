#ifndef INOX_CLASS_RUNTIME_H
#define INOX_CLASS_RUNTIME_H

#include <new>
#include <stdint.h>
#include <type_traits>
#include <utility>
#include "inox/class_descriptor.h"
#include "inox/loop.h"

namespace inox {

template <typename TResult>
static inox_status class_conversion_result(TResult&& result, inox_value* out) {
  if (out == nullptr) {
    return INOX_ERR_TYPE;
  }

  using Result = std::remove_cvref_t<TResult>;

  if constexpr (std::is_base_of_v<Value, Result>) {
    *out = result.release();
    return INOX_OK;
  } else if constexpr (std::is_same_v<Result, inox_value>) {
    *out = result;
    return INOX_OK;
  } else if constexpr (std::is_same_v<Result, bool>) {
    *out = inox_bool_value(result);
    return INOX_OK;
  } else if constexpr (std::is_arithmetic_v<Result>) {
    *out = inox_number_value(static_cast<double>(result));
    return INOX_OK;
  } else if constexpr (requires { Result::inox_descriptor; }) {
    return inox_class_instance_ref_copy(&inox_default_allocator, &Result::inox_descriptor, &result, out);
  } else {
    *out = inox_undefined_value();
    return INOX_ERR_UNSUPPORTED;
  }
}

template <typename T>
static inox_status class_to_string(const void* instance, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  T& value = *const_cast<T*>(static_cast<const T*>(instance));
  auto result = value.toString();

  if (inox::thrown()) {
    return INOX_ERR_THROW;
  }

  return class_conversion_result(std::move(result), out);
}

template <typename T>
static inox_status class_to_json(const void* instance, inox_value* out) {
  if (instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  T& value = *const_cast<T*>(static_cast<const T*>(instance));
  auto result = value.toJSON();

  if (inox::thrown()) {
    return INOX_ERR_THROW;
  }

  return class_conversion_result(std::move(result), out);
}

template <typename T>
static constexpr inox_class_instance_conversion_fn class_to_string_callback() {
  if constexpr (requires(T& value) { value.toString(); }) {
    return class_to_string<T>;
  }

  return nullptr;
}

template <typename T>
static constexpr inox_class_instance_conversion_fn class_to_json_callback() {
  if constexpr (requires(T& value) { value.toJSON(); }) {
    return class_to_json<T>;
  }

  return nullptr;
}

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

  static inox_status assign_from_value(inox_value value, const inox_class_descriptor* descriptor, T* out) {
    if (
      descriptor == nullptr ||
      out == nullptr ||
      value.tag != INOX_TAG_CLASS_INSTANCE ||
      value.as.ref == nullptr
    ) {
      return INOX_ERR_TYPE;
    }

    inox_class_instance_ref* ref = (inox_class_instance_ref*)value.as.ref;

    if (ref->descriptor != descriptor || ref->instance == nullptr) {
      return INOX_ERR_TYPE;
    }

    *out = *(const T*)ref->instance;
    return INOX_OK;
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
    Class<T>::inox_destroy_instance,
    nullptr,
    class_to_string_callback<T>(),
    class_to_json_callback<T>()
  };

  return descriptor;
}

template <typename T>
static inox_status class_assign_from_value(inox_value value, const inox_class_descriptor* descriptor, T* out) {
  return Class<T>::assign_from_value(value, descriptor, out);
}

} // namespace inox

#endif
