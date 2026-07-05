#ifndef INOX_REGEXP_H
#define INOX_REGEXP_H

#include <regex.h>

#include "inox/string_view.h"
#include "inox/value.h"

#ifdef __cplusplus

class RegExp {
private:
  const char* pattern_ = "";
  int flags_ = 0;

public:
  RegExp() = default;

  RegExp(const char* pattern, int flags) : pattern_(pattern), flags_(flags) {}

  bool test(const char* value) const;
  bool test(inox::StringView value) const;
  bool test(const inox::String& value) const;
  bool test(const inox::Value& value) const;
};

#endif

#endif
