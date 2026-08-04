#include "inox/buffer.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <span>
#include <utility>

#include "inox/loop.h"

namespace {

void throwBufferError(const char* message) {
  inox::String error(message);

  if (!error.valid()) {
    inox::throw_out_of_memory();
    return;
  }

  inox::throw_value(error);
}

bool isUtf8(inox::StringView encoding) {
  return encoding.len == 4 &&
         encoding.bytes[0] == 'u' &&
         encoding.bytes[1] == 't' &&
         encoding.bytes[2] == 'f' &&
         encoding.bytes[3] == '8';
}

double compareBytes(std::span<const std::uint8_t> first, std::span<const std::uint8_t> second) {
  const std::size_t commonLength = std::min(first.size(), second.size());
  const int order = commonLength == 0 ? 0 : std::memcmp(first.data(), second.data(), commonLength);

  if (order < 0) {
    return -1;
  }

  if (order > 0) {
    return 1;
  }

  if (first.size() < second.size()) {
    return -1;
  }

  return first.size() > second.size() ? 1 : 0;
}

bool bufferIndex(double value, std::size_t limit, std::size_t& result) {
  if (std::isnan(value)) {
    result = 0;
    return true;
  }

  const double integer = std::trunc(value);

  if (integer < 0) {
    return false;
  }

  if (integer >= static_cast<double>(limit) || integer == std::numeric_limits<double>::infinity()) {
    result = limit;
    return true;
  }

  result = static_cast<std::size_t>(integer);
  return true;
}

Buffer concatBuffers(const Array& list, bool hasTotalLength, double totalLength) {
  std::size_t length = 0;
  const std::size_t maximum = static_cast<std::size_t>(Buffer::maximumLength());

  if (hasTotalLength) {
    if (
      !std::isfinite(totalLength) ||
      totalLength < 0 ||
      std::trunc(totalLength) != totalLength ||
      totalLength > static_cast<double>(maximum)
    ) {
      throwBufferError("RangeError: Buffer.concat totalLength is invalid");
      return Buffer();
    }

    length = static_cast<std::size_t>(totalLength);
  } else {
    for (std::size_t index = 0; index < list.length(); index += 1) {
      Uint8Array item(list.get(index));

      if (!item.valid() || inox::thrown()) {
        return Buffer();
      }

      if (item.length() > maximum - length) {
        throwBufferError("RangeError: Buffer.concat result is too large");
        return Buffer();
      }

      length += item.length();
    }
  }

  Buffer result = Buffer::alloc(static_cast<double>(length));

  if (!result.valid() || inox::thrown()) {
    return Buffer();
  }

  std::size_t offset = 0;

  for (std::size_t index = 0; index < list.length() && offset < length; index += 1) {
    Uint8Array item(list.get(index));

    if (!item.valid() || inox::thrown()) {
      return Buffer();
    }

    const auto source = item.bytes();
    const std::size_t count = std::min(source.size(), length - offset);

    if (count > 0) {
      std::memcpy(result.bytes().data() + offset, source.data(), count);
      offset += count;
    }
  }

  return result;
}

} // namespace

Buffer::Buffer() : Uint8Array() {}

Buffer::Buffer(std::span<const std::uint8_t> values) : Uint8Array(Uint8Array::copy(values, true)) {}

Buffer::Buffer(const inox::Value& value) : Uint8Array(value) {}

Buffer::Buffer(inox::Value&& value) : Uint8Array(std::move(value)) {}

Buffer::Buffer(Uint8Array&& value) : Uint8Array(std::move(value)) {}

bool Buffer::valid() const {
  return isBufferValue();
}

Buffer Buffer::alloc(double size) {
  auto value = Uint8Array::allocate(size, true);

  if (!value.valid()) {
    return Buffer();
  }

  return Buffer(std::move(value));
}

double Buffer::byteLength(inox::StringView value) {
  return static_cast<double>(value.len);
}

double Buffer::byteLength(inox::StringView value, inox::StringView encoding) {
  if (!isUtf8(encoding)) {
    throwBufferError("TypeError: Buffer.byteLength only supports utf8 encoding");
    return 0;
  }

  return byteLength(value);
}

double Buffer::compare(const Uint8Array& first, const Uint8Array& second) {
  return compareBytes(first.bytes(), second.bytes());
}

Buffer Buffer::concat(const Array& list) {
  return concatBuffers(list, false, 0);
}

Buffer Buffer::concat(const Array& list, double totalLength) {
  return concatBuffers(list, true, totalLength);
}

double Buffer::maximumLength() {
  return static_cast<double>(Uint8Array::maximumLength());
}

Buffer Buffer::from(inox::StringView value) {
  return fromUtf8(value);
}

Buffer Buffer::from(inox::StringView value, inox::StringView encoding) {
  if (!isUtf8(encoding)) {
    throwBufferError("TypeError: Buffer.from only supports utf8 encoding");
    return Buffer();
  }

  return fromUtf8(value);
}

Buffer Buffer::from(const Uint8Array& value) {
  return Buffer(value.bytes());
}

bool Buffer::isBuffer(const inox::Value& value) {
  return valueHasBufferIdentity(value);
}

double Buffer::compare(const Uint8Array& target) const {
  return compareBytes(bytes(), target.bytes());
}

double Buffer::copy(
  Uint8Array target,
  double targetStart,
  double sourceStart,
  double sourceEnd
) const {
  if (!valid() || !target.valid()) {
    inox::fatal("Buffer.copy native facade invariant failed");
  }

  std::size_t targetOffset = 0;
  std::size_t sourceOffset = 0;
  std::size_t sourceLimit = 0;

  if (
    !bufferIndex(targetStart, target.length(), targetOffset) ||
    !bufferIndex(sourceStart, length(), sourceOffset) ||
    !bufferIndex(sourceEnd, length(), sourceLimit)
  ) {
    throwBufferError("RangeError: Buffer.copy offset is invalid");
    return 0;
  }

  if (sourceLimit <= sourceOffset || targetOffset >= target.length()) {
    return 0;
  }

  const std::size_t count = std::min(sourceLimit - sourceOffset, target.length() - targetOffset);
  std::memmove(target.bytes().data() + targetOffset, bytes().data() + sourceOffset, count);
  return static_cast<double>(count);
}

bool Buffer::equals(const Uint8Array& otherBuffer) const {
  return compare(otherBuffer) == 0;
}

Buffer Buffer::slice(double start) const {
  return slice(start, static_cast<double>(length()));
}

Buffer Buffer::slice(double start, double end) const {
  if (!valid()) {
    inox::fatal("Buffer.slice native facade invariant failed");
  }

  return Buffer(view(start, end, true));
}

Buffer Buffer::subarray(double start, double end) const {
  if (!valid()) {
    inox::fatal("Buffer.subarray native facade invariant failed");
  }

  return Buffer(view(start, end, true));
}

inox::String Buffer::toString() const {
  if (!valid()) {
    inox::fatal("Buffer.toString native facade invariant failed");
  }

  const auto value = bytes();
  inox::String result(reinterpret_cast<const char*>(value.data()), value.size());

  if (!result.valid()) {
    inox::throw_out_of_memory();
  }

  return result;
}

inox::String Buffer::toString(inox::StringView encoding) const {
  if (!isUtf8(encoding)) {
    throwBufferError("TypeError: Buffer.toString only supports utf8 encoding");
    return inox::String();
  }

  return toString();
}

Buffer Buffer::fromUtf8(inox::StringView value) {
  if (value.bytes == nullptr && value.len != 0) {
    throwBufferError("TypeError: Buffer.from value is invalid");
    return Buffer();
  }

  const auto bytes = std::span(
    reinterpret_cast<const std::uint8_t*>(value.bytes),
    value.len
  );
  auto result = Uint8Array::copy(bytes, true);

  if (!result.valid()) {
    return Buffer();
  }

  return Buffer(std::move(result));
}
