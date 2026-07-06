#define INOX_CONSOLE_NO_PRINTF_MACRO
#include "inox/console.h"

#include <stdarg.h>
#include <memory>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/string.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include <limits.h>
#include <uv.h>
#endif

struct ConsoleFormatBuffer {
  char* bytes;
  size_t length;
  size_t capacity;
};

#ifdef INOX_LOOP_BACKEND_LIBUV
static inox_status inox_console_libuv_write(inox::ConsoleStream stream, const char* bytes, size_t len);
#endif

#ifndef INOX_CONSOLE_DISABLE_HOST
static inox_status inox_console_host_write(inox::ConsoleStream stream, const char* bytes, size_t len);
#endif

static inox_status inox_console_format_value_into(ConsoleFormatBuffer* buffer, inox_value value, unsigned int depth);

static void inox_console_format_buffer_dispose(ConsoleFormatBuffer* buffer) {
  if (buffer == 0) {
    return;
  }

  free(buffer->bytes);
  buffer->bytes = 0;
  buffer->length = 0;
  buffer->capacity = 0;
}

static inox_status inox_console_format_buffer_reserve(ConsoleFormatBuffer* buffer, size_t additional) {
  if (buffer == 0) {
    return INOX_ERR_TYPE;
  }

  if (additional > ((size_t)-1) - buffer->length - 1) {
    return INOX_ERR_OOM;
  }

  size_t needed = buffer->length + additional + 1;

  if (needed <= buffer->capacity) {
    return INOX_OK;
  }

  size_t cap = buffer->capacity == 0 ? 64 : buffer->capacity;

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
  buffer->capacity = cap;

  return INOX_OK;
}

static inox_status inox_console_format_append(ConsoleFormatBuffer* buffer, const char* bytes, size_t len) {
  if (buffer == 0 || (bytes == 0 && len != 0)) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_console_format_buffer_reserve(buffer, len);

  if (status != INOX_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(buffer->bytes + buffer->length, bytes, len);
  }

  buffer->length += len;
  buffer->bytes[buffer->length] = 0;

  return INOX_OK;
}

static inox_status inox_console_format_append_literal(ConsoleFormatBuffer* buffer, const char* bytes) {
  return inox_console_format_append(buffer, bytes, bytes == 0 ? 0 : strlen(bytes));
}

static inox_status inox_console_format_append_number(ConsoleFormatBuffer* buffer, double value) {
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
  ConsoleFormatBuffer* buffer,
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

static inox_status inox_console_format_array(ConsoleFormatBuffer* buffer, inox_value value, unsigned int depth) {
  if (value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  ArrayStorage* array = (ArrayStorage*)value.as.ref;
  inox_status status = inox_console_format_append_literal(buffer, "[");

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < array->length; index += 1) {
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

static inox_status inox_console_format_class_instance_into(
  ConsoleFormatBuffer* buffer,
  const inox_class_descriptor* descriptor,
  const void* instance,
  unsigned int depth
) {
  if (depth > 8) {
    return inox_console_format_append_literal(buffer, "[Object]");
  }

  if (buffer == 0 || descriptor == 0 || instance == 0 || descriptor->read_field == 0) {
    return INOX_ERR_TYPE;
  }

  const char* class_name = descriptor->name == 0 ? "" : descriptor->name;
  inox_status status = inox_console_format_append(buffer, class_name, strlen(class_name));

  if (status == INOX_OK) {
    status = inox_console_format_append_literal(buffer, " {");
  }

  if (status != INOX_OK) {
    return status;
  }

  uint32_t printed = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    if (printed == 0) {
      status = inox_console_format_append_literal(buffer, " ");
    } else {
      status = inox_console_format_append_literal(buffer, ", ");
    }

    if (status != INOX_OK) {
      return status;
    }

    const char* name = field->name == 0 ? "" : field->name;

    status = inox_console_format_append(buffer, name, strlen(name));

    if (status == INOX_OK) {
      status = inox_console_format_append_literal(buffer, ": ");
    }

    if (status != INOX_OK) {
      return status;
    }

    inox_value value = inox_undefined_value();

    status = descriptor->read_field(instance, index, &value);

    if (status == INOX_OK) {
      status = inox_console_format_value_into(buffer, value, depth + 1);
    }

    inox_release(value);

    if (status != INOX_OK) {
      return status;
    }

    printed += 1;
  }

  if (printed == 0) {
    return inox_console_format_append_literal(buffer, "}");
  }

  return inox_console_format_append_literal(buffer, " }");
}

static inox_status inox_console_format_object(ConsoleFormatBuffer* buffer, inox_value value, unsigned int depth) {
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

static inox_status inox_console_format_value_into(ConsoleFormatBuffer* buffer, inox_value value, unsigned int depth) {
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

  if (value.tag == INOX_TAG_CLASS_INSTANCE) {
    if (value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    inox_class_instance_ref* instance = (inox_class_instance_ref*)value.as.ref;

    return inox_console_format_class_instance_into(buffer, instance->descriptor, instance->instance, depth);
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

namespace inox {

static inox_status console_newline(ConsoleStream stream);
static inox_status console_write(ConsoleStream stream, const char* bytes, size_t len);
static inox_status console_write_line(ConsoleStream stream, const char* bytes, size_t len);
static inox_status console_print_value(ConsoleStream stream, inox_value value);
static inox_status console_print_value_line(ConsoleStream stream, inox_value value);
static int console_printf(ConsoleStream stream, const char* format, ...);

ConsoleArg::ConsoleArg()
  : kind(ConsoleArgKind::empty),
    signed_integer(0),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(bool value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer(value ? 1 : 0),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(char value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer((long long)value),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(signed char value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer((long long)value),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(unsigned char value)
  : kind(ConsoleArgKind::unsigned_integer),
    signed_integer(0),
    unsigned_integer((unsigned long long)value),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(short value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer((long long)value),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(unsigned short value)
  : kind(ConsoleArgKind::unsigned_integer),
    signed_integer(0),
    unsigned_integer((unsigned long long)value),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(int value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer((long long)value),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(unsigned int value)
  : kind(ConsoleArgKind::unsigned_integer),
    signed_integer(0),
    unsigned_integer((unsigned long long)value),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(long value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer((long long)value),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(unsigned long value)
  : kind(ConsoleArgKind::unsigned_integer),
    signed_integer(0),
    unsigned_integer((unsigned long long)value),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(long long value)
  : kind(ConsoleArgKind::signed_integer),
    signed_integer(value),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(unsigned long long value)
  : kind(ConsoleArgKind::unsigned_integer),
    signed_integer(0),
    unsigned_integer(value),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(float value)
  : kind(ConsoleArgKind::number),
    signed_integer(0),
    unsigned_integer(0),
    number((double)value),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(double value)
  : kind(ConsoleArgKind::number),
    signed_integer(0),
    unsigned_integer(0),
    number(value),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(const char* value)
  : kind(ConsoleArgKind::c_string),
    signed_integer(0),
    unsigned_integer(0),
    number(0),
    bytes(value == nullptr ? "" : value),
    len(value == nullptr ? 0 : strlen(value)),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(StringView value)
  : kind(ConsoleArgKind::string_view),
    signed_integer(0),
    unsigned_integer(0),
    number(0),
    bytes(value.bytes),
    len(value.len),
    string(nullptr),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(const String& value)
  : kind(ConsoleArgKind::string),
    signed_integer(0),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(std::addressof(value)),
    value(inox_undefined_value()) {}

ConsoleArg::ConsoleArg(inox_value value)
  : kind(ConsoleArgKind::value),
    signed_integer(0),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(value) {}

ConsoleArg::ConsoleArg(const Value& value)
  : kind(ConsoleArgKind::value),
    signed_integer(0),
    unsigned_integer(0),
    number(0),
    bytes(nullptr),
    len(0),
    string(nullptr),
    value(value.raw()) {}

static inox_status console_newline(ConsoleStream stream) {
  return console_write(stream, "\n", 1);
}

static inox_status console_write(ConsoleStream stream, const char* bytes, size_t len) {
  if (bytes == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

#ifdef INOX_LOOP_BACKEND_LIBUV
  return inox_console_libuv_write(stream, bytes, len);
#elif !defined(INOX_CONSOLE_DISABLE_HOST)
  return inox_console_host_write(stream, bytes, len);
#else
  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status console_write_line(ConsoleStream stream, const char* bytes, size_t len) {
  inox_status status = console_write(stream, bytes, len);

  if (status != INOX_OK) {
    return status;
  }

  return console_write(stream, "\n", 1);
}

static inox_status console_print_value(ConsoleStream stream, inox_value value) {
  ConsoleFormatBuffer buffer = { 0 };
  inox_status status = inox_console_format_value_into(&buffer, value, 0);

  if (status == INOX_OK) {
    status = console_write(stream, buffer.bytes == 0 ? "" : buffer.bytes, buffer.length);
  }

  inox_console_format_buffer_dispose(&buffer);

  return status;
}

static inox_status console_print_value_line(ConsoleStream stream, inox_value value) {
  ConsoleFormatBuffer buffer = { 0 };
  inox_status status = inox_console_format_value_into(&buffer, value, 0);

  if (status == INOX_OK) {
    status = console_write_line(stream, buffer.bytes == 0 ? "" : buffer.bytes, buffer.length);
  }

  inox_console_format_buffer_dispose(&buffer);

  return status;
}

String console_format_class_instance(
  const inox_class_descriptor& descriptor,
  const void* instance
) {
  ConsoleFormatBuffer buffer = { 0 };
  inox_status status = inox_console_format_class_instance_into(&buffer, &descriptor, instance, 0);
  String out;

  if (status == INOX_OK) {
    out = String(buffer.bytes == 0 ? "" : buffer.bytes, buffer.length);
  }

  inox_console_format_buffer_dispose(&buffer);

  return out;
}

} // namespace inox

#ifdef INOX_LOOP_BACKEND_LIBUV
static inox_status inox_console_libuv_write(inox::ConsoleStream stream, const char* bytes, size_t len) {
  int fd = stream == inox::ConsoleStream::stderr ? 2 : 1;
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
static inox_status inox_console_host_write(inox::ConsoleStream stream, const char* bytes, size_t len) {
  FILE* file = stream == inox::ConsoleStream::stderr ? stderr : stdout;

  if (len != 0 && fwrite(bytes, 1, len, file) != len) {
    return INOX_ERR_FIELD;
  }

  return fflush(file) == 0 ? INOX_OK : INOX_ERR_FIELD;
}
#endif

namespace inox {

static int console_printf(ConsoleStream stream, const char* format, ...) {
  if (format == nullptr) {
    format = "";
  }

  va_list args;
  va_list copy;
  va_start(args, format);
  va_copy(copy, args);
  int len = vsnprintf(nullptr, 0, format, copy);
  va_end(copy);

  if (len < 0) {
    va_end(args);
    return -1;
  }

  char stack_buffer[256];
  char* bytes = stack_buffer;

  if ((size_t)len + 1 > sizeof(stack_buffer)) {
    bytes = (char*)malloc((size_t)len + 1);

    if (bytes == nullptr) {
      va_end(args);
      return -1;
    }
  }

  int written = vsnprintf(bytes, (size_t)len + 1, format, args);
  va_end(args);

  if (written == len && console_write(stream, bytes, (size_t)len) != INOX_OK) {
    written = -1;
  }

  if (bytes != stack_buffer) {
    free(bytes);
  }

  return written;
}

} // namespace inox

static inox_status inox_console_printf_line(
  inox::ConsoleStream stream,
  inox::StringView format,
  const inox::ConsoleArg* args,
  size_t arg_count
);

void console::log() const {
  if (inox::thrown()) {
    return;
  }

  inox::console_newline(inox::ConsoleStream::stdout);
}

void console::log(inox::StringView text) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_write_line(inox::ConsoleStream::stdout, text.bytes, text.len);
}

void console::log(inox_value value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stdout, value);
}

void console::log(const inox::Value& value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stdout, value.raw());
}

void console::log(
  inox::StringView format,
  inox::ConsoleArg arg0,
  inox::ConsoleArg arg1,
  inox::ConsoleArg arg2,
  inox::ConsoleArg arg3,
  inox::ConsoleArg arg4,
  inox::ConsoleArg arg5,
  inox::ConsoleArg arg6,
  inox::ConsoleArg arg7,
  inox::ConsoleArg arg8,
  inox::ConsoleArg arg9,
  inox::ConsoleArg arg10,
  inox::ConsoleArg arg11,
  inox::ConsoleArg arg12,
  inox::ConsoleArg arg13,
  inox::ConsoleArg arg14,
  inox::ConsoleArg arg15
) const {
  const inox::ConsoleArg args[] = {
    arg0,
    arg1,
    arg2,
    arg3,
    arg4,
    arg5,
    arg6,
    arg7,
    arg8,
    arg9,
    arg10,
    arg11,
    arg12,
    arg13,
    arg14,
    arg15
  };

  inox_console_printf_line(inox::ConsoleStream::stdout, format, args, 16);
}

void console::info() const {
  if (inox::thrown()) {
    return;
  }

  inox::console_newline(inox::ConsoleStream::stdout);
}

void console::info(inox::StringView text) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_write_line(inox::ConsoleStream::stdout, text.bytes, text.len);
}

void console::info(inox_value value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stdout, value);
}

void console::info(const inox::Value& value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stdout, value.raw());
}

void console::info(
  inox::StringView format,
  inox::ConsoleArg arg0,
  inox::ConsoleArg arg1,
  inox::ConsoleArg arg2,
  inox::ConsoleArg arg3,
  inox::ConsoleArg arg4,
  inox::ConsoleArg arg5,
  inox::ConsoleArg arg6,
  inox::ConsoleArg arg7,
  inox::ConsoleArg arg8,
  inox::ConsoleArg arg9,
  inox::ConsoleArg arg10,
  inox::ConsoleArg arg11,
  inox::ConsoleArg arg12,
  inox::ConsoleArg arg13,
  inox::ConsoleArg arg14,
  inox::ConsoleArg arg15
) const {
  const inox::ConsoleArg args[] = {
    arg0,
    arg1,
    arg2,
    arg3,
    arg4,
    arg5,
    arg6,
    arg7,
    arg8,
    arg9,
    arg10,
    arg11,
    arg12,
    arg13,
    arg14,
    arg15
  };

  inox_console_printf_line(inox::ConsoleStream::stdout, format, args, 16);
}

void console::warn() const {
  if (inox::thrown()) {
    return;
  }

  inox::console_newline(inox::ConsoleStream::stderr);
}

void console::warn(inox::StringView text) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_write_line(inox::ConsoleStream::stderr, text.bytes, text.len);
}

void console::warn(inox_value value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stderr, value);
}

void console::warn(const inox::Value& value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stderr, value.raw());
}

void console::warn(
  inox::StringView format,
  inox::ConsoleArg arg0,
  inox::ConsoleArg arg1,
  inox::ConsoleArg arg2,
  inox::ConsoleArg arg3,
  inox::ConsoleArg arg4,
  inox::ConsoleArg arg5,
  inox::ConsoleArg arg6,
  inox::ConsoleArg arg7,
  inox::ConsoleArg arg8,
  inox::ConsoleArg arg9,
  inox::ConsoleArg arg10,
  inox::ConsoleArg arg11,
  inox::ConsoleArg arg12,
  inox::ConsoleArg arg13,
  inox::ConsoleArg arg14,
  inox::ConsoleArg arg15
) const {
  const inox::ConsoleArg args[] = {
    arg0,
    arg1,
    arg2,
    arg3,
    arg4,
    arg5,
    arg6,
    arg7,
    arg8,
    arg9,
    arg10,
    arg11,
    arg12,
    arg13,
    arg14,
    arg15
  };

  inox_console_printf_line(inox::ConsoleStream::stderr, format, args, 16);
}

void console::error() const {
  if (inox::thrown()) {
    return;
  }

  inox::console_newline(inox::ConsoleStream::stderr);
}

void console::error(inox::StringView text) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_write_line(inox::ConsoleStream::stderr, text.bytes, text.len);
}

void console::error(inox_value value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stderr, value);
}

void console::error(const inox::Value& value) const {
  if (inox::thrown()) {
    return;
  }

  inox::console_print_value_line(inox::ConsoleStream::stderr, value.raw());
}

void console::error(
  inox::StringView format,
  inox::ConsoleArg arg0,
  inox::ConsoleArg arg1,
  inox::ConsoleArg arg2,
  inox::ConsoleArg arg3,
  inox::ConsoleArg arg4,
  inox::ConsoleArg arg5,
  inox::ConsoleArg arg6,
  inox::ConsoleArg arg7,
  inox::ConsoleArg arg8,
  inox::ConsoleArg arg9,
  inox::ConsoleArg arg10,
  inox::ConsoleArg arg11,
  inox::ConsoleArg arg12,
  inox::ConsoleArg arg13,
  inox::ConsoleArg arg14,
  inox::ConsoleArg arg15
) const {
  const inox::ConsoleArg args[] = {
    arg0,
    arg1,
    arg2,
    arg3,
    arg4,
    arg5,
    arg6,
    arg7,
    arg8,
    arg9,
    arg10,
    arg11,
    arg12,
    arg13,
    arg14,
    arg15
  };

  inox_console_printf_line(inox::ConsoleStream::stderr, format, args, 16);
  return;
}

static bool inox_console_is_format_conversion(char value) {
  return strchr("diuoxXfFeEgGaAcsp", value) != nullptr;
}

static bool inox_console_is_string_format_spec(const char* spec, size_t len) {
  return len > 0 && spec[len - 1] == 's';
}

static bool inox_console_is_value_format_spec(const char* spec, size_t len) {
  return len > 0 && spec[len - 1] == 's';
}

static const char* inox_console_next_format_spec(const char* format, const char** spec_end) {
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

    while (*end != '\0' && !inox_console_is_format_conversion(*end)) {
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

static bool inox_console_format_uses_dynamic_width_or_precision(const char* format) {
  const char* current = format;

  while (*current != '\0') {
    if (*current != '%') {
      current += 1;
      continue;
    }

    current += 1;

    if (*current == '%') {
      current += 1;
      continue;
    }

    while (*current != '\0' && !inox_console_is_format_conversion(*current)) {
      if (*current == '*') {
        return true;
      }

      current += 1;
    }

    if (*current != '\0') {
      current += 1;
    }
  }

  return false;
}

static bool inox_console_format_spec_has_length_modifier(const char* spec, size_t len) {
  for (size_t index = 1; index + 1 < len; ++index) {
    const char value = spec[index];

    if (
      value == 'h' || value == 'l' || value == 'j' || value == 'z' ||
      value == 't' || value == 'L'
    ) {
      return true;
    }
  }

  return false;
}

static inox_status inox_console_write_format_literal(inox::ConsoleStream stream, const char* begin, const char* end) {
  const char* chunk = begin;
  const char* current = begin;

  while (current < end) {
    if (*current == '%' && current + 1 < end && *(current + 1) == '%') {
      inox_status status = inox::console_write(stream, chunk, (size_t)(current - chunk));

      if (status != INOX_OK) {
        return status;
      }

      status = inox::console_write(stream, "%", 1);

      if (status != INOX_OK) {
        return status;
      }

      current += 2;
      chunk = current;
      continue;
    }

    current += 1;
  }

  return inox::console_write(stream, chunk, (size_t)(end - chunk));
}

static inox_status inox_console_copy_format(const char* spec, size_t spec_len, char* out, size_t out_len) {
  if (spec_len >= out_len) {
    return INOX_ERR_TYPE;
  }

  memcpy(out, spec, spec_len);
  out[spec_len] = '\0';

  return INOX_OK;
}

static bool inox_console_is_float_format(char conversion) {
  return
    conversion == 'f' ||
    conversion == 'F' ||
    conversion == 'e' ||
    conversion == 'E' ||
    conversion == 'g' ||
    conversion == 'G' ||
    conversion == 'a' ||
    conversion == 'A';
}

static inox_status inox_console_write_signed_format(
  inox::ConsoleStream stream,
  const char* format,
  const char* spec,
  size_t spec_len,
  long long value
) {
  const char conversion = spec_len > 0 ? spec[spec_len - 1] : '\0';

  if (inox_console_is_float_format(conversion)) {
    return inox::console_printf(stream, format, (double)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  if (!inox_console_format_spec_has_length_modifier(spec, spec_len)) {
    switch (conversion) {
      case 'd':
      case 'i':
      case 'c':
        return inox::console_printf(stream, format, (int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
      case 'u':
      case 'o':
      case 'x':
      case 'X':
        return inox::console_printf(stream, format, (unsigned int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
    }
  }

  return inox::console_printf(stream, format, value) < 0 ? INOX_ERR_TYPE : INOX_OK;
}

static inox_status inox_console_write_unsigned_format(
  inox::ConsoleStream stream,
  const char* format,
  const char* spec,
  size_t spec_len,
  unsigned long long value
) {
  const char conversion = spec_len > 0 ? spec[spec_len - 1] : '\0';

  if (inox_console_is_float_format(conversion)) {
    return inox::console_printf(stream, format, (double)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  if (!inox_console_format_spec_has_length_modifier(spec, spec_len)) {
    switch (conversion) {
      case 'd':
      case 'i':
      case 'c':
        return inox::console_printf(stream, format, (int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
      case 'u':
      case 'o':
      case 'x':
      case 'X':
        return inox::console_printf(stream, format, (unsigned int)value) < 0 ? INOX_ERR_TYPE : INOX_OK;
    }
  }

  return inox::console_printf(stream, format, value) < 0 ? INOX_ERR_TYPE : INOX_OK;
}

static inox_status inox_console_write_format_arg(
  inox::ConsoleStream stream,
  const char* spec,
  size_t spec_len,
  const inox::ConsoleArg& value
) {
  if (value.kind == inox::ConsoleArgKind::empty) {
    return INOX_ERR_TYPE;
  }

  if (value.kind == inox::ConsoleArgKind::string) {
    if (!inox_console_is_string_format_spec(spec, spec_len) || value.string == nullptr) {
      return INOX_ERR_TYPE;
    }

    return inox::console_write(stream, value.string->bytes(), value.string->length());
  }

  if (value.kind == inox::ConsoleArgKind::string_view) {
    if (!inox_console_is_string_format_spec(spec, spec_len)) {
      return INOX_ERR_TYPE;
    }

    return inox::console_write(stream, value.bytes, value.len);
  }

  if (value.kind == inox::ConsoleArgKind::value) {
    if (!inox_console_is_value_format_spec(spec, spec_len)) {
      return INOX_ERR_TYPE;
    }

    return inox::console_print_value(stream, value.value);
  }

  char format[64];
  inox_status status = inox_console_copy_format(spec, spec_len, format, sizeof(format));

  if (status != INOX_OK) {
    return status;
  }

  if (value.kind == inox::ConsoleArgKind::c_string) {
    return inox::console_printf(stream, format, value.bytes == nullptr ? "" : value.bytes) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  if (value.kind == inox::ConsoleArgKind::number) {
    const char conversion = spec_len > 0 ? spec[spec_len - 1] : '\0';

    if (!inox_console_is_float_format(conversion)) {
      if (conversion == 'd' || conversion == 'i' || conversion == 'c') {
        return inox_console_write_signed_format(stream, format, spec, spec_len, (long long)value.number);
      }

      if (conversion == 'u' || conversion == 'o' || conversion == 'x' || conversion == 'X') {
        return inox_console_write_unsigned_format(stream, format, spec, spec_len, (unsigned long long)value.number);
      }
    }

    return inox::console_printf(stream, format, value.number) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  if (value.kind == inox::ConsoleArgKind::signed_integer) {
    return inox_console_write_signed_format(stream, format, spec, spec_len, value.signed_integer);
  }

  if (value.kind == inox::ConsoleArgKind::unsigned_integer) {
    return inox_console_write_unsigned_format(stream, format, spec, spec_len, value.unsigned_integer);
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_console_write_unformatted_arg(inox::ConsoleStream stream, const inox::ConsoleArg& value) {
  if (value.kind == inox::ConsoleArgKind::empty) {
    return INOX_ERR_TYPE;
  }

  if (value.kind == inox::ConsoleArgKind::string) {
    if (value.string == nullptr) {
      return INOX_ERR_TYPE;
    }

    return inox::console_write(stream, value.string->bytes(), value.string->length());
  }

  if (value.kind == inox::ConsoleArgKind::string_view || value.kind == inox::ConsoleArgKind::c_string) {
    const char* bytes = value.bytes == nullptr ? "" : value.bytes;
    const size_t len = value.kind == inox::ConsoleArgKind::c_string ? strlen(bytes) : value.len;

    return inox::console_write(stream, bytes, len);
  }

  if (value.kind == inox::ConsoleArgKind::value) {
    return inox::console_print_value(stream, value.value);
  }

  if (value.kind == inox::ConsoleArgKind::number) {
    return inox::console_printf(stream, "%.17g", value.number) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  if (value.kind == inox::ConsoleArgKind::signed_integer) {
    return inox::console_printf(stream, "%lld", value.signed_integer) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  if (value.kind == inox::ConsoleArgKind::unsigned_integer) {
    return inox::console_printf(stream, "%llu", value.unsigned_integer) < 0 ? INOX_ERR_TYPE : INOX_OK;
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_console_write_unformatted(
  inox::ConsoleStream stream,
  const char* format,
  const inox::ConsoleArg* args,
  size_t arg_count
) {
  const char* text = format == nullptr ? "" : format;
  bool needs_space = false;

  if (text[0] != '\0') {
    inox_status status = inox_console_write_format_literal(stream, text, text + strlen(text));

    if (status != INOX_OK) {
      return status;
    }

    needs_space = true;
  }

  for (size_t index = 0; index < arg_count; ++index) {
    if (needs_space) {
      inox_status status = inox::console_write(stream, " ", 1);

      if (status != INOX_OK) {
        return status;
      }
    }

    inox_status status = inox_console_write_unformatted_arg(stream, args[index]);

    if (status != INOX_OK) {
      return status;
    }

    needs_space = true;
  }

  return INOX_OK;
}

static inox_status inox_console_write_formatted(
  inox::ConsoleStream stream,
  const char* format,
  const inox::ConsoleArg* args,
  size_t arg_count
) {
  const char* current = format == nullptr ? "" : format;

  for (size_t index = 0; index < arg_count; ++index) {
    if (args[index].kind == inox::ConsoleArgKind::empty) {
      return INOX_ERR_TYPE;
    }

    const char* spec_end = nullptr;
    const char* spec = inox_console_next_format_spec(current, &spec_end);

    if (spec == nullptr) {
      return INOX_ERR_TYPE;
    }

    inox_status status = inox_console_write_format_literal(stream, current, spec);

    if (status != INOX_OK) {
      return status;
    }

    status = inox_console_write_format_arg(stream, spec, (size_t)(spec_end - spec), args[index]);

    if (status != INOX_OK) {
      return status;
    }

    current = spec_end;
  }

  const char* spec_end = nullptr;
  const char* spec = inox_console_next_format_spec(current, &spec_end);

  if (spec != nullptr) {
    return INOX_ERR_TYPE;
  }

  return inox_console_write_format_literal(stream, current, current + strlen(current));
}

static inox_status inox_console_printf_line(
  inox::ConsoleStream stream,
  inox::StringView format,
  const inox::ConsoleArg* args,
  size_t arg_count
) {
  if (inox::thrown()) {
    return INOX_OK;
  }

  const char* format_bytes = format.bytes == nullptr ? "" : format.bytes;
  const size_t format_len = format.bytes == nullptr ? 0 : format.len;
  char stack_format[256];
  char* heap_format = nullptr;
  char* safe_format = stack_format;

  if (format_len >= sizeof(stack_format)) {
    heap_format = (char*)malloc(format_len + 1);

    if (heap_format == nullptr) {
      return INOX_ERR_OOM;
    }

    safe_format = heap_format;
  }

  if (format_len != 0) {
    memcpy(safe_format, format_bytes, format_len);
  }

  safe_format[format_len] = '\0';

  if (inox_console_format_uses_dynamic_width_or_precision(safe_format)) {
    if (heap_format != nullptr) {
      free(heap_format);
    }

    return INOX_ERR_TYPE;
  }

  while (arg_count > 0 && args[arg_count - 1].kind == inox::ConsoleArgKind::empty) {
    arg_count -= 1;
  }

  const char* spec_end = nullptr;
  inox_status status = inox_console_next_format_spec(safe_format, &spec_end) == nullptr
    ? inox_console_write_unformatted(stream, safe_format, args, arg_count)
    : inox_console_write_formatted(stream, safe_format, args, arg_count);

  if (heap_format != nullptr) {
    free(heap_format);
  }

  if (status != INOX_OK) {
    return status;
  }

  return inox::console_newline(stream);
}

class console console;
