#ifndef INOX_OBJECT_GLOBAL_H
#define INOX_OBJECT_GLOBAL_H

#include "inox/array.h"
#include "inox/value.h"

class Object {
public:
  Array keys(inox_value value) const;
  Array values(inox_value value) const;
  Array entries(inox_value value) const;
  bool hasOwn(inox_value value, inox::StringView property) const;
  bool hasOwn(inox_value value, double property) const;
};

extern Object Object;

#endif
