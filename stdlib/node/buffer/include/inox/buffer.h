#ifndef INOX_BUFFER_H
#define INOX_BUFFER_H

#include "inox/array.h"
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
  static Buffer concat(const Array& list);
  static Buffer concat(const Array& list, double totalLength);
  static double maximumLength();
  static Buffer from(inox::StringView value);
  static Buffer from(inox::StringView value, inox::StringView encoding);
  static Buffer from(const Uint8Array& value);
  static bool isBuffer(const inox::Value& value);
  double compare(const Uint8Array& target) const;
  double copy(
    Uint8Array target,
    double targetStart = 0,
    double sourceStart = 0,
    double sourceEnd = std::numeric_limits<double>::infinity()
  ) const;
  bool equals(const Uint8Array& otherBuffer) const;
  Buffer slice(double start) const;
  Buffer slice(double start, double end) const;
  Buffer subarray(
    double start = 0,
    double end = std::numeric_limits<double>::infinity()
  ) const;
  inox::String toString() const;
  inox::String toString(inox::StringView encoding) const;

private:
  explicit Buffer(Uint8Array&& value);
  static Buffer fromUtf8(inox::StringView value);
};

#endif
