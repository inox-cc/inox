#ifndef INOX_REGEXP_H
#define INOX_REGEXP_H

#include "inox/string_view.h"

#ifdef __cplusplus

class RegExp {
private:
  inox::StringView pattern_;
  bool ignore_case_;

public:
  RegExp();
  RegExp(inox::StringView pattern, inox::StringView flags);

  bool test(inox::StringView value) const;
};

#endif

#endif
