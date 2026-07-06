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
  inox::StringView pattern_;
  RegExpFlags flags_;

public:
  RegExp();

  explicit RegExp(inox::StringView pattern);
  RegExp(inox::StringView pattern, RegExpFlags flags);

  bool test(inox::StringView value) const;
  bool test(const inox::Value& value) const;
};

#endif

#endif
