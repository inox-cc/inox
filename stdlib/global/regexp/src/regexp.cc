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

RegExp::RegExp() : pattern_(""), flags_(RegExpFlags::None) {}

RegExp::RegExp(inox::StringView pattern) : pattern_(pattern), flags_(RegExpFlags::None) {}

RegExp::RegExp(inox::StringView pattern, RegExpFlags flags) : pattern_(pattern), flags_(flags) {}

bool RegExp::test(inox::StringView value) const {
  char* pattern_bytes = regexp_copy_null_terminated(pattern_);

  if (pattern_bytes == nullptr) {
    return false;
  }

  regex_t regex;
  int status = regcomp(&regex, pattern_bytes, REG_EXTENDED | regexp_native_flags(flags_));
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

bool RegExp::test(const inox::Value& value) const {
  const inox::String string(value);
  const inox::StringView view(string.bytes(), string.length());
  char* pattern_bytes = regexp_copy_null_terminated(pattern_);

  if (pattern_bytes == nullptr) {
    return false;
  }

  regex_t regex;
  int status = regcomp(&regex, pattern_bytes, REG_EXTENDED | regexp_native_flags(flags_));
  free(pattern_bytes);

  if (status != 0) {
    return false;
  }

  char* value_bytes = regexp_copy_null_terminated(view);

  if (value_bytes == nullptr) {
    regfree(&regex);
    return false;
  }

  status = regexec(&regex, value_bytes, 0, 0, 0);
  free(value_bytes);
  regfree(&regex);

  return status == 0;
}
