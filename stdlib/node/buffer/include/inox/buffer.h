#ifndef INOX_BUFFER_H
#define INOX_BUFFER_H

#include "inox/binary.h"
#include "inox/string.h"
#include "inox/string_view.h"

class BufferConstructor;
class BufferConstants;

class Buffer : public Uint8Array {
public:
  Buffer();
  explicit Buffer(std::span<const std::uint8_t> values);
  explicit Buffer(const inox::Value& value);
  explicit Buffer(inox::Value&& value);

  bool valid() const;
  static Buffer alloc(double size);
  static Buffer from(inox::StringView value);
  static Buffer from(inox::StringView value, inox::StringView encoding);
  static bool isBuffer(const inox::Value& value);
  Buffer slice(double start) const;
  Buffer slice(double start, double end) const;
  inox::String toString() const;
  inox::String toString(inox::StringView encoding) const;

private:
  explicit Buffer(Uint8Array&& value);
  static Buffer allocate(double size);
  static Buffer fromUtf8(inox::StringView value);
  static bool hasBufferIdentity(const inox::Value& value);

  friend class BufferConstructor;
};

class BufferConstructor {
public:
  Buffer alloc(double size) const;
  Buffer from(inox::StringView value) const;
  Buffer from(inox::StringView value, inox::StringView encoding) const;
  bool isBuffer(const inox::Value& value) const;
};

class BufferConstants {
public:
  const double MAX_LENGTH;

  BufferConstants();
};

class BufferModule {
public:
  BufferConstructor Buffer;
  BufferConstants constants;
};

extern const BufferModule buffer;

#endif
