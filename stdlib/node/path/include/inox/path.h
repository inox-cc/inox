#ifndef INOX_PATH_H
#define INOX_PATH_H

#include <stddef.h>
#include "inox/object.h"
#include "inox/string.h"
#include "inox/value.h"

#ifdef __cplusplus
#include <initializer_list>

class path {
public:
  struct FormatEntry {
    inox::StringView name;
    inox::StringView value;
  };

  inox::String delimiter;
  inox::String sep;
  const path& posix;

  path();
  inox::String basename(inox::StringView value, inox::StringView suffix, bool has_suffix) const;
  inox::String dirname(inox::StringView value) const;
  inox::String extname(inox::StringView value) const;
  inox::String format(const inox::Value& path_object) const;
  inox::String format(std::initializer_list<FormatEntry> entries) const;
  bool isAbsolute(inox::StringView value) const;
  inox::String join(const inox::StringView* values, size_t count) const;
  inox::String normalize(inox::StringView value) const;
  inox::Value parse(inox::StringView value, const inox_shape* shape) const;
  inox::String relative(inox::StringView from, inox::StringView to) const;
  inox::String resolve(const inox::StringView* values, size_t count) const;
};

extern path path;

#endif

#endif
