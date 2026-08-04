#include "inox/error.h"

#include <utility>

#include "inox/object.h"

static const inox_field_info error_fields[] = {
  { "name", INOX_FIELD_READONLY },
  { "message", INOX_FIELD_READONLY },
  { "cause", INOX_FIELD_READONLY }
};

static const inox_shape error_shape = {
  3,
  error_fields
};

static void materialize_error(Error& target) {
  inox::ObjectValue value = inox::ObjectValue::create(&error_shape);

  value.init(0, target.name.raw());
  value.init(1, target.message.raw());
  value.init(2, target.cause.raw());
  static_cast<inox::Value&>(target) = std::move(value);
}

Error::Error() : Error(inox::StringView("")) {}

Error::Error(inox::StringView message_value)
  : inox::Value(), name("Error"), message(message_value), cause() {
  materialize_error(*this);
}

Error::Error(inox::StringView message_value, const inox::Value& options)
  : inox::Value(), name("Error"), message(message_value), cause() {
  inox::Value cause_value = inox::get(options.raw(), "cause");

  if (cause_value.tag != INOX_TAG_UNDEFINED) {
    cause = std::move(cause_value);
  }

  materialize_error(*this);
}
