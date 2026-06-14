#ifndef CCJS_CONSOLE_H
#define CCJS_CONSOLE_H

#include <stddef.h>
#include "ccjs/value.h"

typedef enum ccjs_console_stream {
  CCJS_CONSOLE_STDOUT = 1,
  CCJS_CONSOLE_STDERR = 2
} ccjs_console_stream;

typedef ccjs_status (*ccjs_console_write_fn)(void* user, ccjs_console_stream stream, const char* bytes, size_t len);

typedef struct ccjs_console_adapter {
  void* user;
  ccjs_console_write_fn write;
} ccjs_console_adapter;

void ccjs_console_set_adapter(ccjs_console_adapter adapter);
ccjs_console_adapter ccjs_console_get_adapter(void);
void ccjs_console_clear_adapter(void);
ccjs_status ccjs_console_write(ccjs_console_stream stream, const char* bytes, size_t len);
ccjs_status ccjs_console_write_line(ccjs_console_stream stream, const char* bytes, size_t len);
int ccjs_console_printf(ccjs_console_stream stream, const char* format, ...);

#ifndef CCJS_CONSOLE_NO_PRINTF_MACRO
#define printf(...) ccjs_console_printf(CCJS_CONSOLE_STDOUT, __VA_ARGS__)
#endif

#endif
