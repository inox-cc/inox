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

RegExp::RegExp() : pattern_(""), flags_(RegExpFlags::None) {}

RegExp::RegExp(const char* pattern) : pattern_(pattern), flags_(RegExpFlags::None) {}

RegExp::RegExp(const char* pattern, RegExpFlags flags) : pattern_(pattern), flags_(flags) {}

bool RegExp::test(const char* value) const {
  if (value == nullptr) {
    return false;
  }

  regex_t regex;
  int status = regcomp(&regex, pattern_, REG_EXTENDED | regexp_native_flags(flags_));

  if (status != 0) {
    return false;
  }

  status = regexec(&regex, value, 0, 0, 0);
  regfree(&regex);

  return status == 0;
}

bool RegExp::test(inox::StringView value) const {
  regex_t regex;
  int status = regcomp(&regex, pattern_, REG_EXTENDED | regexp_native_flags(flags_));

  if (status != 0) {
    return false;
  }

  char* bytes = (char*)malloc(value.len + 1);

  if (bytes == nullptr) {
    regfree(&regex);
    return false;
  }

  if (value.len > 0) {
    memcpy(bytes, value.bytes, value.len);
  }

  bytes[value.len] = 0;
  status = regexec(&regex, bytes, 0, 0, 0);
  free(bytes);
  regfree(&regex);

  return status == 0;
}

bool RegExp::test(const inox::String& value) const {
  regex_t regex;
  int status = regcomp(&regex, pattern_, REG_EXTENDED | regexp_native_flags(flags_));

  if (status != 0) {
    return false;
  }

  char* bytes = (char*)malloc(value.length() + 1);

  if (bytes == nullptr) {
    regfree(&regex);
    return false;
  }

  if (value.length() > 0) {
    memcpy(bytes, value.bytes(), value.length());
  }

  bytes[value.length()] = 0;
  status = regexec(&regex, bytes, 0, 0, 0);
  free(bytes);
  regfree(&regex);

  return status == 0;
}

bool RegExp::test(const inox::Value& value) const {
  const inox::String string(value);
  regex_t regex;
  int status = regcomp(&regex, pattern_, REG_EXTENDED | regexp_native_flags(flags_));

  if (status != 0) {
    return false;
  }

  char* bytes = (char*)malloc(string.length() + 1);

  if (bytes == nullptr) {
    regfree(&regex);
    return false;
  }

  if (string.length() > 0) {
    memcpy(bytes, string.bytes(), string.length());
  }

  bytes[string.length()] = 0;
  status = regexec(&regex, bytes, 0, 0, 0);
  free(bytes);
  regfree(&regex);

  return status == 0;
}
