#include "inox/conversions.h"

#include <cmath>

#include "inox/loop.h"
#include "inox/string.h"

namespace {

double checkedIntegerCast(
  double value,
  double preMinimum,
  double preMaximum,
  long long minimum,
  long long maximum,
  const char* name
) {
  if (!std::isfinite(value) || value <= preMinimum || value >= preMaximum) {
    inox::throw_value(inox::String::fromFormat("RangeError: %s cast is outside the supported range", name));
    return 0;
  }

  const auto truncated = static_cast<long long>(value);

  if (truncated < minimum || truncated > maximum) {
    inox::throw_value(inox::String::fromFormat("RangeError: %s cast is outside the supported range", name));
    return 0;
  }

  return static_cast<double>(truncated);
}

}

bool Boolean(bool value) {
  return value;
}

bool Boolean(double value) {
  return inox_value_truthy(inox_number_value(value));
}

bool Boolean(const inox::Value& value) {
  return inox_value_truthy(value.raw());
}

double i32(double value) {
  return checkedIntegerCast(value, -2147483649.0, 2147483648.0, -2147483648LL, 2147483647LL, "i32");
}

double u32(double value) {
  return checkedIntegerCast(value, -1.0, 4294967296.0, 0LL, 4294967295LL, "u32");
}

double u64(double value) {
  return checkedIntegerCast(value, -1.0, 9007199254740992.0, 0LL, 9007199254740991LL, "u64");
}

double f32(double value) {
  return static_cast<double>(static_cast<float>(value));
}

double f64(double value) {
  return value;
}
