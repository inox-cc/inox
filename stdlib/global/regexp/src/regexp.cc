#include "inox/regexp.h"

#include <stdlib.h>
#include <string.h>

bool RegExp::test(const char* value) const {
  if (value == nullptr) {
    return false;
  }

  return test(inox::StringView(value));
}

bool RegExp::test(inox::StringView value) const {
  regex_t regex;
  int status = regcomp(&regex, pattern_, REG_EXTENDED | flags_);

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
  return test(inox::StringView(value.bytes(), value.length()));
}

bool RegExp::test(const inox::Value& value) const {
  return test(inox::String(value));
}
