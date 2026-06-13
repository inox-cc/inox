#include <float.h>
#include <math.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include "ccjs/array.h"
#include "ccjs/string.h"

ccjs_status ccjs_string_from_literal(ccjs_allocator* allocator, const char* bytes, size_t len, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || bytes == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  const size_t size = sizeof(ccjs_string) + len;
  ccjs_string* string = allocator->alloc(allocator->user, size, _Alignof(ccjs_string));

  if (string == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  string->header.kind = CCJS_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(ccjs_string);
  string->header.allocator = allocator;
  string->len = len;
  memcpy(string->bytes, bytes, len);

  out->tag = CCJS_TAG_STRING;
  out->as.ref = &string->header;

  return CCJS_OK;
}

ccjs_status ccjs_string_from_bool(ccjs_allocator* allocator, bool value, ccjs_value* out) {
  return value
    ? ccjs_string_from_literal(allocator, "true", 4, out)
    : ccjs_string_from_literal(allocator, "false", 5, out);
}

ccjs_status ccjs_string_from_number(ccjs_allocator* allocator, double value, ccjs_value* out) {
  char buffer[64];
  const int len = snprintf(buffer, sizeof(buffer), "%.17g", value);

  if (len < 0 || (size_t)len >= sizeof(buffer)) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  return ccjs_string_from_literal(allocator, buffer, (size_t)len, out);
}

static bool ccjs_string_is_ascii_trim_space(char value) {
  return value == ' '
    || value == '\t'
    || value == '\n'
    || value == '\r'
    || value == '\f'
    || value == '\v';
}

static bool ccjs_string_is_ascii_digit(char value) {
  return value >= '0' && value <= '9';
}

static bool ccjs_utf8_is_continuation(unsigned char value) {
  return (value & 0xc0u) == 0x80u;
}

static size_t ccjs_utf8_next_len(const char* bytes, size_t len, size_t index) {
  if (bytes == 0 || index >= len) {
    return 0;
  }

  const unsigned char first = (unsigned char)bytes[index];

  if (first < 0x80u) {
    return 1;
  }

  if (first >= 0xc2u && first <= 0xdfu && index + 1 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1])) {
    return 2;
  }

  if (first == 0xe0u && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0xa0u && second <= 0xbfu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (first >= 0xe1u && first <= 0xecu && index + 2 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])) {
    return 3;
  }

  if (first == 0xedu && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0x80u && second <= 0x9fu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (first >= 0xeeu && first <= 0xefu && index + 2 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])) {
    return 3;
  }

  if (first == 0xf0u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0x90u && second <= 0xbfu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 3])) {
      return 4;
    }
  }

  if (first >= 0xf1u && first <= 0xf3u && index + 3 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 3])) {
    return 4;
  }

  if (first == 0xf4u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0x80u && second <= 0x8fu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 3])) {
      return 4;
    }
  }

  return 1;
}

size_t ccjs_string_code_point_length_parts(const char* value_bytes, size_t value_len) {
  if (value_bytes == 0 && value_len != 0) {
    return 0;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t index = 0;
  size_t length = 0;

  while (index < value_len) {
    size_t step = ccjs_utf8_next_len(bytes, value_len, index);

    if (step == 0) {
      step = 1;
    }

    index += step;
    length += 1;
  }

  return length;
}

static size_t ccjs_string_code_point_to_byte_offset(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = ccjs_utf8_next_len(bytes, value_len, index);

    if (step == 0) {
      step = 1;
    }

    index += step;
    current += 1;
  }

  return index;
}

ccjs_status ccjs_string_to_number(const char* value_bytes, size_t value_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_null_value();
  }

  if (out == 0 || (value_bytes == 0 && value_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;

  while (start < end && ccjs_string_is_ascii_trim_space(bytes[start])) {
    start += 1;
  }

  while (end > start && ccjs_string_is_ascii_trim_space(bytes[end - 1])) {
    end -= 1;
  }

  if (start == end) {
    *out = ccjs_number_value(0);
    return CCJS_OK;
  }

  size_t pos = start;
  bool negative = false;

  if (bytes[pos] == '+' || bytes[pos] == '-') {
    negative = bytes[pos] == '-';
    pos += 1;
  }

  if (end - pos == 8 && memcmp(bytes + pos, "Infinity", 8) == 0) {
    *out = ccjs_number_value(negative ? -HUGE_VAL : HUGE_VAL);
    return CCJS_OK;
  }

  double value = 0;
  size_t digits = 0;

  while (pos < end && ccjs_string_is_ascii_digit(bytes[pos])) {
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

    while (pos < end && ccjs_string_is_ascii_digit(bytes[pos])) {
      value += (double)(bytes[pos] - '0') * scale;
      scale /= 10.0;
      digits += 1;
      pos += 1;
    }
  }

  if (digits == 0) {
    return CCJS_OK;
  }

  if (pos < end && (bytes[pos] == 'e' || bytes[pos] == 'E')) {
    pos += 1;
    bool exponent_negative = false;

    if (pos < end && (bytes[pos] == '+' || bytes[pos] == '-')) {
      exponent_negative = bytes[pos] == '-';
      pos += 1;
    }

    if (pos >= end || !ccjs_string_is_ascii_digit(bytes[pos])) {
      return CCJS_OK;
    }

    size_t exponent = 0;

    while (pos < end && ccjs_string_is_ascii_digit(bytes[pos])) {
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
    return CCJS_OK;
  }

  *out = ccjs_number_value(negative ? -value : value);

  return CCJS_OK;
}

ccjs_status ccjs_string_concat_parts(
  ccjs_allocator* allocator,
  const char* left_bytes,
  size_t left_len,
  const char* right_bytes,
  size_t right_len,
  ccjs_value* out
) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (left_len > ((size_t)-1) - right_len) {
    return CCJS_ERR_OOM;
  }

  const size_t len = left_len + right_len;

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (left_bytes == 0 && left_len != 0) || (right_bytes == 0 && right_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (len > ((size_t)-1) - sizeof(ccjs_string)) {
    return CCJS_ERR_OOM;
  }

  const size_t size = sizeof(ccjs_string) + len;
  ccjs_string* string = allocator->alloc(allocator->user, size, _Alignof(ccjs_string));

  if (string == 0) {
    return CCJS_ERR_OOM;
  }

  string->header.kind = CCJS_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = _Alignof(ccjs_string);
  string->header.allocator = allocator;
  string->len = len;

  if (left_len != 0) {
    memcpy(string->bytes, left_bytes, left_len);
  }

  if (right_len != 0) {
    memcpy(string->bytes + left_len, right_bytes, right_len);
  }

  out->tag = CCJS_TAG_STRING;
  out->as.ref = &string->header;

  return CCJS_OK;
}

ccjs_status ccjs_string_trim_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;

  while (start < end && ccjs_string_is_ascii_trim_space(bytes[start])) {
    start += 1;
  }

  while (end > start && ccjs_string_is_ascii_trim_space(bytes[end - 1])) {
    end -= 1;
  }

  return ccjs_string_from_literal(allocator, bytes + start, end - start, out);
}

ccjs_status ccjs_string_slice_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, size_t start, size_t end, ccjs_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  if (end < start) {
    end = start;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const size_t start_byte = ccjs_string_code_point_to_byte_offset(bytes, value_len, start);
  size_t end_byte = ccjs_string_code_point_to_byte_offset(bytes, value_len, end);

  if (end_byte < start_byte) {
    end_byte = start_byte;
  }

  return ccjs_string_from_literal(allocator, bytes + start_byte, end_byte - start_byte, out);
}

static ccjs_status ccjs_string_split_push(ccjs_allocator* allocator, ccjs_value array, const char* bytes, size_t len) {
  ccjs_value item = ccjs_undefined_value();
  ccjs_status status = ccjs_string_from_literal(allocator, bytes == 0 ? "" : bytes, len, &item);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_array_push(array, item);
  ccjs_release(item);

  return status;
}

ccjs_status ccjs_string_split_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, const char* separator_bytes, size_t separator_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0 || out == 0 || (value_bytes == 0 && value_len != 0) || (separator_bytes == 0 && separator_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  const char* separator = separator_bytes == 0 ? "" : separator_bytes;
  ccjs_status status = ccjs_array_new(allocator, 0, out);

  if (status != CCJS_OK) {
    return status;
  }

  if (separator_len == 0) {
    for (size_t index = 0; index < value_len;) {
      size_t step = ccjs_utf8_next_len(bytes, value_len, index);

      if (step == 0) {
        step = 1;
      }

      status = ccjs_string_split_push(allocator, *out, bytes + index, step);

      if (status != CCJS_OK) {
        ccjs_release(*out);
        *out = ccjs_undefined_value();
        return status;
      }

      index += step;
    }

    return CCJS_OK;
  }

  size_t start = 0;
  size_t index = 0;

  while (index + separator_len <= value_len) {
    if (memcmp(bytes + index, separator, separator_len) != 0) {
      index += 1;
      continue;
    }

    status = ccjs_string_split_push(allocator, *out, bytes + start, index - start);

    if (status != CCJS_OK) {
      ccjs_release(*out);
      *out = ccjs_undefined_value();
      return status;
    }

    index += separator_len;
    start = index;
  }

  status = ccjs_string_split_push(allocator, *out, bytes + start, value_len - start);

  if (status != CCJS_OK) {
    ccjs_release(*out);
    *out = ccjs_undefined_value();
  }

  return status;
}

bool ccjs_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len == 0) {
    return true;
  }

  if (search_len > value_len) {
    return false;
  }

  const size_t max_start = value_len - search_len;

  for (size_t index = 0; index <= max_start; index += 1) {
    if (memcmp(value_bytes + index, search_bytes, search_len) == 0) {
      return true;
    }
  }

  return false;
}

bool ccjs_string_starts_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len > value_len) {
    return false;
  }

  return search_len == 0 || memcmp(value_bytes, search_bytes, search_len) == 0;
}

bool ccjs_string_ends_with_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  if ((value_bytes == 0 && value_len != 0) || (search_bytes == 0 && search_len != 0)) {
    return false;
  }

  if (search_len > value_len) {
    return false;
  }

  return search_len == 0 || memcmp(value_bytes + value_len - search_len, search_bytes, search_len) == 0;
}
