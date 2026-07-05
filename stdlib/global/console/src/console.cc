#define INOX_CONSOLE_NO_PRINTF_MACRO
#include "inox/console.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/object.h"
#include "inox/string.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include <limits.h>
#include <uv.h>
#endif

typedef struct inox_console_format_buffer {
  char* bytes;
  size_t len;
  size_t cap;
} inox_console_format_buffer;

#ifdef INOX_LOOP_BACKEND_LIBUV
static inox_status inox_console_libuv_write(inox::ConsoleStream stream, const char* bytes, size_t len);
#endif

#ifndef INOX_CONSOLE_DISABLE_HOST
static inox_status inox_console_host_write(inox::ConsoleStream stream, const char* bytes, size_t len);
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
  inox_console_format_buffer* buffer,
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

inox_status console_newline(ConsoleStream stream) {
  return console_write(stream, "\n", 1);
}

inox_status console_write(ConsoleStream stream, const char* bytes, size_t len) {
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

inox_status console_write_line(ConsoleStream stream, const char* bytes, size_t len) {
  inox_status status = console_write(stream, bytes, len);

  if (status != INOX_OK) {
    return status;
  }

  return console_write(stream, "\n", 1);
}

inox_status console_print_value(ConsoleStream stream, inox_value value) {
  inox_console_format_buffer buffer = { 0 };
  inox_status status = inox_console_format_value_into(&buffer, value, 0);

  if (status == INOX_OK) {
    status = console_write(stream, buffer.bytes == 0 ? "" : buffer.bytes, buffer.len);
  }

  inox_console_format_buffer_dispose(&buffer);

  return status;
}

inox_status console_print_value_line(ConsoleStream stream, inox_value value) {
  inox_console_format_buffer buffer = { 0 };
  inox_status status = inox_console_format_value_into(&buffer, value, 0);

  if (status == INOX_OK) {
    status = console_write_line(stream, buffer.bytes == 0 ? "" : buffer.bytes, buffer.len);
  }

  inox_console_format_buffer_dispose(&buffer);

  return status;
}

inox_status console_format_class_instance(
  const inox_class_descriptor& descriptor,
  const void* instance,
  Value& out
) {
  inox_value* raw_out = out.out();
  inox_console_format_buffer buffer = { 0 };
  inox_status status = inox_console_format_class_instance_into(&buffer, &descriptor, instance, 0);

  if (status == INOX_OK) {
    status = inox_string_from_literal(&inox_default_allocator, buffer.bytes == 0 ? "" : buffer.bytes, buffer.len, raw_out);
  }

  inox_console_format_buffer_dispose(&buffer);

  return status;
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

#define INOX_CONSOLE_NO_PRINTF_MACRO
#include "inox/console.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace inox {

int console_printf(ConsoleStream stream, const char* format, ...) {
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

inox_status console::log() const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_newline(inox::ConsoleStream::stdout);
}

inox_status console::log(const char* text) const {
  return write_text_line(inox::ConsoleStream::stdout, text);
}

inox_status console::log(inox::StringView text) const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_write_line(inox::ConsoleStream::stdout, text.bytes, text.len);
}

inox_status console::log(const inox::String& value) const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_write_line(inox::ConsoleStream::stdout, value.bytes(), value.length());
}

inox_status console::log(inox_value value) const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_print_value_line(inox::ConsoleStream::stdout, value);
}

inox_status console::log(const inox::Value& value) const {
  return log(value.raw());
}

inox_status console::log(const char* prefix, inox_value value) const {
  return write_prefixed_value_line(inox::ConsoleStream::stdout, prefix, value);
}

inox_status console::log(const char* prefix, const inox::Value& value) const {
  return log(prefix, value.raw());
}

inox_status console::info() const {
  return log();
}

inox_status console::info(const char* text) const {
  return log(text);
}

inox_status console::info(inox::StringView text) const {
  return log(text);
}

inox_status console::info(const inox::String& value) const {
  return log(value);
}

inox_status console::info(inox_value value) const {
  return log(value);
}

inox_status console::info(const inox::Value& value) const {
  return log(value);
}

inox_status console::info(const char* prefix, inox_value value) const {
  return log(prefix, value);
}

inox_status console::info(const char* prefix, const inox::Value& value) const {
  return log(prefix, value);
}

inox_status console::warn() const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_newline(inox::ConsoleStream::stderr);
}

inox_status console::warn(const char* text) const {
  return write_text_line(inox::ConsoleStream::stderr, text);
}

inox_status console::warn(inox::StringView text) const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_write_line(inox::ConsoleStream::stderr, text.bytes, text.len);
}

inox_status console::warn(const inox::String& value) const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_write_line(inox::ConsoleStream::stderr, value.bytes(), value.length());
}

inox_status console::warn(inox_value value) const {
  if (skip_write()) {
    return INOX_OK;
  }

  return inox::console_print_value_line(inox::ConsoleStream::stderr, value);
}

inox_status console::warn(const inox::Value& value) const {
  return warn(value.raw());
}

inox_status console::warn(const char* prefix, inox_value value) const {
  return write_prefixed_value_line(inox::ConsoleStream::stderr, prefix, value);
}

inox_status console::warn(const char* prefix, const inox::Value& value) const {
  return warn(prefix, value.raw());
}

inox_status console::error() const {
  return warn();
}

inox_status console::error(const char* text) const {
  return warn(text);
}

inox_status console::error(inox::StringView text) const {
  return warn(text);
}

inox_status console::error(const inox::String& value) const {
  return warn(value);
}

inox_status console::error(inox_value value) const {
  return warn(value);
}

inox_status console::error(const inox::Value& value) const {
  return warn(value);
}

inox_status console::error(const char* prefix, inox_value value) const {
  return warn(prefix, value);
}

inox_status console::error(const char* prefix, const inox::Value& value) const {
  return warn(prefix, value);
}

bool console::skip_write() {
  return inox::thrown();
}

inox_status console::write_text_line(inox::ConsoleStream stream, const char* text) {
  if (skip_write()) {
    return INOX_OK;
  }

  if (text == nullptr) {
    return inox::console_newline(stream);
  }

  return inox::console_write_line(stream, text, strlen(text));
}

inox_status console::write_prefixed_value_line(inox::ConsoleStream stream, const char* prefix, inox_value value) {
  if (skip_write()) {
    return INOX_OK;
  }

  if (prefix != nullptr && prefix[0] != '\0') {
    inox_status status = inox::console_write(stream, prefix, strlen(prefix));

    if (status != INOX_OK) {
      return status;
    }

    status = inox::console_write(stream, " ", 1);

    if (status != INOX_OK) {
      return status;
    }
  }

  inox_status status = inox::console_print_value(stream, value);

  if (status != INOX_OK) {
    return status;
  }

  return inox::console_newline(stream);
}

static bool inox_console_is_format_conversion(char value) {
  return strchr("diuoxXfFeEgGaAcsp", value) != nullptr;
}

bool console::is_string_format_spec(const char* spec, size_t len) {
  return len > 0 && spec[len - 1] == 's';
}

bool console::is_value_format_spec(const char* spec, size_t len) {
  return is_string_format_spec(spec, len);
}

const char* console::next_format_spec(const char* format, const char** spec_end) {
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

bool console::format_uses_dynamic_width_or_precision(const char* format) {
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

bool console::format_spec_has_length_modifier(const char* spec, size_t len) {
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

inox_status console::write_format_literal(inox::ConsoleStream stream, const char* begin, const char* end) {
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

inox_status console::write_format_arg(
  inox::ConsoleStream stream,
  const char* spec,
  size_t spec_len,
  const inox::String& value
) {
  if (!is_string_format_spec(spec, spec_len)) {
    return INOX_ERR_TYPE;
  }

  return inox::console_write(stream, value.bytes(), value.length());
}

inox_status console::write_format_arg(
  inox::ConsoleStream stream,
  const char* spec,
  size_t spec_len,
  inox::StringView value
) {
  if (!is_string_format_spec(spec, spec_len)) {
    return INOX_ERR_TYPE;
  }

  return inox::console_write(stream, value.bytes, value.len);
}

inox_status console::write_format_arg(inox::ConsoleStream stream, const char* spec, size_t spec_len, inox_value value) {
  if (!is_value_format_spec(spec, spec_len)) {
    return INOX_ERR_TYPE;
  }

  return inox::console_print_value(stream, value);
}

inox_status console::write_format_arg(
  inox::ConsoleStream stream,
  const char* spec,
  size_t spec_len,
  const inox::Value& value
) {
  return write_format_arg(stream, spec, spec_len, value.raw());
}

inox_status console::write_formatted(inox::ConsoleStream stream, const char* format) {
  const char* spec_end = nullptr;
  const char* spec = next_format_spec(format, &spec_end);

  if (spec != nullptr) {
    return INOX_ERR_TYPE;
  }

  return write_format_literal(stream, format, format + strlen(format));
}

class console console;
