#ifndef INOX_JSON_H
#define INOX_JSON_H

#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

class Json {
public:
  inox::Value parse(inox::StringView text) const;

  inox::String stringify(const inox::Value& value) const;
  inox::String stringify(const inox::Value& value, const inox::Value& replacer) const;
  inox::String stringify(const inox::Value& value, const inox::Value& replacer, double space) const;
};

extern Json JSON;

#endif
