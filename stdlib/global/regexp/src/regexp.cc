#include "inox/regexp.h"

#include <regex.h>
#include <stdlib.h>
#include <string.h>

static int regexp_native_flags(RegExpFlags flags) {
  if (flags == RegExpFlags::IgnoreCase) {
    return REG_ICASE;
  }

  return 0;
}

static char* regexp_copy_null_terminated(inox::StringView value) {
  if (value.len == (size_t)-1) {
    return nullptr;
  }

  char* bytes = (char*)malloc(value.len + 1);

  if (bytes == nullptr) {
    return nullptr;
  }

  if (value.len > 0) {
    memcpy(bytes, value.bytes, value.len);
  }

  bytes[value.len] = 0;

  return bytes;
}

static bool regexp_test(inox::StringView pattern, RegExpFlags flags, inox::StringView value) {
  char* pattern_bytes = regexp_copy_null_terminated(pattern);

  if (pattern_bytes == nullptr) {
    return false;
  }

  regex_t regex;
  int status = regcomp(&regex, pattern_bytes, REG_EXTENDED | regexp_native_flags(flags));
  free(pattern_bytes);

  if (status != 0) {
    return false;
  }

  char* value_bytes = regexp_copy_null_terminated(value);

  if (value_bytes == nullptr) {
    regfree(&regex);
    return false;
  }

  status = regexec(&regex, value_bytes, 0, 0, 0);
  free(value_bytes);
  regfree(&regex);

  return status == 0;
}

RegExp::RegExp() : pattern_(""), flags_(RegExpFlags::None) {}

RegExp::RegExp(inox::StringView pattern) : pattern_(pattern), flags_(RegExpFlags::None) {}

RegExp::RegExp(inox::StringView pattern, RegExpFlags flags) : pattern_(pattern), flags_(flags) {}

bool RegExp::test(inox::StringView value) const {
  return regexp_test(pattern_, flags_, value);
}

bool RegExp::test(const inox::Value& value) const {
  const inox::String string(value);
  return regexp_test(pattern_, flags_, inox::StringView(string.bytes(), string.length()));
}
