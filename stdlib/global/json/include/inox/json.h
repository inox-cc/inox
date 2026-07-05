#ifndef INOX_JSON_H
#define INOX_JSON_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/loop.h"
#include "inox/string_view.h"
#endif

#ifdef __cplusplus
class Json {
public:
  inox::Value parse(inox::StringView text) const;
  inox::Value parse(const char* text) const;

  template <size_t N>
  inox::Value parse(const char (&text)[N]) const {
    return parse(inox::StringView(text));
  }

  inox_status stringify(inox_value value, inox::Value& out) const;

  inox_status stringify(const inox_class_descriptor& descriptor, const void* instance, inox::Value& out) const;

  inox_status stringify(const inox_class_descriptor* descriptor, const void* instance, inox::Value& out) const;
};

extern Json JSON;
#endif

#endif
