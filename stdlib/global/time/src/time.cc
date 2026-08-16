#include "inox/time.h"
#include "inox/class_descriptor.h"
#include "inox/class_runtime.h"
#include "inox/loop.h"
#include "inox/string.h"
#include "inox/time_bridge.h"

#include <chrono>
#include <limits>
#include <new>
#include <stdio.h>
#include <string.h>
#include <time.h>

static inox_number inox_default_wall_now_ms(void);
static int inox_date_day_from_civil(int year, unsigned int month, unsigned int day);
static int inox_date_floor_div(int value, int divisor);
static inox_number inox_floor_ms(inox_number value);
static inox_number inox_date_nan(void);
static int inox_date_parse_fixed_digits(const char* bytes, size_t len, size_t* offset, size_t count, int* out);
static int inox_date_parse_iso(const char* bytes, size_t len, inox_number* out);
static inox_number inox_date_part(inox_number value, int part, bool utc);
static inox_number inox_date_timezone_offset(inox_number value);
static int inox_date_time_struct(inox_number value, int utc, struct tm* out, int* millisecond);
static inox::String inox_date_to_string(inox_number value, int kind);
static int inox_date_timezone_offset_minutes(const char* bytes, size_t len, size_t* offset, int* out);
static inox_number inox_date_utc(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
);
static inox_number inox_date_from_local(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
);
static void inox_time_ensure_initialized(void);
static inox_status inox_date_copy_instance(inox_allocator* allocator, const void* instance, void** out);
static void inox_date_destroy_instance(inox_allocator* allocator, void* instance);
static const inox_class_descriptor* inox_date_class_descriptor(void);
static void inox_date_throw_type_error(void);

static int inox_time_initialized = 0;
static inox_number inox_performance_base_ms = 0;

static inox_status inox_date_copy_instance(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == 0 || allocator->alloc == 0 || instance == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(DateValue), alignof(DateValue));

  if (memory == 0) {
    *out = 0;
    return INOX_ERR_OOM;
  }

  new (memory) DateValue(*(const DateValue*)instance);
  *out = memory;
  return INOX_OK;
}

static void inox_date_destroy_instance(inox_allocator* allocator, void* instance) {
  if (allocator == 0 || allocator->free == 0 || instance == 0) {
    return;
  }

  ((DateValue*)instance)->~DateValue();
  allocator->free(allocator->user, instance, sizeof(DateValue), alignof(DateValue));
}

static const inox_class_descriptor* inox_date_class_descriptor(void) {
  static const inox_class_descriptor descriptor = {
    "Date",
    0,
    0,
    0,
    inox_date_copy_instance,
    inox_date_destroy_instance,
    0,
    inox::class_to_string<DateValue>,
    inox::class_to_json<DateValue>
  };

  return &descriptor;
}

static void inox_date_throw_type_error(void) {
  inox::String error("TypeError: value is not a Date");

  if (!error.valid()) {
    inox::throw_out_of_memory();
    return;
  }

  inox::throw_value(error);
}

static void inox_time_ensure_initialized(void) {
  if (inox_time_initialized) {
    return;
  }

  inox_performance_base_ms = inox_monotonic_now_ms();
  inox_time_initialized = 1;
}

static inox_number inox_default_wall_now_ms(void) {
  const std::chrono::system_clock::duration elapsed = std::chrono::system_clock::now().time_since_epoch();

  return std::chrono::duration<inox_number, std::milli>(elapsed).count();
}

static inox_number inox_floor_ms(inox_number value) {
  if (value != value) {
    return value;
  }

  long long truncated = (long long)value;

  return (inox_number)truncated > value ? (inox_number)(truncated - 1) : (inox_number)truncated;
}

static inox_number inox_date_nan(void) {
  return std::numeric_limits<inox_number>::quiet_NaN();
}

static int inox_date_floor_div(int value, int divisor) {
  int quotient = value / divisor;
  int remainder = value % divisor;

  if (remainder != 0 && ((remainder < 0) != (divisor < 0))) {
    quotient -= 1;
  }

  return quotient;
}

static int inox_date_day_from_civil(int year, unsigned int month, unsigned int day) {
  year -= month <= 2 ? 1 : 0;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned int year_of_era = (unsigned int)(year - era * 400);
  const unsigned int month_prime = month + (month > 2 ? (unsigned int)-3 : 9);
  const unsigned int day_of_year = (153 * month_prime + 2) / 5 + day - 1;
  const unsigned int day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

  return era * 146097 + (int)day_of_era - 719468;
}

static int inox_date_parse_fixed_digits(const char* bytes, size_t len, size_t* offset, size_t count, int* out) {
  int value = 0;

  if (bytes == 0 || offset == 0 || out == 0 || *offset + count > len) {
    return 0;
  }

  for (size_t index = 0; index < count; index += 1) {
    const char ch = bytes[*offset + index];

    if (ch < '0' || ch > '9') {
      return 0;
    }

    value = value * 10 + (int)(ch - '0');
  }

  *offset += count;
  *out = value;
  return 1;
}

static int inox_date_timezone_offset_minutes(const char* bytes, size_t len, size_t* offset, int* out) {
  if (offset == 0 || out == 0 || *offset >= len) {
    *out = 0;
    return 1;
  }

  if (bytes[*offset] == 'Z') {
    *offset += 1;
    *out = 0;
    return 1;
  }

  if (bytes[*offset] != '+' && bytes[*offset] != '-') {
    *out = 0;
    return 1;
  }

  const int sign = bytes[*offset] == '+' ? 1 : -1;
  int hour = 0;
  int minute = 0;
  *offset += 1;

  if (!inox_date_parse_fixed_digits(bytes, len, offset, 2, &hour)) {
    return 0;
  }

  if (*offset < len && bytes[*offset] == ':') {
    *offset += 1;
  }

  if (!inox_date_parse_fixed_digits(bytes, len, offset, 2, &minute)) {
    return 0;
  }

  *out = sign * (hour * 60 + minute);
  return 1;
}

static int inox_date_parse_iso(const char* bytes, size_t len, inox_number* out) {
  size_t offset = 0;
  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  int millisecond = 0;
  int timezone_offset = 0;

  if (out == 0 || len < 10) {
    return 0;
  }

  if (!inox_date_parse_fixed_digits(bytes, len, &offset, 4, &year)) return 0;
  if (offset >= len || bytes[offset] != '-') return 0;
  offset += 1;
  if (!inox_date_parse_fixed_digits(bytes, len, &offset, 2, &month)) return 0;
  if (offset >= len || bytes[offset] != '-') return 0;
  offset += 1;
  if (!inox_date_parse_fixed_digits(bytes, len, &offset, 2, &day)) return 0;

  if (offset < len && (bytes[offset] == 'T' || bytes[offset] == ' ')) {
    offset += 1;
    if (!inox_date_parse_fixed_digits(bytes, len, &offset, 2, &hour)) return 0;
    if (offset >= len || bytes[offset] != ':') return 0;
    offset += 1;
    if (!inox_date_parse_fixed_digits(bytes, len, &offset, 2, &minute)) return 0;

    if (offset < len && bytes[offset] == ':') {
      offset += 1;
      if (!inox_date_parse_fixed_digits(bytes, len, &offset, 2, &second)) return 0;
    }

    if (offset < len && bytes[offset] == '.') {
      int factor = 100;
      offset += 1;

      while (offset < len && bytes[offset] >= '0' && bytes[offset] <= '9') {
        if (factor > 0) {
          millisecond += (int)(bytes[offset] - '0') * factor;
          factor /= 10;
        }

        offset += 1;
      }
    }

    if (!inox_date_timezone_offset_minutes(bytes, len, &offset, &timezone_offset)) return 0;
  }

  if (offset != len || month < 1 || month > 12 || day < 1 || day > 31) {
    return 0;
  }

  *out = inox_date_utc(year, month - 1, day, hour, minute, second, millisecond) -
         ((inox_number)timezone_offset * 60000.0);
  return 1;
}

static int inox_date_time_struct(inox_number value, int utc, struct tm* out, int* millisecond) {
  if (out == 0 || millisecond == 0 || value != value) {
    return 0;
  }

  const inox_number whole_ms = inox_floor_ms(value);
  time_t seconds = (time_t)(whole_ms / 1000.0);
  int ms = (int)(whole_ms - ((inox_number)seconds * 1000.0));

  if (ms < 0) {
    ms += 1000;
    seconds -= 1;
  }

#if defined(_WIN32)
  errno_t status = utc ? gmtime_s(out, &seconds) : localtime_s(out, &seconds);

  if (status != 0) {
    return 0;
  }
#else
  struct tm* status = utc ? gmtime_r(&seconds, out) : localtime_r(&seconds, out);

  if (status == 0) {
    return 0;
  }
#endif

  *millisecond = ms;
  return 1;
}

static inox_number inox_date_utc(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
) {
  int full_year = (int)year;
  int full_month = (int)month;

  if (full_year >= 0 && full_year <= 99) {
    full_year += 1900;
  }

  const int month_year_delta = inox_date_floor_div(full_month, 12);
  full_year += month_year_delta;
  full_month -= month_year_delta * 12;

  if (full_month < 0) {
    full_month += 12;
    full_year -= 1;
  }

  const int days = inox_date_day_from_civil(full_year, (unsigned int)(full_month + 1), 1) + (int)day - 1;
  const long long total_ms =
    (long long)days * 86400000LL +
    (long long)((int)hour) * 3600000LL +
    (long long)((int)minute) * 60000LL +
    (long long)((int)second) * 1000LL +
    (long long)((int)millisecond);

  return (inox_number)total_ms;
}

static inox_number inox_date_from_local(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
) {
  int full_year = (int)year;

  if (full_year >= 0 && full_year <= 99) {
    full_year += 1900;
  }

  struct tm value;
  memset(&value, 0, sizeof(value));
  value.tm_year = full_year - 1900;
  value.tm_mon = (int)month;
  value.tm_mday = (int)day;
  value.tm_hour = (int)hour;
  value.tm_min = (int)minute;
  value.tm_sec = (int)second;
  value.tm_isdst = -1;

  time_t seconds = mktime(&value);

  if (seconds == (time_t)-1) {
    return inox_date_nan();
  }

  return ((inox_number)seconds * 1000.0) + (inox_number)((int)millisecond);
}

static inox_number inox_date_part(inox_number value, int part, bool utc) {
  struct tm time_value;
  int millisecond = 0;

  if (!inox_date_time_struct(value, utc ? 1 : 0, &time_value, &millisecond)) {
    return inox_date_nan();
  }

  if (part == 0) return (inox_number)(time_value.tm_year + 1900);
  if (part == 1) return (inox_number)time_value.tm_mon;
  if (part == 2) return (inox_number)time_value.tm_mday;
  if (part == 3) return (inox_number)time_value.tm_wday;
  if (part == 4) return (inox_number)time_value.tm_hour;
  if (part == 5) return (inox_number)time_value.tm_min;
  if (part == 6) return (inox_number)time_value.tm_sec;
  if (part == 7) return (inox_number)millisecond;

  return inox_date_nan();
}

static inox_number inox_date_timezone_offset(inox_number value) {
  struct tm local_value;
  int millisecond = 0;

  if (!inox_date_time_struct(value, 0, &local_value, &millisecond)) {
    return inox_date_nan();
  }

  const inox_number whole_ms = inox_floor_ms(value);
  const inox_number local_as_utc = inox_date_utc(
    local_value.tm_year + 1900,
    local_value.tm_mon,
    local_value.tm_mday,
    local_value.tm_hour,
    local_value.tm_min,
    local_value.tm_sec,
    millisecond
  );

  return (whole_ms - local_as_utc) / 60000.0;
}

static inox::String inox_date_result_or_oom(inox::String result) {
  if (!result.valid()) {
    inox::throw_out_of_memory();
  }

  return result;
}

static void inox_date_throw_range_error(const char* message) {
  inox::String error(message);

  if (!error.valid()) {
    inox::throw_out_of_memory();
    return;
  }

  inox::throw_value(error);
}

static inox::String inox_date_to_string(inox_number value, int kind) {
  static const char* weekdays[] = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
  static const char* months[] = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };
  struct tm time_value;
  int millisecond = 0;
  char buffer[96];
  int len = 0;

  if (!inox_date_time_struct(value, (kind == 0 || kind == 1) ? 1 : 0, &time_value, &millisecond)) {
    return inox::String("Invalid Date");
  }

  if (kind == 0) {
    len = snprintf(
      buffer,
      sizeof(buffer),
      "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
      time_value.tm_year + 1900,
      time_value.tm_mon + 1,
      time_value.tm_mday,
      time_value.tm_hour,
      time_value.tm_min,
      time_value.tm_sec,
      millisecond
    );
  } else if (kind == 1) {
    len = snprintf(
      buffer,
      sizeof(buffer),
      "%s, %02d %s %04d %02d:%02d:%02d GMT",
      weekdays[time_value.tm_wday],
      time_value.tm_mday,
      months[time_value.tm_mon],
      time_value.tm_year + 1900,
      time_value.tm_hour,
      time_value.tm_min,
      time_value.tm_sec
    );
  } else if (kind == 3) {
    len = snprintf(
      buffer,
      sizeof(buffer),
      "%s %s %02d %04d",
      weekdays[time_value.tm_wday],
      months[time_value.tm_mon],
      time_value.tm_mday,
      time_value.tm_year + 1900
    );
  } else if (kind == 4) {
    len = snprintf(
      buffer,
      sizeof(buffer),
      "%02d:%02d:%02d GMT",
      time_value.tm_hour,
      time_value.tm_min,
      time_value.tm_sec
    );
  } else {
    len = snprintf(
      buffer,
      sizeof(buffer),
      "%s %s %02d %04d %02d:%02d:%02d GMT",
      weekdays[time_value.tm_wday],
      months[time_value.tm_mon],
      time_value.tm_mday,
      time_value.tm_year + 1900,
      time_value.tm_hour,
      time_value.tm_min,
      time_value.tm_sec
    );
  }

  if (len < 0 || (size_t)len >= sizeof(buffer)) {
    return inox::String();
  }

  return inox::String(buffer, (size_t)len);
}

DateValue::DateValue() : value_(inox_date_nan()) {}

DateValue::DateValue(inox_number value) : value_(value) {}

DateValue::DateValue(const inox::Value& value) : value_(inox_date_nan()) {
  if (inox::thrown()) {
    return;
  }

  if (!isDate(value)) {
    inox_date_throw_type_error();
    return;
  }

  const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
  value_ = ((const DateValue*)ref->instance)->value_;
}

bool DateValue::isDate(const inox::Value& value) {
  if (value.tag != INOX_TAG_CLASS_INSTANCE || value.as.ref == 0) {
    return false;
  }

  const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
  return ref->descriptor == inox_date_class_descriptor() && ref->instance != 0;
}

inox::Value DateValue::runtimeValue() const {
  inox_value value = inox_undefined_value();
  const inox_status status =
    inox_class_instance_ref_copy(&inox_default_allocator, inox_date_class_descriptor(), this, &value);

  if (status == INOX_ERR_OOM) {
    inox::throw_out_of_memory();
  } else if (status != INOX_OK) {
    inox_date_throw_type_error();
  }

  return inox::adopt(value);
}

inox_number DateValue::getDate() const { return inox_date_part(value_, 2, false); }
inox_number DateValue::getDay() const { return inox_date_part(value_, 3, false); }
inox_number DateValue::getFullYear() const { return inox_date_part(value_, 0, false); }
inox_number DateValue::getHours() const { return inox_date_part(value_, 4, false); }
inox_number DateValue::getMilliseconds() const { return inox_date_part(value_, 7, false); }
inox_number DateValue::getMinutes() const { return inox_date_part(value_, 5, false); }
inox_number DateValue::getMonth() const { return inox_date_part(value_, 1, false); }
inox_number DateValue::getSeconds() const { return inox_date_part(value_, 6, false); }
inox_number DateValue::getTime() const { return value_; }
inox_number DateValue::getTimezoneOffset() const { return inox_date_timezone_offset(value_); }
inox_number DateValue::getUTCDate() const { return inox_date_part(value_, 2, true); }
inox_number DateValue::getUTCDay() const { return inox_date_part(value_, 3, true); }
inox_number DateValue::getUTCFullYear() const { return inox_date_part(value_, 0, true); }
inox_number DateValue::getUTCHours() const { return inox_date_part(value_, 4, true); }
inox_number DateValue::getUTCMilliseconds() const { return inox_date_part(value_, 7, true); }
inox_number DateValue::getUTCMinutes() const { return inox_date_part(value_, 5, true); }
inox_number DateValue::getUTCMonth() const { return inox_date_part(value_, 1, true); }
inox_number DateValue::getUTCSeconds() const { return inox_date_part(value_, 6, true); }
inox_number DateValue::valueOf() const { return value_; }

inox::String DateValue::toDateString() const {
  return inox_date_result_or_oom(inox_date_to_string(value_, 3));
}

inox::String DateValue::toISOString() const {
  struct tm time_value;
  int millisecond = 0;

  if (!inox_date_time_struct(value_, 1, &time_value, &millisecond)) {
    inox_date_throw_range_error("RangeError: Invalid time value");
    return inox::String();
  }

  return inox_date_result_or_oom(inox_date_to_string(value_, 0));
}

inox::String DateValue::toJSON() const {
  return inox_date_result_or_oom(inox_date_to_string(value_, 0));
}

inox::String DateValue::toString() const {
  return inox_date_result_or_oom(inox_date_to_string(value_, 2));
}

inox::String DateValue::toTimeString() const {
  return inox_date_result_or_oom(inox_date_to_string(value_, 4));
}

inox::String DateValue::toUTCString() const {
  return inox_date_result_or_oom(inox_date_to_string(value_, 1));
}

DateValue DateObject::operator()() const { return DateValue(now()); }
DateValue DateObject::operator()(inox_number value) const { return DateValue(value); }
DateValue DateObject::operator()(inox::StringView value) const { return DateValue(parse(value)); }
DateValue DateObject::operator()(const DateValue& value) const { return value; }

DateValue DateObject::operator()(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
) const {
  return DateValue(inox_date_from_local(year, month, day, hour, minute, second, millisecond));
}

inox_number DateObject::now() const {
  return inox_floor_ms(inox_default_wall_now_ms());
}

inox_number DateObject::parse(inox::StringView text) const {
  inox_number result = 0;

  if (text.bytes == 0) {
    return inox_date_nan();
  }

  if (inox_date_parse_iso(text.bytes, text.len, &result)) {
    return result;
  }

  return inox_date_nan();
}

inox_number DateObject::UTC(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
) const {
  return inox_date_utc(year, month, day, hour, minute, second, millisecond);
}

inox_number Performance::now() const {
  inox_time_ensure_initialized();

  return inox_monotonic_now_ms() - inox_performance_base_ms;
}

const DateObject Date;
const Performance performance;
