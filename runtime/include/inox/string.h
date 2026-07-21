#ifndef INOX_STRING_H
#define INOX_STRING_H

#include <stdbool.h>
#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

typedef struct inox_string {
  inox_ref header;
  size_t len;
  char bytes[];
} inox_string;

#ifdef __cplusplus

#include "inox/string_view.h"

class Array;

namespace inox {

int compareStrings(StringView left, StringView right);

class String : public Value {
private:
  static Value make(const char* bytes, size_t len);
  static size_t non_negative_index(double raw);
  static size_t slice_index(double raw, size_t length);

public:
  static String fromNumber(double value);
  static String fromNumberRadix(double value, int radix);
  static String fromFormat(const char* format, ...);
  static String fromValue(const Value& value);
  static Value toNumber(StringView value);

  String();
  String(const char* bytes);
  String(const char* bytes, size_t len);
  String(StringView view);
  explicit String(const Value& value);
  explicit String(Value&& value);

  using Value::operator=;

  bool valid() const;
  size_t length() const;
  size_t codeUnitLength() const;
  const char* bytes() const;
  operator StringView() const;
  String trim() const;
  String trimStart() const;
  String trimLeft() const;
  String trimEnd() const;
  String trimRight() const;
  String toUpperCase() const;
  String padStart(double target_len) const;
  String padStart(double target_len, StringView pad) const;
  String slice(double start) const;
  String slice(double start, double end) const;
  ::Array split(StringView separator) const;
  String concat(StringView right) const;
  double charCodeAt(double offset) const;
  bool includes(StringView search) const;
  bool includes(StringView search, double start) const;
  bool startsWith(StringView search) const;
  bool endsWith(StringView search) const;
  double indexOf(StringView search) const;
  double indexOf(StringView search, double start) const;
  double lastIndexOf(StringView search) const;
  double lastIndexOf(StringView search, double start) const;
};

} // namespace inox

#endif

#endif
