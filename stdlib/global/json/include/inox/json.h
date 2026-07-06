#ifndef INOX_JSON_H
#define INOX_JSON_H

#include <stddef.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/string.h"
#include "inox/string_view.h"
#endif

#ifdef __cplusplus
class Json {
public:
  inox::Value parse(inox::StringView text) const;

  inox::String stringify(inox_value value) const;

  inox::String stringify(const inox_class_descriptor& descriptor, const void* instance) const;
};

extern Json JSON;
#endif

#endif
