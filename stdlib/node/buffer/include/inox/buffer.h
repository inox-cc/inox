#ifndef INOX_BUFFER_H
#define INOX_BUFFER_H

#include "inox/binary.h"
#include "inox/string.h"
#include "inox/string_view.h"

class Buffer : public Uint8Array {
public:
  Buffer();
  explicit Buffer(std::span<const std::uint8_t> values);
  explicit Buffer(const inox::Value& value);
  explicit Buffer(inox::Value&& value);

  bool valid() const;
  static Buffer alloc(double size);
  static double byteLength(inox::StringView value);
  static double byteLength(inox::StringView value, inox::StringView encoding);
  static double compare(const Uint8Array& first, const Uint8Array& second);
  static double maximumLength();
  static Buffer from(inox::StringView value);
  static Buffer from(inox::StringView value, inox::StringView encoding);
  static bool isBuffer(const inox::Value& value);
  double compare(const Uint8Array& target) const;
  bool equals(const Uint8Array& otherBuffer) const;
  Buffer slice(double start) const;
  Buffer slice(double start, double end) const;
  inox::String toString() const;
  inox::String toString(inox::StringView encoding) const;

private:
  explicit Buffer(Uint8Array&& value);
  static Buffer fromUtf8(inox::StringView value);
};

#endif
