#include "inox/time.h"
#include "inox/string.h"

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#endif
#include <stdio.h>
#include <string.h>
#include <time.h>

typedef struct inox_time_adapter {
  void* user;
  inox_number (*monotonic_now_ms)(void* user);
  inox_number (*wall_now_ms)(void* user);
} inox_time_adapter;

static inox_number inox_default_monotonic_now_ms(void* user);
static inox_number inox_default_wall_now_ms(void* user);
static int inox_date_day_from_civil(int year, unsigned int month, unsigned int day);
static int inox_date_floor_div(int value, int divisor);
static inox_number inox_floor_ms(inox_number value);
static inox_number inox_date_nan(void);
static inox_number inox_date_utc_from_parts(int year, int month, int day, int hour, int minute, int second, int millisecond);
static int inox_date_parse_fixed_digits(const char* bytes, size_t len, size_t* offset, size_t count, int* out);
static int inox_date_parse_iso(const char* bytes, size_t len, inox_number* out);
static int inox_date_time_struct(inox_number value, int utc, struct tm* out, int* millisecond);
static int inox_date_timezone_offset_minutes(const char* bytes, size_t len, size_t* offset, int* out);
static inox_number inox_timespec_ms(const struct timespec* value);
static void inox_time_ensure_initialized(void);

static inox_time_adapter inox_time_current_adapter = { 0, inox_default_monotonic_now_ms, inox_default_wall_now_ms };
static int inox_time_initialized = 0;
static inox_number inox_performance_base_ms = 0;
static inox_number inox_wall_base_ms = 0;
static inox_number inox_wall_base_monotonic_ms = 0;

static void inox_time_ensure_initialized(void) {
  if (inox_time_initialized) {
    return;
  }

  inox_performance_base_ms = inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user);
  inox_wall_base_monotonic_ms = inox_performance_base_ms;
  inox_wall_base_ms = inox_time_current_adapter.wall_now_ms(inox_time_current_adapter.user);
  inox_time_initialized = 1;
}

static inox_number inox_default_monotonic_now_ms(void* user) {
  (void)user;

#if defined(CLOCK_MONOTONIC)
  struct timespec value;

  if (clock_gettime(CLOCK_MONOTONIC, &value) == 0) {
    return inox_timespec_ms(&value);
  }
#endif

  return ((inox_number)clock() * 1000.0) / (inox_number)CLOCKS_PER_SEC;
}

static inox_number inox_default_wall_now_ms(void* user) {
  (void)user;

#if defined(CLOCK_REALTIME)
  {
    struct timespec value;

    if (clock_gettime(CLOCK_REALTIME, &value) == 0) {
      return inox_timespec_ms(&value);
    }
  }
#endif

#if defined(TIME_UTC)
  {
    struct timespec value;

    if (timespec_get(&value, TIME_UTC) == TIME_UTC) {
      return inox_timespec_ms(&value);
    }
  }
#endif

  return inox_default_monotonic_now_ms(user);
}

static inox_number inox_floor_ms(inox_number value) {
  if (value != value) {
    return value;
  }

  long long truncated = (long long)value;

  return (inox_number)truncated > value ? (inox_number)(truncated - 1) : (inox_number)truncated;
}

static inox_number inox_date_nan(void) {
  return 0.0 / 0.0;
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

static inox_number inox_date_utc_from_parts(
  int year,
  int month,
  int day,
  int hour,
  int minute,
  int second,
  int millisecond
) {
  if (year >= 0 && year <= 99) {
    year += 1900;
  }

  const int month_year_delta = inox_date_floor_div(month, 12);
  year += month_year_delta;
  month -= month_year_delta * 12;

  if (month < 0) {
    month += 12;
    year -= 1;
  }

  const int days = inox_date_day_from_civil(year, (unsigned int)(month + 1), 1) + day - 1;
  const long long total_ms =
    (long long)days * 86400000LL +
    (long long)hour * 3600000LL +
    (long long)minute * 60000LL +
    (long long)second * 1000LL +
    (long long)millisecond;

  return (inox_number)total_ms;
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

  *out = inox_date_utc_from_parts(year, month - 1, day, hour, minute, second, millisecond) -
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

static inox_number inox_timespec_ms(const struct timespec* value) {
  return ((inox_number)value->tv_sec * 1000.0) + ((inox_number)value->tv_nsec / 1000000.0);
}

inox_number Date::now() const {
  inox_time_ensure_initialized();

  return inox_floor_ms(
    inox_wall_base_ms +
    (inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user) - inox_wall_base_monotonic_ms)
  );
}

inox_number Date::parse(const char* bytes, size_t len) const {
  inox_number result = 0;

  if (bytes == 0) {
    return inox_date_nan();
  }

  if (inox_date_parse_iso(bytes, len, &result)) {
    return result;
  }

  return inox_date_nan();
}

inox_number Date::parse(inox::StringView text) const {
  inox_number result = 0;

  if (text.bytes == 0) {
    return inox_date_nan();
  }

  if (inox_date_parse_iso(text.bytes, text.len, &result)) {
    return result;
  }

  return inox_date_nan();
}

inox_number Date::UTC(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
) const {
  return inox_date_utc_from_parts(
    (int)year,
    (int)month,
    (int)day,
    (int)hour,
    (int)minute,
    (int)second,
    (int)millisecond
  );
}

inox_number Date::fromLocal(
  inox_number year,
  inox_number month,
  inox_number day,
  inox_number hour,
  inox_number minute,
  inox_number second,
  inox_number millisecond
) const {
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

inox_number Date::part(inox_number value, int part, bool utc) const {
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

inox_number Date::timezoneOffset(inox_number value) const {
  struct tm local_value;
  int millisecond = 0;

  if (!inox_date_time_struct(value, 0, &local_value, &millisecond)) {
    return inox_date_nan();
  }

  const inox_number whole_ms = inox_floor_ms(value);
  const inox_number local_as_utc = inox_date_utc_from_parts(
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

inox_status Date::toStringValue(inox_allocator* allocator, inox_number value, int kind, inox_value* out) const {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  static const char* weekdays[] = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
  static const char* months[] = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };
  struct tm time_value;
  int millisecond = 0;
  char buffer[96];
  int len = 0;

  if (!inox_date_time_struct(value, (kind == 0 || kind == 1) ? 1 : 0, &time_value, &millisecond)) {
    return inox_string_from_literal(allocator, "Invalid Date", 12, out);
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
    return INOX_ERR_TYPE;
  }

  return inox_string_from_literal(allocator, buffer, (size_t)len, out);
}

inox_number Performance::now() const {
  inox_time_ensure_initialized();

  return inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user) - inox_performance_base_ms;
}

class Date Date;
Performance performance;

extern "C" inox_number inox_performance_now(void) {
  inox_time_ensure_initialized();

  return inox_time_current_adapter.monotonic_now_ms(inox_time_current_adapter.user) - inox_performance_base_ms;
}

extern "C" void inox_time_sleep_ms(inox_number delay_ms) {
  if (delay_ms != delay_ms || delay_ms <= 0) {
    return;
  }

#if defined(_WIN32)
  DWORD milliseconds = delay_ms < 1 ? 1 : (DWORD)delay_ms;

  Sleep(milliseconds);
#else
  time_t seconds = (time_t)(delay_ms / 1000.0);
  long nanoseconds = (long)((delay_ms - ((inox_number)seconds * 1000.0)) * 1000000.0);

  if (nanoseconds < 0) {
    nanoseconds = 0;
  }

  if (nanoseconds > 999999999L) {
    seconds += 1;
    nanoseconds = 0;
  }

  struct timespec request = { seconds, nanoseconds };

  while (nanosleep(&request, &request) != 0 && errno == EINTR) {
  }
#endif
}
