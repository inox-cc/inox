#ifndef INOX_CONSOLE_H
#define INOX_CONSOLE_H

#include <stddef.h>
#include <string.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

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
public:
  inox_status log() const {
    return inox::console_newline(INOX_CONSOLE_STDOUT);
  }

  inox_status log(const char* text) const {
    return write_text_line(INOX_CONSOLE_STDOUT, text);
  }

  inox_status log(inox::StringView text) const {
    return inox_console_write_line(INOX_CONSOLE_STDOUT, text.bytes, text.len);
  }

  inox_status log(const inox::String& value) const {
    return inox_console_write_line(INOX_CONSOLE_STDOUT, value.bytes(), value.length());
  }

  inox_status log(inox_value value) const {
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

  template <typename... Args>
  inox_status info(const char* format, Args... args) const {
    return log(format, args...);
  }

  inox_status warn() const {
    return inox::console_newline(INOX_CONSOLE_STDERR);
  }

  inox_status warn(const char* text) const {
    return write_text_line(INOX_CONSOLE_STDERR, text);
  }

  inox_status warn(inox::StringView text) const {
    return inox_console_write_line(INOX_CONSOLE_STDERR, text.bytes, text.len);
  }

  inox_status warn(const inox::String& value) const {
    return inox_console_write_line(INOX_CONSOLE_STDERR, value.bytes(), value.length());
  }

  inox_status warn(inox_value value) const {
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

  template <typename... Args>
  inox_status error(const char* format, Args... args) const {
    return warn(format, args...);
  }

private:
  static inox_status write_text_line(inox_console_stream stream, const char* text) {
    if (text == nullptr) {
      return inox::console_newline(stream);
    }

    return inox_console_write_line(stream, text, strlen(text));
  }

  static inox_status write_prefixed_value_line(inox_console_stream stream, const char* prefix, inox_value value) {
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

  template <typename... Args>
  static inox_status printf_line(inox_console_stream stream, const char* format, Args... args) {
    if (inox_console_printf(stream, format == nullptr ? "" : format, args...) < 0) {
      return INOX_ERR_TYPE;
    }

    return inox::console_newline(stream);
  }
};

inline console console;

#endif

#endif
