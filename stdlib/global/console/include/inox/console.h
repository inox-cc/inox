#ifndef INOX_CONSOLE_H
#define INOX_CONSOLE_H

#include <stddef.h>
#include <string.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include <concepts>
#include <type_traits>
#include "inox/loop.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum inox_console_stream {
  INOX_CONSOLE_STDOUT = 1,
  INOX_CONSOLE_STDERR = 2
} inox_console_stream;

typedef inox_status (*inox_console_write_fn)(void* user, inox_console_stream stream, const char* bytes, size_t len);

typedef struct inox_console_adapter {
  void* user;
  inox_console_write_fn write;
} inox_console_adapter;

void inox_console_set_adapter(inox_console_adapter adapter);
inox_console_adapter inox_console_get_adapter(void);
void inox_console_clear_adapter(void);
inox_status inox_console_write(inox_console_stream stream, const char* bytes, size_t len);
inox_status inox_console_write_line(inox_console_stream stream, const char* bytes, size_t len);
inox_status inox_console_print_value(inox_console_stream stream, inox_value value);
inox_status inox_console_print_value_line(inox_console_stream stream, inox_value value);
inox_status inox_console_format_value(inox_allocator* allocator, inox_value value, inox_value* out);
inox_status inox_console_format_class_instance(
  inox_allocator* allocator,
  const inox_class_descriptor* descriptor,
  const void* instance,
  inox_value* out
);
int inox_console_printf(inox_console_stream stream, const char* format, ...);

#ifndef INOX_CONSOLE_NO_PRINTF_MACRO
#define printf(...) inox_console_printf(INOX_CONSOLE_STDOUT, __VA_ARGS__)
#endif

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus
namespace inox {

inox_status console_newline(inox_console_stream stream);

} // namespace inox

template <typename T>
concept inox_console_value_object = requires(const T& value) {
  { value.value() } -> std::same_as<inox::Value>;
};

template <typename T>
using inox_console_decayed_t = std::remove_cvref_t<T>;

template <typename T>
concept inox_console_formatted_string_arg =
  std::same_as<inox_console_decayed_t<T>, inox::String> ||
  std::same_as<inox_console_decayed_t<T>, inox::StringView>;

template <typename T>
concept inox_console_custom_format_arg =
  inox_console_formatted_string_arg<T> ||
  std::same_as<inox_console_decayed_t<T>, inox_value> ||
  std::same_as<inox_console_decayed_t<T>, inox::Value> ||
  inox_console_value_object<T>;

template <typename... Args>
concept inox_console_has_custom_format_arg = (inox_console_custom_format_arg<Args> || ...);

class console {
public:
  inox_status log() const;
  inox_status log(const char* text) const;
  inox_status log(inox::StringView text) const;
  inox_status log(const inox::String& value) const;
  inox_status log(inox_value value) const;
  inox_status log(const inox::Value& value) const;
  inox_status log(const char* prefix, inox_value value) const;
  inox_status log(const char* prefix, const inox::Value& value) const;

  template <typename T>
  requires inox_console_value_object<T>
  inox_status log(const T& value) const {
    return write_value_object_line(INOX_CONSOLE_STDOUT, value);
  }

  template <typename T>
  requires inox_console_value_object<T>
  inox_status log(const char* prefix, const T& value) const {
    return write_prefixed_value_object_line(INOX_CONSOLE_STDOUT, prefix, value);
  }

  template <typename... Args>
  inox_status log(const char* format, Args... args) const {
    return printf_line(INOX_CONSOLE_STDOUT, format, args...);
  }

  inox_status info() const;
  inox_status info(const char* text) const;
  inox_status info(inox::StringView text) const;
  inox_status info(const inox::String& value) const;
  inox_status info(inox_value value) const;
  inox_status info(const inox::Value& value) const;
  inox_status info(const char* prefix, inox_value value) const;
  inox_status info(const char* prefix, const inox::Value& value) const;

  template <typename T>
  requires inox_console_value_object<T>
  inox_status info(const T& value) const {
    return log(value);
  }

  template <typename T>
  requires inox_console_value_object<T>
  inox_status info(const char* prefix, const T& value) const {
    return log(prefix, value);
  }

  template <typename... Args>
  inox_status info(const char* format, Args... args) const {
    return log(format, args...);
  }

  inox_status warn() const;
  inox_status warn(const char* text) const;
  inox_status warn(inox::StringView text) const;
  inox_status warn(const inox::String& value) const;
  inox_status warn(inox_value value) const;
  inox_status warn(const inox::Value& value) const;
  inox_status warn(const char* prefix, inox_value value) const;
  inox_status warn(const char* prefix, const inox::Value& value) const;

  template <typename T>
  requires inox_console_value_object<T>
  inox_status warn(const T& value) const {
    return write_value_object_line(INOX_CONSOLE_STDERR, value);
  }

  template <typename T>
  requires inox_console_value_object<T>
  inox_status warn(const char* prefix, const T& value) const {
    return write_prefixed_value_object_line(INOX_CONSOLE_STDERR, prefix, value);
  }

  template <typename... Args>
  inox_status warn(const char* format, Args... args) const {
    return printf_line(INOX_CONSOLE_STDERR, format, args...);
  }

  inox_status error() const;
  inox_status error(const char* text) const;
  inox_status error(inox::StringView text) const;
  inox_status error(const inox::String& value) const;
  inox_status error(inox_value value) const;
  inox_status error(const inox::Value& value) const;
  inox_status error(const char* prefix, inox_value value) const;
  inox_status error(const char* prefix, const inox::Value& value) const;

  template <typename T>
  requires inox_console_value_object<T>
  inox_status error(const T& value) const {
    return warn(value);
  }

  template <typename T>
  requires inox_console_value_object<T>
  inox_status error(const char* prefix, const T& value) const {
    return warn(prefix, value);
  }

  template <typename... Args>
  inox_status error(const char* format, Args... args) const {
    return warn(format, args...);
  }

private:
  static bool skip_write();
  static inox_status write_text_line(inox_console_stream stream, const char* text);
  static inox_status write_prefixed_value_line(inox_console_stream stream, const char* prefix, inox_value value);

  template <typename T>
  static inox_status write_value_object_line(inox_console_stream stream, const T& object) {
    if (skip_write()) {
      return INOX_OK;
    }

    inox::Value value = object.value();
    return inox_console_print_value_line(stream, value.raw());
  }

  template <typename T>
  static inox_status write_prefixed_value_object_line(inox_console_stream stream, const char* prefix, const T& object) {
    if (skip_write()) {
      return INOX_OK;
    }

    inox::Value value = object.value();
    return write_prefixed_value_line(stream, prefix, value.raw());
  }

  template <typename... Args>
  static inox_status printf_line(inox_console_stream stream, const char* format, Args... args) {
    if (skip_write()) {
      return INOX_OK;
    }

    if constexpr (inox_console_has_custom_format_arg<Args...>) {
      inox_status status = write_formatted(stream, format == nullptr ? "" : format, args...);

      if (status != INOX_OK) {
        return status;
      }
    } else {
      if (inox_console_printf(stream, format == nullptr ? "" : format, args...) < 0) {
        return INOX_ERR_TYPE;
      }
    }

    return inox::console_newline(stream);
  }

  static bool is_string_format_spec(const char* spec, size_t len);
  static bool is_value_format_spec(const char* spec, size_t len);
  static const char* next_format_spec(const char* format, const char** spec_end);
  static inox_status write_format_literal(inox_console_stream stream, const char* begin, const char* end);
  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    const inox::String& value
  );
  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    inox::StringView value
  );
  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    inox_value value
  );
  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    const inox::Value& value
  );

  template <typename T>
  requires inox_console_value_object<T>
  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    const T& object
  ) {
    inox::Value value = object.value();
    return write_format_arg(stream, spec, spec_len, value.raw());
  }

  template <typename T>
  requires (!inox_console_value_object<T>)
  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    T value
  ) {
    char format[64];

    if (spec_len >= sizeof(format)) {
      return INOX_ERR_TYPE;
    }

    memcpy(format, spec, spec_len);
    format[spec_len] = '\0';

    if (inox_console_printf(stream, format, value) < 0) {
      return INOX_ERR_TYPE;
    }

    return INOX_OK;
  }

  static inox_status write_formatted(inox_console_stream stream, const char* format);

  template <typename T, typename... Rest>
  static inox_status write_formatted(inox_console_stream stream, const char* format, T value, Rest... rest) {
    const char* spec_end = nullptr;
    const char* spec = next_format_spec(format, &spec_end);

    if (spec == nullptr) {
      return INOX_ERR_TYPE;
    }

    inox_status status = write_format_literal(stream, format, spec);

    if (status != INOX_OK) {
      return status;
    }

    status = write_format_arg(stream, spec, (size_t)(spec_end - spec), value);

    if (status != INOX_OK) {
      return status;
    }

    return write_formatted(stream, spec_end, rest...);
  }
};

inline console console;

#endif

#endif
