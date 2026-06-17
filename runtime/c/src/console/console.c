#define CCJS_CONSOLE_NO_PRINTF_MACRO
#include "ccjs/console.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ccjs/array.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include <limits.h>
#include <uv.h>
#endif

static ccjs_console_adapter ccjs_console_active_adapter = { 0 };

typedef struct ccjs_console_format_buffer {
  char* bytes;
  size_t len;
  size_t cap;
} ccjs_console_format_buffer;

#ifdef CCJS_LOOP_BACKEND_LIBUV
static ccjs_status ccjs_console_libuv_write(ccjs_console_stream stream, const char* bytes, size_t len);
#endif

#ifndef CCJS_CONSOLE_DISABLE_HOST
static ccjs_status ccjs_console_host_write(ccjs_console_stream stream, const char* bytes, size_t len);
#endif

static ccjs_status ccjs_console_format_value_into(ccjs_console_format_buffer* buffer, ccjs_value value, unsigned int depth);

static void ccjs_console_format_buffer_dispose(ccjs_console_format_buffer* buffer) {
  if (buffer == 0) {
    return;
  }

  free(buffer->bytes);
  buffer->bytes = 0;
  buffer->len = 0;
  buffer->cap = 0;
}

static ccjs_status ccjs_console_format_buffer_reserve(ccjs_console_format_buffer* buffer, size_t additional) {
  if (buffer == 0) {
    return CCJS_ERR_TYPE;
  }

  if (additional > ((size_t)-1) - buffer->len - 1) {
    return CCJS_ERR_OOM;
  }

  size_t needed = buffer->len + additional + 1;

  if (needed <= buffer->cap) {
    return CCJS_OK;
  }

  size_t cap = buffer->cap == 0 ? 64 : buffer->cap;

  while (cap < needed) {
    if (cap > ((size_t)-1) / 2) {
      return CCJS_ERR_OOM;
    }

    cap *= 2;
  }

  char* bytes = (char*)realloc(buffer->bytes, cap);

  if (bytes == 0) {
    return CCJS_ERR_OOM;
  }

  buffer->bytes = bytes;
  buffer->cap = cap;

  return CCJS_OK;
}

static ccjs_status ccjs_console_format_append(ccjs_console_format_buffer* buffer, const char* bytes, size_t len) {
  if (buffer == 0 || (bytes == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status status = ccjs_console_format_buffer_reserve(buffer, len);

  if (status != CCJS_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(buffer->bytes + buffer->len, bytes, len);
  }

  buffer->len += len;
  buffer->bytes[buffer->len] = 0;

  return CCJS_OK;
}

static ccjs_status ccjs_console_format_append_literal(ccjs_console_format_buffer* buffer, const char* bytes) {
  return ccjs_console_format_append(buffer, bytes, bytes == 0 ? 0 : strlen(bytes));
}

static ccjs_status ccjs_console_format_append_number(ccjs_console_format_buffer* buffer, double value) {
  char bytes[64];
  int len = snprintf(bytes, sizeof(bytes), "%.17g", value);

  if (len < 0 || (size_t)len >= sizeof(bytes)) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_console_format_append(buffer, bytes, (size_t)len);
}

static ccjs_status ccjs_console_format_array(ccjs_console_format_buffer* buffer, ccjs_value value, unsigned int depth) {
  if (value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_array* array = (ccjs_array*)value.as.ref;
  ccjs_status status = ccjs_console_format_append_literal(buffer, "[");

  if (status != CCJS_OK) {
    return status;
  }

  for (size_t index = 0; index < array->len; index += 1) {
    if (index != 0) {
      status = ccjs_console_format_append_literal(buffer, ", ");

      if (status != CCJS_OK) {
        return status;
      }
    }

    status = ccjs_console_format_value_into(buffer, array->items[index], depth + 1);

    if (status != CCJS_OK) {
      return status;
    }
  }

  return ccjs_console_format_append_literal(buffer, "]");
}

static ccjs_status ccjs_console_format_object(ccjs_console_format_buffer* buffer, ccjs_value value, unsigned int depth) {
  if (value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_object* object = (ccjs_object*)value.as.ref;

  if (object->shape->field_count == 0) {
    return ccjs_console_format_append_literal(buffer, "{}");
  }

  ccjs_status status = ccjs_console_format_append_literal(buffer, "{ ");

  if (status != CCJS_OK) {
    return status;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    if (index != 0) {
      status = ccjs_console_format_append_literal(buffer, ", ");

      if (status != CCJS_OK) {
        return status;
      }
    }

    const char* name = object->shape->fields[index].name == 0 ? "" : object->shape->fields[index].name;

    status = ccjs_console_format_append(buffer, name, strlen(name));

    if (status == CCJS_OK) {
      status = ccjs_console_format_append_literal(buffer, ": ");
    }

    if (status != CCJS_OK) {
      return status;
    }

    ccjs_value field = ccjs_undefined_value();

    status = ccjs_object_get_known(value, index, &field);

    if (status == CCJS_OK) {
      status = ccjs_console_format_value_into(buffer, field, depth + 1);
    }

    ccjs_release(field);

    if (status != CCJS_OK) {
      return status;
    }
  }

  return ccjs_console_format_append_literal(buffer, " }");
}

static ccjs_status ccjs_console_format_value_into(ccjs_console_format_buffer* buffer, ccjs_value value, unsigned int depth) {
  if (depth > 8) {
    return ccjs_console_format_append_literal(buffer, "[Object]");
  }

  if (value.tag == CCJS_TAG_UNDEFINED) {
    return ccjs_console_format_append_literal(buffer, "undefined");
  }

  if (value.tag == CCJS_TAG_NULL) {
    return ccjs_console_format_append_literal(buffer, "null");
  }

  if (value.tag == CCJS_TAG_BOOL) {
    return ccjs_console_format_append_literal(buffer, value.as.boolean ? "true" : "false");
  }

  if (value.tag == CCJS_TAG_NUMBER) {
    return ccjs_console_format_append_number(buffer, value.as.number);
  }

  if (value.tag == CCJS_TAG_STRING) {
    if (value.as.ref == 0) {
      return CCJS_ERR_TYPE;
    }

    ccjs_string* string = (ccjs_string*)value.as.ref;

    return ccjs_console_format_append(buffer, string->bytes, string->len);
  }

  if (value.tag == CCJS_TAG_ARRAY) {
    return ccjs_console_format_array(buffer, value, depth);
  }

  if (value.tag == CCJS_TAG_OBJECT) {
    return ccjs_console_format_object(buffer, value, depth);
  }

  if (value.tag == CCJS_TAG_MAP) {
    return ccjs_console_format_append_literal(buffer, "[Map]");
  }

  if (value.tag == CCJS_TAG_SET) {
    return ccjs_console_format_append_literal(buffer, "[Set]");
  }

  if (value.tag == CCJS_TAG_BYTES) {
    return ccjs_console_format_append_literal(buffer, "[Bytes]");
  }

  if (value.tag == CCJS_TAG_FUNCTION) {
    return ccjs_console_format_append_literal(buffer, "[Function]");
  }

  return ccjs_console_format_append_literal(buffer, "undefined");
}

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

ccjs_status ccjs_console_format_value(ccjs_allocator* allocator, ccjs_value value, ccjs_value* out) {
  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_console_format_buffer buffer = { 0 };
  ccjs_status status = ccjs_console_format_value_into(&buffer, value, 0);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, buffer.bytes == 0 ? "" : buffer.bytes, buffer.len, out);
  }

  ccjs_console_format_buffer_dispose(&buffer);

  return status;
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
