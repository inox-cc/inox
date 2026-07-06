#include <errno.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/json.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/string.h"

#define INOX_JSON_MAX_DEPTH 64

struct JsonBuffer {
  inox_allocator* allocator;
  char* bytes;
  size_t length;
  size_t capacity;
};

struct JsonParser {
  inox_allocator* allocator;
  const char* bytes;
  size_t length;
  size_t position;
  const char* error_message;
  size_t errorPosition;
  bool has_error;
};

struct JsonStringifyStack {
  const inox_ref* refs[INOX_JSON_MAX_DEPTH + 1];
  size_t length;
};

static void inox_json_buffer_dispose(JsonBuffer* buffer) {
  if (buffer == 0 || buffer->allocator == 0 || buffer->allocator->free == 0 || buffer->bytes == 0) {
    return;
  }

  buffer->allocator->free(buffer->allocator->user, buffer->bytes, buffer->capacity, alignof(char));
  buffer->bytes = 0;
  buffer->length = 0;
  buffer->capacity = 0;
}

static inox_status inox_json_buffer_reserve(JsonBuffer* buffer, size_t needed) {
  if (buffer == 0 || buffer->allocator == 0 || buffer->allocator->realloc == 0) {
    return INOX_ERR_TYPE;
  }

  if (needed <= buffer->capacity) {
    return INOX_OK;
  }

  size_t next_cap = buffer->capacity == 0 ? 64 : buffer->capacity;

  while (next_cap < needed) {
    if (next_cap > ((size_t)-1) / 2) {
      return INOX_ERR_OOM;
    }

    next_cap *= 2;
  }

  char* next = (char*)buffer->allocator->realloc(
    buffer->allocator->user,
    buffer->bytes,
    buffer->capacity,
    next_cap,
    alignof(char)
  );

  if (next == 0) {
    return INOX_ERR_OOM;
  }

  buffer->bytes = next;
  buffer->capacity = next_cap;

  return INOX_OK;
}

static inox_status inox_json_buffer_push_char(JsonBuffer* buffer, char value) {
  inox_status status = inox_json_buffer_reserve(buffer, buffer->length + 1);

  if (status != INOX_OK) {
    return status;
  }

  buffer->bytes[buffer->length] = value;
  buffer->length += 1;

  return INOX_OK;
}

static inox_status inox_json_buffer_push_bytes(JsonBuffer* buffer, const char* bytes, size_t len) {
  if (bytes == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_json_buffer_reserve(buffer, buffer->length + len);

  if (status != INOX_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(buffer->bytes + buffer->length, bytes, len);
  }

  buffer->length += len;

  return INOX_OK;
}

static void inox_json_skip_ws(JsonParser* parser) {
  while (parser->position < parser->length) {
    char value = parser->bytes[parser->position];

    if (value != ' ' && value != '\n' && value != '\r' && value != '\t') {
      return;
    }

    parser->position += 1;
  }
}

static bool inox_json_match_byte(JsonParser* parser, char value) {
  if (parser->position >= parser->length || parser->bytes[parser->position] != value) {
    return false;
  }

  parser->position += 1;

  return true;
}

static bool inox_json_match_literal(JsonParser* parser, const char* literal, size_t len) {
  if (parser->position + len > parser->length || memcmp(parser->bytes + parser->position, literal, len) != 0) {
    return false;
  }

  parser->position += len;

  return true;
}

static void inox_json_set_error_at(JsonParser* parser, const char* message, size_t pos) {
  if (parser == 0 || parser->has_error) {
    return;
  }

  parser->error_message = message;
  parser->errorPosition = pos > parser->length ? parser->length : pos;
  parser->has_error = true;
}

static void inox_json_set_error(JsonParser* parser, const char* message) {
  if (parser == 0) {
    return;
  }

  inox_json_set_error_at(parser, message, parser->position);
}

static void inox_json_error_location(const char* bytes, size_t len, size_t pos, size_t* line_out, size_t* column_out) {
  size_t line = 1;
  size_t column = 1;
  size_t limit = pos > len ? len : pos;

  for (size_t index = 0; index < limit; index += 1) {
    if (bytes[index] == '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  if (line_out != 0) {
    *line_out = line;
  }

  if (column_out != 0) {
    *column_out = column;
  }
}

static inox_status inox_json_make_syntax_error(inox_allocator* allocator, const JsonParser* parser, inox_value* out) {
  if (allocator == 0 || parser == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  const char* message = parser->has_error ? parser->error_message : "Unexpected token";
  size_t position = parser->has_error ? parser->errorPosition : parser->position;
  size_t line = 1;
  size_t column = 1;
  char buffer[256];

  if (position > parser->length) {
    position = parser->length;
  }

  inox_json_error_location(parser->bytes, parser->length, position, &line, &column);

  int written = snprintf(
    buffer,
    sizeof(buffer),
    "SyntaxError: %s in JSON at position %zu (line %zu column %zu)",
    message,
    position,
    line,
    column
  );

  if (written < 0 || (size_t)written >= sizeof(buffer)) {
    return INOX_ERR_TYPE;
  }

  auto error = inox::String(buffer, (size_t)written);

  if (!error.valid()) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  return error.copy_to(out);
}

static int inox_json_hex_value(char value) {
  if (value >= '0' && value <= '9') {
    return value - '0';
  }

  if (value >= 'a' && value <= 'f') {
    return value - 'a' + 10;
  }

  if (value >= 'A' && value <= 'F') {
    return value - 'A' + 10;
  }

  return -1;
}

static bool inox_json_parse_hex4(const char* bytes, uint32_t* out) {
  if (bytes == 0 || out == 0) {
    return false;
  }

  int a = inox_json_hex_value(bytes[0]);
  int b = inox_json_hex_value(bytes[1]);
  int c = inox_json_hex_value(bytes[2]);
  int d = inox_json_hex_value(bytes[3]);

  if (a < 0 || b < 0 || c < 0 || d < 0) {
    return false;
  }

  *out = ((uint32_t)a << 12) | ((uint32_t)b << 8) | ((uint32_t)c << 4) | (uint32_t)d;

  return true;
}

static inox_status inox_json_buffer_push_utf8(JsonBuffer* buffer, uint32_t codepoint) {
  if (codepoint <= 0x7f) {
    return inox_json_buffer_push_char(buffer, (char)codepoint);
  }

  if (codepoint <= 0x7ff) {
    char bytes[] = { (char)(0xc0 | (codepoint >> 6)), (char)(0x80 | (codepoint & 0x3f)) };

    return inox_json_buffer_push_bytes(buffer, bytes, sizeof(bytes));
  }

  if (codepoint <= 0xffff) {
    if (codepoint >= 0xd800 && codepoint <= 0xdfff) {
      return INOX_ERR_TYPE;
    }

    char bytes[] = { (char)(0xe0 | (codepoint >> 12)), (char)(0x80 | ((codepoint >> 6) & 0x3f)),
                     (char)(0x80 | (codepoint & 0x3f)) };

    return inox_json_buffer_push_bytes(buffer, bytes, sizeof(bytes));
  }

  if (codepoint <= 0x10ffff) {
    char bytes[] = { (char)(0xf0 | (codepoint >> 18)), (char)(0x80 | ((codepoint >> 12) & 0x3f)),
                     (char)(0x80 | ((codepoint >> 6) & 0x3f)), (char)(0x80 | (codepoint & 0x3f)) };

    return inox_json_buffer_push_bytes(buffer, bytes, sizeof(bytes));
  }

  return INOX_ERR_TYPE;
}

static inox_status
inox_json_parse_string_bytes(JsonParser* parser, char** out_bytes, size_t* out_len, bool nul_terminated) {
  if (parser == 0 || out_bytes == 0 || out_len == 0 || !inox_json_match_byte(parser, '"')) {
    inox_json_set_error(parser, "Expected string");
    return INOX_ERR_TYPE;
  }

  JsonBuffer buffer = { parser->allocator, 0, 0, 0 };

  while (parser->position < parser->length) {
    unsigned char value = (unsigned char)parser->bytes[parser->position];
    parser->position += 1;

    if (value == '"') {
      if (nul_terminated) {
        inox_status status = inox_json_buffer_push_char(&buffer, '\0');

        if (status != INOX_OK) {
          inox_json_buffer_dispose(&buffer);
          return status;
        }

        buffer.length -= 1;
      }

      *out_bytes = buffer.bytes;
      *out_len = buffer.length;
      return INOX_OK;
    }

    if (value < 0x20) {
      inox_json_buffer_dispose(&buffer);
      inox_json_set_error_at(parser, "Bad control character in string literal", parser->position - 1);
      return INOX_ERR_TYPE;
    }

    if (value != '\\') {
      inox_status status = inox_json_buffer_push_char(&buffer, (char)value);

      if (status != INOX_OK) {
        inox_json_buffer_dispose(&buffer);
        return status;
      }

      continue;
    }

    if (parser->position >= parser->length) {
      inox_json_buffer_dispose(&buffer);
      inox_json_set_error(parser, "Unterminated string");
      return INOX_ERR_TYPE;
    }

    char escaped = parser->bytes[parser->position];
    parser->position += 1;
    char output = 0;
    bool has_output = true;

    if (escaped == '"' || escaped == '\\' || escaped == '/') {
      output = escaped;
    } else if (escaped == 'b') {
      output = '\b';
    } else if (escaped == 'f') {
      output = '\f';
    } else if (escaped == 'n') {
      output = '\n';
    } else if (escaped == 'r') {
      output = '\r';
    } else if (escaped == 't') {
      output = '\t';
    } else if (escaped == 'u') {
      if (parser->position + 4 > parser->length) {
        inox_json_buffer_dispose(&buffer);
        inox_json_set_error(parser, "Bad Unicode escape");
        return INOX_ERR_TYPE;
      }

      uint32_t codepoint = 0;

      if (!inox_json_parse_hex4(parser->bytes + parser->position, &codepoint)) {
        inox_json_buffer_dispose(&buffer);
        inox_json_set_error(parser, "Bad Unicode escape");
        return INOX_ERR_TYPE;
      }

      parser->position += 4;

      if (codepoint >= 0xd800 && codepoint <= 0xdbff) {
        if (parser->position + 6 > parser->length || parser->bytes[parser->position] != '\\' || parser->bytes[parser->position + 1] != 'u') {
          inox_json_buffer_dispose(&buffer);
          inox_json_set_error(parser, "Bad Unicode escape");
          return INOX_ERR_TYPE;
        }

        uint32_t low = 0;

        if (!inox_json_parse_hex4(parser->bytes + parser->position + 2, &low) || low < 0xdc00 || low > 0xdfff) {
          inox_json_buffer_dispose(&buffer);
          inox_json_set_error(parser, "Bad Unicode escape");
          return INOX_ERR_TYPE;
        }

        parser->position += 6;
        codepoint = 0x10000 + ((codepoint - 0xd800) << 10) + (low - 0xdc00);
      } else if (codepoint >= 0xdc00 && codepoint <= 0xdfff) {
        inox_json_buffer_dispose(&buffer);
        inox_json_set_error(parser, "Bad Unicode escape");
        return INOX_ERR_TYPE;
      }

      inox_status status = inox_json_buffer_push_utf8(&buffer, codepoint);

      if (status != INOX_OK) {
        inox_json_buffer_dispose(&buffer);
        return status;
      }

      has_output = false;
    } else {
      inox_json_buffer_dispose(&buffer);
      inox_json_set_error_at(parser, "Bad escaped character in JSON string", parser->position - 1);
      return INOX_ERR_TYPE;
    }

    if (!has_output) {
      continue;
    }

    inox_status status = inox_json_buffer_push_char(&buffer, output);

    if (status != INOX_OK) {
      inox_json_buffer_dispose(&buffer);
      return status;
    }
  }

  inox_json_buffer_dispose(&buffer);
  inox_json_set_error(parser, "Unterminated string");
  return INOX_ERR_TYPE;
}

static inox_status inox_json_parse_value(JsonParser* parser, size_t depth, inox_value* out);

static inox_status inox_json_parse_string(JsonParser* parser, inox_value* out) {
  char* bytes = 0;
  size_t len = 0;
  inox_status status = inox_json_parse_string_bytes(parser, &bytes, &len, false);

  if (status != INOX_OK) {
    return status;
  }

  auto value = inox::String(bytes == 0 ? "" : bytes, len);
  status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;

  if (parser->allocator != 0 && parser->allocator->free != 0 && bytes != 0) {
    parser->allocator->free(parser->allocator->user, bytes, len, alignof(char));
  }

  return status;
}

static inox_status inox_json_parse_number(JsonParser* parser, inox_value* out) {
  size_t start = parser->position;

  if (parser->position < parser->length && parser->bytes[parser->position] == '-') {
    parser->position += 1;
  }

  if (parser->position >= parser->length) {
    inox_json_set_error(parser, "No number after minus sign");
    return INOX_ERR_TYPE;
  }

  if (parser->bytes[parser->position] == '0') {
    parser->position += 1;
  } else if (parser->bytes[parser->position] >= '1' && parser->bytes[parser->position] <= '9') {
    while (parser->position < parser->length && parser->bytes[parser->position] >= '0' && parser->bytes[parser->position] <= '9') {
      parser->position += 1;
    }
  } else {
    inox_json_set_error(parser, "Unexpected token");
    return INOX_ERR_TYPE;
  }

  if (parser->position < parser->length && parser->bytes[parser->position] == '.') {
    parser->position += 1;

    if (parser->position >= parser->length || parser->bytes[parser->position] < '0' || parser->bytes[parser->position] > '9') {
      inox_json_set_error(parser, "Unterminated fractional number");
      return INOX_ERR_TYPE;
    }

    while (parser->position < parser->length && parser->bytes[parser->position] >= '0' && parser->bytes[parser->position] <= '9') {
      parser->position += 1;
    }
  }

  if (parser->position < parser->length && (parser->bytes[parser->position] == 'e' || parser->bytes[parser->position] == 'E')) {
    parser->position += 1;

    if (parser->position < parser->length && (parser->bytes[parser->position] == '+' || parser->bytes[parser->position] == '-')) {
      parser->position += 1;
    }

    if (parser->position >= parser->length || parser->bytes[parser->position] < '0' || parser->bytes[parser->position] > '9') {
      inox_json_set_error(parser, "Exponent part is missing a number");
      return INOX_ERR_TYPE;
    }

    while (parser->position < parser->length && parser->bytes[parser->position] >= '0' && parser->bytes[parser->position] <= '9') {
      parser->position += 1;
    }
  }

  size_t len = parser->position - start;
  char* temp = (char*)parser->allocator->alloc(parser->allocator->user, len + 1, alignof(char));

  if (temp == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(temp, parser->bytes + start, len);
  temp[len] = '\0';
  errno = 0;
  char* end = 0;
  double number = strtod(temp, &end);
  size_t parsed_len = end == 0 ? 0 : (size_t)(end - temp);
  parser->allocator->free(parser->allocator->user, temp, len + 1, alignof(char));

  if (errno != 0 || end == 0 || parsed_len != len) {
    return INOX_ERR_TYPE;
  }

  *out = inox_number_value(number);

  return INOX_OK;
}

static void inox_json_free_names(inox_allocator* allocator, char** names, size_t count) {
  if (allocator == 0 || allocator->free == 0 || names == 0) {
    return;
  }

  for (size_t index = 0; index < count; index += 1) {
    if (names[index] != 0) {
      allocator->free(allocator->user, names[index], strlen(names[index]) + 1, alignof(char));
    }
  }
}

static inox_status inox_json_parse_object(JsonParser* parser, size_t depth, inox_value* out) {
  if (!inox_json_match_byte(parser, '{')) {
    inox_json_set_error(parser, "Expected object");
    return INOX_ERR_TYPE;
  }

  inox_allocator* allocator = parser->allocator;
  char** names = 0;
  inox_value* values = 0;
  size_t len = 0;
  size_t cap = 0;
  inox_status status = INOX_OK;

  inox_json_skip_ws(parser);

  if (!inox_json_match_byte(parser, '}')) {
    while (true) {
      inox_json_skip_ws(parser);

      if (len == cap) {
        size_t next_cap = cap == 0 ? 4 : cap * 2;
        char** next_names = (char**)allocator->realloc(
          allocator->user,
          names,
          sizeof(char*) * cap,
          sizeof(char*) * next_cap,
          alignof(char*)
        );

        if (next_names == 0) {
          status = INOX_ERR_OOM;
          break;
        }

        names = next_names;
        inox_value* next_values = (inox_value*)allocator->realloc(
          allocator->user, values, sizeof(inox_value) * cap, sizeof(inox_value) * next_cap, alignof(inox_value)
        );

        if (next_values == 0) {
          status = INOX_ERR_OOM;
          break;
        }

        values = next_values;

        for (size_t index = cap; index < next_cap; index += 1) {
          names[index] = 0;
          values[index] = inox_undefined_value();
        }

        cap = next_cap;
      }

      char* key = 0;
      size_t key_len = 0;

      if (parser->position >= parser->length || parser->bytes[parser->position] != '"') {
        inox_json_set_error(parser, "Expected property name or '}'");
        status = INOX_ERR_TYPE;
        break;
      }

      status = inox_json_parse_string_bytes(parser, &key, &key_len, true);

      if (status != INOX_OK) {
        break;
      }

      if (memchr(key, '\0', key_len) != 0) {
        allocator->free(allocator->user, key, key_len + 1, alignof(char));
        status = INOX_ERR_UNSUPPORTED;
        break;
      }

      inox_json_skip_ws(parser);

      if (!inox_json_match_byte(parser, ':')) {
        allocator->free(allocator->user, key, key_len + 1, alignof(char));
        inox_json_set_error(parser, "Expected ':' after property name");
        status = INOX_ERR_TYPE;
        break;
      }

      inox_json_skip_ws(parser);
      inox_value value = inox_undefined_value();
      status = inox_json_parse_value(parser, depth + 1, &value);

      if (status != INOX_OK) {
        allocator->free(allocator->user, key, key_len + 1, alignof(char));
        break;
      }

      names[len] = key;
      values[len] = value;
      len += 1;
      inox_json_skip_ws(parser);

      if (inox_json_match_byte(parser, '}')) {
        break;
      }

      if (!inox_json_match_byte(parser, ',')) {
        inox_json_set_error(parser, "Expected ',' or '}' after property value");
        status = INOX_ERR_TYPE;
        break;
      }
    }
  }

  if (status == INOX_OK) {
    if (len > UINT32_MAX) {
      status = INOX_ERR_UNSUPPORTED;
    }
  }

  bool object_owns_shape = false;

  if (status == INOX_OK) {
    inox_shape* shape = (inox_shape*)allocator->alloc(allocator->user, sizeof(inox_shape), alignof(inox_shape));

    if (shape == 0) {
      status = INOX_ERR_OOM;
    } else {
      inox_field_info* fields = len == 0
                                  ? 0
                                  : (inox_field_info*)allocator->alloc(
                                      allocator->user,
                                      sizeof(inox_field_info) * len,
                                      alignof(inox_field_info)
                                    );

      if (len != 0 && fields == 0) {
        allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
        status = INOX_ERR_OOM;
      } else {
        for (size_t index = 0; index < len; index += 1) {
          fields[index].name = names[index];
          fields[index].flags = 0;
          names[index] = 0;
        }

        shape->field_count = (uint32_t)len;
        shape->fields = fields;
        status = inox_object_new(allocator, shape, out);

        if (status == INOX_OK) {
          inox_object* object = (inox_object*)out->as.ref;
          object->header.flags |= INOX_OBJECT_OWNED_SHAPE;
          object_owns_shape = true;

          for (uint32_t index = 0; index < shape->field_count; index += 1) {
            status = inox_object_init_known(*out, index, values[index]);

            if (status != INOX_OK) {
              break;
            }
          }
        }

        if (status != INOX_OK) {
          if (object_owns_shape) {
            inox_release(*out);
            *out = inox_undefined_value();
          } else {
            for (uint32_t index = 0; index < shape->field_count; index += 1) {
              if (shape->fields[index].name != 0) {
                allocator->free(
                  allocator->user, (void*)shape->fields[index].name, strlen(shape->fields[index].name) + 1, alignof(char)
                );
              }
            }

            if (fields != 0) {
              allocator->free(allocator->user, fields, sizeof(inox_field_info) * len, alignof(inox_field_info));
            }

            allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
          }
        }
      }
    }
  }

  for (size_t index = 0; index < len; index += 1) {
    inox_release(values[index]);
  }

  inox_json_free_names(allocator, names, cap);

  if (allocator->free != 0) {
    if (names != 0) {
      allocator->free(allocator->user, names, sizeof(char*) * cap, alignof(char*));
    }

    if (values != 0) {
      allocator->free(allocator->user, values, sizeof(inox_value) * cap, alignof(inox_value));
    }
  }

  return status;
}

static inox_status inox_json_parse_array(JsonParser* parser, size_t depth, inox_value* out) {
  if (!inox_json_match_byte(parser, '[')) {
    inox_json_set_error(parser, "Expected array");
    return INOX_ERR_TYPE;
  }

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  ArrayClass array = ArrayClass::create(parser->allocator, 0);

  if (inox::thrown()) {
    return INOX_ERR_TYPE;
  }

  inox_json_skip_ws(parser);

  if (inox_json_match_byte(parser, ']')) {
    *out = array.release();
    return INOX_OK;
  }

  while (true) {
    inox_json_skip_ws(parser);
    inox_value value = inox_undefined_value();
    inox_status status = inox_json_parse_value(parser, depth + 1, &value);

    if (status != INOX_OK) {
      return status;
    }

    array.push(value);
    inox_release(value);

    if (inox::thrown()) {
      return INOX_ERR_TYPE;
    }

    inox_json_skip_ws(parser);

    if (inox_json_match_byte(parser, ']')) {
      *out = array.release();
      return INOX_OK;
    }

    if (!inox_json_match_byte(parser, ',')) {
      inox_json_set_error(parser, "Expected ',' or ']' after array element");
      return INOX_ERR_TYPE;
    }
  }
}

static inox_status inox_json_parse_value(JsonParser* parser, size_t depth, inox_value* out) {
  if (depth > INOX_JSON_MAX_DEPTH) {
    return INOX_ERR_UNSUPPORTED;
  }

  inox_json_skip_ws(parser);

  if (parser->position >= parser->length) {
    inox_json_set_error(parser, "Unexpected end of JSON input");
    return INOX_ERR_TYPE;
  }

  char value = parser->bytes[parser->position];

  if (value == '"') {
    return inox_json_parse_string(parser, out);
  }

  if (value == '{') {
    return inox_json_parse_object(parser, depth, out);
  }

  if (value == '[') {
    return inox_json_parse_array(parser, depth, out);
  }

  if (value == 't' && inox_json_match_literal(parser, "true", 4)) {
    *out = inox_bool_value(true);
    return INOX_OK;
  }

  if (value == 'f' && inox_json_match_literal(parser, "false", 5)) {
    *out = inox_bool_value(false);
    return INOX_OK;
  }

  if (value == 'n' && inox_json_match_literal(parser, "null", 4)) {
    *out = inox_null_value();
    return INOX_OK;
  }

  if (value == '-' || (value >= '0' && value <= '9')) {
    return inox_json_parse_number(parser, out);
  }

  inox_json_set_error(parser, "Unexpected token");
  return INOX_ERR_TYPE;
}

static inox_status json_parse_with_error(
  inox_allocator* allocator,
  const char* bytes,
  size_t len,
  inox_value* out,
  inox_value* error_out
) {
  if (
    allocator == 0 || allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0 || out == 0 ||
    (bytes == 0 && len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  if (error_out != 0) {
    *error_out = inox_undefined_value();
  }

  JsonParser parser = { allocator, bytes == 0 ? "" : bytes, len, 0, 0, 0, false };
  inox_status status = inox_json_parse_value(&parser, 0, out);

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();

    if (status == INOX_ERR_TYPE && error_out != 0) {
      inox_status error_status = inox_json_make_syntax_error(allocator, &parser, error_out);

      if (error_status != INOX_OK) {
        return error_status;
      }
    }

    return status;
  }

  inox_json_skip_ws(&parser);

  if (parser.position != parser.length) {
    inox_release(*out);
    *out = inox_undefined_value();
    inox_json_set_error(&parser, "Unexpected non-whitespace character after JSON");

    if (error_out != 0) {
      inox_status error_status = inox_json_make_syntax_error(allocator, &parser, error_out);

      if (error_status != INOX_OK) {
        return error_status;
      }
    }

    return INOX_ERR_TYPE;
  }

  return INOX_OK;
}

static inox_status
inox_json_stringify_value(JsonBuffer* buffer, JsonStringifyStack* stack, inox_value value, size_t depth);
static inox_status inox_json_stringify_class_instance_value(
  JsonBuffer* buffer,
  JsonStringifyStack* stack,
  const inox_class_descriptor* descriptor,
  const void* instance,
  size_t depth
);

static bool inox_json_stringify_stack_contains(const JsonStringifyStack* stack, const inox_ref* ref) {
  if (stack == 0 || ref == 0) {
    return false;
  }

  for (size_t index = 0; index < stack->length; index += 1) {
    if (stack->refs[index] == ref) {
      return true;
    }
  }

  return false;
}

static inox_status inox_json_stringify_stack_push(JsonStringifyStack* stack, const inox_ref* ref) {
  if (stack == 0 || ref == 0) {
    return INOX_ERR_TYPE;
  }

  if (inox_json_stringify_stack_contains(stack, ref)) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (stack->length >= INOX_JSON_MAX_DEPTH + 1) {
    return INOX_ERR_UNSUPPORTED;
  }

  stack->refs[stack->length] = ref;
  stack->length += 1;

  return INOX_OK;
}

static void inox_json_stringify_stack_pop(JsonStringifyStack* stack, const inox_ref* ref) {
  if (stack == 0 || ref == 0 || stack->length == 0) {
    return;
  }

  if (stack->refs[stack->length - 1] == ref) {
    stack->length -= 1;
  }
}

static inox_status inox_json_stringify_string_bytes(JsonBuffer* buffer, const char* bytes, size_t len) {
  inox_status status = inox_json_buffer_push_char(buffer, '"');

  if (status != INOX_OK) {
    return status;
  }

  static const char hex[] = "0123456789abcdef";

  for (size_t index = 0; index < len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];

    if (value == '"' || value == '\\') {
      status = inox_json_buffer_push_char(buffer, '\\');

      if (status == INOX_OK) {
        status = inox_json_buffer_push_char(buffer, (char)value);
      }
    } else if (value == '\b') {
      status = inox_json_buffer_push_bytes(buffer, "\\b", 2);
    } else if (value == '\f') {
      status = inox_json_buffer_push_bytes(buffer, "\\f", 2);
    } else if (value == '\n') {
      status = inox_json_buffer_push_bytes(buffer, "\\n", 2);
    } else if (value == '\r') {
      status = inox_json_buffer_push_bytes(buffer, "\\r", 2);
    } else if (value == '\t') {
      status = inox_json_buffer_push_bytes(buffer, "\\t", 2);
    } else if (value < 0x20) {
      char escaped[] = { '\\', 'u', '0', '0', hex[value >> 4], hex[value & 0xf] };
      status = inox_json_buffer_push_bytes(buffer, escaped, sizeof(escaped));
    } else {
      status = inox_json_buffer_push_char(buffer, (char)value);
    }

    if (status != INOX_OK) {
      return status;
    }
  }

  return inox_json_buffer_push_char(buffer, '"');
}

static inox_status inox_json_stringify_number(JsonBuffer* buffer, double number) {
  char temp[64];
  int written = snprintf(temp, sizeof(temp), "%.17g", number);

  if (written < 0 || (size_t)written >= sizeof(temp)) {
    return INOX_ERR_TYPE;
  }

  return inox_json_buffer_push_bytes(buffer, temp, (size_t)written);
}

static inox_status
inox_json_stringify_array(JsonBuffer* buffer, JsonStringifyStack* stack, inox_value value, size_t depth) {
  ArrayStorage* array = (ArrayStorage*)value.as.ref;
  inox_status status = inox_json_stringify_stack_push(stack, value.as.ref);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_json_buffer_push_char(buffer, '[');

  if (status != INOX_OK) {
    goto done;
  }

  for (size_t index = 0; index < array->length; index += 1) {
    if (index != 0) {
      status = inox_json_buffer_push_char(buffer, ',');

      if (status != INOX_OK) {
        goto done;
      }
    }

    status = inox_json_stringify_value(buffer, stack, array->items[index], depth + 1);

    if (status != INOX_OK) {
      goto done;
    }
  }

  status = inox_json_buffer_push_char(buffer, ']');

done:
  inox_json_stringify_stack_pop(stack, value.as.ref);
  return status;
}

static inox_status
inox_json_stringify_object(JsonBuffer* buffer, JsonStringifyStack* stack, inox_value value, size_t depth) {
  inox_object* object = (inox_object*)value.as.ref;
  inox_status status = inox_json_stringify_stack_push(stack, value.as.ref);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_json_buffer_push_char(buffer, '{');

  if (status != INOX_OK) {
    goto done;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    if (index != 0) {
      status = inox_json_buffer_push_char(buffer, ',');

      if (status != INOX_OK) {
        goto done;
      }
    }

    const char* name = object->shape->fields[index].name;
    status = inox_json_stringify_string_bytes(buffer, name, strlen(name));

    if (status == INOX_OK) {
      status = inox_json_buffer_push_char(buffer, ':');
    }

    if (status == INOX_OK) {
      inox_value field = inox_undefined_value();
      status = inox_object_get_known(value, index, &field);

      if (status == INOX_OK) {
        status = inox_json_stringify_value(buffer, stack, field, depth + 1);
      }

      inox_release(field);
    }

    if (status != INOX_OK) {
      goto done;
    }
  }

  status = inox_json_buffer_push_char(buffer, '}');

done:
  inox_json_stringify_stack_pop(stack, value.as.ref);
  return status;
}

static inox_status
inox_json_stringify_value(JsonBuffer* buffer, JsonStringifyStack* stack, inox_value value, size_t depth) {
  if (depth > INOX_JSON_MAX_DEPTH) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (value.tag == INOX_TAG_NULL) {
    return inox_json_buffer_push_bytes(buffer, "null", 4);
  }

  if (value.tag == INOX_TAG_BOOL) {
    return value.as.boolean ? inox_json_buffer_push_bytes(buffer, "true", 4) : inox_json_buffer_push_bytes(buffer, "false", 5);
  }

  if (value.tag == INOX_TAG_NUMBER) {
    return inox_json_stringify_number(buffer, value.as.number);
  }

  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;

    return inox_json_stringify_string_bytes(buffer, string->bytes, string->len);
  }

  if (value.tag == INOX_TAG_ARRAY && value.as.ref != 0) {
    return inox_json_stringify_array(buffer, stack, value, depth);
  }

  if (value.tag == INOX_TAG_OBJECT && value.as.ref != 0) {
    return inox_json_stringify_object(buffer, stack, value, depth);
  }

  if (value.tag == INOX_TAG_CLASS_INSTANCE && value.as.ref != 0) {
    inox_class_instance_ref* instance = (inox_class_instance_ref*)value.as.ref;

    return inox_json_stringify_class_instance_value(buffer, stack, instance->descriptor, instance->instance, depth);
  }

  return INOX_ERR_UNSUPPORTED;
}

static inox_status inox_json_stringify_class_instance_value(
  JsonBuffer* buffer,
  JsonStringifyStack* stack,
  const inox_class_descriptor* descriptor,
  const void* instance,
  size_t depth
) {
  if (depth > INOX_JSON_MAX_DEPTH) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (buffer == 0 || stack == 0 || descriptor == 0 || instance == 0 || descriptor->read_field == 0) {
    return INOX_ERR_TYPE;
  }

  inox_status status = inox_json_buffer_push_char(buffer, '{');

  if (status != INOX_OK) {
    return status;
  }

  uint32_t printed = 0;

  for (uint32_t index = 0; index < descriptor->field_count; index += 1) {
    const inox_class_field_descriptor* field = &descriptor->fields[index];

    if ((field->flags & INOX_CLASS_FIELD_ENUMERABLE) == 0) {
      continue;
    }

    inox_value value = inox_undefined_value();
    status = descriptor->read_field(instance, index, &value);

    if (status != INOX_OK) {
      inox_release(value);
      return status;
    }

    if (value.tag == INOX_TAG_UNDEFINED || value.tag == INOX_TAG_FUNCTION) {
      inox_release(value);
      continue;
    }

    if (printed != 0) {
      status = inox_json_buffer_push_char(buffer, ',');

      if (status != INOX_OK) {
        inox_release(value);
        return status;
      }
    }

    const char* name = field->name == 0 ? "" : field->name;
    status = inox_json_stringify_string_bytes(buffer, name, strlen(name));

    if (status == INOX_OK) {
      status = inox_json_buffer_push_char(buffer, ':');
    }

    if (status == INOX_OK) {
      status = inox_json_stringify_value(buffer, stack, value, depth + 1);
    }

    inox_release(value);

    if (status != INOX_OK) {
      return status;
    }

    printed += 1;
  }

  return inox_json_buffer_push_char(buffer, '}');
}

inox::Value Json::parse(inox::StringView text) const {
  inox_value out = inox_undefined_value();
  inox::Value error;
  inox_status status = json_parse_with_error(&inox_default_allocator, text.bytes, text.len, &out, error.out());

  if (status != INOX_OK) {
    inox_release(out);

    if (inox::thrown()) {
      return inox::Value();
    }

    if (error.tag == INOX_TAG_STRING && error.as.ref != 0) {
      inox::throw_value(error);
    } else {
      inox::throw_value(inox::String("JSON.parse failed"));
    }

    return inox::Value();
  }

  return inox::adopt(out);
}

inox::String Json::stringify(inox_value value) const {
  inox_allocator* allocator = &inox_default_allocator;

  if (allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0) {
    inox::throw_value(inox::String("JSON.stringify failed"));
    return inox::String();
  }

  JsonBuffer buffer = { allocator, 0, 0, 0 };
  JsonStringifyStack stack = { 0 };
  inox_status status = inox_json_stringify_value(&buffer, &stack, value, 0);

  inox::String out;

  if (status == INOX_OK) {
    out = inox::String(buffer.bytes == 0 ? "" : buffer.bytes, buffer.length);
  }

  inox_json_buffer_dispose(&buffer);

  if (status != INOX_OK || !out.valid()) {
    inox::throw_value(inox::String("JSON.stringify failed"));
    return inox::String();
  }

  return out;
}

inox::String Json::stringify(const inox_class_descriptor& descriptor, const void* instance) const {
  inox_allocator* allocator = &inox_default_allocator;

  if (allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0) {
    inox::throw_value(inox::String("JSON.stringify failed"));
    return inox::String();
  }

  JsonBuffer buffer = { allocator, 0, 0, 0 };
  JsonStringifyStack stack = { 0 };
  inox_status status = inox_json_stringify_class_instance_value(&buffer, &stack, &descriptor, instance, 0);

  inox::String out;

  if (status == INOX_OK) {
    out = inox::String(buffer.bytes == 0 ? "" : buffer.bytes, buffer.length);
  }

  inox_json_buffer_dispose(&buffer);

  if (status != INOX_OK || !out.valid()) {
    inox::throw_value(inox::String("JSON.stringify failed"));
    return inox::String();
  }

  return out;
}

inox::String Json::stringify(const inox_class_descriptor* descriptor, const void* instance) const {
  inox_allocator* allocator = &inox_default_allocator;

  if (allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0) {
    inox::throw_value(inox::String("JSON.stringify failed"));
    return inox::String();
  }

  JsonBuffer buffer = { allocator, 0, 0, 0 };
  JsonStringifyStack stack = { 0 };
  inox_status status = inox_json_stringify_class_instance_value(&buffer, &stack, descriptor, instance, 0);

  inox::String out;

  if (status == INOX_OK) {
    out = inox::String(buffer.bytes == 0 ? "" : buffer.bytes, buffer.length);
  }

  inox_json_buffer_dispose(&buffer);

  if (status != INOX_OK || !out.valid()) {
    inox::throw_value(inox::String("JSON.stringify failed"));
    return inox::String();
  }

  return out;
}

Json JSON;
