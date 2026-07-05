#ifndef INOX_TIME_H
#define INOX_TIME_H

#include "inox/value.h"

#ifdef __cplusplus

#include "inox/string_view.h"

class Date {
public:
  inox_number now() const;

  inox_number parse(const char* bytes, size_t len) const;

  inox_number parse(inox::StringView text) const;

  inox_number UTC(
    inox_number year,
    inox_number month = 0,
    inox_number day = 1,
    inox_number hour = 0,
    inox_number minute = 0,
    inox_number second = 0,
    inox_number millisecond = 0
  ) const;

  inox_number fromLocal(
    inox_number year,
    inox_number month = 0,
    inox_number day = 1,
    inox_number hour = 0,
    inox_number minute = 0,
    inox_number second = 0,
    inox_number millisecond = 0
  ) const;

  inox_number part(inox_number value, int part, bool utc) const;

  inox_number timezoneOffset(inox_number value) const;

  inox_status toStringValue(inox_allocator* allocator, inox_number value, int kind, inox_value* out) const;
};

inline Date Date;

class Performance {
public:
  inox_number now() const;
};

inline Performance performance;

#endif

#endif
