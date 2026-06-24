#define INOX_CONSOLE_NO_PRINTF_MACRO
#include "inox/console.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "inox/array.h"
#include "inox/object.h"
#include "inox/string.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include <limits.h>
#include <uv.h>
#endif

static inox_console_adapter inox_console_active_adapter = { 0 };

typedef struct inox_console_format_buffer {
  char* bytes;
  size_t len;
  size_t cap;
} inox_console_format_buffer;

#ifdef INOX_LOOP_BACKEND_LIBUV
static inox_status inox_console_libuv_write(inox_console_stream stream, const char* bytes, size_t len);
#endif

#ifndef INOX_CONSOLE_DISABLE_HOST
static inox_status inox_console_host_write(inox_console_stream stream, const char* bytes, size_t len);
#endif

static inox_status inox_console_format_value_into(inox_console_format_buffer* buffer, inox_value value, unsigned int depth);

static void inox_console_format_buffer_dispose(inox_console_format_buffer* buffer) {
  if (buffer == 0) {
    return;
  }

  free(buffer->bytes);
  buffer->bytes = 0;
  buffer->len = 0;
  buffer->cap = 0;
}

static inox_status inox_console_format_buffer_reserve(inox_console_format_buffer* buffer, size_t additional) {
  if (buffer == 0) {
    return INOX_ERR_TYPE;
  }

  if (additional > ((size_t)-1) - buffer->len - 1) {
    return INOX_ERR_OOM;
  }

  size_t needed = buffer->len + additional + 1;

  if (needed <= buffer->cap) {
    return INOX_OK;
  }

  size_t cap = buffer->cap == 0 ? 64 : buffer->cap;

  while (cap < needed) {
    if (cap > ((size_t)-1) / 2) {
      return INOX_ERR_OOM;
    }

    cap *= 2;
  }

  char* bytes = (char*)realloc(buffer->bytes, cap);

  if (bytes == 0) {
    return INOX_ERR_OOM;
  }

  buffer->bytes = bytes;
  buffer->cap = cap;

  return INOX_OK;
}

static inox_status inox_console_format_append(inox_console_format_buffer* buffer, const char* bytes, size_t len) {
  if (buffer == 0 || (bytes == 0 && len != 0)) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_console_format_buffer_reserve(buffer, len);

  if (status != INOX_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(buffer->bytes + buffer->len, bytes, len);
  }

  buffer->len += len;
  buffer->bytes[buffer->len] = 0;

  return INOX_OK;
}

static inox_status inox_console_format_append_literal(inox_console_format_buffer* buffer, const char* bytes) {
  return inox_console_format_append(buffer, bytes, bytes == 0 ? 0 : strlen(bytes));
}

static inox_status inox_console_format_append_number(inox_console_format_buffer* buffer, double value) {
  char bytes[64];
  int len = snprintf(bytes, sizeof(bytes), "%.17g", value);

  if (len < 0 || (size_t)len >= sizeof(bytes)) {
    return INOX_ERR_TYPE;
  }

  return inox_console_format_append(buffer, bytes, (size_t)len);
}

static bool inox_console_object_get_string_field(
  inox_value object_value,
  inox_object* object,
  const char* name,
  inox_value* out
) {
  if (object == 0 || object->shape == 0 || name == 0 || out == 0) {
    return false;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    const char* field_name = object->shape->fields[index].name;

    if (field_name == 0 || strcmp(field_name, name) != 0) {
      continue;
    }

    inox_status status = inox_object_get_known(object_value, index, out);

    if (status != INOX_OK) {
      return false;
    }

    if (out->tag == INOX_TAG_STRING && out->as.ref != 0) {
      return true;
    }

    inox_release(*out);
    *out = inox_undefined_value();
    return false;
  }

  return false;
}

static inox_status inox_console_format_error_object(
  inox_console_format_buffer* buffer,
  inox_value object_value,
  inox_object* object
) {
  inox_value name_value = inox_undefined_value();
  inox_value message_value = inox_undefined_value();

  if (
    !inox_console_object_get_string_field(object_value, object, "name", &name_value) ||
    !inox_console_object_get_string_field(object_value, object, "message", &message_value)
  ) {
    inox_release(name_value);
    inox_release(message_value);
    return INOX_ERR_FIELD;
  }

  inox_string* name = (inox_string*)name_value.as.ref;
  inox_string* message = (inox_string*)message_value.as.ref;

  inox_status status = inox_console_format_append(buffer, name->bytes, name->len);

  if (status == INOX_OK) {
    status = inox_console_format_append_literal(buffer, ": ");
  }

  if (status == INOX_OK) {
    status = inox_console_format_append(buffer, message->bytes, message->len);
  }

  inox_release(name_value);
  inox_release(message_value);

  return status;
}

static inox_status inox_console_format_array(inox_console_format_buffer* buffer, inox_value value, unsigned int depth) {
  if (value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_array* array = (inox_array*)value.as.ref;
  inox_status status = inox_console_format_append_literal(buffer, "[");

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < array->len; index += 1) {
    if (index != 0) {
      status = inox_console_format_append_literal(buffer, ", ");

      if (status != INOX_OK) {
        return status;
      }
    }

    status = inox_console_format_value_into(buffer, array->items[index], depth + 1);

    if (status != INOX_OK) {
      return status;
    }
  }

  return inox_console_format_append_literal(buffer, "]");
}

static inox_status inox_console_format_object(inox_console_format_buffer* buffer, inox_value value, unsigned int depth) {
  if (value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_object* object = (inox_object*)value.as.ref;

  inox_status error_status = inox_console_format_error_object(buffer, value, object);

  if (error_status == INOX_OK) {
    return INOX_OK;
  }

  if (error_status != INOX_ERR_FIELD) {
    return error_status;
  }

  if (object->shape->field_count == 0) {
    return inox_console_format_append_literal(buffer, "{}");
  }

  inox_status status = inox_console_format_append_literal(buffer, "{ ");

  if (status != INOX_OK) {
    return status;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    if (index != 0) {
      status = inox_console_format_append_literal(buffer, ", ");

      if (status != INOX_OK) {
        return status;
      }
    }

    const char* name = object->shape->fields[index].name == 0 ? "" : object->shape->fields[index].name;

    status = inox_console_format_append(buffer, name, strlen(name));

    if (status == INOX_OK) {
      status = inox_console_format_append_literal(buffer, ": ");
    }

    if (status != INOX_OK) {
      return status;
    }

    inox_value field = inox_undefined_value();

    status = inox_object_get_known(value, index, &field);

    if (status == INOX_OK) {
      status = inox_console_format_value_into(buffer, field, depth + 1);
    }

    inox_release(field);

    if (status != INOX_OK) {
      return status;
    }
  }

  return inox_console_format_append_literal(buffer, " }");
}

static inox_status inox_console_format_value_into(inox_console_format_buffer* buffer, inox_value value, unsigned int depth) {
  if (depth > 8) {
    return inox_console_format_append_literal(buffer, "[Object]");
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return inox_console_format_append_literal(buffer, "undefined");
  }

  if (value.tag == INOX_TAG_NULL) {
    return inox_console_format_append_literal(buffer, "null");
  }

  if (value.tag == INOX_TAG_BOOL) {
    return inox_console_format_append_literal(buffer, value.as.boolean ? "true" : "false");
  }

  if (value.tag == INOX_TAG_NUMBER) {
    return inox_console_format_append_number(buffer, value.as.number);
  }

  if (value.tag == INOX_TAG_STRING) {
    if (value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    inox_string* string = (inox_string*)value.as.ref;

    return inox_console_format_append(buffer, string->bytes, string->len);
  }

  if (value.tag == INOX_TAG_ARRAY) {
    return inox_console_format_array(buffer, value, depth);
  }

  if (value.tag == INOX_TAG_OBJECT) {
    return inox_console_format_object(buffer, value, depth);
  }

  if (value.tag == INOX_TAG_MAP) {
    return inox_console_format_append_literal(buffer, "[Map]");
  }

  if (value.tag == INOX_TAG_SET) {
    return inox_console_format_append_literal(buffer, "[Set]");
  }

  if (value.tag == INOX_TAG_BYTES) {
    return inox_console_format_append_literal(buffer, "[Bytes]");
  }

  if (value.tag == INOX_TAG_FUNCTION) {
    return inox_console_format_append_literal(buffer, "[Function]");
  }

  return inox_console_format_append_literal(buffer, "undefined");
}

void inox_console_set_adapter(inox_console_adapter adapter) {
  inox_console_active_adapter = adapter;
}

inox_console_adapter inox_console_get_adapter(void) {
  return inox_console_active_adapter;
}

void inox_console_clear_adapter(void) {
  inox_console_active_adapter = (inox_console_adapter){ 0 };
}

inox_status inox_console_write(inox_console_stream stream, const char* bytes, size_t len) {
  if (stream != INOX_CONSOLE_STDOUT && stream != INOX_CONSOLE_STDERR) {
    return INOX_ERR_TYPE;
  }

  if (bytes == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

  if (inox_console_active_adapter.write != 0) {
    return inox_console_active_adapter.write(inox_console_active_adapter.user, stream, bytes, len);
  }

#ifdef INOX_LOOP_BACKEND_LIBUV
  return inox_console_libuv_write(stream, bytes, len);
#elif !defined(INOX_CONSOLE_DISABLE_HOST)
  return inox_console_host_write(stream, bytes, len);
#else
  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_console_write_line(inox_console_stream stream, const char* bytes, size_t len) {
  inox_status status = inox_console_write(stream, bytes, len);

  if (status != INOX_OK) {
    return status;
  }

  return inox_console_write(stream, "\n", 1);
}

inox_status inox_console_format_value(inox_allocator* allocator, inox_value value, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  inox_console_format_buffer buffer = { 0 };
  inox_status status = inox_console_format_value_into(&buffer, value, 0);

  if (status == INOX_OK) {
    status = inox_string_from_literal(allocator, buffer.bytes == 0 ? "" : buffer.bytes, buffer.len, out);
  }

  inox_console_format_buffer_dispose(&buffer);

  return status;
}

int inox_console_printf(inox_console_stream stream, const char* format, ...) {
  va_list args;
  va_list copy;
  int len;
  char* bytes;
  int written;
  inox_status status;

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

  status = inox_console_write(stream, bytes, (size_t)len);
  free(bytes);

  return status == INOX_OK ? len : -1;
}

#ifdef INOX_LOOP_BACKEND_LIBUV
static inox_status inox_console_libuv_write(inox_console_stream stream, const char* bytes, size_t len) {
  int fd = stream == INOX_CONSOLE_STDERR ? 2 : 1;
  size_t offset = 0;

  while (offset < len) {
    size_t remaining = len - offset;
    unsigned int chunk = remaining > UINT_MAX ? UINT_MAX : (unsigned int)remaining;
    uv_buf_t buffer = uv_buf_init((char*)bytes + offset, chunk);
    uv_fs_t request;
    int result = uv_fs_write(0, &request, fd, &buffer, 1, -1, 0);
    uv_fs_req_cleanup(&request);

    if (result <= 0) {
      return INOX_ERR_FIELD;
    }

    offset += (size_t)result;
  }

  return INOX_OK;
}
#endif

#ifndef INOX_CONSOLE_DISABLE_HOST
static inox_status inox_console_host_write(inox_console_stream stream, const char* bytes, size_t len) {
  FILE* file = stream == INOX_CONSOLE_STDERR ? stderr : stdout;

  if (len != 0 && fwrite(bytes, 1, len, file) != len) {
    return INOX_ERR_FIELD;
  }

  return fflush(file) == 0 ? INOX_OK : INOX_ERR_FIELD;
}
#endif
