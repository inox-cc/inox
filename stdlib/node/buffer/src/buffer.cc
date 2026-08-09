#include "inox/buffer.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <memory>
#include <new>
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

enum class BufferEncoding {
  utf8,
  hex,
  base64,
  base64url,
  unknown
};

bool asciiEquals(char actual, char expected) {
  return actual == expected ||
         (actual >= 'A' && actual <= 'Z' && actual + ('a' - 'A') == expected);
}

bool encodingEquals(inox::StringView encoding, const char* expected, std::size_t length) {
  if (encoding.bytes == nullptr || encoding.len != length) {
    return false;
  }

  for (std::size_t index = 0; index < length; index += 1) {
    if (!asciiEquals(encoding.bytes[index], expected[index])) {
      return false;
    }
  }

  return true;
}

BufferEncoding parseEncoding(inox::StringView encoding) {
  if (encodingEquals(encoding, "utf8", 4) || encodingEquals(encoding, "utf-8", 5)) {
    return BufferEncoding::utf8;
  }

  if (encodingEquals(encoding, "hex", 3)) {
    return BufferEncoding::hex;
  }

  if (encodingEquals(encoding, "base64", 6)) {
    return BufferEncoding::base64;
  }

  if (encodingEquals(encoding, "base64url", 9)) {
    return BufferEncoding::base64url;
  }

  return BufferEncoding::unknown;
}

int hexValue(char value) {
  if (value >= '0' && value <= '9') {
    return value - '0';
  }

  if (value >= 'a' && value <= 'f') {
    return value - 'a' + 10;
  }

  if (value >= 'A' && value <= 'F') {
    return value - 'A' + 10;
  }

  return -1;
}

int base64Value(char value) {
  if (value >= 'A' && value <= 'Z') {
    return value - 'A';
  }

  if (value >= 'a' && value <= 'z') {
    return value - 'a' + 26;
  }

  if (value >= '0' && value <= '9') {
    return value - '0' + 52;
  }

  if (value == '+' || value == '-') {
    return 62;
  }

  if (value == '/' || value == '_') {
    return 63;
  }

  return -1;
}

Buffer decodeHex(inox::StringView value) {
  std::size_t length = 0;

  while (length * 2 + 1 < value.len) {
    if (hexValue(value.bytes[length * 2]) < 0 || hexValue(value.bytes[length * 2 + 1]) < 0) {
      break;
    }

    length += 1;
  }

  Buffer result = Buffer::alloc(static_cast<double>(length));

  if (!result.valid() || inox::thrown()) {
    return Buffer();
  }

  for (std::size_t index = 0; index < length; index += 1) {
    result.bytes()[index] = static_cast<std::uint8_t>(
      (hexValue(value.bytes[index * 2]) << 4) | hexValue(value.bytes[index * 2 + 1])
    );
  }

  return result;
}

Buffer decodeBase64(inox::StringView value) {
  std::size_t digitCount = 0;

  for (std::size_t index = 0; index < value.len && value.bytes[index] != '='; index += 1) {
    if (base64Value(value.bytes[index]) >= 0) {
      digitCount += 1;
    }
  }

  const std::size_t length = digitCount * 6 / 8;
  Buffer result = Buffer::alloc(static_cast<double>(length));

  if (!result.valid() || inox::thrown()) {
    return Buffer();
  }

  std::uint32_t accumulator = 0;
  int bitCount = 0;
  std::size_t outputIndex = 0;

  for (std::size_t index = 0; index < value.len && value.bytes[index] != '='; index += 1) {
    const int digit = base64Value(value.bytes[index]);

    if (digit < 0) {
      continue;
    }

    accumulator = (accumulator << 6) | static_cast<std::uint32_t>(digit);
    bitCount += 6;

    if (bitCount >= 8) {
      bitCount -= 8;
      result.bytes()[outputIndex] = static_cast<std::uint8_t>(accumulator >> bitCount);
      outputIndex += 1;

      if (bitCount == 0) {
        accumulator = 0;
      } else {
        accumulator &= (1U << bitCount) - 1U;
      }
    }
  }

  return result;
}

inox::String encodeHex(std::span<const std::uint8_t> value) {
  static constexpr char digits[] = "0123456789abcdef";

  if (value.size() > std::numeric_limits<std::size_t>::max() / 2) {
    inox::throw_out_of_memory();
    return inox::String();
  }

  const std::size_t length = value.size() * 2;

  if (length == 0) {
    return inox::String("", 0);
  }

  auto output = std::unique_ptr<char[]>(new (std::nothrow) char[length]);

  if (!output) {
    inox::throw_out_of_memory();
    return inox::String();
  }

  for (std::size_t index = 0; index < value.size(); index += 1) {
    output[index * 2] = digits[value[index] >> 4];
    output[index * 2 + 1] = digits[value[index] & 0x0f];
  }

  inox::String result(output.get(), length);

  if (!result.valid()) {
    inox::throw_out_of_memory();
  }

  return result;
}

inox::String encodeBase64(std::span<const std::uint8_t> value, bool url) {
  static constexpr char standardDigits[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  static constexpr char urlDigits[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const char* digits = url ? urlDigits : standardDigits;
  const std::size_t groups = value.size() / 3 + (value.size() % 3 == 0 ? 0 : 1);

  if (groups > std::numeric_limits<std::size_t>::max() / 4) {
    inox::throw_out_of_memory();
    return inox::String();
  }

  const std::size_t padding = value.size() % 3 == 0 ? 0 : 3 - value.size() % 3;
  const std::size_t length = groups * 4 - (url ? padding : 0);

  if (length == 0) {
    return inox::String("", 0);
  }

  auto output = std::unique_ptr<char[]>(new (std::nothrow) char[length]);

  if (!output) {
    inox::throw_out_of_memory();
    return inox::String();
  }

  std::size_t outputIndex = 0;

  for (std::size_t index = 0; index < value.size(); index += 3) {
    const std::size_t remaining = value.size() - index;
    const std::uint32_t first = value[index];
    const std::uint32_t second = remaining > 1 ? value[index + 1] : 0;
    const std::uint32_t third = remaining > 2 ? value[index + 2] : 0;
    const std::uint32_t packed = (first << 16) | (second << 8) | third;

    output[outputIndex++] = digits[(packed >> 18) & 0x3f];
    output[outputIndex++] = digits[(packed >> 12) & 0x3f];

    if (remaining > 1) {
      output[outputIndex++] = digits[(packed >> 6) & 0x3f];
    } else if (!url) {
      output[outputIndex++] = '=';
    }

    if (remaining > 2) {
      output[outputIndex++] = digits[packed & 0x3f];
    } else if (!url) {
      output[outputIndex++] = '=';
    }
  }

  inox::String result(output.get(), length);

  if (!result.valid()) {
    inox::throw_out_of_memory();
  }

  return result;
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
  switch (parseEncoding(encoding)) {
    case BufferEncoding::hex:
      return static_cast<double>(value.len / 2);
    case BufferEncoding::base64:
    case BufferEncoding::base64url: {
      std::size_t length = value.len;

      if (length > 0 && value.bytes[length - 1] == '=') {
        length -= 1;
      }

      if (length > 0 && value.bytes[length - 1] == '=') {
        length -= 1;
      }

      return static_cast<double>(length * 3 / 4);
    }
    case BufferEncoding::utf8:
    case BufferEncoding::unknown:
      return byteLength(value);
  }

  return 0;
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
  if (value.bytes == nullptr && value.len != 0) {
    throwBufferError("TypeError: Buffer.from value is invalid");
    return Buffer();
  }

  switch (parseEncoding(encoding)) {
    case BufferEncoding::utf8:
      return fromUtf8(value);
    case BufferEncoding::hex:
      return decodeHex(value);
    case BufferEncoding::base64:
    case BufferEncoding::base64url:
      return decodeBase64(value);
    case BufferEncoding::unknown:
      throwBufferError("TypeError: Buffer.from received an unknown encoding");
      return Buffer();
  }

  return Buffer();
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
  if (!valid()) {
    inox::fatal("Buffer.toString native facade invariant failed");
  }

  switch (parseEncoding(encoding)) {
    case BufferEncoding::utf8:
      return toString();
    case BufferEncoding::hex:
      return encodeHex(bytes());
    case BufferEncoding::base64:
      return encodeBase64(bytes(), false);
    case BufferEncoding::base64url:
      return encodeBase64(bytes(), true);
    case BufferEncoding::unknown:
      throwBufferError("TypeError: Buffer.toString received an unknown encoding");
      return inox::String();
  }

  return inox::String();
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
