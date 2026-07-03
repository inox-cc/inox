#ifndef INOX_STRING_VIEW_H
#define INOX_STRING_VIEW_H

#include <stddef.h>
#include <string.h>

namespace inox {

struct StringView {
  const char* bytes;
  size_t len;

  constexpr StringView() : bytes(""), len(0) {}

  constexpr StringView(const char* bytes, size_t len) : bytes(bytes == nullptr ? "" : bytes), len(bytes == nullptr ? 0 : len) {}

  StringView(const char* bytes) : bytes(bytes == nullptr ? "" : bytes), len(bytes == nullptr ? 0 : strlen(bytes)) {}

  template <size_t N>
  constexpr StringView(const char (&bytes)[N]) : bytes(bytes), len(N > 0 ? N - 1 : 0) {}
};

} // namespace inox

#endif
