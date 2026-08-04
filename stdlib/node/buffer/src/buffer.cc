#include "inox/buffer.h"

#include <algorithm>
#include <cstring>
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

} // namespace

Buffer::Buffer() : Uint8Array() {}

Buffer::Buffer(std::span<const std::uint8_t> values) : Uint8Array(copy(values, true)) {}

Buffer::Buffer(const inox::Value& value) : Uint8Array(value) {}

Buffer::Buffer(inox::Value&& value) : Uint8Array(std::move(value)) {}

Buffer::Buffer(Uint8Array&& value) : Uint8Array(std::move(value)) {}

bool Buffer::valid() const {
  return isBufferValue();
}

Buffer Buffer::alloc(double size) {
  return allocate(size);
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

bool Buffer::isBuffer(const inox::Value& value) {
  return hasBufferIdentity(value);
}

double Buffer::compare(const Uint8Array& target) const {
  return compareBytes(bytes(), target.bytes());
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

Buffer Buffer::allocate(double size) {
  auto value = Uint8Array::allocate(size, true);

  if (!value.valid()) {
    return Buffer();
  }

  return Buffer(std::move(value));
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

bool Buffer::hasBufferIdentity(const inox::Value& value) {
  return valueHasBufferIdentity(value);
}

Buffer BufferConstructor::alloc(double size) const {
  return Buffer::allocate(size);
}

double BufferConstructor::byteLength(inox::StringView value) const {
  return Buffer::byteLength(value);
}

double BufferConstructor::byteLength(inox::StringView value, inox::StringView encoding) const {
  return Buffer::byteLength(value, encoding);
}

double BufferConstructor::compare(const Uint8Array& first, const Uint8Array& second) const {
  return Buffer::compare(first, second);
}

Buffer BufferConstructor::from(inox::StringView value) const {
  return Buffer::fromUtf8(value);
}

Buffer BufferConstructor::from(inox::StringView value, inox::StringView encoding) const {
  if (!isUtf8(encoding)) {
    throwBufferError("TypeError: Buffer.from only supports utf8 encoding");
    return ::Buffer();
  }

  return Buffer::fromUtf8(value);
}

bool BufferConstructor::isBuffer(const inox::Value& value) const {
  return Buffer::hasBufferIdentity(value);
}

BufferConstants::BufferConstants() : MAX_LENGTH(static_cast<double>(Uint8Array::maximumLength())) {}

const BufferModule buffer;
