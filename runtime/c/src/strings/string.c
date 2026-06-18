#include <float.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "ccjs/array.h"
#ifdef CCJS_DEBUG_MEMORY
#include "ccjs/debug.h"
#endif
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
  ccjs_ref_init_weak(&string->header);
  string->len = len;
  memcpy(string->bytes, bytes, len);

  out->tag = CCJS_TAG_STRING;
  out->as.ref = &string->header;
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_ref_created(CCJS_REF_STRING);
#endif

  return CCJS_OK;
}

ccjs_status ccjs_string_from_bool(ccjs_allocator* allocator, bool value, ccjs_value* out) {
  return value ? ccjs_string_from_literal(allocator, "true", 4, out) : ccjs_string_from_literal(allocator, "false", 5, out);
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

ccjs_status ccjs_string_from_value(ccjs_allocator* allocator, ccjs_value value, ccjs_value* out) {
  if (value.tag == CCJS_TAG_UNDEFINED) {
    return ccjs_string_from_literal(allocator, "undefined", 9, out);
  }

  if (value.tag == CCJS_TAG_NULL) {
    return ccjs_string_from_literal(allocator, "null", 4, out);
  }

  if (value.tag == CCJS_TAG_BOOL) {
    return ccjs_string_from_bool(allocator, value.as.boolean, out);
  }

  if (value.tag == CCJS_TAG_NUMBER) {
    return ccjs_string_from_number(allocator, value.as.number, out);
  }

  if (value.tag == CCJS_TAG_STRING && value.as.ref != 0) {
    ccjs_string* string = (ccjs_string*)value.as.ref;
    return ccjs_string_from_literal(allocator, string->bytes, string->len, out);
  }

  if (value.tag == CCJS_TAG_ARRAY) {
    return ccjs_array_join(allocator, value, ",", 1, out);
  }

  if (value.tag == CCJS_TAG_OBJECT) {
    return ccjs_string_from_literal(allocator, "[object Object]", 15, out);
  }

  if (value.tag == CCJS_TAG_MAP) {
    return ccjs_string_from_literal(allocator, "[object Map]", 12, out);
  }

  if (value.tag == CCJS_TAG_SET) {
    return ccjs_string_from_literal(allocator, "[object Set]", 12, out);
  }

  if (value.tag == CCJS_TAG_BYTES) {
    return ccjs_string_from_literal(allocator, "[object Uint8Array]", 19, out);
  }

  if (value.tag == CCJS_TAG_FUNCTION) {
    return ccjs_string_from_literal(allocator, "[object Function]", 17, out);
  }

  return CCJS_ERR_TYPE;
}

static bool ccjs_string_is_trim_space_code_point(uint32_t value) {
  return value == 0x0009u || value == 0x000au || value == 0x000bu || value == 0x000cu || value == 0x000du || value == 0x0020u ||
         value == 0x00a0u || value == 0x1680u || (value >= 0x2000u && value <= 0x200au) || value == 0x2028u || value == 0x2029u ||
         value == 0x202fu || value == 0x205fu || value == 0x3000u || value == 0xfeffu;
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

  if (
    first >= 0xe1u && first <= 0xecu && index + 2 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])
  ) {
    return 3;
  }

  if (first == 0xedu && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0x80u && second <= 0x9fu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (
    first >= 0xeeu && first <= 0xefu && index + 2 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    ccjs_utf8_is_continuation((unsigned char)bytes[index + 2])
  ) {
    return 3;
  }

  if (first == 0xf0u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (
      second >= 0x90u && second <= 0xbfu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2]) &&
      ccjs_utf8_is_continuation((unsigned char)bytes[index + 3])
    ) {
      return 4;
    }
  }

  if (
    first >= 0xf1u && first <= 0xf3u && index + 3 < len && ccjs_utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    ccjs_utf8_is_continuation((unsigned char)bytes[index + 2]) && ccjs_utf8_is_continuation((unsigned char)bytes[index + 3])
  ) {
    return 4;
  }

  if (first == 0xf4u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (
      second >= 0x80u && second <= 0x8fu && ccjs_utf8_is_continuation((unsigned char)bytes[index + 2]) &&
      ccjs_utf8_is_continuation((unsigned char)bytes[index + 3])
    ) {
      return 4;
    }
  }

  return 1;
}

static uint32_t ccjs_utf8_code_point_at(const char* bytes, size_t len, size_t index, size_t* step_out) {
  size_t step = ccjs_utf8_next_len(bytes, len, index);

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

static size_t ccjs_string_utf16_code_units(uint32_t code_point) {
  return code_point > 0xffffu ? 2 : 1;
}

static void ccjs_string_trim_span(const char* bytes, size_t len, size_t* start_out, size_t* end_out) {
  size_t start = 0;
  size_t end = 0;
  size_t index = 0;
  bool seen_non_space = false;

  while (index < len) {
    size_t step = 0;
    const uint32_t code_point = ccjs_utf8_code_point_at(bytes, len, index, &step);

    if (!ccjs_string_is_trim_space_code_point(code_point)) {
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

size_t ccjs_string_code_unit_length_parts(const char* value_bytes, size_t value_len) {
  if (value_bytes == 0 && value_len != 0) {
    return 0;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t index = 0;
  size_t length = 0;

  while (index < value_len) {
    size_t step = 0;
    const uint32_t code_point = ccjs_utf8_code_point_at(bytes, value_len, index, &step);

    index += step;
    length += ccjs_string_utf16_code_units(code_point);
  }

  return length;
}

static size_t ccjs_string_code_unit_to_byte_offset_floor(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = 0;
    const uint32_t code_point = ccjs_utf8_code_point_at(bytes, value_len, index, &step);
    const size_t units = ccjs_string_utf16_code_units(code_point);

    if (current + units > offset) {
      return index;
    }

    index += step;
    current += units;
  }

  return index;
}

static size_t ccjs_string_code_unit_to_byte_offset_ceiling(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = 0;
    const uint32_t code_point = ccjs_utf8_code_point_at(bytes, value_len, index, &step);
    const size_t units = ccjs_string_utf16_code_units(code_point);

    if (current + units > offset) {
      return index + step;
    }

    index += step;
    current += units;
  }

  return index;
}

static size_t ccjs_string_code_unit_index_of_byte_offset(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && index < offset) {
    size_t step = 0;
    const uint32_t code_point = ccjs_utf8_code_point_at(bytes, value_len, index, &step);

    if (index + step > offset) {
      break;
    }

    index += step;
    current += ccjs_string_utf16_code_units(code_point);
  }

  return current;
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
  ccjs_string_trim_span(bytes, value_len, &start, &end);

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

  if (
    allocator == 0 || allocator->alloc == 0 || out == 0 || (left_bytes == 0 && left_len != 0) ||
    (right_bytes == 0 && right_len != 0)
  ) {
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
  ccjs_ref_init_weak(&string->header);
  string->len = len;

  if (left_len != 0) {
    memcpy(string->bytes, left_bytes, left_len);
  }

  if (right_len != 0) {
    memcpy(string->bytes + left_len, right_bytes, right_len);
  }

  out->tag = CCJS_TAG_STRING;
  out->as.ref = &string->header;
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_ref_created(CCJS_REF_STRING);
#endif

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
  ccjs_string_trim_span(bytes, value_len, &start, &end);

  return ccjs_string_from_literal(allocator, bytes + start, end - start, out);
}

ccjs_status ccjs_string_trim_start_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t start = 0;
  size_t end = value_len;
  ccjs_string_trim_span(bytes, value_len, &start, &end);

  if (end == 0) {
    return ccjs_string_from_literal(allocator, "", 0, out);
  }

  return ccjs_string_from_literal(allocator, bytes + start, value_len - start, out);
}

ccjs_status ccjs_string_trim_end_parts(ccjs_allocator* allocator, const char* value_bytes, size_t value_len, ccjs_value* out) {
  if (value_bytes == 0 && value_len != 0) {
    if (out != 0) {
      *out = ccjs_undefined_value();
    }

    return CCJS_ERR_TYPE;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t end = value_len;
  ccjs_string_trim_span(bytes, value_len, 0, &end);

  return ccjs_string_from_literal(allocator, bytes, end, out);
}

ccjs_status ccjs_string_slice_parts(
  ccjs_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  size_t start,
  size_t end,
  ccjs_value* out
) {
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
  const size_t start_byte = ccjs_string_code_unit_to_byte_offset_ceiling(bytes, value_len, start);
  size_t end_byte = ccjs_string_code_unit_to_byte_offset_ceiling(bytes, value_len, end);

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

ccjs_status ccjs_string_split_parts(
  ccjs_allocator* allocator,
  const char* value_bytes,
  size_t value_len,
  const char* separator_bytes,
  size_t separator_len,
  ccjs_value* out
) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (
    allocator == 0 || allocator->alloc == 0 || allocator->realloc == 0 || allocator->free == 0 || out == 0 ||
    (value_bytes == 0 && value_len != 0) || (separator_bytes == 0 && separator_len != 0)
  ) {
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

double ccjs_string_index_of_parts(
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
  const size_t length = ccjs_string_code_unit_length_parts(bytes, value_len);

  if (start > length) {
    start = length;
  }

  if (search_len == 0) {
    return (double)start;
  }

  const size_t start_byte = ccjs_string_code_unit_to_byte_offset_ceiling(bytes, value_len, start);

  if (search_len > value_len - start_byte) {
    return -1;
  }

  const size_t max_start = value_len - search_len;

  for (size_t index = start_byte; index <= max_start;) {
    if (memcmp(bytes + index, search, search_len) == 0) {
      return (double)ccjs_string_code_unit_index_of_byte_offset(bytes, value_len, index);
    }

    size_t step = ccjs_utf8_next_len(bytes, value_len, index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return -1;
}

double ccjs_string_last_index_of_parts(
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
  const size_t length = ccjs_string_code_unit_length_parts(bytes, value_len);

  if (start > length) {
    start = length;
  }

  if (search_len == 0) {
    return (double)start;
  }

  if (search_len > value_len) {
    return -1;
  }

  const size_t start_byte = ccjs_string_code_unit_to_byte_offset_floor(bytes, value_len, start);
  const size_t max_start = value_len - search_len;
  double last_match = -1;

  for (size_t index = 0; index <= max_start;) {
    if (index > start_byte) {
      break;
    }

    if (memcmp(bytes + index, search, search_len) == 0) {
      last_match = (double)ccjs_string_code_unit_index_of_byte_offset(bytes, value_len, index);
    }

    size_t step = ccjs_utf8_next_len(bytes, value_len, index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return last_match;
}

bool ccjs_string_includes_from_parts(
  const char* value_bytes,
  size_t value_len,
  const char* search_bytes,
  size_t search_len,
  size_t start
) {
  return ccjs_string_index_of_parts(value_bytes, value_len, search_bytes, search_len, start) >= 0;
}

bool ccjs_string_includes_parts(const char* value_bytes, size_t value_len, const char* search_bytes, size_t search_len) {
  return ccjs_string_includes_from_parts(value_bytes, value_len, search_bytes, search_len, 0);
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
