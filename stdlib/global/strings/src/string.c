#include <float.h>
#include <math.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "inox/array.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/string.h"

inox_status inox_array_join(
  inox_allocator* allocator,
  inox_value array,
  const char* separator_bytes,
  size_t separator_len,
  inox_value* out
);
inox_status inox_array_new(inox_allocator* allocator, size_t len, inox_value* out);
inox_status inox_array_push(inox_value array, inox_value value);

inox_status inox_string_from_literal(inox_allocator* allocator, const char* bytes, size_t len, inox_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || bytes == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  const size_t size = sizeof(inox_string) + len;
  inox_string* string = allocator->alloc(allocator->user, size, _Alignof(inox_string));

  if (string == 0) {
    *out = inox_undefined_value();
    return INOX_ERR_OOM;
  }

  string->header.kind = INOX_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(inox_string);
  string->header.allocator = allocator;
  string->header.dispose = 0;
  inox_ref_init_weak(&string->header);
  string->len = len;
  memcpy(string->bytes, bytes, len);

  out->tag = INOX_TAG_STRING;
  out->as.ref = &string->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_STRING);
#endif

  return INOX_OK;
}

inox_status inox_string_from_bool(inox_allocator* allocator, bool value, inox_value* out) {
  return value ? inox_string_from_literal(allocator, "true", 4, out) : inox_string_from_literal(allocator, "false", 5, out);
}

inox_status inox_string_from_number(inox_allocator* allocator, double value, inox_value* out) {
  char buffer[64];
  const int len = snprintf(buffer, sizeof(buffer), "%.17g", value);

  if (len < 0 || (size_t)len >= sizeof(buffer)) {
    if (out != 0) {
      *out = inox_undefined_value();
    }

    return INOX_ERR_TYPE;
  }

  return inox_string_from_literal(allocator, buffer, (size_t)len, out);
}

inox_status inox_string_from_number_radix(inox_allocator* allocator, double value, int radix, inox_value* out) {
  if (radix == 10) {
    return inox_string_from_number(allocator, value, out);
  }

  if (allocator == 0 || out == 0 || radix < 2 || radix > 36) {
    if (out != 0) {
      *out = inox_undefined_value();
    }

    return INOX_ERR_TYPE;
  }

  if (value != value || isinf(value) || floor(value) != value) {
    return inox_string_from_number(allocator, value, out);
  }

  const char digits[] = "0123456789abcdefghijklmnopqrstuvwxyz";
  char buffer[80];
  size_t index = sizeof(buffer);
  bool negative = value < 0;
  double remaining = negative ? -value : value;

  buffer[--index] = '\0';

  if (remaining == 0) {
    buffer[--index] = '0';
  } else {
    while (remaining > 0 && index > 0) {
      double quotient = floor(remaining / (double)radix);
      int digit = (int)(remaining - quotient * (double)radix);
      buffer[--index] = digits[digit];
      remaining = quotient;
    }
  }

  if (negative && index > 0) {
    buffer[--index] = '-';
  }

  return inox_string_from_literal(allocator, buffer + index, sizeof(buffer) - index - 1, out);
}

inox_status inox_string_from_format(inox_allocator* allocator, inox_value* out, const char* format, ...) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || format == 0) {
    return INOX_ERR_TYPE;
  }

  va_list args;
  va_start(args, format);

  va_list length_args;
  va_copy(length_args, args);
  const int written_len = vsnprintf(0, 0, format, length_args);
  va_end(length_args);

  if (written_len < 0) {
    va_end(args);
    return INOX_ERR_TYPE;
  }

  const size_t len = (size_t)written_len;

  if (len > ((size_t)-1) - sizeof(inox_string) - 1) {
    va_end(args);
    return INOX_ERR_OOM;
  }

  const size_t size = sizeof(inox_string) + len + 1;
  inox_string* string = allocator->alloc(allocator->user, size, _Alignof(inox_string));

  if (string == 0) {
    va_end(args);
    return INOX_ERR_OOM;
  }

  const int written = vsnprintf(string->bytes, len + 1, format, args);
  va_end(args);

  if (written < 0 || (size_t)written != len) {
    if (allocator->free != 0) {
      allocator->free(allocator->user, string, size, _Alignof(inox_string));
    }

    return INOX_ERR_TYPE;
  }

  string->header.kind = INOX_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(inox_string);
  string->header.allocator = allocator;
  string->header.dispose = 0;
  inox_ref_init_weak(&string->header);
  string->len = len;

  out->tag = INOX_TAG_STRING;
  out->as.ref = &string->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_STRING);
#endif

  return INOX_OK;
}

inox_status inox_string_from_value(inox_allocator* allocator, inox_value value, inox_value* out) {
  if (value.tag == INOX_TAG_UNDEFINED) {
    return inox_string_from_literal(allocator, "undefined", 9, out);
  }

  if (value.tag == INOX_TAG_NULL) {
    return inox_string_from_literal(allocator, "null", 4, out);
  }

  if (value.tag == INOX_TAG_BOOL) {
    return inox_string_from_bool(allocator, value.as.boolean, out);
  }

  if (value.tag == INOX_TAG_NUMBER) {
    return inox_string_from_number(allocator, value.as.number, out);
  }

  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;
    return inox_string_from_literal(allocator, string->bytes, string->len, out);
  }

  if (value.tag == INOX_TAG_ARRAY) {
    return inox_array_join(allocator, value, ",", 1, out);
  }

  if (value.tag == INOX_TAG_OBJECT) {
    return inox_string_from_literal(allocator, "[object Object]", 15, out);
  }

  if (value.tag == INOX_TAG_MAP) {
    return inox_string_from_literal(allocator, "[object Map]", 12, out);
  }

  if (value.tag == INOX_TAG_SET) {
    return inox_string_from_literal(allocator, "[object Set]", 12, out);
  }

  if (value.tag == INOX_TAG_BYTES) {
    return inox_string_from_literal(allocator, "[object Uint8Array]", 19, out);
  }

  if (value.tag == INOX_TAG_FUNCTION) {
    return inox_string_from_literal(allocator, "[object Function]", 17, out);
  }

  return INOX_ERR_TYPE;
}

static bool inox_string_is_trim_space_code_point(uint32_t value) {
  return value == 0x0009u || value == 0x000au || value == 0x000bu || value == 0x000cu || value == 0x000du || value == 0x0020u ||
         value == 0x00a0u || value == 0x1680u || (value >= 0x2000u && value <= 0x200au) || value == 0x2028u || value == 0x2029u ||
         value == 0x202fu || value == 0x205fu || value == 0x3000u || value == 0xfeffu;
}

static bool inox_string_is_ascii_digit(char value) {
  return value >= '0' && value <= '9';
}

static bool inox_utf8_is_continuation(unsigned char value) {
  return (value & 0xc0u) == 0x80u;
}

static size_t inox_utf8_next_len(const char* bytes, size_t len, size_t index) {
  if (bytes == 0 || index >= len) {
    return 0;
  }

  const unsigned char first = (unsigned char)bytes[index];

  if (first < 0x80u) {
    return 1;
  }

  if (first >= 0xc2u && first <= 0xdfu && index + 1 < len && inox_utf8_is_continuation((unsigned char)bytes[index + 1])) {
    return 2;
  }

  if (first == 0xe0u && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0xa0u && second <= 0xbfu && inox_utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (
    first >= 0xe1u && first <= 0xecu && index + 2 < len && inox_utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    inox_utf8_is_continuation((unsigned char)bytes[index + 2])
  ) {
    return 3;
  }

  if (first == 0xedu && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0x80u && second <= 0x9fu && inox_utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (
    first >= 0xeeu && first <= 0xefu && index + 2 < len && inox_utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    inox_utf8_is_continuation((unsigned char)bytes[index + 2])
  ) {
    return 3;
  }

  if (first == 0xf0u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (
      second >= 0x90u && second <= 0xbfu && inox_utf8_is_continuation((unsigned char)bytes[index + 2]) &&
      inox_utf8_is_continuation((unsigned char)bytes[index + 3])
    ) {
      return 4;
    }
  }

  if (
    first >= 0xf1u && first <= 0xf3u && index + 3 < len && inox_utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    inox_utf8_is_continuation((unsigned char)bytes[index + 2]) && inox_utf8_is_continuation((unsigned char)bytes[index + 3])
  ) {
    return 4;
  }

  if (first == 0xf4u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (
      second >= 0x80u && second <= 0x8fu && inox_utf8_is_continuation((unsigned char)bytes[index + 2]) &&
      inox_utf8_is_continuation((unsigned char)bytes[index + 3])
    ) {
      return 4;
    }
  }

  return 1;
}

static uint32_t inox_utf8_code_point_at(const char* bytes, size_t len, size_t index, size_t* step_out) {
  size_t step = inox_utf8_next_len(bytes, len, index);

  if (step == 0) {
    step = 1;
  }

  if (step_out != 0) {
    *step_out = step;
  }

  const unsigned char first = (unsigned char)bytes[index];

  if (step == 1) {
    return (uint32_t)first;
  }

  const unsigned char second = (unsigned char)bytes[index + 1];

  if (step == 2) {
    return ((uint32_t)(first & 0x1fu) << 6) | (uint32_t)(second & 0x3fu);
  }

  const unsigned char third = (unsigned char)bytes[index + 2];

  if (step == 3) {
    return ((uint32_t)(first & 0x0fu) << 12) | ((uint32_t)(second & 0x3fu) << 6) | (uint32_t)(third & 0x3fu);
  }

  const unsigned char fourth = (unsigned char)bytes[index + 3];

  return ((uint32_t)(first & 0x07u) << 18) | ((uint32_t)(second & 0x3fu) << 12) | ((uint32_t)(third & 0x3fu) << 6) |
         (uint32_t)(fourth & 0x3fu);
}

static size_t inox_string_utf16_code_units(uint32_t code_point) {
  return code_point > 0xffffu ? 2 : 1;
}

static size_t inox_string_code_unit_to_byte_offset_floor(const char* bytes, size_t value_len, size_t offset);
static size_t inox_string_code_unit_index_of_byte_offset(const char* bytes, size_t value_len, size_t offset);

static void inox_string_trim_span(const char* bytes, size_t len, size_t* start_out, size_t* end_out) {
  size_t start = 0;
  size_t end = 0;
  size_t index = 0;
  bool seen_non_space = false;

  while (index < len) {
    size_t step = 0;
    const uint32_t code_point = inox_utf8_code_point_at(bytes, len, index, &step);

    if (!inox_string_is_trim_space_code_point(code_point)) {
      if (!seen_non_space) {
        start = index;
      }

      end = index + step;
      seen_non_space = true;
    }

    index += step;
  }

  if (!seen_non_space) {
    start = 0;
    end = 0;
  }

  if (start_out != 0) {
    *start_out = start;
  }

  if (end_out != 0) {
    *end_out = end;
  }
}

size_t inox_string_code_unit_length_parts(const char* value_bytes, size_t value_len) {
  if (value_bytes == 0 && value_len != 0) {
    return 0;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t index = 0;
  size_t length = 0;

  while (index < value_len) {
    size_t step = 0;
    const uint32_t code_point = inox_utf8_code_point_at(bytes, value_len, index, &step);

    index += step;
    length += inox_string_utf16_code_units(code_point);
  }

  return length;
}

double inox_string_char_code_at_parts(const char* value_bytes, size_t value_len, size_t offset) {
  if (value_bytes == 0 && value_len != 0) {
    return 0;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const size_t byte_offset = inox_string_code_unit_to_byte_offset_floor(bytes, value_len, offset);

  if (byte_offset >= value_len) {
    return 0;
  }

  size_t step = 0;
  const uint32_t code_point = inox_utf8_code_point_at(bytes, value_len, byte_offset, &step);

  if (code_point <= 0xffffu) {
    return (double)code_point;
  }

  const size_t code_unit_offset = inox_string_code_unit_index_of_byte_offset(bytes, value_len, byte_offset);
  const uint32_t surrogate = code_point - 0x10000u;

  if (offset > code_unit_offset) {
    return (double)(0xdc00u + (surrogate & 0x3ffu));
  }

  return (double)(0xd800u + (surrogate >> 10));
}

static size_t inox_string_code_unit_to_byte_offset_floor(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = 0;
    const uint32_t code_point = inox_utf8_code_point_at(bytes, value_len, index, &step);
    const size_t units = inox_string_utf16_code_units(code_point);

    if (current + units > offset) {
      return index;
    }

    index += step;
    current += units;
  }

  return index;
}

static size_t inox_string_code_unit_to_byte_offset_ceiling(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = 0;
    const uint32_t code_point = inox_utf8_code_point_at(bytes, value_len, index, &step);
    const size_t units = inox_string_utf16_code_units(code_point);

    if (current + units > offset) {
      return index + step;
    }

    index += step;
    current += units;
  }

  return index;
}

static size_t inox_string_code_unit_index_of_byte_offset(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && index < offset) {
    size_t step = 0;
    const uint32_t code_point = inox_utf8_code_point_at(bytes, value_len, index, &step);

    if (index + step > offset) {
      break;
    }

    index += step;
    current += inox_string_utf16_code_units(code_point);
  }

  return current;
}

inox_status inox_string_to_number(const char* value_bytes, size_t value_len, inox_value* out) {
  if (out != 0) {
    *out = inox_null_value();
  }

  if (out == 0 || (value_bytes == 0 && value_len != 0)) {
    return INOX_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;
  inox_string_trim_span(bytes, value_len, &start, &end);

  if (start == end) {
    *out = inox_number_value(0);
    return INOX_OK;
  }

  size_t pos = start;
  bool negative = false;

  if (bytes[pos] == '+' || bytes[pos] == '-') {
    negative = bytes[pos] == '-';
    pos += 1;
  }

  if (end - pos == 8 && memcmp(bytes + pos, "Infinity", 8) == 0) {
    *out = inox_number_value(negative ? -HUGE_VAL : HUGE_VAL);
    return INOX_OK;
  }

  double value = 0;
  size_t digits = 0;

  while (pos < end && inox_string_is_ascii_digit(bytes[pos])) {
    const double digit = (double)(bytes[pos] - '0');

    if (value > (DBL_MAX - digit) / 10.0) {
      value = HUGE_VAL;
    } else {
      value = value * 10.0 + digit;
    }

    digits += 1;
    pos += 1;
  }

  if (pos < end && bytes[pos] == '.') {
    pos += 1;
    double scale = 0.1;

    while (pos < end && inox_string_is_ascii_digit(bytes[pos])) {
      value += (double)(bytes[pos] - '0') * scale;
      scale /= 10.0;
      digits += 1;
      pos += 1;
    }
  }

  if (digits == 0) {
    return INOX_OK;
  }

  if (pos < end && (bytes[pos] == 'e' || bytes[pos] == 'E')) {
    pos += 1;
    bool exponent_negative = false;

    if (pos < end && (bytes[pos] == '+' || bytes[pos] == '-')) {
      exponent_negative = bytes[pos] == '-';
      pos += 1;
    }

    if (pos >= end || !inox_string_is_ascii_digit(bytes[pos])) {
      return INOX_OK;
    }

    size_t exponent = 0;

    while (pos < end && inox_string_is_ascii_digit(bytes[pos])) {
      if (exponent < 400) {
        exponent = exponent * 10 + (size_t)(bytes[pos] - '0');

        if (exponent > 400) {
          exponent = 400;
        }
      }

      pos += 1;
    }

    if (exponent_negative) {
      for (size_t index = 0; index < exponent; index += 1) {
        value /= 10.0;
      }
    } else {
      for (size_t index = 0; index < exponent; index += 1) {
        if (value > DBL_MAX / 10.0) {
          value = HUGE_VAL;
        } else {
          value *= 10.0;
        }
      }
    }
  }

  if (pos != end) {
    return INOX_OK;
  }

  *out = inox_number_value(negative ? -value : value);

  return INOX_OK;
}

inox_status inox_string_concat_parts(
  inox_allocator* allocator,
  const char* left_bytes,
  size_t left_len,
  const char* right_bytes,
  size_t right_len,
  inox_value* out
) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (left_len > ((size_t)-1) - right_len) {
    return INOX_ERR_OOM;
  }

  const size_t len = left_len + right_len;

  if (
    allocator == 0 || allocator->alloc == 0 || out == 0 || (left_bytes == 0 && left_len != 0) ||
    (right_bytes == 0 && right_len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  if (len > ((size_t)-1) - sizeof(inox_string)) {
    return INOX_ERR_OOM;
  }

  const size_t size = sizeof(inox_string) + len;
  inox_string* string = allocator->alloc(allocator->user, size, _Alignof(inox_string));

  if (string == 0) {
    return INOX_ERR_OOM;
  }

  string->header.kind = INOX_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(inox_string);
  string->header.allocator = allocator;
  string->header.dispose = 0;
  inox_ref_init_weak(&string->header);
  string->len = len;

  if (left_len != 0) {
    memcpy(string->bytes, left_bytes, left_len);
  }

  if (right_len != 0) {
    memcpy(string->bytes + left_len, right_bytes, right_len);
  }

  out->tag = INOX_TAG_STRING;
  out->as.ref = &string->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_STRING);
#endif

  return INOX_OK;
}

inox_status inox_string_trim_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = inox_undefined_value();
    }

    return INOX_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;
  inox_string_trim_span(bytes, value_len, &start, &end);

  return inox_string_from_literal(allocator, bytes + start, end - start, out);
}

inox_status inox_string_trim_start_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = inox_undefined_value();
    }

    return INOX_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;
  inox_string_trim_span(bytes, value_len, &start, &end);

  if (end == 0) {
    return inox_string_from_literal(allocator, "", 0, out);
  }

  return inox_string_from_literal(allocator, bytes + start, value_len - start, out);
}

inox_status inox_string_trim_end_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = inox_undefined_value();
    }

    return INOX_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t end = value_len;
  inox_string_trim_span(bytes, value_len, 0, &end);

  return inox_string_from_literal(allocator, bytes, end, out);
}

inox_status inox_string_to_upper_case_parts(inox_allocator* allocator, const char* value_bytes, size_t value_len, inox_value* out) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (value_bytes == 0 && value_len != 0)) {
    return INOX_ERR_TYPE;
  }

  if (value_len > ((size_t)-1) - sizeof(inox_string)) {
    return INOX_ERR_OOM;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const size_t size = sizeof(inox_string) + value_len;
  inox_string* string = allocator->alloc(allocator->user, size, _Alignof(inox_string));

  if (string == 0) {
    return INOX_ERR_OOM;
  }

  string->header.kind = INOX_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(inox_string);
  string->header.allocator = allocator;
  string->header.dispose = 0;
  inox_ref_init_weak(&string->header);
  string->len = value_len;

  for (size_t index = 0; index < value_len; index += 1) {
    unsigned char value = (unsigned char)bytes[index];

    if (value >= (unsigned char)'a' && value <= (unsigned char)'z') {
      value = (unsigned char)(value - ((unsigned char)'a' - (unsigned char)'A'));
    }

    string->bytes[index] = (char)value;
  }

  out->tag = INOX_TAG_STRING;
  out->as.ref = &string->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_STRING);
#endif

  return INOX_OK;
}

inox_status inox_string_pad_start_parts(
  inox_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  size_t target_len,
  const char* pad_bytes,
  size_t pad_len,
  inox_value* out
) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (
    allocator == 0 || allocator->alloc == 0 || out == 0 || (value_bytes == 0 && value_len != 0) ||
    (pad_bytes == 0 && pad_len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const char* pad = pad_bytes == 0 ? "" : pad_bytes;
  const size_t value_units = inox_string_code_unit_length_parts(bytes, value_len);
  const size_t pad_units = inox_string_code_unit_length_parts(pad, pad_len);

  if (target_len <= value_units || pad_len == 0 || pad_units == 0) {
    return inox_string_from_literal(allocator, bytes, value_len, out);
  }

  size_t remaining_units = target_len - value_units;
  size_t pad_total_len = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = inox_string_code_unit_to_byte_offset_ceiling(pad, pad_len, take_units);

    if (take_len > ((size_t)-1) - pad_total_len) {
      return INOX_ERR_OOM;
    }

    pad_total_len += take_len;
    remaining_units -= take_units;
  }

  if (value_len > ((size_t)-1) - pad_total_len) {
    return INOX_ERR_OOM;
  }

  const size_t len = pad_total_len + value_len;

  if (len > ((size_t)-1) - sizeof(inox_string)) {
    return INOX_ERR_OOM;
  }

  const size_t size = sizeof(inox_string) + len;
  inox_string* string = allocator->alloc(allocator->user, size, _Alignof(inox_string));

  if (string == 0) {
    return INOX_ERR_OOM;
  }

  string->header.kind = INOX_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(inox_string);
  string->header.allocator = allocator;
  string->header.dispose = 0;
  inox_ref_init_weak(&string->header);
  string->len = len;

  remaining_units = target_len - value_units;
  size_t offset = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = inox_string_code_unit_to_byte_offset_ceiling(pad, pad_len, take_units);

    if (take_len != 0) {
      memcpy(string->bytes + offset, pad, take_len);
      offset += take_len;
    }

    remaining_units -= take_units;
  }

  if (value_len != 0) {
    memcpy(string->bytes + offset, bytes, value_len);
  }

  out->tag = INOX_TAG_STRING;
  out->as.ref = &string->header;
#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_ref_created(INOX_REF_STRING);
#endif

  return INOX_OK;
}

inox_status inox_string_slice_parts(
  inox_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  size_t start,
  size_t end,
  inox_value* out
) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = inox_undefined_value();
    }

    return INOX_ERR_TYPE;
  }

  if (end < start) {
    end = start;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const size_t start_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes, value_len, start);
  size_t end_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes, value_len, end);

  if (end_byte < start_byte) {
    end_byte = start_byte;
  }

  return inox_string_from_literal(allocator, bytes + start_byte, end_byte - start_byte, out);
}

static inox_status inox_string_split_push(inox_allocator* allocator, inox_value array, const char* bytes, size_t len) {
  inox_value item = inox_undefined_value();
  inox_status status = inox_string_from_literal(allocator, bytes == 0 ? "" : bytes, len, &item);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_array_push(array, item);
  inox_release(item);

  return status;
}

inox_status inox_string_split_parts(
  inox_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  const char* separator_bytes,
  size_t separator_len,
  inox_value* out
) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (
    allocator == 0 || allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0 || out == 0 ||
    (value_bytes == 0 && value_len != 0) || (separator_bytes == 0 && separator_len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const char* separator = separator_bytes == 0 ? "" : separator_bytes;
  inox_status status = inox_array_new(allocator, 0, out);

  if (status != INOX_OK) {
    return status;
  }

  if (separator_len == 0) {
    for (size_t index = 0; index < value_len;) {
      size_t step = inox_utf8_next_len(bytes, value_len, index);

      if (step == 0) {
        step = 1;
      }

      status = inox_string_split_push(allocator, *out, bytes + index, step);

      if (status != INOX_OK) {
        inox_release(*out);
        *out = inox_undefined_value();
        return status;
      }

      index += step;
    }

    return INOX_OK;
  }

  size_t start = 0;
  size_t index = 0;

  while (index + separator_len <= value_len) {
    if (memcmp(bytes + index, separator, separator_len) != 0) {
      index += 1;
      continue;
    }

    status = inox_string_split_push(allocator, *out, bytes + start, index - start);

    if (status != INOX_OK) {
      inox_release(*out);
      *out = inox_undefined_value();
      return status;
    }

    index += separator_len;
    start = index;
  }

  status = inox_string_split_push(allocator, *out, bytes + start, value_len - start);

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

double inox_string_index_of_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return -1;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const char* search = search_bytes == 0 ? "" : search_bytes;
  const size_t length = inox_string_code_unit_length_parts(bytes, value_len);

  if (start > length) {
    start = length;
  }

  if (search_len == 0) {
    return (double)start;
  }

  const size_t start_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes, value_len, start);

  if (search_len > value_len - start_byte) {
    return -1;
  }

  const size_t max_start = value_len - search_len;

  for (size_t index = start_byte; index <= max_start;) {
    if (memcmp(bytes + index, search, search_len) == 0) {
      return (double)inox_string_code_unit_index_of_byte_offset(bytes, value_len, index);
    }

    size_t step = inox_utf8_next_len(bytes, value_len, index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return -1;
}

double inox_string_last_index_of_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return -1;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const char* search = search_bytes == 0 ? "" : search_bytes;
  const size_t length = inox_string_code_unit_length_parts(bytes, value_len);

  if (start > length) {
    start = length;
  }

  if (search_len == 0) {
    return (double)start;
  }

  if (search_len > value_len) {
    return -1;
  }

  const size_t start_byte = inox_string_code_unit_to_byte_offset_floor(bytes, value_len, start);
  const size_t max_start = value_len - search_len;
  double last_match = -1;

  for (size_t index = 0; index <= max_start;) {
    if (index > start_byte) {
      break;
    }

    if (memcmp(bytes + index, search, search_len) == 0) {
      last_match = (double)inox_string_code_unit_index_of_byte_offset(bytes, value_len, index);
    }

    size_t step = inox_utf8_next_len(bytes, value_len, index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return last_match;
}

bool inox_string_includes_from_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
) {
  return inox_string_index_of_parts(value_bytes, value_len, search_bytes, search_len, start) >= 0;
}

bool inox_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  return inox_string_includes_from_parts(value_bytes, value_len, search_bytes, search_len, 0);
}

bool inox_string_starts_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len > value_len) {
    return false;
  }

  return search_len == 0 || memcmp(value_bytes, search_bytes, search_len) == 0;
}

bool inox_string_ends_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len > value_len) {
    return false;
  }

  return search_len == 0 || memcmp(value_bytes + value_len - search_len, search_bytes, search_len) == 0;
}
