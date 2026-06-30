#ifndef INOX_STRING_VIEW_H
#define INOX_STRING_VIEW_H

#include <stddef.h>
#include <string.h>

namespace inox {

struct StringView {
  const char* bytes;
  size_t len;
};

inline StringView string_view(const char* bytes, size_t len) {
  return { bytes == nullptr ? "" : bytes, bytes == nullptr ? 0 : len };
}

inline StringView string_view(const char* bytes) {
  return string_view(bytes, bytes == nullptr ? 0 : strlen(bytes));
}

template <size_t N>
constexpr StringView string_view(const char (&bytes)[N]) {
  return { bytes, N > 0 ? N - 1 : 0 };
}

} // namespace inox

#endif
