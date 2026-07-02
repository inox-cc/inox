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

inline inox_status console_log(inox_console_stream stream) {
  return console_newline(stream);
}

inline inox_status console_log(inox_console_stream stream, inox_value value) {
  return inox_console_print_value_line(stream, value);
}

inline inox_status console_log(inox_console_stream stream, const Value& value) {
  return console_log(stream, value.raw());
}

inline inox_status console_log(inox_console_stream stream, const char* text) {
  if (text == nullptr) {
    return console_newline(stream);
  }

  return inox_console_write_line(stream, text, strlen(text));
}

inline inox_status console_log(inox_console_stream stream, const char* prefix, inox_value value) {
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

  return console_newline(stream);
}

inline inox_status console_log(inox_console_stream stream, const char* prefix, const Value& value) {
  return console_log(stream, prefix, value.raw());
}

} // namespace inox
#endif

#endif
