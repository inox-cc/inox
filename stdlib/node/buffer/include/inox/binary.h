#ifndef INOX_BINARY_H
#define INOX_BINARY_H

#include <stddef.h>
#include <stdint.h>
#include "inox/value.h"

struct BytesStorage {
  inox_ref header;
  size_t length;
  uint8_t bytes[];
};

#ifdef __cplusplus

#include "inox/string.h"
#include "inox/string_view.h"

class Uint8Array : public inox::Value {
public:
  Uint8Array();
  explicit Uint8Array(inox_value value);
  explicit Uint8Array(const inox::Value& value);
  explicit Uint8Array(inox::Value&& value);
  Uint8Array(inox::AdoptValue adopt, inox_value value);

  using inox::Value::operator=;
  using inox::Value::raw;
  using inox::Value::release;

  static Uint8Array create(size_t length);
  static Uint8Array create(inox_allocator* allocator, size_t length);
  static Uint8Array from(const uint8_t* bytes, size_t length);
  static Uint8Array from(inox_allocator* allocator, const uint8_t* bytes, size_t length);

  bool valid() const;
  size_t length() const;
  const uint8_t* bytes() const;
  uint8_t* bytes();
  uint8_t get(size_t index) const;
  void set(size_t index, uint8_t byte) const;
  Uint8Array slice(size_t start, size_t end) const;
  inox::String toString() const;
  BytesStorage* data() const;
};

class Buffer : public Uint8Array {
public:
  Buffer();
  explicit Buffer(inox_value value);
  explicit Buffer(const inox::Value& value);
  explicit Buffer(inox::Value&& value);
  explicit Buffer(const Uint8Array& value);
  explicit Buffer(Uint8Array&& value);
  Buffer(inox::AdoptValue adopt, inox_value value);

  using Uint8Array::operator=;
  using Uint8Array::raw;
  using Uint8Array::release;

  static Buffer alloc(size_t length);
  static Buffer from(const char* text);
  static Buffer from(inox::StringView text);
  static Buffer from(const uint8_t* bytes, size_t length);
  static Buffer from(inox_allocator* allocator, const uint8_t* bytes, size_t length);
  static bool isBuffer(inox_value value);
  static bool isBuffer(const inox::Value& value);

  Buffer slice(size_t start, size_t end) const;
  inox::String toString() const;
};

#endif

#endif
