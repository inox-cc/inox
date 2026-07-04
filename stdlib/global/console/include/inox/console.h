#ifndef INOX_CONSOLE_H
#define INOX_CONSOLE_H

#include <stddef.h>
#include <string.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include <type_traits>
#include <utility>
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

inline inox_status console_newline(inox_console_stream stream) {
  return inox_console_write(stream, "\n", 1);
}

} // namespace inox

class console {
private:
  template <typename T, typename = void>
  struct is_console_value_object : std::false_type {};

  template <typename T>
  struct is_console_value_object<
    T,
    typename std::enable_if<
      std::is_same<typename std::decay<decltype(std::declval<const T&>().value())>::type, inox::Value>::value
    >::type
  > : std::true_type {};

public:
  inox_status log() const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox::console_newline(INOX_CONSOLE_STDOUT);
  }

  inox_status log(const char* text) const {
    return write_text_line(INOX_CONSOLE_STDOUT, text);
  }

  inox_status log(inox::StringView text) const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox_console_write_line(INOX_CONSOLE_STDOUT, text.bytes, text.len);
  }

  inox_status log(const inox::String& value) const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox_console_write_line(INOX_CONSOLE_STDOUT, value.bytes(), value.length());
  }

  inox_status log(inox_value value) const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox_console_print_value_line(INOX_CONSOLE_STDOUT, value);
  }

  inox_status log(const inox::Value& value) const {
    return log(value.raw());
  }

  inox_status log(const char* prefix, inox_value value) const {
    return write_prefixed_value_line(INOX_CONSOLE_STDOUT, prefix, value);
  }

  inox_status log(const char* prefix, const inox::Value& value) const {
    return log(prefix, value.raw());
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type log(const T& value) const {
    return write_value_object_line(INOX_CONSOLE_STDOUT, value);
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type log(
    const char* prefix,
    const T& value
  ) const {
    return write_prefixed_value_object_line(INOX_CONSOLE_STDOUT, prefix, value);
  }

  template <typename... Args>
  inox_status log(const char* format, Args... args) const {
    return printf_line(INOX_CONSOLE_STDOUT, format, args...);
  }

  inox_status info() const {
    return log();
  }

  inox_status info(const char* text) const {
    return log(text);
  }

  inox_status info(inox::StringView text) const {
    return log(text);
  }

  inox_status info(const inox::String& value) const {
    return log(value);
  }

  inox_status info(inox_value value) const {
    return log(value);
  }

  inox_status info(const inox::Value& value) const {
    return log(value);
  }

  inox_status info(const char* prefix, inox_value value) const {
    return log(prefix, value);
  }

  inox_status info(const char* prefix, const inox::Value& value) const {
    return log(prefix, value);
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type info(const T& value) const {
    return log(value);
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type info(
    const char* prefix,
    const T& value
  ) const {
    return log(prefix, value);
  }

  template <typename... Args>
  inox_status info(const char* format, Args... args) const {
    return log(format, args...);
  }

  inox_status warn() const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox::console_newline(INOX_CONSOLE_STDERR);
  }

  inox_status warn(const char* text) const {
    return write_text_line(INOX_CONSOLE_STDERR, text);
  }

  inox_status warn(inox::StringView text) const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox_console_write_line(INOX_CONSOLE_STDERR, text.bytes, text.len);
  }

  inox_status warn(const inox::String& value) const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox_console_write_line(INOX_CONSOLE_STDERR, value.bytes(), value.length());
  }

  inox_status warn(inox_value value) const {
    if (skip_write()) {
      return INOX_OK;
    }

    return inox_console_print_value_line(INOX_CONSOLE_STDERR, value);
  }

  inox_status warn(const inox::Value& value) const {
    return warn(value.raw());
  }

  inox_status warn(const char* prefix, inox_value value) const {
    return write_prefixed_value_line(INOX_CONSOLE_STDERR, prefix, value);
  }

  inox_status warn(const char* prefix, const inox::Value& value) const {
    return warn(prefix, value.raw());
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type warn(const T& value) const {
    return write_value_object_line(INOX_CONSOLE_STDERR, value);
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type warn(
    const char* prefix,
    const T& value
  ) const {
    return write_prefixed_value_object_line(INOX_CONSOLE_STDERR, prefix, value);
  }

  template <typename... Args>
  inox_status warn(const char* format, Args... args) const {
    return printf_line(INOX_CONSOLE_STDERR, format, args...);
  }

  inox_status error() const {
    return warn();
  }

  inox_status error(const char* text) const {
    return warn(text);
  }

  inox_status error(inox::StringView text) const {
    return warn(text);
  }

  inox_status error(const inox::String& value) const {
    return warn(value);
  }

  inox_status error(inox_value value) const {
    return warn(value);
  }

  inox_status error(const inox::Value& value) const {
    return warn(value);
  }

  inox_status error(const char* prefix, inox_value value) const {
    return warn(prefix, value);
  }

  inox_status error(const char* prefix, const inox::Value& value) const {
    return warn(prefix, value);
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type error(const T& value) const {
    return warn(value);
  }

  template <typename T>
  typename std::enable_if<is_console_value_object<T>::value, inox_status>::type error(
    const char* prefix,
    const T& value
  ) const {
    return warn(prefix, value);
  }

  template <typename... Args>
  inox_status error(const char* format, Args... args) const {
    return warn(format, args...);
  }

private:
  static bool skip_write() {
    return inox::thrown();
  }

  static inox_status write_text_line(inox_console_stream stream, const char* text) {
    if (skip_write()) {
      return INOX_OK;
    }

    if (text == nullptr) {
      return inox::console_newline(stream);
    }

    return inox_console_write_line(stream, text, strlen(text));
  }

  static inox_status write_prefixed_value_line(inox_console_stream stream, const char* prefix, inox_value value) {
    if (skip_write()) {
      return INOX_OK;
    }

    if (prefix != nullptr && prefix[0] != '\0') {
      inox_status status = inox_console_write(stream, prefix, strlen(prefix));

      if (status != INOX_OK) {
        return status;
      }

      status = inox_console_write(stream, " ", 1);

      if (status != INOX_OK) {
        return status;
      }
    }

    inox_status status = inox_console_print_value(stream, value);

    if (status != INOX_OK) {
      return status;
    }

    return inox::console_newline(stream);
  }

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

    if constexpr (has_custom_format_arg<Args...>::value) {
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

  template <typename T>
  struct is_formatted_string_arg {
    using Decayed = typename std::decay<T>::type;
    static constexpr bool value =
      std::is_same<Decayed, inox::String>::value ||
      std::is_same<Decayed, inox::StringView>::value;
  };

  template <typename T>
  struct is_custom_format_arg {
    using Decayed = typename std::decay<T>::type;
    static constexpr bool value =
      is_formatted_string_arg<T>::value ||
      std::is_same<Decayed, inox_value>::value ||
      std::is_same<Decayed, inox::Value>::value ||
      is_console_value_object<T>::value;
  };

  template <typename... Args>
  struct has_custom_format_arg : std::integral_constant<bool, (is_custom_format_arg<Args>::value || ...)> {};

  static bool is_format_conversion(char value) {
    return strchr("diuoxXfFeEgGaAcsp", value) != nullptr;
  }

  static const char* next_format_spec(const char* format, const char** spec_end) {
    const char* current = format;

    while (*current != '\0') {
      if (*current != '%') {
        current += 1;
        continue;
      }

      if (*(current + 1) == '%') {
        current += 2;
        continue;
      }

      const char* end = current + 1;

      while (*end != '\0' && !is_format_conversion(*end)) {
        end += 1;
      }

      if (*end == '\0') {
        return nullptr;
      }

      *spec_end = end + 1;
      return current;
    }

    return nullptr;
  }

  static inox_status write_format_literal(inox_console_stream stream, const char* begin, const char* end) {
    const char* chunk = begin;
    const char* current = begin;

    while (current < end) {
      if (*current == '%' && current + 1 < end && *(current + 1) == '%') {
        inox_status status = inox_console_write(stream, chunk, (size_t)(current - chunk));

        if (status != INOX_OK) {
          return status;
        }

        status = inox_console_write(stream, "%", 1);

        if (status != INOX_OK) {
          return status;
        }

        current += 2;
        chunk = current;
        continue;
      }

      current += 1;
    }

    return inox_console_write(stream, chunk, (size_t)(end - chunk));
  }

  static bool is_string_format_spec(const char* spec, size_t len) {
    return len > 0 && spec[len - 1] == 's';
  }

  static bool is_value_format_spec(const char* spec, size_t len) {
    return is_string_format_spec(spec, len);
  }

  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    const inox::String& value
  ) {
    if (!is_string_format_spec(spec, spec_len)) {
      return INOX_ERR_TYPE;
    }

    return inox_console_write(stream, value.bytes(), value.length());
  }

  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    inox::StringView value
  ) {
    if (!is_string_format_spec(spec, spec_len)) {
      return INOX_ERR_TYPE;
    }

    return inox_console_write(stream, value.bytes, value.len);
  }

  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    inox_value value
  ) {
    if (!is_value_format_spec(spec, spec_len)) {
      return INOX_ERR_TYPE;
    }

    return inox_console_print_value(stream, value);
  }

  static inox_status write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    const inox::Value& value
  ) {
    return write_format_arg(stream, spec, spec_len, value.raw());
  }

  template <typename T>
  static typename std::enable_if<is_console_value_object<T>::value, inox_status>::type write_format_arg(
    inox_console_stream stream,
    const char* spec,
    size_t spec_len,
    const T& object
  ) {
    inox::Value value = object.value();
    return write_format_arg(stream, spec, spec_len, value.raw());
  }

  template <typename T>
  static typename std::enable_if<!is_console_value_object<T>::value, inox_status>::type write_format_arg(
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

  static inox_status write_formatted(inox_console_stream stream, const char* format) {
    const char* spec_end = nullptr;
    const char* spec = next_format_spec(format, &spec_end);

    if (spec != nullptr) {
      return INOX_ERR_TYPE;
    }

    return write_format_literal(stream, format, format + strlen(format));
  }

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
