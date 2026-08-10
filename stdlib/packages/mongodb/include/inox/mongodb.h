#ifndef INOX_MONGODB_H
#define INOX_MONGODB_H

#include <array>
#include <cstdint>
#include <memory>

#include "inox/binary.h"
#include "inox/promise.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

class MongoBsonCodec;
class MongoClientState;
class MongoDatabaseState;
class MongoCollectionState;
class MongoCursorState;

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

class MongoDatabase;

class MongoClient final {
public:
  MongoClient();
  explicit MongoClient(inox::StringView uri);
  MongoClient(inox::StringView uri, const inox::Value& options);
  explicit MongoClient(const inox::Value& value);
  explicit MongoClient(std::shared_ptr<MongoClientState> state);

  static inox::Promise connect(inox::StringView uri);
  static inox::Promise connect(inox::StringView uri, const inox::Value& options);
  static bool isMongoClient(const inox::Value& value);

  inox::Promise connect() const;
  MongoDatabase db() const;
  MongoDatabase db(inox::StringView name) const;
  inox::Promise bulkWrite(const inox::Value& models) const;
  inox::Promise bulkWrite(const inox::Value& models, const inox::Value& options) const;
  inox::Promise close() const;
  bool valid() const;
  inox::Value runtimeValue() const;

private:
  std::shared_ptr<MongoClientState> state_;

  friend class MongoDatabase;
  friend class MongoCollection;
};

class MongoCollection;

class MongoDatabase final {
public:
  MongoDatabase();
  explicit MongoDatabase(const inox::Value& value);

  static bool isMongoDatabase(const inox::Value& value);

  MongoCollection collection(inox::StringView name) const;
  bool valid() const;
  inox::Value runtimeValue() const;

private:
  std::shared_ptr<MongoDatabaseState> state_;

  explicit MongoDatabase(std::shared_ptr<MongoDatabaseState> state);

  friend class MongoClient;
  friend class MongoCollection;
};

class MongoCursor final {
public:
  MongoCursor();
  explicit MongoCursor(const inox::Value& value);
  explicit MongoCursor(std::shared_ptr<MongoCursorState> state);

  static bool isMongoCursor(const inox::Value& value);

  MongoCursor sort(const inox::Value& sort) const;
  MongoCursor limit(double limit) const;
  inox::Promise next() const;
  inox::Promise toArray() const;
  bool valid() const;
  inox::Value runtimeValue() const;

private:
  std::shared_ptr<MongoCursorState> state_;

  friend class MongoCollection;
};

class MongoCollection final {
public:
  MongoCollection();
  explicit MongoCollection(const inox::Value& value);

  static bool isMongoCollection(const inox::Value& value);

  MongoCursor find() const;
  MongoCursor find(const inox::Value& filter) const;
  inox::Promise findOne() const;
  inox::Promise findOne(const inox::Value& filter) const;
  inox::Promise findOneAndUpdate(const inox::Value& filter, const inox::Value& update) const;
  MongoCursor aggregate() const;
  MongoCursor aggregate(const inox::Value& pipeline) const;
  inox::Promise distinct(inox::StringView key) const;
  inox::Promise distinct(inox::StringView key, const inox::Value& filter) const;
  inox::Promise countDocuments() const;
  inox::Promise countDocuments(const inox::Value& filter) const;
  inox::Promise estimatedDocumentCount() const;
  inox::Promise createIndex(const inox::Value& indexSpec) const;
  inox::Promise createIndex(const inox::Value& indexSpec, const inox::Value& options) const;
  inox::Promise createIndexes(const inox::Value& indexSpecs) const;
  inox::Promise createIndexes(const inox::Value& indexSpecs, const inox::Value& options) const;
  inox::Promise bulkWrite(const inox::Value& operations) const;
  inox::Promise bulkWrite(const inox::Value& operations, const inox::Value& options) const;
  inox::Promise insertOne(const inox::Value& document) const;
  inox::Promise insertMany(const inox::Value& documents) const;
  inox::Promise updateOne(const inox::Value& filter, const inox::Value& update) const;
  inox::Promise updateMany(const inox::Value& filter, const inox::Value& update) const;
  inox::Promise deleteOne(const inox::Value& filter) const;
  inox::Promise deleteMany(const inox::Value& filter) const;
  bool valid() const;
  inox::Value runtimeValue() const;

private:
  std::shared_ptr<MongoCollectionState> state_;

  explicit MongoCollection(std::shared_ptr<MongoCollectionState> state);

  friend class MongoDatabase;
};

#endif
