#include "inox/buffer.h"

#include <span>
#include <utility>

#include "inox/loop.h"

namespace {

void throwBufferError(const char* message) {
  inox::throw_value(inox::String(message));
}

bool isUtf8(inox::StringView encoding) {
  return encoding.len == 4 &&
         encoding.bytes[0] == 'u' &&
         encoding.bytes[1] == 't' &&
         encoding.bytes[2] == 'f' &&
         encoding.bytes[3] == '8';
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

Buffer Buffer::slice(double start) const {
  return slice(start, static_cast<double>(length()));
}

Buffer Buffer::slice(double start, double end) const {
  if (!valid()) {
    throwBufferError("TypeError: Buffer.slice receiver is not a Buffer");
    return Buffer();
  }

  return Buffer(view(start, end, true));
}

inox::String Buffer::toString() const {
  if (!valid()) {
    throwBufferError("TypeError: Buffer.toString receiver is not a Buffer");
    return inox::String();
  }

  const auto value = bytes();
  return inox::String(reinterpret_cast<const char*>(value.data()), value.size());
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
  return Uint8Array(value).isBufferValue();
}

Buffer BufferConstructor::alloc(double size) const {
  return Buffer::allocate(size);
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
