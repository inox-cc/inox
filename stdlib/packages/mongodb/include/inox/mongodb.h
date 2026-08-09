#ifndef INOX_MONGODB_H
#define INOX_MONGODB_H

#include <array>
#include <cstdint>

#include "inox/binary.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

class MongoBsonCodec;

class MongoObjectId final {
public:
  MongoObjectId();
  explicit MongoObjectId(inox::StringView input);
  explicit MongoObjectId(const inox::Value& value);

  static MongoObjectId createFromTime(double time);
  static bool isValid(inox::StringView input);
  static bool isValid(const MongoObjectId& input);
  static bool isObjectId(const inox::Value& value);

  bool equals(inox::StringView otherId) const;
  bool equals(const MongoObjectId& otherId) const;
  inox::String toString() const;
  inox::Value runtimeValue() const;

private:
  std::array<std::uint8_t, 12> bytes_;

  explicit MongoObjectId(const std::array<std::uint8_t, 12>& bytes);

  friend class MongoBsonCodec;
};

class MongoBson final {
public:
  static Uint8Array serialize(const inox::Value& value);
  static inox::Value deserialize(const inox::Value& value);
};

#endif
