#ifndef INOX_REGEXP_H
#define INOX_REGEXP_H

#include "inox/string_view.h"
#include "inox/value.h"

#ifdef __cplusplus

enum class RegExpFlags {
  None = 0,
  IgnoreCase = 1
};

class RegExp {
private:
  const char* pattern_ = "";
  RegExpFlags flags_ = RegExpFlags::None;

public:
  RegExp();

  RegExp(const char* pattern, RegExpFlags flags = RegExpFlags::None);

  bool test(const char* value) const;
  bool test(inox::StringView value) const;
  bool test(const inox::String& value) const;
  bool test(const inox::Value& value) const;
};

#endif

#endif
