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

static inox_string* inox_string_alloc_storage(inox_allocator* allocator, size_t len) {
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

static inox_status inox_string_format_number(double value, char* buffer, size_t buffer_len, size_t* len_out) {
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

static size_t inox_string_code_unit_length(const char* value_bytes, size_t value_len) {
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

inox_value inox::String::toNumber(StringView value) {
  if (value.bytes == 0 && value.len != 0) {
    return inox_null_value();
  }

  const char* bytes = value.bytes == 0 ? "" : value.bytes;
  size_t start = 0;
  size_t end = value.len;
  inox_string_trim_span(bytes, value.len, &start, &end);

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

  while (pos < end && inox_string_is_ascii_digit(bytes[pos])) {
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

    while (pos < end && inox_string_is_ascii_digit(bytes[pos])) {
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

    if (pos >= end || !inox_string_is_ascii_digit(bytes[pos])) {
      return inox_null_value();
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

Value String::make(const char* bytes, size_t len) {
  if (bytes == nullptr) {
    return Value();
  }

  inox_string* string = inox_string_alloc_storage(&inox_default_allocator, len);

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

  if (inox_string_format_number(value, buffer, sizeof(buffer), &len) != INOX_OK) {
    return String();
  }

  return String(buffer, len);
}

String String::fromNumberRadix(double value, int radix) {
  if (radix == 10) {
    char buffer[64];
    size_t len = 0;

    if (inox_string_format_number(value, buffer, sizeof(buffer), &len) != INOX_OK) {
      return String();
    }

    return String(buffer, len);
  }

  if (radix < 2 || radix > 36) {
    return String();
  }

  if (value != value || isinf(value) || floor(value) != value) {
    char buffer[64];
    size_t len = 0;

    if (inox_string_format_number(value, buffer, sizeof(buffer), &len) != INOX_OK) {
      return String();
    }

    return String(buffer, len);
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

  return String(buffer + index, sizeof(buffer) - index - 1);
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

  inox_string* string = inox_string_alloc_storage(&inox_default_allocator, len + 1);

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

  return String(adopt_value, out);
}

String String::fromValue(inox_value value) {
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
    return ArrayClass(value).join(",");
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

String::String(inox_string* string) : Value() {
  if (string == nullptr) {
    return;
  }

  inox_value value = { INOX_TAG_STRING };
  value.as.ref = &string->header;
  *this = value;
}

String::String(const Value& value) : Value(value) {}

String::String(Value&& value) : Value(std::move(value)) {}

String::String(inox_value value) : Value(value) {}

String::String(AdoptValue, inox_value value) : Value(adopt_value, value) {}

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
    const uint32_t code_point = inox_utf8_code_point_at(value, len, index, &step);

    index += step;
    code_units += inox_string_utf16_code_units(code_point);
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
    return String();
  }

  size_t start = 0;
  size_t end = length();
  inox_string_trim_span(bytes(), length(), &start, &end);

  return String(bytes() + start, end - start);
}

String String::trimStart() const {
  if (!valid()) {
    return String();
  }

  size_t start = 0;
  size_t end = length();
  inox_string_trim_span(bytes(), length(), &start, &end);

  if (end == 0) {
    return String("");
  }

  return String(bytes() + start, length() - start);
}

String String::trimLeft() const {
  if (!valid()) {
    return String();
  }

  size_t start = 0;
  size_t end = length();
  inox_string_trim_span(bytes(), length(), &start, &end);

  if (end == 0) {
    return String("");
  }

  return String(bytes() + start, length() - start);
}

String String::trimEnd() const {
  if (!valid()) {
    return String();
  }

  size_t end = length();
  inox_string_trim_span(bytes(), length(), 0, &end);

  return String(bytes(), end);
}

String String::trimRight() const {
  if (!valid()) {
    return String();
  }

  size_t end = length();
  inox_string_trim_span(bytes(), length(), 0, &end);

  return String(bytes(), end);
}

String String::toUpperCase() const {
  if (!valid()) {
    return String();
  }

  String out(bytes(), length());

  if (!out.valid()) {
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
    return String();
  }

  StringView pad(" ");
  size_t target = non_negative_index(target_len);
  const size_t value_units = inox_string_code_unit_length(bytes(), length());
  const size_t pad_units = inox_string_code_unit_length(pad.bytes, pad.len);

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

    const size_t take_len = inox_string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

    if (take_len > ((size_t)-1) - pad_total_len) {
      return String();
    }

    pad_total_len += take_len;
    remaining_units -= take_units;
  }

  if (length() > ((size_t)-1) - pad_total_len) {
    return String();
  }

  const size_t len = pad_total_len + length();
  inox_string* string = inox_string_alloc_storage(&inox_default_allocator, len);

  if (string == 0) {
    return String();
  }

  remaining_units = target - value_units;
  size_t offset = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = inox_string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

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

  return String(adopt_value, value);
}

String String::padStart(double target_len, StringView pad) const {
  if (!valid()) {
    return String();
  }

  size_t target = non_negative_index(target_len);
  const size_t value_units = inox_string_code_unit_length(bytes(), length());
  const size_t pad_units = inox_string_code_unit_length(pad.bytes, pad.len);

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

    const size_t take_len = inox_string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

    if (take_len > ((size_t)-1) - pad_total_len) {
      return String();
    }

    pad_total_len += take_len;
    remaining_units -= take_units;
  }

  if (length() > ((size_t)-1) - pad_total_len) {
    return String();
  }

  const size_t len = pad_total_len + length();
  inox_string* string = inox_string_alloc_storage(&inox_default_allocator, len);

  if (string == 0) {
    return String();
  }

  remaining_units = target - value_units;
  size_t offset = 0;

  while (remaining_units > 0) {
    size_t take_units = pad_units;

    if (take_units > remaining_units) {
      take_units = remaining_units;
    }

    const size_t take_len = inox_string_code_unit_to_byte_offset_ceiling(pad.bytes, pad.len, take_units);

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

  return String(adopt_value, value);
}

String String::slice(double start) const {
  if (!valid()) {
    return String();
  }

  const size_t code_unit_length = inox_string_code_unit_length(bytes(), length());
  size_t start_index = slice_index(start, code_unit_length);
  const size_t start_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  return String(bytes() + start_byte, length() - start_byte);
}

String String::slice(double start, double end) const {
  if (!valid()) {
    return String();
  }

  const size_t code_unit_length = inox_string_code_unit_length(bytes(), length());
  size_t start_index = slice_index(start, code_unit_length);
  size_t end_index = slice_index(end, code_unit_length);

  if (end_index < start_index) {
    end_index = start_index;
  }

  const size_t start_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);
  size_t end_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes(), length(), end_index);

  if (end_byte < start_byte) {
    end_byte = start_byte;
  }

  return String(bytes() + start_byte, end_byte - start_byte);
}

ArrayClass String::split(StringView separator) const {
  if (!valid()) {
    return ArrayClass();
  }

  ArrayClass out = ArrayClass::create(0);

  if (inox::thrown() || !out.valid()) {
    return ArrayClass();
  }

  if (separator.len == 0) {
    for (size_t index = 0; index < length();) {
      size_t step = inox_utf8_next_len(bytes(), length(), index);

      if (step == 0) {
        step = 1;
      }

      String item(bytes() + index, step);

      if (!item.valid()) {
        return ArrayClass();
      }

      out.push(item.raw());

      if (inox::thrown()) {
        return ArrayClass();
      }

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
      return ArrayClass();
    }

    out.push(item.raw());

    if (inox::thrown()) {
      return ArrayClass();
    }

    index += separator.len;
    start = index;
  }

  String item(bytes() + start, length() - start);

  if (!item.valid()) {
    return ArrayClass();
  }

  out.push(item.raw());

  if (inox::thrown()) {
    return ArrayClass();
  }

  return out;
}

String String::concat(StringView right) const {
  if (!valid() || length() > ((size_t)-1) - right.len) {
    return String();
  }

  const size_t len = length() + right.len;
  inox_string* string = inox_string_alloc_storage(&inox_default_allocator, len);

  if (string == 0) {
    return String();
  }

  if (length() != 0) {
    memcpy(string->bytes, bytes(), length());
  }

  if (right.len != 0) {
    memcpy(string->bytes + length(), right.bytes, right.len);
  }

  inox_value value = { INOX_TAG_STRING };
  value.as.ref = &string->header;

  return String(adopt_value, value);
}

double String::charCodeAt(double offset) const {
  if (!valid()) {
    return 0;
  }

  const size_t index = non_negative_index(offset);
  const size_t byte_offset = inox_string_code_unit_to_byte_offset_floor(bytes(), length(), index);

  if (byte_offset >= length()) {
    return 0;
  }

  size_t step = 0;
  const uint32_t code_point = inox_utf8_code_point_at(bytes(), length(), byte_offset, &step);

  if (code_point <= 0xffffu) {
    return (double)code_point;
  }

  const size_t code_unit_offset = inox_string_code_unit_index_of_byte_offset(bytes(), length(), byte_offset);
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

    size_t step = inox_utf8_next_len(bytes(), length(), index);

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
  const size_t code_unit_length = inox_string_code_unit_length(bytes(), length());

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  if (search.len == 0) {
    return true;
  }

  const size_t start_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  if (search.len > length() - start_byte) {
    return false;
  }

  const size_t max_start = length() - search.len;

  for (size_t index = start_byte; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      return true;
    }

    size_t step = inox_utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return false;
}

bool String::startsWith(StringView search) const {
  if (!valid() || search.len > length()) {
    return false;
  }

  return search.len == 0 || memcmp(bytes(), search.bytes, search.len) == 0;
}

bool String::endsWith(StringView search) const {
  if (!valid() || search.len > length()) {
    return false;
  }

  return search.len == 0 || memcmp(bytes() + length() - search.len, search.bytes, search.len) == 0;
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
      return (double)inox_string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = inox_utf8_next_len(bytes(), length(), index);

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
  const size_t code_unit_length = inox_string_code_unit_length(bytes(), length());

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  if (search.len == 0) {
    return (double)start_index;
  }

  const size_t start_byte = inox_string_code_unit_to_byte_offset_ceiling(bytes(), length(), start_index);

  if (search.len > length() - start_byte) {
    return -1;
  }

  const size_t max_start = length() - search.len;

  for (size_t index = start_byte; index <= max_start;) {
    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      return (double)inox_string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = inox_utf8_next_len(bytes(), length(), index);

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

  const size_t code_unit_length = inox_string_code_unit_length(bytes(), length());

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
      last_match = (double)inox_string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = inox_utf8_next_len(bytes(), length(), index);

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
  const size_t code_unit_length = inox_string_code_unit_length(bytes(), length());

  if (start_index > code_unit_length) {
    start_index = code_unit_length;
  }

  if (search.len == 0) {
    return (double)start_index;
  }

  if (search.len > length()) {
    return -1;
  }

  const size_t start_byte = inox_string_code_unit_to_byte_offset_floor(bytes(), length(), start_index);
  const size_t max_start = length() - search.len;
  double last_match = -1;

  for (size_t index = 0; index <= max_start;) {
    if (index > start_byte) {
      break;
    }

    if (memcmp(bytes() + index, search.bytes, search.len) == 0) {
      last_match = (double)inox_string_code_unit_index_of_byte_offset(bytes(), length(), index);
    }

    size_t step = inox_utf8_next_len(bytes(), length(), index);

    if (step == 0) {
      step = 1;
    }

    index += step;
  }

  return last_match;
}

} // namespace inox
