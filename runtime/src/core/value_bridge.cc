#include "inox/value.h"

#include "inox/loop.h"
#include "inox/string.h"

namespace inox {

double expect_number(const Value& value) {
  if (thrown()) {
    return 0;
  }

  inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_NUMBER) {
    throw_value(String("TypeError: expected number"));
    return 0;
  }

  return raw.as.number;
}

bool expect_boolean(const Value& value) {
  if (thrown()) {
    return false;
  }

  inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_BOOL) {
    throw_value(String("TypeError: expected boolean"));
    return false;
  }

  return raw.as.boolean;
}

} // namespace inox
