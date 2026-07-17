#include "inox/conversions.h"

bool Boolean(bool value) {
  return value;
}

bool Boolean(double value) {
  return inox_value_truthy(inox_number_value(value));
}

bool Boolean(const inox::Value& value) {
  return inox_value_truthy(value.raw());
}
