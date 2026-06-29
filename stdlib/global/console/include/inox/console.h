#ifndef INOX_CONSOLE_H
#define INOX_CONSOLE_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

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

#endif
