#define CCJS_CONSOLE_NO_PRINTF_MACRO
#include "ccjs/console.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include <limits.h>
#include <uv.h>
#endif

static ccjs_console_adapter ccjs_console_active_adapter = { 0 };

#ifdef CCJS_LOOP_BACKEND_LIBUV
static ccjs_status ccjs_console_libuv_write(ccjs_console_stream stream, const char* bytes, size_t len);
#endif

#ifndef CCJS_CONSOLE_DISABLE_HOST
static ccjs_status ccjs_console_host_write(ccjs_console_stream stream, const char* bytes, size_t len);
#endif

void ccjs_console_set_adapter(ccjs_console_adapter adapter) {
  ccjs_console_active_adapter = adapter;
}

ccjs_console_adapter ccjs_console_get_adapter(void) {
  return ccjs_console_active_adapter;
}

void ccjs_console_clear_adapter(void) {
  ccjs_console_active_adapter = (ccjs_console_adapter){ 0 };
}

ccjs_status ccjs_console_write(ccjs_console_stream stream, const char* bytes, size_t len) {
  if (stream != CCJS_CONSOLE_STDOUT && stream != CCJS_CONSOLE_STDERR) {
    return CCJS_ERR_TYPE;
  }

  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_console_active_adapter.write != 0) {
    return ccjs_console_active_adapter.write(ccjs_console_active_adapter.user, stream, bytes, len);
  }

#ifdef CCJS_LOOP_BACKEND_LIBUV
  return ccjs_console_libuv_write(stream, bytes, len);
#elif !defined(CCJS_CONSOLE_DISABLE_HOST)
  return ccjs_console_host_write(stream, bytes, len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_console_write_line(ccjs_console_stream stream, const char* bytes, size_t len) {
  ccjs_status status = ccjs_console_write(stream, bytes, len);

  if (status != CCJS_OK) {
    return status;
  }

  return ccjs_console_write(stream, "\n", 1);
}

int ccjs_console_printf(ccjs_console_stream stream, const char* format, ...) {
  va_list args;
  va_list copy;
  int len;
  char* bytes;
  int written;
  ccjs_status status;

  if (format == 0) {
    return -1;
  }

  va_start(args, format);
  va_copy(copy, args);
  len = vsnprintf(0, 0, format, copy);
  va_end(copy);

  if (len < 0) {
    va_end(args);
    return -1;
  }

  bytes = (char*)malloc((size_t)len + 1);

  if (bytes == 0) {
    va_end(args);
    return -1;
  }

  written = vsnprintf(bytes, (size_t)len + 1, format, args);
  va_end(args);

  if (written < 0 || written > len) {
    free(bytes);
    return -1;
  }

  status = ccjs_console_write(stream, bytes, (size_t)len);
  free(bytes);

  return status == CCJS_OK ? len : -1;
}

#ifdef CCJS_LOOP_BACKEND_LIBUV
static ccjs_status ccjs_console_libuv_write(ccjs_console_stream stream, const char* bytes, size_t len) {
  int fd = stream == CCJS_CONSOLE_STDERR ? 2 : 1;
  size_t offset = 0;

  while (offset < len) {
    size_t remaining = len - offset;
    unsigned int chunk = remaining > UINT_MAX ? UINT_MAX : (unsigned int)remaining;
    uv_buf_t buffer = uv_buf_init((char*)bytes + offset, chunk);
    uv_fs_t request;
    int result = uv_fs_write(0, &request, fd, &buffer, 1, -1, 0);
    uv_fs_req_cleanup(&request);

    if (result <= 0) {
      return CCJS_ERR_FIELD;
    }

    offset += (size_t)result;
  }

  return CCJS_OK;
}
#endif

#ifndef CCJS_CONSOLE_DISABLE_HOST
static ccjs_status ccjs_console_host_write(ccjs_console_stream stream, const char* bytes, size_t len) {
  FILE* file = stream == CCJS_CONSOLE_STDERR ? stderr : stdout;

  if (len != 0 && fwrite(bytes, 1, len, file) != len) {
    return CCJS_ERR_FIELD;
  }

  return fflush(file) == 0 ? CCJS_OK : CCJS_ERR_FIELD;
}
#endif
