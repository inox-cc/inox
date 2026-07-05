#include "inox/time.h"

inox_number Date::now() const {
  return inox_date_now();
}

inox_number Date::parse(const char* bytes, size_t len) const {
  return inox_date_parse(bytes, len);
}

inox_number Date::parse(inox::StringView text) const {
  return parse(text.bytes, text.len);
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
  return inox_date_utc(year, month, day, hour, minute, second, millisecond);
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
  return inox_date_from_local(year, month, day, hour, minute, second, millisecond);
}

inox_number Date::part(inox_number value, int part, bool utc) const {
  return inox_date_get_part(value, part, utc);
}

inox_number Date::timezoneOffset(inox_number value) const {
  return inox_date_get_timezone_offset(value);
}

inox_status Date::toStringValue(inox_allocator* allocator, inox_number value, int kind, inox_value* out) const {
  return inox_date_to_string(allocator, value, kind, out);
}

inox_number Performance::now() const {
  return inox_performance_now();
}
