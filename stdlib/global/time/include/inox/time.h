#ifndef INOX_TIME_H
#define INOX_TIME_H

#include "inox/value.h"

#ifdef __cplusplus

#include "inox/string.h"
#include "inox/string_view.h"

class DateValue final {
private:
  inox_number value_;

public:
  DateValue();
  explicit DateValue(inox_number value);
  explicit DateValue(const inox::Value& value);

  static bool isDate(const inox::Value& value);
  inox::Value runtimeValue() const;

  inox_number getDate() const;
  inox_number getDay() const;
  inox_number getFullYear() const;
  inox_number getHours() const;
  inox_number getMilliseconds() const;
  inox_number getMinutes() const;
  inox_number getMonth() const;
  inox_number getSeconds() const;
  inox_number getTime() const;
  inox_number getTimezoneOffset() const;
  inox_number getUTCDate() const;
  inox_number getUTCDay() const;
  inox_number getUTCFullYear() const;
  inox_number getUTCHours() const;
  inox_number getUTCMilliseconds() const;
  inox_number getUTCMinutes() const;
  inox_number getUTCMonth() const;
  inox_number getUTCSeconds() const;
  inox_number valueOf() const;

  inox::String toDateString() const;
  inox::String toISOString() const;
  inox::String toJSON() const;
  inox::String toString() const;
  inox::String toTimeString() const;
  inox::String toUTCString() const;
};

class DateObject final {
public:
  DateValue operator()() const;
  DateValue operator()(inox_number value) const;
  DateValue operator()(inox::StringView value) const;
  DateValue operator()(const DateValue& value) const;
  DateValue operator()(
    inox_number year,
    inox_number month,
    inox_number day = 1,
    inox_number hour = 0,
    inox_number minute = 0,
    inox_number second = 0,
    inox_number millisecond = 0
  ) const;

  inox_number now() const;

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

};

extern const DateObject Date;

class Performance final {
public:
  inox_number now() const;
};

extern const Performance performance;

#endif

#endif
