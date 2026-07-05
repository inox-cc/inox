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
namespace inox {

enum class ConsoleStream {
  stdout,
  stderr
};

inox_status console_newline(ConsoleStream stream);
inox_status console_write(ConsoleStream stream, const char* bytes, size_t len);
inox_status console_write_line(ConsoleStream stream, const char* bytes, size_t len);
inox_status console_print_value(ConsoleStream stream, inox_value value);
inox_status console_print_value_line(ConsoleStream stream, inox_value value);
inox_status console_format_class_instance(
  const inox_class_descriptor& descriptor,
  const void* instance,
  Value& out
);
int console_printf(ConsoleStream stream, const char* format, ...);

} // namespace inox

template <typename...>
using ConsoleVoid = void;

template <typename T, typename = void>
struct ConsoleValueObject : std::false_type {
};

template <typename T>
struct ConsoleValueObject<T, ConsoleVoid<decltype(std::declval<const T&>().value())>>
  : std::is_same<decltype(std::declval<const T&>().value()), inox::Value> {
};

template <typename T>
using ConsoleDecayed = typename std::decay<T>::type;

template <typename T>
struct ConsoleFormattedStringArg
  : std::integral_constant<
      bool,
      std::is_same<ConsoleDecayed<T>, inox::String>::value ||
      std::is_same<ConsoleDecayed<T>, inox::StringView>::value
    > {
};

template <typename T>
struct ConsoleCustomFormatArg
  : std::integral_constant<
      bool,
      ConsoleFormattedStringArg<T>::value ||
      std::is_arithmetic<ConsoleDecayed<T>>::value ||
      std::is_same<ConsoleDecayed<T>, inox_value>::value ||
      std::is_same<ConsoleDecayed<T>, inox::Value>::value ||
      ConsoleValueObject<T>::value
    > {
};

template <typename... Args>
struct ConsoleHasCustomFormatArg : std::false_type {
};

template <typename T, typename... Rest>
struct ConsoleHasCustomFormatArg<T, Rest...>
  : std::integral_constant<bool, ConsoleCustomFormatArg<T>::value || ConsoleHasCustomFormatArg<Rest...>::value> {
};

template <typename T>
struct ConsolePlainVararg
  : std::integral_constant<
      bool,
      std::is_arithmetic<ConsoleDecayed<T>>::value ||
      std::is_pointer<ConsoleDecayed<T>>::value
    > {
};

template <typename... Args>
struct ConsoleCanUsePlainVarargs : std::true_type {
};

template <typename T, typename... Rest>
struct ConsoleCanUsePlainVarargs<T, Rest...>
  : std::integral_constant<bool, ConsolePlainVararg<T>::value && ConsoleCanUsePlainVarargs<Rest...>::value> {
};

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

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status log(const T& value) const {
    return write_value_object_line(inox::ConsoleStream::stdout, value);
  }

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status log(const char* prefix, const T& value) const {
    return write_prefixed_value_object_line(inox::ConsoleStream::stdout, prefix, value);
  }

  template <typename... Args>
  inox_status log(const char* format, Args... args) const {
    return printf_line(inox::ConsoleStream::stdout, format, args...);
  }

  inox_status info() const;
  inox_status info(const char* text) const;
  inox_status info(inox::StringView text) const;
  inox_status info(const inox::String& value) const;
  inox_status info(inox_value value) const;
  inox_status info(const inox::Value& value) const;
  inox_status info(const char* prefix, inox_value value) const;
  inox_status info(const char* prefix, const inox::Value& value) const;

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status info(const T& value) const {
    return log(value);
  }

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
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

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status warn(const T& value) const {
    return write_value_object_line(inox::ConsoleStream::stderr, value);
  }

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status warn(const char* prefix, const T& value) const {
    return write_prefixed_value_object_line(inox::ConsoleStream::stderr, prefix, value);
  }

  template <typename... Args>
  inox_status warn(const char* format, Args... args) const {
    return printf_line(inox::ConsoleStream::stderr, format, args...);
  }

  inox_status error() const;
  inox_status error(const char* text) const;
  inox_status error(inox::StringView text) const;
  inox_status error(const inox::String& value) const;
  inox_status error(inox_value value) const;
  inox_status error(const inox::Value& value) const;
  inox_status error(const char* prefix, inox_value value) const;
  inox_status error(const char* prefix, const inox::Value& value) const;

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status error(const T& value) const {
    return warn(value);
  }

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  inox_status error(const char* prefix, const T& value) const {
    return warn(prefix, value);
  }

  template <typename... Args>
  inox_status error(const char* format, Args... args) const {
    return warn(format, args...);
  }

private:
  static bool skip_write();
  static inox_status write_text_line(inox::ConsoleStream stream, const char* text);
  static inox_status write_prefixed_value_line(inox::ConsoleStream stream, const char* prefix, inox_value value);

  template <typename T>
  static inox_status write_value_object_line(inox::ConsoleStream stream, const T& object) {
    if (skip_write()) {
      return INOX_OK;
    }

    inox::Value value = object.value();
    return inox::console_print_value_line(stream, value.raw());
  }

  template <typename T>
  static inox_status write_prefixed_value_object_line(inox::ConsoleStream stream, const char* prefix, const T& object) {
    if (skip_write()) {
      return INOX_OK;
    }

    inox::Value value = object.value();
    return write_prefixed_value_line(stream, prefix, value.raw());
  }

  template <typename... Args>
  static inox_status printf_line(inox::ConsoleStream stream, const char* format, Args... args) {
    if (skip_write()) {
      return INOX_OK;
    }

    const char* safe_format = format == nullptr ? "" : format;

    return printf_line_format_dispatch(stream, safe_format, ConsoleCanUsePlainVarargs<Args...>(), args...);
  }

  template <typename... Args>
  static inox_status printf_line_format_dispatch(
    inox::ConsoleStream stream,
    const char* safe_format,
    std::true_type,
    Args... args
  ) {
    if (format_uses_dynamic_width_or_precision(safe_format)) {
      if (inox::console_printf(stream, safe_format, args...) < 0) {
        return INOX_ERR_TYPE;
      }

      return inox::console_newline(stream);
    }

    return printf_line_dispatch(stream, safe_format, ConsoleHasCustomFormatArg<Args...>(), args...);
  }

  template <typename... Args>
  static inox_status printf_line_format_dispatch(
    inox::ConsoleStream stream,
    const char* safe_format,
    std::false_type,
    Args... args
  ) {
    return printf_line_dispatch(stream, safe_format, ConsoleHasCustomFormatArg<Args...>(), args...);
  }

  template <typename... Args>
  static inox_status printf_line_dispatch(
    inox::ConsoleStream stream,
    const char* format,
    std::true_type,
    Args... args
  ) {
    inox_status status = write_formatted(stream, format == nullptr ? "" : format, args...);

    if (status != INOX_OK) {
      return status;
    }

    return inox::console_newline(stream);
  }

  template <typename... Args>
  static inox_status printf_line_dispatch(
    inox::ConsoleStream stream,
    const char* format,
    std::false_type,
    Args... args
  ) {
    if (inox::console_printf(stream, format == nullptr ? "" : format, args...) < 0) {
      return INOX_ERR_TYPE;
    }

    return inox::console_newline(stream);
  }

  static bool is_string_format_spec(const char* spec, size_t len);
  static bool is_value_format_spec(const char* spec, size_t len);
  static const char* next_format_spec(const char* format, const char** spec_end);
  static bool format_uses_dynamic_width_or_precision(const char* format);
  static bool format_spec_has_length_modifier(const char* spec, size_t len);

  template <typename T>
  static inox_status write_plain_format_arg(
    inox::ConsoleStream stream,
    const char* format,
    const char* spec,
    size_t spec_len,
    T value,
    std::true_type
  ) {
    const char conversion = spec_len > 0 ? spec[spec_len - 1] : '\0';

    if (!format_spec_has_length_modifier(spec, spec_len)) {
      switch (conversion) {
        case 'd':
        case 'i':
          return inox::console_printf(stream, format, (int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
        case 'u':
        case 'o':
        case 'x':
        case 'X':
          return inox::console_printf(stream, format, (unsigned int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
        case 'c':
          return inox::console_printf(stream, format, (int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
      }
    }

    switch (conversion) {
      case 'f':
      case 'F':
      case 'e':
      case 'E':
      case 'g':
      case 'G':
      case 'a':
      case 'A':
        return inox::console_printf(stream, format, (double)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
    }

    return inox::console_printf(stream, format, value) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  template <typename T>
  static inox_status write_plain_format_arg(
    inox::ConsoleStream stream,
    const char* format,
    const char* spec,
    size_t spec_len,
    T value,
    std::false_type
  ) {
    (void)spec;
    (void)spec_len;

    return inox::console_printf(stream, format, value) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  static inox_status write_format_literal(inox::ConsoleStream stream, const char* begin, const char* end);
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
    const char* spec,
    size_t spec_len,
    const inox::String& value
  );
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
    const char* spec,
    size_t spec_len,
    inox::StringView value
  );
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
    const char* spec,
    size_t spec_len,
    inox_value value
  );
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
    const char* spec,
    size_t spec_len,
    const inox::Value& value
  );

  template <typename T, typename std::enable_if_t<ConsoleValueObject<T>::value, int> = 0>
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
    const char* spec,
    size_t spec_len,
    const T& object
  ) {
    inox::Value value = object.value();
    return write_format_arg(stream, spec, spec_len, value.raw());
  }

  template <typename T, typename std::enable_if_t<!ConsoleValueObject<T>::value, int> = 0>
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
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

    return write_plain_format_arg(stream, format, spec, spec_len, value, std::is_arithmetic<ConsoleDecayed<T>>());
  }

  static inox_status write_formatted(inox::ConsoleStream stream, const char* format);

  template <typename T, typename... Rest>
  static inox_status write_formatted(inox::ConsoleStream stream, const char* format, T value, Rest... rest) {
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

extern console console;

#endif

#endif
