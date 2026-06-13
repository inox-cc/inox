#include <errno.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/array.h"
#include "ccjs/json.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

#define CCJS_JSON_MAX_DEPTH 64

typedef struct ccjs_json_buffer {
  ccjs_allocator* allocator;
  char* bytes;
  size_t len;
  size_t cap;
} ccjs_json_buffer;

typedef struct ccjs_json_parser {
  ccjs_allocator* allocator;
  const char* bytes;
  size_t len;
  size_t pos;
} ccjs_json_parser;

typedef struct ccjs_json_stringify_stack {
  const ccjs_ref* refs[CCJS_JSON_MAX_DEPTH + 1];
  size_t len;
} ccjs_json_stringify_stack;

static void ccjs_json_buffer_dispose(ccjs_json_buffer* buffer) {
  if (buffer == 0 || buffer->allocator == 0 || buffer->allocator->free == 0 || buffer->bytes == 0) {
    return;
  }

  buffer->allocator->free(buffer->allocator->user, buffer->bytes, buffer->cap, _Alignof(char));
  buffer->bytes = 0;
  buffer->len = 0;
  buffer->cap = 0;
}

static ccjs_status ccjs_json_buffer_reserve(ccjs_json_buffer* buffer, size_t needed) {
  if (buffer == 0 || buffer->allocator == 0 || buffer->allocator->realloc == 0) {
    return CCJS_ERR_TYPE;
  }

  if (needed <= buffer->cap) {
    return CCJS_OK;
  }

  size_t next_cap = buffer->cap == 0 ? 64 : buffer->cap;

  while (next_cap < needed) {
    if (next_cap > ((size_t)-1) / 2) {
      return CCJS_ERR_OOM;
    }

    next_cap *= 2;
  }

  char* next = buffer->allocator->realloc(buffer->allocator->user, buffer->bytes, buffer->cap, next_cap, _Alignof(char));

  if (next == 0) {
    return CCJS_ERR_OOM;
  }

  buffer->bytes = next;
  buffer->cap = next_cap;

  return CCJS_OK;
}

static ccjs_status ccjs_json_buffer_push_char(ccjs_json_buffer* buffer, char value) {
  ccjs_status status = ccjs_json_buffer_reserve(buffer, buffer->len + 1);

  if (status != CCJS_OK) {
    return status;
  }

  buffer->bytes[buffer->len] = value;
  buffer->len += 1;

  return CCJS_OK;
}

static ccjs_status ccjs_json_buffer_push_bytes(ccjs_json_buffer* buffer, const char* bytes, size_t len) {
  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status status = ccjs_json_buffer_reserve(buffer, buffer->len + len);

  if (status != CCJS_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(buffer->bytes + buffer->len, bytes, len);
  }

  buffer->len += len;

  return CCJS_OK;
}

static void ccjs_json_skip_ws(ccjs_json_parser* parser) {
  while (parser->pos < parser->len) {
    char value = parser->bytes[parser->pos];

    if (value != ' ' && value != '\n' && value != '\r' && value != '\t') {
      return;
    }

    parser->pos += 1;
  }
}

static bool ccjs_json_match_byte(ccjs_json_parser* parser, char value) {
  if (parser->pos >= parser->len || parser->bytes[parser->pos] != value) {
    return false;
  }

  parser->pos += 1;

  return true;
}

static bool ccjs_json_match_literal(ccjs_json_parser* parser, const char* literal, size_t len) {
  if (parser->pos + len > parser->len || memcmp(parser->bytes + parser->pos, literal, len) != 0) {
    return false;
  }

  parser->pos += len;

  return true;
}

static int ccjs_json_hex_value(char value) {
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

static bool ccjs_json_parse_hex4(const char* bytes, uint32_t* out) {
  if (bytes == 0 || out == 0) {
    return false;
  }

  int a = ccjs_json_hex_value(bytes[0]);
  int b = ccjs_json_hex_value(bytes[1]);
  int c = ccjs_json_hex_value(bytes[2]);
  int d = ccjs_json_hex_value(bytes[3]);

  if (a < 0 || b < 0 || c < 0 || d < 0) {
    return false;
  }

  *out = ((uint32_t)a << 12) | ((uint32_t)b << 8) | ((uint32_t)c << 4) | (uint32_t)d;

  return true;
}

static ccjs_status ccjs_json_buffer_push_utf8(ccjs_json_buffer* buffer, uint32_t codepoint) {
  if (codepoint <= 0x7f) {
    return ccjs_json_buffer_push_char(buffer, (char)codepoint);
  }

  if (codepoint <= 0x7ff) {
    char bytes[] = { (char)(0xc0 | (codepoint >> 6)), (char)(0x80 | (codepoint & 0x3f)) };

    return ccjs_json_buffer_push_bytes(buffer, bytes, sizeof(bytes));
  }

  if (codepoint <= 0xffff) {
    if (codepoint >= 0xd800 && codepoint <= 0xdfff) {
      return CCJS_ERR_TYPE;
    }

    char bytes[] = { (char)(0xe0 | (codepoint >> 12)), (char)(0x80 | ((codepoint >> 6) & 0x3f)),
                     (char)(0x80 | (codepoint & 0x3f)) };

    return ccjs_json_buffer_push_bytes(buffer, bytes, sizeof(bytes));
  }

  if (codepoint <= 0x10ffff) {
    char bytes[] = { (char)(0xf0 | (codepoint >> 18)), (char)(0x80 | ((codepoint >> 12) & 0x3f)),
                     (char)(0x80 | ((codepoint >> 6) & 0x3f)), (char)(0x80 | (codepoint & 0x3f)) };

    return ccjs_json_buffer_push_bytes(buffer, bytes, sizeof(bytes));
  }

  return CCJS_ERR_TYPE;
}

static ccjs_status
ccjs_json_parse_string_bytes(ccjs_json_parser* parser, char** out_bytes, size_t* out_len, bool nul_terminated) {
  if (parser == 0 || out_bytes == 0 || out_len == 0 || !ccjs_json_match_byte(parser, '"')) {
    return CCJS_ERR_TYPE;
  }

  ccjs_json_buffer buffer = { .allocator = parser->allocator };

  while (parser->pos < parser->len) {
    unsigned char value = (unsigned char)parser->bytes[parser->pos];
    parser->pos += 1;

    if (value == '"') {
      if (nul_terminated) {
        ccjs_status status = ccjs_json_buffer_push_char(&buffer, '\0');

        if (status != CCJS_OK) {
          ccjs_json_buffer_dispose(&buffer);
          return status;
        }

        buffer.len -= 1;
      }

      *out_bytes = buffer.bytes;
      *out_len = buffer.len;
      return CCJS_OK;
    }

    if (value < 0x20) {
      ccjs_json_buffer_dispose(&buffer);
      return CCJS_ERR_TYPE;
    }

    if (value != '\\') {
      ccjs_status status = ccjs_json_buffer_push_char(&buffer, (char)value);

      if (status != CCJS_OK) {
        ccjs_json_buffer_dispose(&buffer);
        return status;
      }

      continue;
    }

    if (parser->pos >= parser->len) {
      ccjs_json_buffer_dispose(&buffer);
      return CCJS_ERR_TYPE;
    }

    char escaped = parser->bytes[parser->pos];
    parser->pos += 1;
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
      if (parser->pos + 4 > parser->len) {
        ccjs_json_buffer_dispose(&buffer);
        return CCJS_ERR_TYPE;
      }

      uint32_t codepoint = 0;

      if (!ccjs_json_parse_hex4(parser->bytes + parser->pos, &codepoint)) {
        ccjs_json_buffer_dispose(&buffer);
        return CCJS_ERR_TYPE;
      }

      parser->pos += 4;

      if (codepoint >= 0xd800 && codepoint <= 0xdbff) {
        if (parser->pos + 6 > parser->len || parser->bytes[parser->pos] != '\\' || parser->bytes[parser->pos + 1] != 'u') {
          ccjs_json_buffer_dispose(&buffer);
          return CCJS_ERR_TYPE;
        }

        uint32_t low = 0;

        if (!ccjs_json_parse_hex4(parser->bytes + parser->pos + 2, &low) || low < 0xdc00 || low > 0xdfff) {
          ccjs_json_buffer_dispose(&buffer);
          return CCJS_ERR_TYPE;
        }

        parser->pos += 6;
        codepoint = 0x10000 + ((codepoint - 0xd800) << 10) + (low - 0xdc00);
      } else if (codepoint >= 0xdc00 && codepoint <= 0xdfff) {
        ccjs_json_buffer_dispose(&buffer);
        return CCJS_ERR_TYPE;
      }

      ccjs_status status = ccjs_json_buffer_push_utf8(&buffer, codepoint);

      if (status != CCJS_OK) {
        ccjs_json_buffer_dispose(&buffer);
        return status;
      }

      has_output = false;
    } else {
      ccjs_json_buffer_dispose(&buffer);
      return CCJS_ERR_TYPE;
    }

    if (!has_output) {
      continue;
    }

    ccjs_status status = ccjs_json_buffer_push_char(&buffer, output);

    if (status != CCJS_OK) {
      ccjs_json_buffer_dispose(&buffer);
      return status;
    }
  }

  ccjs_json_buffer_dispose(&buffer);
  return CCJS_ERR_TYPE;
}

static ccjs_status ccjs_json_parse_value(ccjs_json_parser* parser, size_t depth, ccjs_value* out);

static ccjs_status ccjs_json_parse_string(ccjs_json_parser* parser, ccjs_value* out) {
  char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_json_parse_string_bytes(parser, &bytes, &len, false);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_string_from_literal(parser->allocator, bytes == 0 ? "" : bytes, len, out);

  if (parser->allocator != 0 && parser->allocator->free != 0 && bytes != 0) {
    parser->allocator->free(parser->allocator->user, bytes, len, _Alignof(char));
  }

  return status;
}

static ccjs_status ccjs_json_parse_number(ccjs_json_parser* parser, ccjs_value* out) {
  size_t start = parser->pos;

  if (parser->pos < parser->len && parser->bytes[parser->pos] == '-') {
    parser->pos += 1;
  }

  if (parser->pos >= parser->len) {
    return CCJS_ERR_TYPE;
  }

  if (parser->bytes[parser->pos] == '0') {
    parser->pos += 1;
  } else if (parser->bytes[parser->pos] >= '1' && parser->bytes[parser->pos] <= '9') {
    while (parser->pos < parser->len && parser->bytes[parser->pos] >= '0' && parser->bytes[parser->pos] <= '9') {
      parser->pos += 1;
    }
  } else {
    return CCJS_ERR_TYPE;
  }

  if (parser->pos < parser->len && parser->bytes[parser->pos] == '.') {
    parser->pos += 1;

    if (parser->pos >= parser->len || parser->bytes[parser->pos] < '0' || parser->bytes[parser->pos] > '9') {
      return CCJS_ERR_TYPE;
    }

    while (parser->pos < parser->len && parser->bytes[parser->pos] >= '0' && parser->bytes[parser->pos] <= '9') {
      parser->pos += 1;
    }
  }

  if (parser->pos < parser->len && (parser->bytes[parser->pos] == 'e' || parser->bytes[parser->pos] == 'E')) {
    parser->pos += 1;

    if (parser->pos < parser->len && (parser->bytes[parser->pos] == '+' || parser->bytes[parser->pos] == '-')) {
      parser->pos += 1;
    }

    if (parser->pos >= parser->len || parser->bytes[parser->pos] < '0' || parser->bytes[parser->pos] > '9') {
      return CCJS_ERR_TYPE;
    }

    while (parser->pos < parser->len && parser->bytes[parser->pos] >= '0' && parser->bytes[parser->pos] <= '9') {
      parser->pos += 1;
    }
  }

  size_t len = parser->pos - start;
  char* temp = parser->allocator->alloc(parser->allocator->user, len + 1, _Alignof(char));

  if (temp == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(temp, parser->bytes + start, len);
  temp[len] = '\0';
  errno = 0;
  char* end = 0;
  double number = strtod(temp, &end);
  size_t parsed_len = end == 0 ? 0 : (size_t)(end - temp);
  parser->allocator->free(parser->allocator->user, temp, len + 1, _Alignof(char));

  if (errno != 0 || end == 0 || parsed_len != len) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_number_value(number);

  return CCJS_OK;
}

static void ccjs_json_free_names(ccjs_allocator* allocator, char** names, size_t count) {
  if (allocator == 0 || allocator->free == 0 || names == 0) {
    return;
  }

  for (size_t index = 0; index < count; index += 1) {
    if (names[index] != 0) {
      allocator->free(allocator->user, names[index], strlen(names[index]) + 1, _Alignof(char));
    }
  }
}

static ccjs_status ccjs_json_parse_object(ccjs_json_parser* parser, size_t depth, ccjs_value* out) {
  if (!ccjs_json_match_byte(parser, '{')) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = parser->allocator;
  char** names = 0;
  ccjs_value* values = 0;
  size_t len = 0;
  size_t cap = 0;
  ccjs_status status = CCJS_OK;

  ccjs_json_skip_ws(parser);

  if (!ccjs_json_match_byte(parser, '}')) {
    while (true) {
      ccjs_json_skip_ws(parser);

      if (len == cap) {
        size_t next_cap = cap == 0 ? 4 : cap * 2;
        char** next_names =
          allocator->realloc(allocator->user, names, sizeof(char*) * cap, sizeof(char*) * next_cap, _Alignof(char*));

        if (next_names == 0) {
          status = CCJS_ERR_OOM;
          break;
        }

        names = next_names;
        ccjs_value* next_values = allocator->realloc(
          allocator->user, values, sizeof(ccjs_value) * cap, sizeof(ccjs_value) * next_cap, _Alignof(ccjs_value)
        );

        if (next_values == 0) {
          status = CCJS_ERR_OOM;
          break;
        }

        values = next_values;

        for (size_t index = cap; index < next_cap; index += 1) {
          names[index] = 0;
          values[index] = ccjs_undefined_value();
        }

        cap = next_cap;
      }

      char* key = 0;
      size_t key_len = 0;
      status = ccjs_json_parse_string_bytes(parser, &key, &key_len, true);

      if (status != CCJS_OK) {
        break;
      }

      if (memchr(key, '\0', key_len) != 0) {
        allocator->free(allocator->user, key, key_len + 1, _Alignof(char));
        status = CCJS_ERR_UNSUPPORTED;
        break;
      }

      ccjs_json_skip_ws(parser);

      if (!ccjs_json_match_byte(parser, ':')) {
        allocator->free(allocator->user, key, key_len + 1, _Alignof(char));
        status = CCJS_ERR_TYPE;
        break;
      }

      ccjs_json_skip_ws(parser);
      ccjs_value value = ccjs_undefined_value();
      status = ccjs_json_parse_value(parser, depth + 1, &value);

      if (status != CCJS_OK) {
        allocator->free(allocator->user, key, key_len + 1, _Alignof(char));
        break;
      }

      names[len] = key;
      values[len] = value;
      len += 1;
      ccjs_json_skip_ws(parser);

      if (ccjs_json_match_byte(parser, '}')) {
        break;
      }

      if (!ccjs_json_match_byte(parser, ',')) {
        status = CCJS_ERR_TYPE;
        break;
      }
    }
  }

  if (status == CCJS_OK) {
    if (len > UINT32_MAX) {
      status = CCJS_ERR_UNSUPPORTED;
    }
  }

  bool object_owns_shape = false;

  if (status == CCJS_OK) {
    ccjs_shape* shape = allocator->alloc(allocator->user, sizeof(ccjs_shape), _Alignof(ccjs_shape));

    if (shape == 0) {
      status = CCJS_ERR_OOM;
    } else {
      ccjs_field_info* fields =
        len == 0 ? 0 : allocator->alloc(allocator->user, sizeof(ccjs_field_info) * len, _Alignof(ccjs_field_info));

      if (len != 0 && fields == 0) {
        allocator->free(allocator->user, shape, sizeof(ccjs_shape), _Alignof(ccjs_shape));
        status = CCJS_ERR_OOM;
      } else {
        for (size_t index = 0; index < len; index += 1) {
          fields[index].name = names[index];
          fields[index].flags = 0;
          names[index] = 0;
        }

        shape->field_count = (uint32_t)len;
        shape->fields = fields;
        status = ccjs_object_new(allocator, shape, out);

        if (status == CCJS_OK) {
          ccjs_object* object = (ccjs_object*)out->as.ref;
          object->header.flags |= CCJS_OBJECT_OWNED_SHAPE;
          object_owns_shape = true;

          for (uint32_t index = 0; index < shape->field_count; index += 1) {
            status = ccjs_object_init_known(*out, index, values[index]);

            if (status != CCJS_OK) {
              break;
            }
          }
        }

        if (status != CCJS_OK) {
          if (object_owns_shape) {
            ccjs_release(*out);
            *out = ccjs_undefined_value();
          } else {
            for (uint32_t index = 0; index < shape->field_count; index += 1) {
              if (shape->fields[index].name != 0) {
                allocator->free(
                  allocator->user, (void*)shape->fields[index].name, strlen(shape->fields[index].name) + 1, _Alignof(char)
                );
              }
            }

            if (fields != 0) {
              allocator->free(allocator->user, fields, sizeof(ccjs_field_info) * len, _Alignof(ccjs_field_info));
            }

            allocator->free(allocator->user, shape, sizeof(ccjs_shape), _Alignof(ccjs_shape));
          }
        }
      }
    }
  }

  for (size_t index = 0; index < len; index += 1) {
    ccjs_release(values[index]);
  }

  ccjs_json_free_names(allocator, names, cap);

  if (allocator->free != 0) {
    if (names != 0) {
      allocator->free(allocator->user, names, sizeof(char*) * cap, _Alignof(char*));
    }

    if (values != 0) {
      allocator->free(allocator->user, values, sizeof(ccjs_value) * cap, _Alignof(ccjs_value));
    }
  }

  return status;
}

static ccjs_status ccjs_json_parse_array(ccjs_json_parser* parser, size_t depth, ccjs_value* out) {
  if (!ccjs_json_match_byte(parser, '[')) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status status = ccjs_array_new(parser->allocator, 0, out);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_json_skip_ws(parser);

  if (ccjs_json_match_byte(parser, ']')) {
    return CCJS_OK;
  }

  while (true) {
    ccjs_json_skip_ws(parser);
    ccjs_value value = ccjs_undefined_value();
    status = ccjs_json_parse_value(parser, depth + 1, &value);

    if (status != CCJS_OK) {
      ccjs_release(*out);
      *out = ccjs_undefined_value();
      return status;
    }

    status = ccjs_array_push(*out, value);
    ccjs_release(value);

    if (status != CCJS_OK) {
      ccjs_release(*out);
      *out = ccjs_undefined_value();
      return status;
    }

    ccjs_json_skip_ws(parser);

    if (ccjs_json_match_byte(parser, ']')) {
      return CCJS_OK;
    }

    if (!ccjs_json_match_byte(parser, ',')) {
      ccjs_release(*out);
      *out = ccjs_undefined_value();
      return CCJS_ERR_TYPE;
    }
  }
}

static ccjs_status ccjs_json_parse_value(ccjs_json_parser* parser, size_t depth, ccjs_value* out) {
  if (depth > CCJS_JSON_MAX_DEPTH) {
    return CCJS_ERR_UNSUPPORTED;
  }

  ccjs_json_skip_ws(parser);

  if (parser->pos >= parser->len) {
    return CCJS_ERR_TYPE;
  }

  char value = parser->bytes[parser->pos];

  if (value == '"') {
    return ccjs_json_parse_string(parser, out);
  }

  if (value == '{') {
    return ccjs_json_parse_object(parser, depth, out);
  }

  if (value == '[') {
    return ccjs_json_parse_array(parser, depth, out);
  }

  if (value == 't' && ccjs_json_match_literal(parser, "true", 4)) {
    *out = ccjs_bool_value(true);
    return CCJS_OK;
  }

  if (value == 'f' && ccjs_json_match_literal(parser, "false", 5)) {
    *out = ccjs_bool_value(false);
    return CCJS_OK;
  }

  if (value == 'n' && ccjs_json_match_literal(parser, "null", 4)) {
    *out = ccjs_null_value();
    return CCJS_OK;
  }

  return ccjs_json_parse_number(parser, out);
}

ccjs_status ccjs_json_parse(ccjs_allocator* allocator, const char* bytes, size_t len, ccjs_value* out) {
  if (
    allocator == 0 || allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0 || out == 0 ||
    (bytes == 0 && len != 0)
  ) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_json_parser parser = { .allocator = allocator, .bytes = bytes == 0 ? "" : bytes, .len = len };
  ccjs_status status = ccjs_json_parse_value(&parser, 0, out);

  if (status != CCJS_OK) {
    ccjs_release(*out);
    *out = ccjs_undefined_value();
    return status;
  }

  ccjs_json_skip_ws(&parser);

  if (parser.pos != parser.len) {
    ccjs_release(*out);
    *out = ccjs_undefined_value();
    return CCJS_ERR_TYPE;
  }

  return CCJS_OK;
}

static ccjs_status
ccjs_json_stringify_value(ccjs_json_buffer* buffer, ccjs_json_stringify_stack* stack, ccjs_value value, size_t depth);

static bool ccjs_json_stringify_stack_contains(const ccjs_json_stringify_stack* stack, const ccjs_ref* ref) {
  if (stack == 0 || ref == 0) {
    return false;
  }

  for (size_t index = 0; index < stack->len; index += 1) {
    if (stack->refs[index] == ref) {
      return true;
    }
  }

  return false;
}

static ccjs_status ccjs_json_stringify_stack_push(ccjs_json_stringify_stack* stack, const ccjs_ref* ref) {
  if (stack == 0 || ref == 0) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_json_stringify_stack_contains(stack, ref)) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (stack->len >= CCJS_JSON_MAX_DEPTH + 1) {
    return CCJS_ERR_UNSUPPORTED;
  }

  stack->refs[stack->len] = ref;
  stack->len += 1;

  return CCJS_OK;
}

static void ccjs_json_stringify_stack_pop(ccjs_json_stringify_stack* stack, const ccjs_ref* ref) {
  if (stack == 0 || ref == 0 || stack->len == 0) {
    return;
  }

  if (stack->refs[stack->len - 1] == ref) {
    stack->len -= 1;
  }
}

static ccjs_status ccjs_json_stringify_string_bytes(ccjs_json_buffer* buffer, const char* bytes, size_t len) {
  ccjs_status status = ccjs_json_buffer_push_char(buffer, '"');

  if (status != CCJS_OK) {
    return status;
  }

  static const char hex[] = "0123456789abcdef";

  for (size_t index = 0; index < len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];

    if (value == '"' || value == '\\') {
      status = ccjs_json_buffer_push_char(buffer, '\\');

      if (status == CCJS_OK) {
        status = ccjs_json_buffer_push_char(buffer, (char)value);
      }
    } else if (value == '\b') {
      status = ccjs_json_buffer_push_bytes(buffer, "\\b", 2);
    } else if (value == '\f') {
      status = ccjs_json_buffer_push_bytes(buffer, "\\f", 2);
    } else if (value == '\n') {
      status = ccjs_json_buffer_push_bytes(buffer, "\\n", 2);
    } else if (value == '\r') {
      status = ccjs_json_buffer_push_bytes(buffer, "\\r", 2);
    } else if (value == '\t') {
      status = ccjs_json_buffer_push_bytes(buffer, "\\t", 2);
    } else if (value < 0x20) {
      char escaped[] = { '\\', 'u', '0', '0', hex[value >> 4], hex[value & 0xf] };
      status = ccjs_json_buffer_push_bytes(buffer, escaped, sizeof(escaped));
    } else {
      status = ccjs_json_buffer_push_char(buffer, (char)value);
    }

    if (status != CCJS_OK) {
      return status;
    }
  }

  return ccjs_json_buffer_push_char(buffer, '"');
}

static ccjs_status ccjs_json_stringify_number(ccjs_json_buffer* buffer, double number) {
  char temp[64];
  int written = snprintf(temp, sizeof(temp), "%.17g", number);

  if (written < 0 || (size_t)written >= sizeof(temp)) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_json_buffer_push_bytes(buffer, temp, (size_t)written);
}

static ccjs_status
ccjs_json_stringify_array(ccjs_json_buffer* buffer, ccjs_json_stringify_stack* stack, ccjs_value value, size_t depth) {
  ccjs_array* array = (ccjs_array*)value.as.ref;
  ccjs_status status = ccjs_json_stringify_stack_push(stack, value.as.ref);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_json_buffer_push_char(buffer, '[');

  if (status != CCJS_OK) {
    goto done;
  }

  for (size_t index = 0; index < array->len; index += 1) {
    if (index != 0) {
      status = ccjs_json_buffer_push_char(buffer, ',');

      if (status != CCJS_OK) {
        goto done;
      }
    }

    status = ccjs_json_stringify_value(buffer, stack, array->items[index], depth + 1);

    if (status != CCJS_OK) {
      goto done;
    }
  }

  status = ccjs_json_buffer_push_char(buffer, ']');

done:
  ccjs_json_stringify_stack_pop(stack, value.as.ref);
  return status;
}

static ccjs_status
ccjs_json_stringify_object(ccjs_json_buffer* buffer, ccjs_json_stringify_stack* stack, ccjs_value value, size_t depth) {
  ccjs_object* object = (ccjs_object*)value.as.ref;
  ccjs_status status = ccjs_json_stringify_stack_push(stack, value.as.ref);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_json_buffer_push_char(buffer, '{');

  if (status != CCJS_OK) {
    goto done;
  }

  for (uint32_t index = 0; index < object->shape->field_count; index += 1) {
    if (index != 0) {
      status = ccjs_json_buffer_push_char(buffer, ',');

      if (status != CCJS_OK) {
        goto done;
      }
    }

    const char* name = object->shape->fields[index].name;
    status = ccjs_json_stringify_string_bytes(buffer, name, strlen(name));

    if (status == CCJS_OK) {
      status = ccjs_json_buffer_push_char(buffer, ':');
    }

    if (status == CCJS_OK) {
      status = ccjs_json_stringify_value(buffer, stack, object->fields[index], depth + 1);
    }

    if (status != CCJS_OK) {
      goto done;
    }
  }

  status = ccjs_json_buffer_push_char(buffer, '}');

done:
  ccjs_json_stringify_stack_pop(stack, value.as.ref);
  return status;
}

static ccjs_status
ccjs_json_stringify_value(ccjs_json_buffer* buffer, ccjs_json_stringify_stack* stack, ccjs_value value, size_t depth) {
  if (depth > CCJS_JSON_MAX_DEPTH) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (value.tag == CCJS_TAG_NULL) {
    return ccjs_json_buffer_push_bytes(buffer, "null", 4);
  }

  if (value.tag == CCJS_TAG_BOOL) {
    return value.as.boolean ? ccjs_json_buffer_push_bytes(buffer, "true", 4) : ccjs_json_buffer_push_bytes(buffer, "false", 5);
  }

  if (value.tag == CCJS_TAG_NUMBER) {
    return ccjs_json_stringify_number(buffer, value.as.number);
  }

  if (value.tag == CCJS_TAG_STRING && value.as.ref != 0) {
    ccjs_string* string = (ccjs_string*)value.as.ref;

    return ccjs_json_stringify_string_bytes(buffer, string->bytes, string->len);
  }

  if (value.tag == CCJS_TAG_ARRAY && value.as.ref != 0) {
    return ccjs_json_stringify_array(buffer, stack, value, depth);
  }

  if (value.tag == CCJS_TAG_OBJECT && value.as.ref != 0) {
    return ccjs_json_stringify_object(buffer, stack, value, depth);
  }

  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_json_stringify(ccjs_allocator* allocator, ccjs_value value, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_json_buffer buffer = { .allocator = allocator };
  ccjs_json_stringify_stack stack = { 0 };
  ccjs_status status = ccjs_json_stringify_value(&buffer, &stack, value, 0);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, buffer.bytes == 0 ? "" : buffer.bytes, buffer.len, out);
  }

  ccjs_json_buffer_dispose(&buffer);

  return status;
}
