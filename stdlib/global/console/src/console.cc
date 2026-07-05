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
