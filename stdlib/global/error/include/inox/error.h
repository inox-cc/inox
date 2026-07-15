#ifndef INOX_ERROR_H
#define INOX_ERROR_H

#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

class Error : public inox::Value {
public:
  Error();
  explicit Error(inox::StringView message);
  Error(inox::StringView message, const inox::Value& options);

  inox::String name;
  inox::String message;
  inox::String code;
  inox::Value cause;
};

#endif
