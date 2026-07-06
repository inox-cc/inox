#ifndef INOX_PATH_H
#define INOX_PATH_H

#include <stddef.h>
#include "inox/object.h"
#include "inox/string.h"
#include "inox/value.h"

#ifdef __cplusplus

class path {
public:
  inox::String delimiter;
  inox::String sep;
  const path& posix;

  path();
  inox::String basename(inox_value value, inox_value suffix, bool has_suffix) const;
  inox::String dirname(inox_value value) const;
  inox::String extname(inox_value value) const;
  inox::String format(inox_value path_object) const;
  bool isAbsolute(inox_value value) const;
  inox::String join(const inox_value* values, size_t count) const;
  inox::String normalize(inox_value value) const;
  inox::Value parse(inox_value value, const inox_shape* shape) const;
  inox::String relative(inox_value from, inox_value to) const;
  inox::String resolve(const inox_value* values, size_t count) const;
};

extern path path;

#endif

#endif
