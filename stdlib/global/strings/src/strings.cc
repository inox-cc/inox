#include <float.h>
#include <math.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <utility>
#include "inox/array.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/loop.h"
#include "inox/string.h"

static inox_string* string_alloc_storage(inox_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0 || len > ((size_t)-1) - sizeof(inox_string)) {
    return 0;
  }

  const size_t size = sizeof(inox_string) + len;
  inox_string* string = (inox_string*)allocator->alloc(allocator->user, size, alignof(inox_string));

  if (string == 0) {
    return 0;
  }

  string->header.kind = INOX_REF_STRING;
  string->header.ref_count = 1;
  string->header.flags = 0;
  string->header.size = size;
  string->header.align = alignof(inox_string);
  string->header.allocator = allocator;
  string->header.dispose = 0;
  inox_ref_init_weak(&string->header);
  string->len = len;
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_STRING);
#endif

  return string;
}

static inox_status string_format_number(double value, char* buffer, size_t buffer_len, size_t* len_out) {
  if (buffer == 0 || buffer_len == 0 || len_out == 0) {
    return INOX_ERR_TYPE;
  }

  const int len = snprintf(buffer, buffer_len, "%.17g", value);

  if (len < 0 || (size_t)len >= buffer_len) {
    return INOX_ERR_TYPE;
  }

  *len_out = (size_t)len;
  return INOX_OK;
}

static bool string_is_trim_space_code_point(uint32_t value) {
  return value == 0x0009u || value == 0x000au || value == 0x000bu || value == 0x000cu || value == 0x000du || value == 0x0020u ||
         value == 0x00a0u || value == 0x1680u || (value >= 0x2000u && value <= 0x200au) || value == 0x2028u || value == 0x2029u ||
         value == 0x202fu || value == 0x205fu || value == 0x3000u || value == 0xfeffu;
}

static bool string_is_ascii_digit(char value) {
  return value >= '0' && value <= '9';
}

static bool utf8_is_continuation(unsigned char value) {
  return (value & 0xc0u) == 0x80u;
}

static size_t utf8_next_len(const char* bytes, size_t len, size_t index) {
  if (bytes == 0 || index >= len) {
    return 0;
  }

  const unsigned char first = (unsigned char)bytes[index];

  if (first < 0x80u) {
    return 1;
  }

  if (first >= 0xc2u && first <= 0xdfu && index + 1 < len && utf8_is_continuation((unsigned char)bytes[index + 1])) {
    return 2;
  }

  if (first == 0xe0u && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0xa0u && second <= 0xbfu && utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (
    first >= 0xe1u && first <= 0xecu && index + 2 < len && utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    utf8_is_continuation((unsigned char)bytes[index + 2])
  ) {
    return 3;
  }

  if (first == 0xedu && index + 2 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (second >= 0x80u && second <= 0x9fu && utf8_is_continuation((unsigned char)bytes[index + 2])) {
      return 3;
    }
  }

  if (
    first >= 0xeeu && first <= 0xefu && index + 2 < len && utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    utf8_is_continuation((unsigned char)bytes[index + 2])
  ) {
    return 3;
  }

  if (first == 0xf0u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (
      second >= 0x90u && second <= 0xbfu && utf8_is_continuation((unsigned char)bytes[index + 2]) &&
      utf8_is_continuation((unsigned char)bytes[index + 3])
    ) {
      return 4;
    }
  }

  if (
    first >= 0xf1u && first <= 0xf3u && index + 3 < len && utf8_is_continuation((unsigned char)bytes[index + 1]) &&
    utf8_is_continuation((unsigned char)bytes[index + 2]) && utf8_is_continuation((unsigned char)bytes[index + 3])
  ) {
    return 4;
  }

  if (first == 0xf4u && index + 3 < len) {
    const unsigned char second = (unsigned char)bytes[index + 1];

    if (
      second >= 0x80u && second <= 0x8fu && utf8_is_continuation((unsigned char)bytes[index + 2]) &&
      utf8_is_continuation((unsigned char)bytes[index + 3])
    ) {
      return 4;
    }
  }

  return 1;
}

static uint32_t utf8_code_point_at(const char* bytes, size_t len, size_t index, size_t* step_out) {
  size_t step = utf8_next_len(bytes, len, index);

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

static size_t string_utf16_code_units(uint32_t code_point) {
  return code_point > 0xffffu ? 2 : 1;
}

static size_t string_code_unit_to_byte_offset_floor(const char* bytes, size_t value_len, size_t offset);
static size_t string_code_unit_index_of_byte_offset(const char* bytes, size_t value_len, size_t offset);

static void string_trim_span(const char* bytes, size_t len, size_t* start_out, size_t* end_out) {
  size_t start = 0;
  size_t end = 0;
  size_t index = 0;
  bool seen_non_space = false;

  while (index < len) {
    size_t step = 0;
    const uint32_t code_point = utf8_code_point_at(bytes, len, index, &step);

    if (!string_is_trim_space_code_point(code_point)) {
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

static size_t string_code_unit_length(const char* value_bytes, size_t value_len) {
  if (value_bytes == 0 && value_len != 0) {
    return 0;
  }

  const char* bytes = value_bytes == 0 ? "" : value_bytes;
  size_t index = 0;
  size_t length = 0;

  while (index < value_len) {
    size_t step = 0;
    const uint32_t code_point = utf8_code_point_at(bytes, value_len, index, &step);

    index += step;
    length += string_utf16_code_units(code_point);
  }

  return length;
}

static size_t string_code_unit_to_byte_offset_floor(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = 0;
    const uint32_t code_point = utf8_code_point_at(bytes, value_len, index, &step);
    const size_t units = string_utf16_code_units(code_point);

    if (current + units > offset) {
      return index;
    }

    index += step;
    current += units;
  }

  return index;
}

static size_t string_code_unit_to_byte_offset_ceiling(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && current < offset) {
    size_t step = 0;
    const uint32_t code_point = utf8_code_point_at(bytes, value_len, index, &step);
    const size_t units = string_utf16_code_units(code_point);

    if (current + units > offset) {
      return index + step;
    }

    index += step;
    current += units;
  }

  return index;
}

static size_t string_code_unit_index_of_byte_offset(const char* bytes, size_t value_len, size_t offset) {
  size_t index = 0;
  size_t current = 0;

  while (index < value_len && index < offset) {
    size_t step = 0;
    const uint32_t code_point = utf8_code_point_at(bytes, value_len, index, &step);

    if (index + step > offset) {
      break;
    }

    index += step;
    current += string_utf16_code_units(code_point);
  }

  return current;
}

inox::Value inox::String::toNumber(StringView value) {
  if (value.bytes == 0 && value.len != 0) {
    return inox_null_value();
  }

  const char* bytes = value.bytes == 0 ? "" : value.bytes;
  size_t start = 0;
  size_t end = value.len;
  string_trim_span(bytes, value.len, &start, &end);

  if (start == end) {
    return inox_number_value(0);
  }

  size_t pos = start;
  bool negative = false;

  if (bytes[pos] == '+' || bytes[pos] == '-') {
    negative = bytes[pos] == '-';
    pos += 1;
  }

  if (end - pos == 8 && memcmp(bytes + pos, "Infinity", 8) == 0) {
    return inox_number_value(negative ? -HUGE_VAL : HUGE_VAL);
  }

  double parsed = 0;
  size_t digits = 0;

  while (pos < end && string_is_ascii_digit(bytes[pos])) {
    const double digit = (double)(bytes[pos] - '0');

    if (parsed > (DBL_MAX - digit) / 10.0) {
      parsed = HUGE_VAL;
    } else {
      parsed = parsed * 10.0 + digit;
    }

    digits += 1;
    pos += 1;
  }

  if (pos < end && bytes[pos] == '.') {
    pos += 1;
    double scale = 0.1;

    while (pos < end && string_is_ascii_digit(bytes[pos])) {
      parsed += (double)(bytes[pos] - '0') * scale;
      scale /= 10.0;
      digits += 1;
      pos += 1;
    }
  }

  if (digits == 0) {
    return inox_null_value();
  }

  if (pos < end && (bytes[pos] == 'e' || bytes[pos] == 'E')) {
    pos += 1;
    bool exponent_negative = false;

    if (pos < end && (bytes[pos] == '+' || bytes[pos] == '-')) {
      exponent_negative = bytes[pos] == '-';
      pos += 1;
    }

    if (pos >= end || !string_is_ascii_digit(bytes[pos])) {
      return inox_null_value();
    }

    size_t exponent = 0;

    while (pos < end && string_is_ascii_digit(bytes[pos])) {
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
        parsed /= 10.0;
      }
    } else {
      for (size_t index = 0; index < exponent; index += 1) {
        if (parsed > DBL_MAX / 10.0) {
          parsed = HUGE_VAL;
        } else {
          parsed *= 10.0;
        }
      }
    }
  }

  if (pos != end) {
    return inox_null_value();
  }

  return inox_number_value(negative ? -parsed : parsed);
}

namespace inox {

static String string_result_or_oom(String result) {
  if (!result.valid()) {
    throw_out_of_memory();
  }

  return result;
}

static void string_throw_range_error(const char* message) {
  String error(message);

  if (!error.valid()) {
    throw_out_of_memory();
    return;
  }

  throw_value(error);
}

static bool string_next_utf16_code_unit(
  StringView value,
  size_t* index,
  uint16_t* pending,
  bool* has_pending,
  uint16_t* out
) {
  if (*has_pending) {
    *has_pending = false;
    *out = *pending;
    return true;
  }

  if (*index >= value.len) {
    return false;
  }

  size_t step = 0;
  const uint32_t code_point = utf8_code_point_at(value.bytes, value.len, *index, &step);
  *index += step;

  if (code_point <= 0xffffu) {
    *out = (uint16_t)code_point;
    return true;
  }

  const uint32_t adjusted = code_point - 0x10000u;
  *out = (uint16_t)(0xd800u + (adjusted >> 10));
  *pending = (uint16_t)(0xdc00u + (adjusted & 0x3ffu));
  *has_pending = true;
  return true;
}

int compareStrings(StringView left, StringView right) {
  size_t left_index = 0;
  size_t right_index = 0;
  uint16_t left_pending = 0;
  uint16_t right_pending = 0;
  bool left_has_pending = false;
  bool right_has_pending = false;

  for (;;) {
    uint16_t left_unit = 0;
    uint16_t right_unit = 0;
    const bool has_left = string_next_utf16_code_unit(left, &left_index, &left_pending, &left_has_pending, &left_unit);
    const bool has_right = string_next_utf16_code_unit(right, &right_index, &right_pending, &right_has_pending, &right_unit);

    if (!has_left || !has_right) {
      if (has_left) {
        return 1;
      }

      if (has_right) {
        return -1;
      }

      return 0;
    }

    if (left_unit < right_unit) {
      return -1;
    }

    if (left_unit > right_unit) {
      return 1;
    }
  }
}

Value String::make(const char* bytes, size_t len) {
  if (thrown() || bytes == nullptr) {
    return Value();
  }

  inox_string* string = string_alloc_storage(&inox_default_allocator, len);

  if (string == nullptr) {
    return Value();
  }

  memcpy(string->bytes, bytes, len);
  inox_value value = { INOX_TAG_STRING };
  value.as.ref = &string->header;

  return Value(adopt_value, value);
}

size_t String::non_negative_index(double raw) {
  if (raw != raw || raw <= 0) {
    return 0;
  }

  if (raw > (double)((size_t)-1)) {
    return (size_t)-1;
  }

  return (size_t)raw;
}

size_t String::slice_index(double raw, size_t length) {
  if (raw != raw) {
    return 0;
  }

  if (raw <= -((double)length)) {
    return 0;
  }

  if (raw >= ((double)length)) {
    return length;
  }

  long long index = (long long)raw;

  if (index < 0) {
    long long from_end = (long long)length + index;
    return from_end < 0 ? 0 : (size_t)from_end;
  }

  return (size_t)index;
}

String String::fromNumber(double value) {
  char buffer[64];
  size_t len = 0;

  if (string_format_number(value, buffer, sizeof(buffer), &len) != INOX_OK) {
    fatal("Number.toString formatting invariant failed");
  }

  return string_result_or_oom(String(buffer, len));
}

String String::fromNumberRadix(double value, double radix_value) {
  if (!isfinite(radix_value)) {
    string_throw_range_error("RangeError: radix must be between 2 and 36");
    return String();
  }

  const double truncated_radix = trunc(radix_value);

  if (truncated_radix < 2 || truncated_radix > 36) {
    string_throw_range_error("RangeError: radix must be between 2 and 36");
    return String();
  }

  const int radix = (int)truncated_radix;

  if (radix == 10) {
    char buffer[64];
    size_t len = 0;

    if (string_format_number(value, buffer, sizeof(buffer), &len) != INOX_OK) {
      fatal("Number.toString formatting invariant failed");
    }

    return string_result_or_oom(String(buffer, len));
  }

  if (value != value || isinf(value) || floor(value) != value) {
    char buffer[64];
    size_t len = 0;

    if (string_format_number(value, buffer, sizeof(buffer), &len) != INOX_OK) {
      fatal("Number.toString formatting invariant failed");
    }

    return string_result_or_oom(String(buffer, len));
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

  return string_result_or_oom(String(buffer + index, sizeof(buffer) - index - 1));
}

String String::fromFormat(const char* format, ...) {
  if (format == 0) {
    return String();
  }

  va_list args;
  va_start(args, format);

  va_list length_args;
  va_copy(length_args, args);
  const int written_len = vsnprintf(0, 0, format, length_args);
  va_end(length_args);

  if (written_len < 0) {
    va_end(args);
    return String();
  }

  const size_t len = (size_t)written_len;

  if (len > ((size_t)-1) - 1) {
    va_end(args);
    return String();
  }

  inox_string* string = string_alloc_storage(&inox_default_allocator, len + 1);

  if (string == 0) {
    va_end(args);
    return String();
  }

  string->len = len;
  const int written = vsnprintf(string->bytes, len + 1, format, args);
  va_end(args);

  if (written < 0 || (size_t)written != len) {
    inox_value failed = { INOX_TAG_STRING };
    failed.as.ref = &string->header;
    inox_release(failed);
    return String();
  }

  inox_value out = { INOX_TAG_STRING };
  out.as.ref = &string->header;

  return String(adopt(out));
}

String String::fromValue(const Value& input) {
  inox_value value = input.raw();

  if (value.tag == INOX_TAG_UNDEFINED) {
    return String("undefined");
  }

  if (value.tag == INOX_TAG_NULL) {
    return String("null");
  }

  if (value.tag == INOX_TAG_BOOL) {
    return String(value.as.boolean ? "true" : "false");
  }

  if (value.tag == INOX_TAG_NUMBER) {
    return fromNumber(value.as.number);
  }

  if (value.tag == INOX_TAG_STRING && value.as.ref != 0) {
    inox_string* string = (inox_string*)value.as.ref;
    return String(string->bytes, string->len);
  }

  if (value.tag == INOX_TAG_ARRAY) {
    return Array(value).join(",");
  }

  if (value.tag == INOX_TAG_OBJECT) {
    return String("[object Object]");
  }

  if (value.tag == INOX_TAG_MAP) {
    return String("[object Map]");
  }

  if (value.tag == INOX_TAG_SET) {
    return String("[object Set]");
  }

  if (value.tag == INOX_TAG_BYTES) {
    return String("[object Uint8Array]");
  }

  if (value.tag == INOX_TAG_FUNCTION) {
    return String("[object Function]");
  }

  return String();
}

String::String() : Value() {}

String::String(const char* bytes) : Value(make(bytes, bytes == nullptr ? 0 : strlen(bytes))) {}

String::String(const char* bytes, size_t len) : Value(make(bytes, len)) {}

String::String(StringView view) : Value(make(view.bytes, view.len)) {}

String::String(const Value& value) : Value(value) {
  if (thrown()) {
    return;
  }

  if (!valid()) {
    throw_value(Value());
  }
}

String::String(Value&& value) : Value(std::move(value)) {
  if (thrown()) {
    return;
  }

  if (!valid()) {
    throw_value(Value());
  }
}

bool String::valid() const {
  inox_value value = raw();

  return value.tag == INOX_TAG_STRING && value.as.ref != nullptr;
}

size_t String::length() const {
  if (!valid()) {
    return 0;
  }

  return ((inox_string*)raw().as.ref)->len;
}

size_t String::codeUnitLength() const {
  if (!valid()) {
    return 0;
  }

  size_t index = 0;
  size_t code_units = 0;
  const size_t len = length();
  const char* value = bytes();

  while (index < len) {
    size_t step = 0;
    const uint32_t code_point = utf8_code_point_at(value, len, index, &step);

    index += step;
    code_units += string_utf16_code_units(code_point);
  }

  return code_units;
}

const char* String::bytes() const {
  if (!valid()) {
    return "";
  }

  return ((inox_string*)raw().as.ref)->bytes;
}

String::operator StringView() const {
  return StringView(bytes(), length());
}

String String::trim() const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  size_t start = 0;
  size_t end = length();
  string_trim_span(bytes(), length(), &start, &end);

  return string_result_or_oom(String(bytes() + start, end - start));
}

String String::trimStart() const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  size_t start = 0;
  size_t end = length();
  string_trim_span(bytes(), length(), &start, &end);

  if (end == 0) {
    return string_result_or_oom(String(""));
  }

  return string_result_or_oom(String(bytes() + start, length() - start));
}

String String::trimLeft() const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  size_t start = 0;
  size_t end = length();
  string_trim_span(bytes(), length(), &start, &end);

  if (end == 0) {
    return string_result_or_oom(String(""));
  }

  return string_result_or_oom(String(bytes() + start, length() - start));
}

String String::trimEnd() const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  size_t end = length();
  string_trim_span(bytes(), length(), 0, &end);

  return string_result_or_oom(String(bytes(), end));
}

String String::trimRight() const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  size_t end = length();
  string_trim_span(bytes(), length(), 0, &end);

  return string_result_or_oom(String(bytes(), end));
}

String String::toUpperCase() const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  String out(bytes(), length());

  if (!out.valid()) {
    throw_out_of_memory();
    return String();
  }

  inox_string* string = (inox_string*)out.raw().as.ref;

  for (size_t index = 0; index < string->len; index += 1) {
    unsigned char value = (unsigned char)string->bytes[index];

    if (value >= (unsigned char)'a' && value <= (unsigned char)'z') {
      value = (unsigned char)(value - ((unsigned char)'a' - (unsigned char)'A'));
    }

    string->bytes[index] = (char)value;
  }

  return out;
}

String String::padStart(double target_len) const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  StringView pad(" ");
  size_t target = non_negative_index(target_len);
  const size_t value_units = string_code_unit_length(bytes(), length());
  const size_t pad_units = string_code_unit_length(pad.bytes, pad.len);

  if (target <= value_units || pad.len == 0 || pad_units == 0) {
    return String(*this);
  }

  size_t remaining_units = target - value_units;
  size_t pad_total_len = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

    if (take_len > ((size_t)-1) - pad_total_len) {
      throw_out_of_memory();
      return String();
    }

    pad_total_len += take_len;
    remaining_units -= take_units;
  }

  if (length() > ((size_t)-1) - pad_total_len) {
    throw_out_of_memory();
    return String();
  }

  const size_t len = pad_total_len + length();
  inox_string* string = string_alloc_storage(&inox_default_allocator, len);

  if (string == 0) {
    throw_out_of_memory();
    return String();
  }

  remaining_units = target - value_units;
  size_t offset = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

    if (take_len != 0) {
      memcpy(string->bytes + offset, pad.bytes, take_len);
      offset += take_len;
    }

    remaining_units -= take_units;
  }

  if (length() != 0) {
    memcpy(string->bytes + offset, bytes(), length());
  }

  inox_value value = { INOX_TAG_STRING };
  value.as.ref = &string->header;

  return String(adopt(value));
}

String String::padStart(double target_len, StringView pad) const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  size_t target = non_negative_index(target_len);
  const size_t value_units = string_code_unit_length(bytes(), length());
  const size_t pad_units = string_code_unit_length(pad.bytes, pad.len);

  if (target <= value_units || pad.len == 0 || pad_units == 0) {
    return String(*this);
  }

  size_t remaining_units = target - value_units;
  size_t pad_total_len = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

    if (take_len > ((size_t)-1) - pad_total_len) {
      throw_out_of_memory();
      return String();
    }

    pad_total_len += take_len;
    remaining_units -= take_units;
  }

  if (length() > ((size_t)-1) - pad_total_len) {
    throw_out_of_memory();
    return String();
  }

  const size_t len = pad_total_len + length();
  inox_string* string = string_alloc_storage(&inox_default_allocator, len);

  if (string == 0) {
    throw_out_of_memory();
    return String();
  }

  remaining_units = target - value_units;
  size_t offset = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

    if (take_len != 0) {
      memcpy(string->bytes + offset, pad.bytes, take_len);
      offset += take_len;
    }

    remaining_units -= take_units;
  }

  if (length() != 0) {
    memcpy(string->bytes + offset, bytes(), length());
  }

  inox_value value = { INOX_TAG_STRING };
  value.as.ref = &string->header;

  return String(adopt(value));
}

String String::slice() const {
  return slice(0);
}

String String::slice(double start) const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  const size_t code_unit_length = string_code_unit_length(bytes(), length());
  size_t start_index = slice_index(start, code_unit_length);
  const size_t start_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  return string_result_or_oom(String(bytes() + start_byte, length() - start_byte));
}

String String::slice(double start, double end) const {
  if (!valid()) {
    throw_out_of_memory();
    return String();
  }

  const size_t code_unit_length = string_code_unit_length(bytes(), length());
  size_t start_index = slice_index(start, code_unit_length);
  size_t end_index = slice_index(end, code_unit_length);

  if (end_index < start_index) {
    end_index = start_index;
  }

  const size_t start_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);
  size_t end_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), end_index);

  if (end_byte < start_byte) {
    end_byte = start_byte;
  }

  return string_result_or_oom(String(bytes() + start_byte, end_byte - start_byte));
}

static uint32_t string_split_limit(double raw) {
  if (!isfinite(raw) || raw == 0) {
    return 0;
  }

  double value = fmod(trunc(raw), 4294967296.0);

  if (value < 0) {
    value += 4294967296.0;
  }

  return static_cast<uint32_t>(value);
}

Array String::split() const {
  if (!valid()) {
    return Array();
  }

  Array out = Array::create(0);

  if (inox::thrown() || !out.valid()) {
    return Array();
  }

  out.push(raw());
  return inox::thrown() ? Array() : out;
}

Array String::split(StringView separator) const {
  return split(separator, 4294967295.0);
}

Array String::split(StringView separator, double raw_limit) const {
  if (!valid()) {
    return Array();
  }

  Array out = Array::create(0);

  if (inox::thrown() || !out.valid()) {
    return Array();
  }

  const uint32_t limit = string_split_limit(raw_limit);

  if (limit == 0) {
    return out;
  }

  uint32_t count = 0;

  if (separator.len == 0) {
    for (size_t index = 0; index < length() && count < limit;) {
      size_t step = utf8_next_len(bytes(), length(), index);

      if (step == 0) {
        step = 1;
      }

      String item(bytes() + index, step);

      if (!item.valid()) {
        return Array();
      }

      out.push(item.raw());

      if (inox::thrown()) {
        return Array();
      }

      count += 1;
      index += step;
    }

    return out;
  }

  size_t start = 0;
  size_t index = 0;

  while (index + separator.len <= length()) {
    if (memcmp(bytes() + index, separator.bytes, separator.len) != 0) {
      index += 1;
      continue;
    }

    String item(bytes() + start, index - start);

    if (!item.valid()) {
      return Array();
    }

    out.push(item.raw());

    if (inox::thrown()) {
      return Array();
    }

    count += 1;

    if (count >= limit) {
      return out;
    }

    index += separator.len;
    start = index;
  }

  String item(bytes() + start, length() - start);

  if (!item.valid()) {
    return Array();
  }

  if (count < limit) {
    out.push(item.raw());
  }

  if (inox::thrown()) {
    return Array();
  }

  return out;
}

String String::concat(StringView right) const {
  return concat(&right, 1);
}

String String::concat(const StringView* values, size_t count) const {
  if (!valid() || (count != 0 && values == 0)) {
    throw_out_of_memory();
    return String();
  }

  size_t len = length();

  for (size_t index = 0; index < count; index += 1) {
    if (len > ((size_t)-1) - values[index].len) {
      throw_out_of_memory();
      return String();
    }

    len += values[index].len;
  }

  inox_string* string = string_alloc_storage(&inox_default_allocator, len);

  if (string == 0) {
    throw_out_of_memory();
    return String();
  }

  if (length() != 0) {
    memcpy(string->bytes, bytes(), length());
  }

  size_t offset = length();

  for (size_t index = 0; index < count; index += 1) {
    if (values[index].len != 0) {
      memcpy(string->bytes + offset, values[index].bytes, values[index].len);
      offset += values[index].len;
    }
  }

  inox_value value = { INOX_TAG_STRING };
  value.as.ref = &string->header;

  return String(adopt(value));
}

double String::charCodeAt(double offset) const {
  if (!valid()) {
    return 0;
  }

  const size_t index = non_negative_index(offset);
  const size_t byte_offset = string_code_unit_to_byte_offset_floor(bytes(), length(), index);

  if (byte_offset >= length()) {
    return 0;
  }

  size_t step = 0;
  const uint32_t code_point = utf8_code_point_at(bytes(), length(), byte_offset, &step);

  if (code_point <= 0xffffu) {
    return (double)code_point;
  }

  const size_t code_unit_offset = string_code_unit_index_of_byte_offset(bytes(), length(), byte_offset);
  const uint32_t surrogate = code_point - 0x10000u;

  if (index > code_unit_offset) {
    return (double)(0xdc00u + (surrogate & 0x3ffu));
  }

  return (double)(0xd800u + (surrogate >> 10));
}

bool String::includes(StringView search) const {
  if (!valid()) {
    return false;
  }

  if (search.len == 0) {
    return true;
  }

  if (search.len > length()) {
    return false;
  }

  const size_t max_start = length() - search.len;

  for (size_t index = 0; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      return true;
    }

    size_t step = utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return false;
}

bool String::includes(StringView search, double start) const {
  if (!valid()) {
    return false;
  }

  size_t start_index = non_negative_index(start);
  const size_t code_unit_length = string_code_unit_length(bytes(), length());

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  if (search.len == 0) {
    return true;
  }

  const size_t start_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  if (search.len > length() - start_byte) {
    return false;
  }

  const size_t max_start = length() - search.len;

  for (size_t index = start_byte; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      return true;
    }

    size_t step = utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return false;
}

bool String::startsWith(StringView search) const {
  return startsWith(search, 0);
}

bool String::startsWith(StringView search, double position) const {
  if (!valid()) {
    return false;
  }

  const size_t code_unit_length = string_code_unit_length(bytes(), length());
  size_t start_index = non_negative_index(position);

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  const size_t start_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  if (search.len > length() - start_byte) {
    return false;
  }

  return search.len == 0 || memcmp(bytes() + start_byte, search.bytes, search.len) == 0;
}

bool String::endsWith(StringView search) const {
  return endsWith(search, static_cast<double>(codeUnitLength()));
}

bool String::endsWith(StringView search, double end_position) const {
  if (!valid()) {
    return false;
  }

  const size_t code_unit_length = string_code_unit_length(bytes(), length());
  size_t end_index = non_negative_index(end_position);

  if (end_index > code_unit_length) {
    end_index = code_unit_length;
  }

  const size_t end_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), end_index);

  if (search.len > end_byte) {
    return false;
  }

  return search.len == 0 || memcmp(bytes() + end_byte - search.len, search.bytes, search.len) == 0;
}

double String::indexOf(StringView search) const {
  if (!valid()) {
    return -1;
  }

  if (search.len == 0) {
    return 0;
  }

  if (search.len > length()) {
    return -1;
  }

  const size_t max_start = length() - search.len;

  for (size_t index = 0; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      return (double)string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return -1;
}

double String::indexOf(StringView search, double start) const {
  if (!valid()) {
    return -1;
  }

  size_t start_index = non_negative_index(start);
  const size_t code_unit_length = string_code_unit_length(bytes(), length());

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  if (search.len == 0) {
    return (double)start_index;
  }

  const size_t start_byte = string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  if (search.len > length() - start_byte) {
    return -1;
  }

  const size_t max_start = length() - search.len;

  for (size_t index = start_byte; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      return (double)string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return -1;
}

double String::lastIndexOf(StringView search) const {
  if (!valid()) {
    return -1;
  }

  const size_t code_unit_length = string_code_unit_length(bytes(), length());

  if (search.len == 0) {
    return (double)code_unit_length;
  }

  if (search.len > length()) {
    return -1;
  }

  const size_t max_start = length() - search.len;
  double last_match = -1;

  for (size_t index = 0; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      last_match = (double)string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return last_match;
}

double String::lastIndexOf(StringView search, double start) const {
  if (!valid()) {
    return -1;
  }

  size_t start_index = non_negative_index(start);
  const size_t code_unit_length = string_code_unit_length(bytes(), length());

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  if (search.len == 0) {
    return (double)start_index;
  }

  if (search.len > length()) {
    return -1;
  }

  const size_t start_byte = string_code_unit_to_byte_offset_floor(bytes(), length(), start_index);
  const size_t max_start = length() - search.len;
  double last_match = -1;

  for (size_t index = 0; index <= max_start;) {
    if (index > start_byte) {
      break;
    }

    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      last_match = (double)string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return last_match;
}

} // namespace inox
