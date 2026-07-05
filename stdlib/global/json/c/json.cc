#include "inox/json.h"

#include "inox/string.h"

inox::Value Json::parse(inox::StringView text) const {
  inox_value out = inox_undefined_value();
  inox::Value error;
  inox_status status = inox_json_parse_with_error(&inox_default_allocator, text.bytes, text.len, &out, error.out());

  if (status != INOX_OK) {
    inox_release(out);

    if (error.tag == INOX_TAG_STRING && error.as.ref != 0) {
      inox::throw_value(error);
    } else {
      inox::throw_value(inox::string("JSON.parse failed"));
    }

    return inox::Value();
  }

  return inox::adopt(out);
}

inox::Value Json::parse(const char* text) const {
  return parse(inox::StringView(text));
}

inox_status Json::stringify(inox_value value, inox::Value& out) const {
  return inox_json_stringify(&inox_default_allocator, value, out.out());
}

inox_status Json::stringify(const inox_class_descriptor* descriptor, const void* instance, inox::Value& out) const {
  return inox_json_stringify_class_instance(&inox_default_allocator, descriptor, instance, out.out());
}
