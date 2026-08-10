#include "inox/mongodb.h"

#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/error.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/time.h"
#include "loop-libuv-internal.h"

#include <bson/bson.h>
#include <mongoc/mongoc.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <memory>
#include <mutex>
#include <new>
#include <span>
#include <string>
#include <vector>

static inox_status inox_mongodb_object_id_copy(inox_allocator* allocator, const void* instance, void** out);
static void inox_mongodb_object_id_destroy(inox_allocator* allocator, void* instance);
static const inox_class_descriptor* inox_mongodb_object_id_descriptor();
static void inox_mongodb_throw(const char* message);
static void inox_mongodb_throw_oom();

static inox_status inox_mongodb_object_id_copy(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(MongoObjectId), alignof(MongoObjectId));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  new (memory) MongoObjectId(*(const MongoObjectId*)instance);
  *out = memory;
  return INOX_OK;
}

static void inox_mongodb_object_id_destroy(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  ((MongoObjectId*)instance)->~MongoObjectId();
  allocator->free(allocator->user, instance, sizeof(MongoObjectId), alignof(MongoObjectId));
}

static const inox_class_descriptor* inox_mongodb_object_id_descriptor() {
  static const inox_class_descriptor descriptor = {
    "ObjectId",
    0,
    nullptr,
    nullptr,
    inox_mongodb_object_id_copy,
    inox_mongodb_object_id_destroy,
    nullptr
  };

  return &descriptor;
}

static void inox_mongodb_throw(const char* message) {
  inox::String error(message);

  if (!error.valid()) {
    inox::throw_out_of_memory();
    return;
  }

  inox::throw_value(error);
}

static void inox_mongodb_throw_oom() {
  inox::throw_out_of_memory();
}

MongoObjectId::MongoObjectId() : bytes_{} {
  bson_oid_t oid;
  bson_oid_init(&oid, nullptr);
  std::copy(oid.bytes, oid.bytes + bytes_.size(), bytes_.begin());
}

MongoObjectId::MongoObjectId(inox::StringView input) : bytes_{} {
  if (!isValid(input)) {
    inox_mongodb_throw("TypeError: ObjectId input must be a 24 character hexadecimal string");
    return;
  }

  char text[25];
  std::memcpy(text, input.bytes, 24);
  text[24] = '\0';

  bson_oid_t oid;
  bson_oid_init_from_string(&oid, text);
  std::copy(oid.bytes, oid.bytes + bytes_.size(), bytes_.begin());
}

MongoObjectId::MongoObjectId(const inox::Value& value) : bytes_{} {
  if (inox::thrown()) {
    return;
  }

  if (!isObjectId(value)) {
    inox_mongodb_throw("TypeError: value is not an ObjectId");
    return;
  }

  const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
  bytes_ = ((const MongoObjectId*)ref->instance)->bytes_;
}

MongoObjectId::MongoObjectId(const std::array<std::uint8_t, 12>& bytes) : bytes_(bytes) {}

MongoObjectId MongoObjectId::createFromTime(double time) {
  std::array<std::uint8_t, 12> bytes{};
  double normalized = std::isfinite(time) ? std::fmod(std::trunc(time), 4294967296.0) : 0;

  if (normalized < 0) {
    normalized += 4294967296.0;
  }

  const std::uint32_t seconds = (std::uint32_t)normalized;
  bytes[0] = (std::uint8_t)(seconds >> 24);
  bytes[1] = (std::uint8_t)(seconds >> 16);
  bytes[2] = (std::uint8_t)(seconds >> 8);
  bytes[3] = (std::uint8_t)seconds;
  return MongoObjectId(bytes);
}

bool MongoObjectId::isValid(inox::StringView input) {
  return input.len == 24 && bson_oid_is_valid(input.bytes, input.len);
}

bool MongoObjectId::isValid(const MongoObjectId&) {
  return true;
}

bool MongoObjectId::isObjectId(const inox::Value& value) {
  if (value.tag != INOX_TAG_CLASS_INSTANCE || value.as.ref == nullptr) {
    return false;
  }

  const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
  return ref->descriptor == inox_mongodb_object_id_descriptor() && ref->instance != nullptr;
}

bool MongoObjectId::equals(inox::StringView otherId) const {
  if (!isValid(otherId)) {
    return false;
  }

  char text[25];
  std::memcpy(text, otherId.bytes, 24);
  text[24] = '\0';

  bson_oid_t other;
  bson_oid_init_from_string(&other, text);
  return std::equal(bytes_.begin(), bytes_.end(), other.bytes);
}

bool MongoObjectId::equals(const MongoObjectId& otherId) const {
  return bytes_ == otherId.bytes_;
}

inox::String MongoObjectId::toString() const {
  bson_oid_t oid;
  std::copy(bytes_.begin(), bytes_.end(), oid.bytes);

  char text[25];
  bson_oid_to_string(&oid, text);
  return inox::String(text, 24);
}

inox::Value MongoObjectId::runtimeValue() const {
  inox_value value = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(
    &inox_default_allocator,
    inox_mongodb_object_id_descriptor(),
    this,
    &value
  );

  if (status == INOX_ERR_OOM) {
    inox_mongodb_throw_oom();
  } else if (status != INOX_OK) {
    inox_mongodb_throw("TypeError: ObjectId could not cross the runtime value boundary");
  }

  return inox::adopt(value);
}

class MongoBsonCodec final {
public:
  static bool encodeDocument(bson_t* bson, const inox::Value& value, std::size_t depth) {
    if (bson == nullptr || value.tag != INOX_TAG_OBJECT || value.as.ref == nullptr) {
      inox_mongodb_throw("TypeError: BSON document must be a plain object");
      return false;
    }

    if (depth > 100) {
      inox_mongodb_throw("RangeError: BSON document nesting is too deep");
      return false;
    }

    const inox_object* object = (const inox_object*)value.as.ref;

    if (object->shape == nullptr) {
      inox_mongodb_throw("TypeError: BSON document has no object shape");
      return false;
    }

    for (std::uint32_t index = 0; index < object->shape->field_count; index += 1) {
      inox_value raw = inox_undefined_value();
      const inox_status status = inox_object_value_at(value.raw(), index, &raw);

      if (status != INOX_OK) {
        inox_release(raw);
        inox_mongodb_throw("TypeError: BSON document field could not be read");
        return false;
      }

      inox::Value field = inox::adopt(raw);

      if (field.tag == INOX_TAG_UNDEFINED) {
        continue;
      }

      const char* name = object->shape->fields[index].name;

      if (name == nullptr || !encodeValue(bson, name, std::strlen(name), field, false, depth + 1)) {
        return false;
      }
    }

    return true;
  }

  static bool encodeArray(bson_t* bson, const inox::Value& value, std::size_t depth) {
    Array array(value);

    if (!array.valid()) {
      inox_mongodb_throw("TypeError: BSON array value is invalid");
      return false;
    }

    if (depth > 100) {
      inox_mongodb_throw("RangeError: BSON document nesting is too deep");
      return false;
    }

    for (std::size_t index = 0; index < array.length(); index += 1) {
      char key[32];
      const int keyLength = std::snprintf(key, sizeof(key), "%zu", index);

      if (keyLength < 0 || (std::size_t)keyLength >= sizeof(key)) {
        inox_mongodb_throw("RangeError: BSON array index is too large");
        return false;
      }

      inox::Value item = array.get(index);

      if (inox::thrown() || !encodeValue(bson, key, (std::size_t)keyLength, item, true, depth + 1)) {
        return false;
      }
    }

    return true;
  }

  static bool encodeValue(
    bson_t* bson,
    const char* key,
    std::size_t keyLength,
    const inox::Value& value,
    bool arrayElement,
    std::size_t depth
  ) {
    if (bson == nullptr || key == nullptr || keyLength > (std::size_t)std::numeric_limits<int>::max()) {
      inox_mongodb_throw("RangeError: BSON key is too long");
      return false;
    }

    const int keySize = (int)keyLength;
    bool appended = false;

    switch (value.tag) {
      case INOX_TAG_UNDEFINED:
        return !arrayElement || bson_append_null(bson, key, keySize);
      case INOX_TAG_NULL:
        appended = bson_append_null(bson, key, keySize);
        break;
      case INOX_TAG_BOOL:
        appended = bson_append_bool(bson, key, keySize, value.as.boolean);
        break;
      case INOX_TAG_NUMBER:
        appended = bson_append_double(bson, key, keySize, value.as.number);
        break;
      case INOX_TAG_STRING: {
        inox::String string(value);

        if (!string.valid() || string.length() > (std::size_t)std::numeric_limits<int>::max()) {
          inox_mongodb_throw("RangeError: BSON string is invalid or too long");
          return false;
        }

        appended = bson_append_utf8(bson, key, keySize, string.bytes(), (int)string.length());
        break;
      }
      case INOX_TAG_BYTES: {
        Uint8Array bytes(value);

        if (!bytes.valid() || bytes.length() > (std::size_t)std::numeric_limits<std::uint32_t>::max()) {
          inox_mongodb_throw("RangeError: BSON binary value is invalid or too large");
          return false;
        }

        const std::span<const std::uint8_t> data = bytes.bytes();
        appended = bson_append_binary(
          bson,
          key,
          keySize,
          BSON_SUBTYPE_BINARY,
          data.data(),
          (std::uint32_t)data.size()
        );
        break;
      }
      case INOX_TAG_ARRAY: {
        bson_t child;

        if (!bson_append_array_unsafe_begin(bson, key, keySize, &child)) {
          appended = false;
          break;
        }

        const bool encoded = encodeArray(&child, value, depth);
        const bool ended = bson_append_array_end(bson, &child);
        appended = encoded && ended;
        break;
      }
      case INOX_TAG_OBJECT: {
        bson_t child;

        if (!bson_append_document_begin(bson, key, keySize, &child)) {
          appended = false;
          break;
        }

        const bool encoded = encodeDocument(&child, value, depth);
        const bool ended = bson_append_document_end(bson, &child);
        appended = encoded && ended;
        break;
      }
      case INOX_TAG_CLASS_INSTANCE:
        if (MongoObjectId::isObjectId(value)) {
          const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
          const MongoObjectId* objectId = (const MongoObjectId*)ref->instance;
          bson_oid_t oid;
          std::copy(objectId->bytes_.begin(), objectId->bytes_.end(), oid.bytes);
          appended = bson_append_oid(bson, key, keySize, &oid);
        } else if (DateValue::isDate(value)) {
          DateValue date(value);

          if (inox::thrown()) {
            return false;
          }

          if (
            !std::isfinite(date.getTime()) ||
            date.getTime() < (double)std::numeric_limits<std::int64_t>::min() ||
            date.getTime() > (double)std::numeric_limits<std::int64_t>::max()
          ) {
            inox_mongodb_throw("RangeError: Date is outside the BSON date range");
            return false;
          }

          appended = bson_append_date_time(bson, key, keySize, (std::int64_t)date.getTime());
        } else {
          inox_mongodb_throw("TypeError: BSON does not support this class instance");
          return false;
        }
        break;
      default:
        inox_mongodb_throw("TypeError: BSON does not support this value type");
        return false;
    }

    if (!appended && !inox::thrown()) {
      inox_mongodb_throw_oom();
    }

    return appended;
  }

  static inox::Value decodeDocument(const bson_t* bson, bool array, std::size_t depth) {
    if (bson == nullptr || depth > 100) {
      inox_mongodb_throw("RangeError: BSON document nesting is too deep");
      return inox::Value();
    }

    bson_iter_t iterator;

    if (!bson_iter_init(&iterator, bson)) {
      inox_mongodb_throw("TypeError: BSON document is invalid");
      return inox::Value();
    }

    if (array) {
      Array result = Array::create(0);

      while (bson_iter_next(&iterator)) {
        inox::Value value = decodeValue(&iterator, depth + 1);

        if (inox::thrown()) {
          return inox::Value();
        }

        result.push(value);

        if (inox::thrown()) {
          return inox::Value();
        }
      }

      return result;
    }

    std::vector<std::string> names;
    std::vector<inox::Value> values;
    names.reserve(bson_count_keys(bson));
    values.reserve(bson_count_keys(bson));

    while (bson_iter_next(&iterator)) {
      names.emplace_back(bson_iter_key(&iterator), bson_iter_key_len(&iterator));
      values.push_back(decodeValue(&iterator, depth + 1));

      if (inox::thrown()) {
        return inox::Value();
      }
    }

    return createObject(names, values);
  }

  static inox::Value decodeValue(const bson_iter_t* iterator, std::size_t depth) {
    if (iterator == nullptr) {
      inox_mongodb_throw("TypeError: BSON element is invalid");
      return inox::Value();
    }

    switch (bson_iter_type(iterator)) {
      case BSON_TYPE_DOUBLE:
        return inox::Value(inox_number_value(bson_iter_double(iterator)));
      case BSON_TYPE_UTF8: {
        std::uint32_t length = 0;
        const char* bytes = bson_iter_utf8(iterator, &length);
        inox::String result(bytes, length);

        if (!result.valid()) {
          inox_mongodb_throw_oom();
        }

        return result;
      }
      case BSON_TYPE_DOCUMENT:
      case BSON_TYPE_ARRAY: {
        std::uint32_t length = 0;
        const std::uint8_t* data = nullptr;

        if (bson_iter_type(iterator) == BSON_TYPE_ARRAY) {
          bson_iter_array(iterator, &length, &data);
        } else {
          bson_iter_document(iterator, &length, &data);
        }

        bson_t child;

        if (data == nullptr || !bson_init_static(&child, data, length)) {
          inox_mongodb_throw("TypeError: nested BSON document is invalid");
          return inox::Value();
        }

        return decodeDocument(&child, bson_iter_type(iterator) == BSON_TYPE_ARRAY, depth);
      }
      case BSON_TYPE_BINARY: {
        bson_subtype_t subtype = BSON_SUBTYPE_BINARY;
        std::uint32_t length = 0;
        const std::uint8_t* data = nullptr;
        bson_iter_binary(iterator, &subtype, &length, &data);

        if (subtype != BSON_SUBTYPE_BINARY) {
          inox_mongodb_throw("TypeError: unsupported BSON binary subtype");
          return inox::Value();
        }

        Uint8Array result(std::span<const std::uint8_t>(data, length));

        if (!result.valid()) {
          inox_mongodb_throw_oom();
        }

        return result;
      }
      case BSON_TYPE_UNDEFINED:
        return inox::Value();
      case BSON_TYPE_OID: {
        const bson_oid_t* oid = bson_iter_oid(iterator);
        std::array<std::uint8_t, 12> bytes{};
        std::copy(oid->bytes, oid->bytes + bytes.size(), bytes.begin());
        return MongoObjectId(bytes).runtimeValue();
      }
      case BSON_TYPE_BOOL:
        return inox::Value(inox_bool_value(bson_iter_bool(iterator)));
      case BSON_TYPE_DATE_TIME:
        return DateValue((double)bson_iter_date_time(iterator)).runtimeValue();
      case BSON_TYPE_NULL:
        return inox::Value(inox_null_value());
      case BSON_TYPE_INT32:
        return inox::Value(inox_number_value((double)bson_iter_int32(iterator)));
      case BSON_TYPE_INT64: {
        const std::int64_t integer = bson_iter_int64(iterator);
        constexpr std::int64_t safeInteger = 9007199254740991LL;

        if (integer < -safeInteger || integer > safeInteger) {
          inox_mongodb_throw("RangeError: BSON integer is outside the safe number range");
          return inox::Value();
        }

        return inox::Value(inox_number_value((double)integer));
      }
      default:
        inox_mongodb_throw("TypeError: unsupported BSON element type");
        return inox::Value();
    }
  }

  static inox::Value createObject(const std::vector<std::string>& names, const std::vector<inox::Value>& values) {
    if (names.size() != values.size() || names.size() > std::numeric_limits<std::uint32_t>::max()) {
      inox_mongodb_throw("RangeError: BSON document has too many fields");
      return inox::Value();
    }

    inox_allocator* allocator = &inox_default_allocator;

    if (allocator->alloc == nullptr || allocator->free == nullptr) {
      inox_mongodb_throw("TypeError: BSON object allocator is unavailable");
      return inox::Value();
    }

    inox_shape* shape = (inox_shape*)allocator->alloc(allocator->user, sizeof(inox_shape), alignof(inox_shape));

    if (shape == nullptr) {
      inox_mongodb_throw_oom();
      return inox::Value();
    }

    shape->field_count = (std::uint32_t)names.size();
    inox_field_info* fields = names.empty()
                                ? nullptr
                                : (inox_field_info*)allocator->alloc(
                                    allocator->user,
                                    sizeof(inox_field_info) * names.size(),
                                    alignof(inox_field_info)
                                  );

    if (!names.empty() && fields == nullptr) {
      allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
      inox_mongodb_throw_oom();
      return inox::Value();
    }

    shape->fields = fields;
    std::size_t initialized = 0;

    for (; initialized < names.size(); initialized += 1) {
      char* name = (char*)allocator->alloc(allocator->user, names[initialized].size() + 1, alignof(char));

      if (name == nullptr) {
        break;
      }

      std::memcpy(name, names[initialized].data(), names[initialized].size());
      name[names[initialized].size()] = '\0';
      fields[initialized].name = name;
      fields[initialized].flags = 0;
    }

    if (initialized != names.size()) {
      for (std::size_t index = 0; index < initialized; index += 1) {
        allocator->free(
          allocator->user,
          (void*)fields[index].name,
          names[index].size() + 1,
          alignof(char)
        );
      }

      if (fields != nullptr) {
        allocator->free(
          allocator->user,
          fields,
          sizeof(inox_field_info) * names.size(),
          alignof(inox_field_info)
        );
      }

      allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));
      inox_mongodb_throw_oom();
      return inox::Value();
    }

    inox_value raw = inox_undefined_value();
    const inox_status createStatus = inox_object_new(allocator, shape, &raw);

    if (createStatus != INOX_OK) {
      for (std::size_t index = 0; index < names.size(); index += 1) {
        allocator->free(
          allocator->user,
          (void*)fields[index].name,
          names[index].size() + 1,
          alignof(char)
        );
      }

      if (fields != nullptr) {
        allocator->free(
          allocator->user,
          fields,
          sizeof(inox_field_info) * names.size(),
          alignof(inox_field_info)
        );
      }

      allocator->free(allocator->user, shape, sizeof(inox_shape), alignof(inox_shape));

      if (createStatus == INOX_ERR_OOM) {
        inox_mongodb_throw_oom();
      } else {
        inox_mongodb_throw("TypeError: BSON object could not be allocated");
      }

      return inox::Value();
    }

    inox_object* object = (inox_object*)raw.as.ref;
    object->header.flags |= INOX_OBJECT_OWNED_SHAPE;

    for (std::uint32_t index = 0; index < shape->field_count; index += 1) {
      const inox_status initStatus = inox_object_init_known(raw, index, values[index].raw());

      if (initStatus != INOX_OK) {
        inox_release(raw);

        if (initStatus == INOX_ERR_OOM) {
          inox_mongodb_throw_oom();
        } else {
          inox_mongodb_throw("TypeError: BSON object field could not be initialized");
        }

        return inox::Value();
      }
    }

    return inox::adopt(raw);
  }
};

Uint8Array MongoBson::serialize(const inox::Value& value) {
  if (inox::thrown()) {
    return Uint8Array();
  }

  try {
    bson_t bson;
    bson_init(&bson);
    const bool encoded = MongoBsonCodec::encodeDocument(&bson, value, 0);
    Uint8Array result;

    if (encoded) {
      result = Uint8Array(std::span<const std::uint8_t>(bson_get_data(&bson), bson.len));

      if (!result.valid()) {
        inox_mongodb_throw_oom();
      }
    }

    bson_destroy(&bson);
    return result;
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return Uint8Array();
  }
}

inox::Value MongoBson::deserialize(const inox::Value& value) {
  if (inox::thrown()) {
    return inox::Value();
  }

  try {
    Uint8Array bytes(value);

    if (!bytes.valid()) {
      inox_mongodb_throw("TypeError: BSON.deserialize expects a Uint8Array");
      return inox::Value();
    }

    const std::span<const std::uint8_t> data = bytes.bytes();
    bson_t bson;
    std::size_t invalidOffset = 0;

    if (
      data.empty() || !bson_init_static(&bson, data.data(), data.size()) ||
      !bson_validate(&bson, BSON_VALIDATE_UTF8, &invalidOffset)
    ) {
      inox_mongodb_throw("TypeError: BSON input is invalid");
      return inox::Value();
    }

    return MongoBsonCodec::decodeDocument(&bson, false, 0);
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return inox::Value();
  }
}

class MongoClientState final {
public:
  mongoc_client_pool_t* pool = nullptr;
  std::string defaultDatabase;
  bool closed = false;
  std::size_t activeJobs = 0;
  std::vector<inox::Promise> closeWaiters;

  ~MongoClientState() {
    if (pool != nullptr) {
      mongoc_client_pool_destroy(pool);
    }
  }

  void finishJob() {
    if (activeJobs > 0) {
      activeJobs -= 1;
    }

    if (!closed || activeJobs != 0) {
      return;
    }

    if (pool != nullptr) {
      mongoc_client_pool_destroy(pool);
      pool = nullptr;
    }

    for (const inox::Promise& waiter : closeWaiters) {
      const inox_status status = waiter.fulfill(inox::Value());

      if (status != INOX_OK) {
        inox_libuv_loop_report_status(inox::loop(), status);
      }
    }

    closeWaiters.clear();
  }
};

class MongoDatabaseState final {
public:
  std::shared_ptr<MongoClientState> client;
  std::string name;
};

class MongoCollectionState final {
public:
  std::shared_ptr<MongoClientState> client;
  std::string database;
  std::string name;
};

enum class MongoCursorMode {
  find,
  aggregate
};

class MongoCursorState final {
public:
  std::shared_ptr<MongoClientState> client;
  std::string database;
  std::string collection;
  MongoCursorMode mode = MongoCursorMode::find;
  bson_t* source = nullptr;
  bson_t* sort = nullptr;
  std::int64_t limit = 0;
  std::int64_t offset = 0;
  bool active = false;
  bool exhausted = false;

  ~MongoCursorState() {
    bson_destroy(source);
    bson_destroy(sort);
  }
};

enum class MongoJobKind {
  connect,
  clientBulkWrite,
  cursorNext,
  cursorToArray,
  distinct,
  countDocuments,
  estimatedDocumentCount,
  createIndex,
  createIndexes,
  collectionBulkWrite,
  findOne,
  findOneAndUpdate,
  insertOne,
  insertMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany
};

struct MongoJob final {
  uv_work_t request{};
  MongoJobKind kind = MongoJobKind::connect;
  std::shared_ptr<MongoClientState> client;
  std::shared_ptr<MongoCursorState> cursor;
  inox::Promise promise;
  std::string database;
  std::string collection;
  bson_t* first = nullptr;
  bson_t* second = nullptr;
  std::vector<bson_t*> documents;
  bson_t* result = nullptr;
  std::string text;
  std::string textResult;
  double numberResult = 0;
  std::size_t resultCount = 0;
  bool arrayResult = false;
  bool nullResult = false;
  bool stringResult = false;
  std::array<char, 512> error{};

  ~MongoJob() {
    bson_destroy(first);
    bson_destroy(second);
    bson_destroy(result);

    for (bson_t* document : documents) {
      bson_destroy(document);
    }
  }

  void fail(const char* message) {
    std::snprintf(error.data(), error.size(), "%s", message == nullptr ? "MongoDB operation failed" : message);
  }

  void fail(const bson_error_t& source) {
    std::snprintf(
      error.data(),
      error.size(),
      "MongoServerError: %s",
      source.message[0] == '\0' ? "MongoDB operation failed" : source.message
    );
  }

  bool failed() const {
    return error[0] != '\0';
  }
};

using MongoIndexModelHandle = std::unique_ptr<mongoc_index_model_t, decltype(&mongoc_index_model_destroy)>;
using MongoCollectionBulkHandle = std::unique_ptr<mongoc_bulk_operation_t, decltype(&mongoc_bulk_operation_destroy)>;
using MongoClientBulkHandle = std::unique_ptr<mongoc_bulkwrite_t, decltype(&mongoc_bulkwrite_destroy)>;
using MongoClientBulkOptionsHandle =
  std::unique_ptr<mongoc_bulkwriteopts_t, decltype(&mongoc_bulkwriteopts_destroy)>;
using MongoClientUpdateOneOptionsHandle =
  std::unique_ptr<mongoc_bulkwrite_updateoneopts_t, decltype(&mongoc_bulkwrite_updateoneopts_destroy)>;
using MongoClientUpdateManyOptionsHandle =
  std::unique_ptr<mongoc_bulkwrite_updatemanyopts_t, decltype(&mongoc_bulkwrite_updatemanyopts_destroy)>;
using MongoClientReplaceOneOptionsHandle =
  std::unique_ptr<mongoc_bulkwrite_replaceoneopts_t, decltype(&mongoc_bulkwrite_replaceoneopts_destroy)>;

template <typename T>
static inox_status inox_mongodb_facade_copy(inox_allocator* allocator, const void* instance, void** out) {
  if (allocator == nullptr || allocator->alloc == nullptr || instance == nullptr || out == nullptr) {
    return INOX_ERR_TYPE;
  }

  void* memory = allocator->alloc(allocator->user, sizeof(T), alignof(T));

  if (memory == nullptr) {
    *out = nullptr;
    return INOX_ERR_OOM;
  }

  new (memory) T(*(const T*)instance);
  *out = memory;
  return INOX_OK;
}

template <typename T>
static void inox_mongodb_facade_destroy(inox_allocator* allocator, void* instance) {
  if (allocator == nullptr || allocator->free == nullptr || instance == nullptr) {
    return;
  }

  ((T*)instance)->~T();
  allocator->free(allocator->user, instance, sizeof(T), alignof(T));
}

static const inox_class_descriptor* inox_mongodb_client_descriptor() {
  static const inox_class_descriptor descriptor = {
    "MongoClient",
    0,
    nullptr,
    nullptr,
    inox_mongodb_facade_copy<MongoClient>,
    inox_mongodb_facade_destroy<MongoClient>,
    nullptr
  };
  return &descriptor;
}

static const inox_class_descriptor* inox_mongodb_database_descriptor() {
  static const inox_class_descriptor descriptor = {
    "Db",
    0,
    nullptr,
    nullptr,
    inox_mongodb_facade_copy<MongoDatabase>,
    inox_mongodb_facade_destroy<MongoDatabase>,
    nullptr
  };
  return &descriptor;
}

static const inox_class_descriptor* inox_mongodb_collection_descriptor() {
  static const inox_class_descriptor descriptor = {
    "Collection",
    0,
    nullptr,
    nullptr,
    inox_mongodb_facade_copy<MongoCollection>,
    inox_mongodb_facade_destroy<MongoCollection>,
    nullptr
  };
  return &descriptor;
}

static const inox_class_descriptor* inox_mongodb_cursor_descriptor() {
  static const inox_class_descriptor descriptor = {
    "MongoCursor",
    0,
    nullptr,
    nullptr,
    inox_mongodb_facade_copy<MongoCursor>,
    inox_mongodb_facade_destroy<MongoCursor>,
    nullptr
  };
  return &descriptor;
}

template <typename T>
static bool inox_mongodb_is_facade(const inox::Value& value, const inox_class_descriptor* descriptor) {
  if (value.tag != INOX_TAG_CLASS_INSTANCE || value.as.ref == nullptr) {
    return false;
  }

  const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
  return ref->descriptor == descriptor && ref->instance != nullptr;
}

template <typename T>
static inox::Value inox_mongodb_facade_runtime_value(const T& facade, const inox_class_descriptor* descriptor) {
  inox_value result = inox_undefined_value();
  const inox_status status = inox_class_instance_ref_copy(&inox_default_allocator, descriptor, &facade, &result);

  if (status == INOX_ERR_OOM) {
    inox_mongodb_throw_oom();
  } else if (status != INOX_OK) {
    inox_mongodb_throw("TypeError: MongoDB facade could not cross the runtime value boundary");
  }

  return inox::adopt(result);
}

template <typename T>
static const T* inox_mongodb_facade_instance(const inox::Value& value, const inox_class_descriptor* descriptor) {
  if (!inox_mongodb_is_facade<T>(value, descriptor)) {
    return nullptr;
  }

  const inox_class_instance_ref* ref = (const inox_class_instance_ref*)value.as.ref;
  return (const T*)ref->instance;
}

static bool inox_mongodb_copy_string(inox::StringView value, std::string& out, const char* label) {
  if (value.bytes == nullptr || std::memchr(value.bytes, '\0', value.len) != nullptr) {
    inox_mongodb_throw(label);
    return false;
  }

  try {
    out.assign(value.bytes, value.len);
    return true;
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return false;
  }
}

static bool inox_mongodb_read_number_option(
  const inox::Value& options,
  const char* name,
  std::int32_t minimum,
  std::int32_t* out
) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return false;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return true;
  }

  if (
    value.tag != INOX_TAG_NUMBER || !std::isfinite(value.as.number) || value.as.number != std::trunc(value.as.number) ||
    value.as.number < minimum || value.as.number > std::numeric_limits<std::int32_t>::max()
  ) {
    inox_mongodb_throw("TypeError: MongoClient numeric option is invalid");
    return false;
  }

  *out = (std::int32_t)value.as.number;
  return true;
}

static std::shared_ptr<MongoClientState> inox_mongodb_create_client_state(
  inox::StringView uriText,
  const inox::Value* options
) {
  static std::once_flag initFlag;
  std::call_once(initFlag, []() { mongoc_init(); });

  std::string uriBytes;

  if (!inox_mongodb_copy_string(uriText, uriBytes, "TypeError: MongoClient URI is invalid")) {
    return {};
  }

  bson_error_t error{};
  mongoc_uri_t* uri = mongoc_uri_new_with_error(uriBytes.c_str(), &error);

  if (uri == nullptr) {
    inox_mongodb_throw(error.message);
    return {};
  }

  std::int32_t maxPoolSize = 0;
  std::int32_t serverSelectionTimeout = -1;
  std::string appName;

  if (options != nullptr) {
    if (options->tag != INOX_TAG_OBJECT || options->as.ref == nullptr) {
      mongoc_uri_destroy(uri);
      inox_mongodb_throw("TypeError: MongoClient options must be an object");
      return {};
    }

    inox::Value appNameValue = inox::get(options->raw(), "appName");

    if (inox::thrown()) {
      mongoc_uri_destroy(uri);
      return {};
    }

    if (appNameValue.tag != INOX_TAG_UNDEFINED) {
      inox::String appNameString(appNameValue);

      if (!appNameString.valid()) {
        mongoc_uri_destroy(uri);
        inox_mongodb_throw("TypeError: MongoClient appName must be a string");
        return {};
      }

      if (
        !inox_mongodb_copy_string(
          inox::StringView(appNameString.bytes(), appNameString.length()),
          appName,
          "TypeError: MongoClient appName is invalid"
        )
      ) {
        mongoc_uri_destroy(uri);
        return {};
      }
    }

    if (
      !inox_mongodb_read_number_option(*options, "maxPoolSize", 1, &maxPoolSize) ||
      !inox_mongodb_read_number_option(*options, "serverSelectionTimeoutMS", 0, &serverSelectionTimeout)
    ) {
      mongoc_uri_destroy(uri);
      return {};
    }
  }

  if (
    serverSelectionTimeout >= 0 &&
    !mongoc_uri_set_option_as_int32(uri, MONGOC_URI_SERVERSELECTIONTIMEOUTMS, serverSelectionTimeout)
  ) {
    mongoc_uri_destroy(uri);
    inox_mongodb_throw("TypeError: MongoClient serverSelectionTimeoutMS is invalid");
    return {};
  }

  mongoc_client_pool_t* pool = mongoc_client_pool_new_with_error(uri, &error);

  if (pool == nullptr) {
    mongoc_uri_destroy(uri);
    inox_mongodb_throw(error.message);
    return {};
  }

  const char* database = mongoc_uri_get_database(uri);

  try {
    std::shared_ptr<MongoClientState> state = std::make_shared<MongoClientState>();
    state->pool = pool;
    state->defaultDatabase = database == nullptr || database[0] == '\0' ? "test" : database;
    mongoc_client_pool_set_error_api(pool, 2);

    if (maxPoolSize > 0) {
      mongoc_client_pool_max_size(pool, (std::uint32_t)maxPoolSize);
    }

    if (!appName.empty() && !mongoc_client_pool_set_appname(pool, appName.c_str())) {
      mongoc_uri_destroy(uri);
      inox_mongodb_throw("TypeError: MongoClient appName is invalid");
      return {};
    }

    mongoc_uri_destroy(uri);
    return state;
  } catch (const std::bad_alloc&) {
    mongoc_client_pool_destroy(pool);
    mongoc_uri_destroy(uri);
    inox_mongodb_throw_oom();
    return {};
  }
}

static bson_t* inox_mongodb_encode_owned_document(const inox::Value& value) {
  bson_t* document = bson_new();

  if (document == nullptr) {
    inox_mongodb_throw_oom();
    return nullptr;
  }

  if (!MongoBsonCodec::encodeDocument(document, value, 0)) {
    bson_destroy(document);
    return nullptr;
  }

  return document;
}

static bson_t* inox_mongodb_encode_owned_array(const inox::Value& value, const char* label) {
  bson_t* array = bson_new();

  if (array == nullptr) {
    inox_mongodb_throw_oom();
    return nullptr;
  }

  if (value.tag != INOX_TAG_ARRAY || !MongoBsonCodec::encodeArray(array, value, 0)) {
    bson_destroy(array);

    if (!inox::thrown()) {
      inox_mongodb_throw(label);
    }

    return nullptr;
  }

  return array;
}

static bool inox_mongodb_ensure_id(bson_t* document) {
  if (document == nullptr) {
    return false;
  }

  if (bson_has_field(document, "_id")) {
    return true;
  }

  bson_oid_t oid;
  bson_oid_init(&oid, nullptr);
  return BSON_APPEND_OID(document, "_id", &oid);
}

static bson_t* inox_mongodb_normalize_insert_result(const MongoJob& job, const bson_t* reply) {
  bson_t* result = bson_new();

  if (result == nullptr || !BSON_APPEND_BOOL(result, "acknowledged", true)) {
    bson_destroy(result);
    return nullptr;
  }

  bson_iter_t iterator;

  if (job.kind == MongoJobKind::insertOne) {
    if (!bson_iter_init_find(&iterator, reply, "insertedId") || !bson_append_value(result, "insertedId", -1, bson_iter_value(&iterator))) {
      bson_destroy(result);
      return nullptr;
    }

    return result;
  }

  if (!BSON_APPEND_INT64(result, "insertedCount", (std::int64_t)job.documents.size())) {
    bson_destroy(result);
    return nullptr;
  }

  bson_t ids;

  if (!bson_append_document_begin(result, "insertedIds", -1, &ids)) {
    bson_destroy(result);
    return nullptr;
  }

  for (std::size_t index = 0; index < job.documents.size(); index += 1) {
    char key[32];
    const int keyLength = std::snprintf(key, sizeof(key), "%zu", index);
    bson_iter_t id;

    if (
      keyLength < 0 || !bson_iter_init_find(&id, job.documents[index], "_id") ||
      !bson_append_value(&ids, key, keyLength, bson_iter_value(&id))
    ) {
      bson_destroy(result);
      return nullptr;
    }
  }

  if (!bson_append_document_end(result, &ids)) {
    bson_destroy(result);
    return nullptr;
  }

  return result;
}

static bson_t* inox_mongodb_normalize_update_result(const bson_t* reply) {
  bson_t* result = bson_new();

  if (result == nullptr || !BSON_APPEND_BOOL(result, "acknowledged", true)) {
    bson_destroy(result);
    return nullptr;
  }

  const char* fields[] = { "matchedCount", "modifiedCount", "upsertedId" };

  for (const char* field : fields) {
    bson_iter_t iterator;

    if (bson_iter_init_find(&iterator, reply, field) && !bson_append_value(result, field, -1, bson_iter_value(&iterator))) {
      bson_destroy(result);
      return nullptr;
    }
  }

  bson_iter_t upserted;
  const bool hasUpsertedId = bson_iter_init_find(&upserted, reply, "upsertedId");

  if (
    !BSON_APPEND_INT32(result, "upsertedCount", hasUpsertedId ? 1 : 0) ||
    (!hasUpsertedId && !BSON_APPEND_NULL(result, "upsertedId"))
  ) {
    bson_destroy(result);
    return nullptr;
  }

  return result;
}

static bson_t* inox_mongodb_normalize_delete_result(const bson_t* reply) {
  bson_t* result = bson_new();
  bson_iter_t deletedCount;

  if (
    result == nullptr || !BSON_APPEND_BOOL(result, "acknowledged", true) ||
    !bson_iter_init_find(&deletedCount, reply, "deletedCount") ||
    !bson_append_value(result, "deletedCount", -1, bson_iter_value(&deletedCount))
  ) {
    bson_destroy(result);
    return nullptr;
  }

  return result;
}

static bool inox_mongodb_bson_document_field(const bson_t* source, const char* name, bson_t& result) {
  bson_iter_t iterator;

  if (!bson_iter_init_find(&iterator, source, name) || !BSON_ITER_HOLDS_DOCUMENT(&iterator)) {
    return false;
  }

  std::uint32_t length = 0;
  const std::uint8_t* data = nullptr;
  bson_iter_document(&iterator, &length, &data);
  return data != nullptr && bson_init_static(&result, data, length);
}

static bool inox_mongodb_bson_string_field(
  const bson_t* source,
  const char* name,
  std::string& result
) {
  bson_iter_t iterator;

  if (!bson_iter_init_find(&iterator, source, name) || !BSON_ITER_HOLDS_UTF8(&iterator)) {
    return false;
  }

  std::uint32_t length = 0;
  const char* value = bson_iter_utf8(&iterator, &length);
  result.assign(value, length);
  return true;
}

static bool inox_mongodb_bson_optional_bool(
  const bson_t* source,
  const char* name,
  bool& result,
  MongoJob& job
) {
  bson_iter_t iterator;

  if (!bson_iter_init_find(&iterator, source, name)) {
    return true;
  }

  if (!BSON_ITER_HOLDS_BOOL(&iterator)) {
    job.fail("TypeError: MongoDB bulk write boolean option is invalid");
    return false;
  }

  result = bson_iter_bool(&iterator);
  return true;
}

static bool inox_mongodb_index_direction(const bson_iter_t& iterator, std::string& result) {
  char buffer[64];
  int length = -1;

  if (BSON_ITER_HOLDS_DOUBLE(&iterator)) {
    const double value = bson_iter_double(&iterator);

    if (!std::isfinite(value)) {
      return false;
    }

    length = std::snprintf(buffer, sizeof(buffer), "%.17g", value);
  } else if (BSON_ITER_HOLDS_INT32(&iterator)) {
    length = std::snprintf(buffer, sizeof(buffer), "%d", bson_iter_int32(&iterator));
  } else if (BSON_ITER_HOLDS_INT64(&iterator)) {
    length = std::snprintf(buffer, sizeof(buffer), "%lld", (long long)bson_iter_int64(&iterator));
  } else if (BSON_ITER_HOLDS_UTF8(&iterator)) {
    std::uint32_t valueLength = 0;
    const char* value = bson_iter_utf8(&iterator, &valueLength);
    result.assign(value, valueLength);
    return true;
  } else {
    return false;
  }

  if (length < 0 || (std::size_t)length >= sizeof(buffer)) {
    return false;
  }

  result.assign(buffer, (std::size_t)length);
  return true;
}

static bool inox_mongodb_index_name(
  const bson_t* keys,
  const bson_t* options,
  std::string& result,
  MongoJob& job
) {
  bson_iter_t customName;

  if (options != nullptr && bson_iter_init_find(&customName, options, "name")) {
    if (!BSON_ITER_HOLDS_UTF8(&customName)) {
      job.fail("TypeError: MongoDB index name must be a string");
      return false;
    }

    std::uint32_t length = 0;
    const char* value = bson_iter_utf8(&customName, &length);
    result.assign(value, length);
    return true;
  }

  bson_iter_t iterator;

  if (!bson_iter_init(&iterator, keys)) {
    job.fail("TypeError: MongoDB index specification is invalid");
    return false;
  }

  while (bson_iter_next(&iterator)) {
    std::string direction;

    if (!inox_mongodb_index_direction(iterator, direction)) {
      job.fail("TypeError: MongoDB index direction must be a number or string");
      return false;
    }

    if (!result.empty()) {
      result.push_back('_');
    }

    result.append(bson_iter_key(&iterator), bson_iter_key_len(&iterator));
    result.push_back('_');
    result.append(direction);
  }

  if (result.empty()) {
    job.fail("MongoInvalidArgumentError: MongoDB index specification must not be empty");
    return false;
  }

  return true;
}

static bool inox_mongodb_run_create_indexes_job(
  MongoJob& job,
  mongoc_collection_t* collection,
  bson_error_t& error
) {
  std::vector<MongoIndexModelHandle> models;
  std::vector<std::string> names;

  if (job.kind == MongoJobKind::createIndex) {
    std::string name;

    if (!inox_mongodb_index_name(job.first, job.second, name, job)) {
      return false;
    }

    if (!bson_has_field(job.second, "name") && !BSON_APPEND_UTF8(job.second, "name", name.c_str())) {
      return false;
    }

    MongoIndexModelHandle model(mongoc_index_model_new(job.first, job.second), mongoc_index_model_destroy);

    if (!model) {
      job.fail("MongoRuntimeError: MongoDB index model could not be created");
      return false;
    }

    models.push_back(std::move(model));
    names.push_back(std::move(name));
  } else {
    bson_iter_t iterator;

    if (!bson_iter_init(&iterator, job.first)) {
      job.fail("TypeError: MongoDB index descriptions are invalid");
      return false;
    }

    while (bson_iter_next(&iterator)) {
      if (!BSON_ITER_HOLDS_DOCUMENT(&iterator)) {
        job.fail("TypeError: MongoDB index description must be an object");
        return false;
      }

      std::uint32_t length = 0;
      const std::uint8_t* data = nullptr;
      bson_iter_document(&iterator, &length, &data);
      bson_t description;
      bson_t keys;
      bson_t options;
      bson_init(&options);

      if (
        data == nullptr || !bson_init_static(&description, data, length) ||
        !inox_mongodb_bson_document_field(&description, "key", keys)
      ) {
        bson_destroy(&options);
        job.fail("TypeError: MongoDB index description requires a key document");
        return false;
      }

      bson_copy_to_excluding_noinit(&description, &options, "key", nullptr);
      std::string name;

      if (!inox_mongodb_index_name(&keys, &options, name, job)) {
        bson_destroy(&options);
        return false;
      }

      if (!bson_has_field(&options, "name") && !BSON_APPEND_UTF8(&options, "name", name.c_str())) {
        bson_destroy(&options);
        return false;
      }

      MongoIndexModelHandle model(mongoc_index_model_new(&keys, &options), mongoc_index_model_destroy);
      bson_destroy(&options);

      if (!model) {
        job.fail("MongoRuntimeError: MongoDB index model could not be created");
        return false;
      }

      models.push_back(std::move(model));
      names.push_back(std::move(name));
    }
  }

  if (models.empty()) {
    job.fail("MongoInvalidArgumentError: MongoDB index list must not be empty");
    return false;
  }

  bson_t reply;
  bson_init(&reply);
  std::vector<mongoc_index_model_t*> modelPointers;
  modelPointers.reserve(models.size());

  for (const MongoIndexModelHandle& model : models) {
    modelPointers.push_back(model.get());
  }

  const bool succeeded = mongoc_collection_create_indexes_with_opts(
    collection,
    modelPointers.data(),
    modelPointers.size(),
    job.kind == MongoJobKind::createIndexes ? job.second : nullptr,
    &reply,
    &error
  );
  bson_destroy(&reply);

  if (!succeeded) {
    return false;
  }

  if (job.kind == MongoJobKind::createIndex) {
    job.stringResult = true;
    job.textResult = std::move(names[0]);
    return true;
  }

  job.result = bson_new();
  job.arrayResult = true;

  if (job.result == nullptr) {
    return false;
  }

  for (std::size_t index = 0; index < names.size(); index += 1) {
    char key[32];
    const int keyLength = std::snprintf(key, sizeof(key), "%zu", index);

    if (
      keyLength < 0 || (std::size_t)keyLength >= sizeof(key) ||
      !bson_append_utf8(job.result, key, keyLength, names[index].data(), names[index].size())
    ) {
      return false;
    }
  }

  return true;
}

static bson_t* inox_mongodb_normalize_bulk_result(const bson_t* reply) {
  bson_t* result = bson_new();

  if (result == nullptr || !BSON_APPEND_BOOL(result, "acknowledged", true)) {
    bson_destroy(result);
    return nullptr;
  }

  struct CountField final {
    const char* source;
    const char* target;
  };

  const CountField fields[] = {
    { "nInserted", "insertedCount" },
    { "nMatched", "matchedCount" },
    { "nModified", "modifiedCount" },
    { "nRemoved", "deletedCount" },
    { "nUpserted", "upsertedCount" }
  };

  for (const CountField& field : fields) {
    bson_iter_t iterator;

    if (bson_iter_init_find(&iterator, reply, field.source)) {
      if (!bson_append_value(result, field.target, -1, bson_iter_value(&iterator))) {
        bson_destroy(result);
        return nullptr;
      }
    } else if (!BSON_APPEND_INT32(result, field.target, 0)) {
      bson_destroy(result);
      return nullptr;
    }
  }

  return result;
}

static bool inox_mongodb_bulk_operation_document(
  const bson_t& operation,
  const char* name,
  bson_t& result,
  MongoJob& job
) {
  if (!inox_mongodb_bson_document_field(&operation, name, result)) {
    job.fail("TypeError: MongoDB bulk write model is missing a required document");
    return false;
  }

  return true;
}

static bool inox_mongodb_append_collection_bulk_operation(
  MongoJob& job,
  mongoc_bulk_operation_t* bulk,
  const bson_t& model,
  bson_error_t& error
) {
  bson_iter_t iterator;

  if (!bson_iter_init(&iterator, &model) || !bson_iter_next(&iterator) || !BSON_ITER_HOLDS_DOCUMENT(&iterator)) {
    job.fail("TypeError: MongoDB bulk write model is invalid");
    return false;
  }

  const std::string name(bson_iter_key(&iterator), bson_iter_key_len(&iterator));
  std::uint32_t length = 0;
  const std::uint8_t* data = nullptr;
  bson_iter_document(&iterator, &length, &data);
  bson_t operation;

  if (data == nullptr || !bson_init_static(&operation, data, length) || bson_iter_next(&iterator)) {
    job.fail("TypeError: MongoDB collection bulk write model must contain one operation");
    return false;
  }

  bson_t first;
  bson_t second;
  bool upsert = false;

  if (name == "insertOne") {
    return inox_mongodb_bulk_operation_document(operation, "document", first, job) &&
      mongoc_bulk_operation_insert_with_opts(bulk, &first, nullptr, &error);
  }

  if (!inox_mongodb_bulk_operation_document(operation, "filter", first, job)) {
    return false;
  }

  if (name == "deleteOne") {
    return mongoc_bulk_operation_remove_one_with_opts(bulk, &first, nullptr, &error);
  }

  if (name == "deleteMany") {
    return mongoc_bulk_operation_remove_many_with_opts(bulk, &first, nullptr, &error);
  }

  const char* documentField = name == "replaceOne" ? "replacement" : "update";

  if (
    !inox_mongodb_bulk_operation_document(operation, documentField, second, job) ||
    !inox_mongodb_bson_optional_bool(&operation, "upsert", upsert, job)
  ) {
    return false;
  }

  bson_t options;
  bson_init(&options);
  const bool optionsReady = !upsert || BSON_APPEND_BOOL(&options, "upsert", true);
  bool appended = false;

  if (optionsReady && name == "updateOne") {
    appended = mongoc_bulk_operation_update_one_with_opts(bulk, &first, &second, &options, &error);
  } else if (optionsReady && name == "updateMany") {
    appended = mongoc_bulk_operation_update_many_with_opts(bulk, &first, &second, &options, &error);
  } else if (optionsReady && name == "replaceOne") {
    appended = mongoc_bulk_operation_replace_one_with_opts(bulk, &first, &second, &options, &error);
  } else if (optionsReady) {
    job.fail("MongoInvalidArgumentError: unsupported MongoDB bulk write operation");
  }

  bson_destroy(&options);
  return appended;
}

static bool inox_mongodb_run_collection_bulk_job(
  MongoJob& job,
  mongoc_collection_t* collection,
  bson_error_t& error
) {
  MongoCollectionBulkHandle bulk(
    mongoc_collection_create_bulk_operation_with_opts(collection, job.second),
    mongoc_bulk_operation_destroy
  );

  if (!bulk) {
    job.fail("MongoRuntimeError: MongoDB bulk operation could not be created");
    return false;
  }

  bson_iter_t iterator;
  bool appended = bson_iter_init(&iterator, job.first);
  std::size_t count = 0;

  while (appended && bson_iter_next(&iterator)) {
    if (!BSON_ITER_HOLDS_DOCUMENT(&iterator)) {
      job.fail("TypeError: MongoDB bulk write operations must be objects");
      appended = false;
      break;
    }

    std::uint32_t length = 0;
    const std::uint8_t* data = nullptr;
    bson_iter_document(&iterator, &length, &data);
    bson_t model;
    appended = data != nullptr && bson_init_static(&model, data, length) &&
      inox_mongodb_append_collection_bulk_operation(job, bulk.get(), model, error);
    count += appended ? 1 : 0;
  }

  if (appended && count == 0) {
    job.fail("MongoInvalidArgumentError: MongoDB bulk write operations must not be empty");
    appended = false;
  }

  bson_t reply;
  bson_init(&reply);
  const std::uint32_t serverId = appended ? mongoc_bulk_operation_execute(bulk.get(), &reply, &error) : 0;

  if (serverId != 0) {
    job.result = inox_mongodb_normalize_bulk_result(&reply);
  }

  bson_destroy(&reply);
  return serverId != 0 && job.result != nullptr;
}

static bool inox_mongodb_append_client_bulk_operation(
  MongoJob& job,
  mongoc_bulkwrite_t* bulk,
  const bson_t& model,
  bson_error_t& error
) {
  std::string name;
  std::string namespaceName;

  if (
    !inox_mongodb_bson_string_field(&model, "name", name) ||
    !inox_mongodb_bson_string_field(&model, "namespace", namespaceName) ||
    namespaceName.empty()
  ) {
    job.fail("TypeError: MongoClient bulk write model requires name and namespace strings");
    return false;
  }

  bson_t first;
  bson_t second;
  bool upsert = false;

  if (name == "insertOne") {
    return inox_mongodb_bulk_operation_document(model, "document", first, job) &&
      mongoc_bulkwrite_append_insertone(bulk, namespaceName.c_str(), &first, nullptr, &error);
  }

  if (!inox_mongodb_bulk_operation_document(model, "filter", first, job)) {
    return false;
  }

  if (name == "deleteOne") {
    return mongoc_bulkwrite_append_deleteone(bulk, namespaceName.c_str(), &first, nullptr, &error);
  }

  if (name == "deleteMany") {
    return mongoc_bulkwrite_append_deletemany(bulk, namespaceName.c_str(), &first, nullptr, &error);
  }

  const char* documentField = name == "replaceOne" ? "replacement" : "update";

  if (
    !inox_mongodb_bulk_operation_document(model, documentField, second, job) ||
    !inox_mongodb_bson_optional_bool(&model, "upsert", upsert, job)
  ) {
    return false;
  }

  bool appended = false;

  if (name == "updateOne") {
    MongoClientUpdateOneOptionsHandle options(
      mongoc_bulkwrite_updateoneopts_new(),
      mongoc_bulkwrite_updateoneopts_destroy
    );

    if (options) {
      mongoc_bulkwrite_updateoneopts_set_upsert(options.get(), upsert);
      appended = mongoc_bulkwrite_append_updateone(
        bulk,
        namespaceName.c_str(),
        &first,
        &second,
        options.get(),
        &error
      );
    }
  } else if (name == "updateMany") {
    MongoClientUpdateManyOptionsHandle options(
      mongoc_bulkwrite_updatemanyopts_new(),
      mongoc_bulkwrite_updatemanyopts_destroy
    );

    if (options) {
      mongoc_bulkwrite_updatemanyopts_set_upsert(options.get(), upsert);
      appended = mongoc_bulkwrite_append_updatemany(
        bulk,
        namespaceName.c_str(),
        &first,
        &second,
        options.get(),
        &error
      );
    }
  } else if (name == "replaceOne") {
    MongoClientReplaceOneOptionsHandle options(
      mongoc_bulkwrite_replaceoneopts_new(),
      mongoc_bulkwrite_replaceoneopts_destroy
    );

    if (options) {
      mongoc_bulkwrite_replaceoneopts_set_upsert(options.get(), upsert);
      appended = mongoc_bulkwrite_append_replaceone(
        bulk,
        namespaceName.c_str(),
        &first,
        &second,
        options.get(),
        &error
      );
    }
  } else {
    job.fail("MongoInvalidArgumentError: unsupported MongoClient bulk write operation");
  }

  if (!appended && !job.failed() && error.message[0] == '\0') {
    job.fail("MongoRuntimeError: MongoClient bulk write operation could not be created");
  }

  return appended;
}

static bson_t* inox_mongodb_normalize_client_bulk_result(const mongoc_bulkwriteresult_t* source) {
  bson_t* result = bson_new();

  if (
    result == nullptr || !BSON_APPEND_BOOL(result, "acknowledged", true) ||
    !BSON_APPEND_INT64(result, "insertedCount", mongoc_bulkwriteresult_insertedcount(source)) ||
    !BSON_APPEND_INT64(result, "matchedCount", mongoc_bulkwriteresult_matchedcount(source)) ||
    !BSON_APPEND_INT64(result, "modifiedCount", mongoc_bulkwriteresult_modifiedcount(source)) ||
    !BSON_APPEND_INT64(result, "deletedCount", mongoc_bulkwriteresult_deletedcount(source)) ||
    !BSON_APPEND_INT64(result, "upsertedCount", mongoc_bulkwriteresult_upsertedcount(source))
  ) {
    bson_destroy(result);
    return nullptr;
  }

  return result;
}

static bool inox_mongodb_run_client_bulk_job(
  MongoJob& job,
  mongoc_client_t* client,
  bson_error_t& error
) {
  MongoClientBulkHandle bulk(mongoc_client_bulkwrite_new(client), mongoc_bulkwrite_destroy);
  MongoClientBulkOptionsHandle options(mongoc_bulkwriteopts_new(), mongoc_bulkwriteopts_destroy);

  if (!bulk || !options) {
    job.fail("MongoRuntimeError: MongoClient bulk write could not be created");
    return false;
  }

  bool ordered = true;

  if (!inox_mongodb_bson_optional_bool(job.second, "ordered", ordered, job)) {
    return false;
  }

  mongoc_bulkwriteopts_set_ordered(options.get(), ordered);
  bson_iter_t iterator;
  bool appended = bson_iter_init(&iterator, job.first);
  std::size_t count = 0;

  while (appended && bson_iter_next(&iterator)) {
    if (!BSON_ITER_HOLDS_DOCUMENT(&iterator)) {
      job.fail("TypeError: MongoClient bulk write models must be objects");
      appended = false;
      break;
    }

    std::uint32_t length = 0;
    const std::uint8_t* data = nullptr;
    bson_iter_document(&iterator, &length, &data);
    bson_t model;
    appended = data != nullptr && bson_init_static(&model, data, length) &&
      inox_mongodb_append_client_bulk_operation(job, bulk.get(), model, error);
    count += appended ? 1 : 0;
  }

  if (appended && count == 0) {
    job.fail("MongoInvalidArgumentError: MongoClient bulk write models must not be empty");
    appended = false;
  }

  mongoc_bulkwritereturn_t writeResult{};

  if (appended) {
    writeResult = mongoc_bulkwrite_execute(bulk.get(), options.get());
  }

  if (writeResult.exc != nullptr) {
    bson_error_t writeError{};

    if (mongoc_bulkwriteexception_error(writeResult.exc, &writeError)) {
      job.fail(writeError);
    } else {
      job.fail("MongoBulkWriteError: one or more MongoClient bulk writes failed");
    }
  } else if (writeResult.res != nullptr) {
    job.result = inox_mongodb_normalize_client_bulk_result(writeResult.res);
  }

  mongoc_bulkwriteresult_destroy(writeResult.res);
  mongoc_bulkwriteexception_destroy(writeResult.exc);
  return appended && !job.failed() && job.result != nullptr;
}

static bool inox_mongodb_append_array_document(bson_t* array, std::size_t index, const bson_t* document) {
  char key[32];
  const int keyLength = std::snprintf(key, sizeof(key), "%zu", index);
  return keyLength >= 0 && (std::size_t)keyLength < sizeof(key) &&
    bson_append_document(array, key, keyLength, document);
}

static bool inox_mongodb_append_aggregate_document_stage(
  bson_t* pipeline,
  std::size_t index,
  const char* name,
  const bson_t* value
) {
  bson_t stage;
  bson_init(&stage);
  const bool appended = BSON_APPEND_DOCUMENT(&stage, name, value) &&
    inox_mongodb_append_array_document(pipeline, index, &stage);
  bson_destroy(&stage);
  return appended;
}

static bool inox_mongodb_append_aggregate_number_stage(
  bson_t* pipeline,
  std::size_t index,
  const char* name,
  std::int64_t value
) {
  bson_t stage;
  bson_init(&stage);
  const bool appended = BSON_APPEND_INT64(&stage, name, value) &&
    inox_mongodb_append_array_document(pipeline, index, &stage);
  bson_destroy(&stage);
  return appended;
}

static bson_t* inox_mongodb_cursor_aggregate_pipeline(const MongoCursorState& state, std::int64_t maximum) {
  bson_t* pipeline = bson_new();

  if (pipeline == nullptr) {
    return nullptr;
  }

  bson_iter_t iterator;
  std::size_t index = 0;

  if (!bson_iter_init(&iterator, state.source)) {
    bson_destroy(pipeline);
    return nullptr;
  }

  while (bson_iter_next(&iterator)) {
    if (!BSON_ITER_HOLDS_DOCUMENT(&iterator)) {
      bson_destroy(pipeline);
      return nullptr;
    }

    std::uint32_t length = 0;
    const std::uint8_t* data = nullptr;
    bson_iter_document(&iterator, &length, &data);
    bson_t stage;

    if (data == nullptr || !bson_init_static(&stage, data, length) ||
      !inox_mongodb_append_array_document(pipeline, index, &stage)) {
      bson_destroy(pipeline);
      return nullptr;
    }

    index += 1;
  }

  if (state.sort != nullptr && !inox_mongodb_append_aggregate_document_stage(pipeline, index++, "$sort", state.sort)) {
    bson_destroy(pipeline);
    return nullptr;
  }

  if (state.offset > 0 && !inox_mongodb_append_aggregate_number_stage(pipeline, index++, "$skip", state.offset)) {
    bson_destroy(pipeline);
    return nullptr;
  }

  if (maximum > 0 && !inox_mongodb_append_aggregate_number_stage(pipeline, index, "$limit", maximum)) {
    bson_destroy(pipeline);
    return nullptr;
  }

  return pipeline;
}

static bool inox_mongodb_run_cursor_job(
  MongoJob& job,
  mongoc_collection_t* collection,
  bson_error_t& error
) {
  if (!job.cursor || job.cursor->source == nullptr) {
    job.fail("MongoCursorClosedError: Cursor is not available");
    return false;
  }

  const bool one = job.kind == MongoJobKind::cursorNext;
  std::int64_t maximum = one ? 1 : 0;

  if (job.cursor->limit > 0) {
    const std::int64_t remaining = job.cursor->limit - job.cursor->offset;

    if (remaining <= 0) {
      job.nullResult = one;
      job.arrayResult = !one;
      job.result = one ? nullptr : bson_new();
      return one || job.result != nullptr;
    }

    maximum = one ? 1 : remaining;
  }

  bson_t options;
  bson_init(&options);
  bson_t* pipeline = nullptr;
  mongoc_cursor_t* cursor = nullptr;

  if (job.cursor->mode == MongoCursorMode::find) {
    if (
      (job.cursor->sort != nullptr && !BSON_APPEND_DOCUMENT(&options, "sort", job.cursor->sort)) ||
      (job.cursor->offset > 0 && !BSON_APPEND_INT64(&options, "skip", job.cursor->offset)) ||
      (maximum > 0 && !BSON_APPEND_INT64(&options, "limit", maximum))
    ) {
      bson_destroy(&options);
      return false;
    }

    cursor = mongoc_collection_find_with_opts(collection, job.cursor->source, &options, nullptr);
  } else {
    pipeline = inox_mongodb_cursor_aggregate_pipeline(*job.cursor, maximum);

    if (pipeline != nullptr) {
      cursor = mongoc_collection_aggregate(collection, MONGOC_QUERY_NONE, pipeline, &options, nullptr);
    }
  }

  if (cursor == nullptr) {
    bson_destroy(pipeline);
    bson_destroy(&options);
    return false;
  }

  if (!one) {
    job.result = bson_new();
    job.arrayResult = true;
  }

  const bson_t* document = nullptr;
  bool appended = !one ? job.result != nullptr : true;

  while (appended && mongoc_cursor_next(cursor, &document)) {
    if (one) {
      job.result = bson_copy(document);
      appended = job.result != nullptr;
      job.resultCount = appended ? 1 : 0;
      break;
    }

    appended = inox_mongodb_append_array_document(job.result, job.resultCount, document);

    if (appended) {
      job.resultCount += 1;
    }
  }

  if (appended && !mongoc_cursor_error(cursor, &error)) {
    if (one && job.result == nullptr) {
      job.nullResult = true;
    }
  } else {
    appended = false;
  }

  mongoc_cursor_destroy(cursor);
  bson_destroy(pipeline);
  bson_destroy(&options);
  return appended;
}

static void inox_mongodb_run_job(uv_work_t* request) {
  MongoJob* job = request == nullptr ? nullptr : (MongoJob*)request->data;

  if (job == nullptr || !job->client || job->client->pool == nullptr) {
    if (job != nullptr) {
      job->fail("MongoClientClosedError: MongoClient is closed");
    }
    return;
  }

  mongoc_client_t* client = mongoc_client_pool_pop(job->client->pool);

  if (client == nullptr) {
    job->fail("MongoRuntimeError: MongoDB client pool returned no client");
    return;
  }

  bson_error_t error{};
  bson_t reply;
  bson_init(&reply);
  bool succeeded = false;
  mongoc_collection_t* collection = nullptr;

  try {
    if (job->kind == MongoJobKind::connect) {
      bson_t command;
      bson_init(&command);
      BSON_APPEND_INT32(&command, "ping", 1);
      succeeded = mongoc_client_command_simple(client, "admin", &command, nullptr, &reply, &error);
      bson_destroy(&command);
    } else if (job->kind == MongoJobKind::clientBulkWrite) {
      succeeded = inox_mongodb_run_client_bulk_job(*job, client, error);
    } else {
      collection = mongoc_client_get_collection(client, job->database.c_str(), job->collection.c_str());

      if (collection == nullptr) {
        job->fail("MongoRuntimeError: MongoDB collection could not be created");
      } else if (job->kind == MongoJobKind::cursorNext || job->kind == MongoJobKind::cursorToArray) {
        succeeded = inox_mongodb_run_cursor_job(*job, collection, error);
      } else if (job->kind == MongoJobKind::distinct) {
        bson_t command;
        bson_init(&command);
        succeeded = BSON_APPEND_UTF8(&command, "distinct", job->collection.c_str()) &&
          BSON_APPEND_UTF8(&command, "key", job->text.c_str()) &&
          BSON_APPEND_DOCUMENT(&command, "query", job->first) &&
          mongoc_collection_command_simple(collection, &command, nullptr, &reply, &error);
        bson_destroy(&command);

        if (succeeded) {
          bson_iter_t values;
          std::uint32_t length = 0;
          const std::uint8_t* data = nullptr;

          if (bson_iter_init_find(&values, &reply, "values") && BSON_ITER_HOLDS_ARRAY(&values)) {
            bson_iter_array(&values, &length, &data);
            bson_t array;

            if (data != nullptr && bson_init_static(&array, data, length)) {
              job->result = bson_copy(&array);
            }
          }

          job->arrayResult = true;
          succeeded = job->result != nullptr;
        }
      } else if (job->kind == MongoJobKind::countDocuments) {
        const std::int64_t count = mongoc_collection_count_documents(
          collection,
          job->first,
          nullptr,
          nullptr,
          &reply,
          &error
        );
        succeeded = count >= 0;

        if (succeeded) {
          job->numberResult = (double)count;
        }
      } else if (job->kind == MongoJobKind::estimatedDocumentCount) {
        const std::int64_t count = mongoc_collection_estimated_document_count(
          collection,
          nullptr,
          nullptr,
          &reply,
          &error
        );
        succeeded = count >= 0;

        if (succeeded) {
          job->numberResult = (double)count;
        }
      } else if (job->kind == MongoJobKind::createIndex || job->kind == MongoJobKind::createIndexes) {
        succeeded = inox_mongodb_run_create_indexes_job(*job, collection, error);
      } else if (job->kind == MongoJobKind::collectionBulkWrite) {
        succeeded = inox_mongodb_run_collection_bulk_job(*job, collection, error);
      } else if (job->kind == MongoJobKind::findOne) {
        bson_t options;
        bson_init(&options);
        BSON_APPEND_INT64(&options, "limit", 1);
        mongoc_cursor_t* cursor = mongoc_collection_find_with_opts(collection, job->first, &options, nullptr);
        const bson_t* found = nullptr;

        if (cursor != nullptr && mongoc_cursor_next(cursor, &found)) {
          job->result = bson_copy(found);
          succeeded = job->result != nullptr;
        } else if (cursor != nullptr && !mongoc_cursor_error(cursor, &error)) {
          job->nullResult = true;
          succeeded = true;
        }

        mongoc_cursor_destroy(cursor);
        bson_destroy(&options);
      } else if (job->kind == MongoJobKind::findOneAndUpdate) {
        mongoc_find_and_modify_opts_t* options = mongoc_find_and_modify_opts_new();

        if (options != nullptr && mongoc_find_and_modify_opts_set_update(options, job->second)) {
          succeeded = mongoc_collection_find_and_modify_with_opts(
            collection,
            job->first,
            options,
            &reply,
            &error
          );
        }

        mongoc_find_and_modify_opts_destroy(options);

        if (succeeded) {
          bson_iter_t value;

          if (!bson_iter_init_find(&value, &reply, "value") || BSON_ITER_HOLDS_NULL(&value)) {
            job->nullResult = true;
          } else if (BSON_ITER_HOLDS_DOCUMENT(&value)) {
            std::uint32_t length = 0;
            const std::uint8_t* data = nullptr;
            bson_iter_document(&value, &length, &data);
            bson_t document;

            if (data != nullptr && bson_init_static(&document, data, length)) {
              job->result = bson_copy(&document);
            }

            succeeded = job->result != nullptr;
          } else {
            succeeded = false;
          }
        }
      } else if (job->kind == MongoJobKind::insertOne) {
        succeeded = mongoc_collection_insert_one(collection, job->first, nullptr, &reply, &error);

        if (succeeded) {
          job->result = inox_mongodb_normalize_insert_result(*job, &reply);
          succeeded = job->result != nullptr;
        }
      } else if (job->kind == MongoJobKind::insertMany) {
        std::vector<const bson_t*> documents(job->documents.begin(), job->documents.end());
        succeeded = mongoc_collection_insert_many(
          collection,
          documents.data(),
          documents.size(),
          nullptr,
          &reply,
          &error
        );

        if (succeeded) {
          job->result = inox_mongodb_normalize_insert_result(*job, &reply);
          succeeded = job->result != nullptr;
        }
      } else if (job->kind == MongoJobKind::updateOne || job->kind == MongoJobKind::updateMany) {
        succeeded = job->kind == MongoJobKind::updateOne
          ? mongoc_collection_update_one(collection, job->first, job->second, nullptr, &reply, &error)
          : mongoc_collection_update_many(collection, job->first, job->second, nullptr, &reply, &error);

        if (succeeded) {
          job->result = inox_mongodb_normalize_update_result(&reply);
          succeeded = job->result != nullptr;
        }
      } else if (job->kind == MongoJobKind::deleteOne || job->kind == MongoJobKind::deleteMany) {
        succeeded = job->kind == MongoJobKind::deleteOne
          ? mongoc_collection_delete_one(collection, job->first, nullptr, &reply, &error)
          : mongoc_collection_delete_many(collection, job->first, nullptr, &reply, &error);

        if (succeeded) {
          job->result = inox_mongodb_normalize_delete_result(&reply);
          succeeded = job->result != nullptr;
        }
      }
    }
  } catch (const std::bad_alloc&) {
    job->fail("MongoRuntimeError: out of memory while executing MongoDB operation");
  }

  if (!succeeded && !job->failed()) {
    if (error.message[0] != '\0') {
      job->fail(error);
    } else {
      job->fail("MongoRuntimeError: MongoDB operation failed");
    }
  }

  mongoc_collection_destroy(collection);
  bson_destroy(&reply);
  mongoc_client_pool_push(job->client->pool, client);
}

static inox::Value inox_mongodb_error_value(const char* message) {
  Error error(inox::StringView(message, std::strlen(message)));

  if (inox::thrown()) {
    return inox::take_exception();
  }

  return error;
}

static void inox_mongodb_complete_job(uv_work_t* request, int status) {
  std::unique_ptr<MongoJob> job(request == nullptr ? nullptr : (MongoJob*)request->data);

  if (!job) {
    return;
  }

  inox_status settleStatus = INOX_OK;

  if (status < 0 && !job->failed()) {
    job->fail(uv_strerror(status));
  }

  if (job->cursor) {
    job->cursor->active = false;

    if (!job->failed()) {
      job->cursor->offset += (std::int64_t)job->resultCount;

      if (
        job->kind == MongoJobKind::cursorToArray || job->nullResult ||
        (job->cursor->limit > 0 && job->cursor->offset >= job->cursor->limit)
      ) {
        job->cursor->exhausted = true;
      }
    }
  }

  if (job->failed()) {
    settleStatus = job->promise.rejectWith(inox_mongodb_error_value(job->error.data()));
  } else if (job->kind == MongoJobKind::connect) {
    MongoClient client(job->client);
    inox::Value value = client.runtimeValue();

    if (inox::thrown()) {
      settleStatus = job->promise.rejectWith(inox::take_exception());
    } else {
      settleStatus = job->promise.fulfill(std::move(value));
    }
  } else if (job->kind == MongoJobKind::countDocuments || job->kind == MongoJobKind::estimatedDocumentCount) {
    settleStatus = job->promise.fulfill(inox::Value(inox_number_value(job->numberResult)));
  } else if (job->stringResult) {
    inox::String value(job->textResult.data(), job->textResult.size());

    if (!value.valid()) {
      settleStatus = job->promise.rejectWith(
        inox::thrown() ? inox::take_exception() : inox_mongodb_error_value("MongoRuntimeError: out of memory")
      );
    } else {
      settleStatus = job->promise.fulfill(value);
    }
  } else if (job->nullResult) {
    settleStatus = job->promise.fulfill(inox::Value(inox_null_value()));
  } else {
    inox::Value value = MongoBsonCodec::decodeDocument(job->result, job->arrayResult, 0);

    if (inox::thrown()) {
      settleStatus = job->promise.rejectWith(inox::take_exception());
    } else {
      settleStatus = job->promise.fulfill(std::move(value));
    }
  }

  if (settleStatus != INOX_OK) {
    inox_libuv_loop_report_status(inox::loop(), settleStatus);
  }

  job->client->finishJob();
}

static inox::Promise inox_mongodb_rejected_promise(const char* message) {
  return inox::Promise::reject(inox_mongodb_error_value(message));
}

static inox::Promise inox_mongodb_queue_job(std::unique_ptr<MongoJob> job) {
  if (!job || !job->client || job->client->closed || job->client->pool == nullptr) {
    if (job && job->cursor) {
      job->cursor->active = false;
    }

    return inox_mongodb_rejected_promise("MongoClientClosedError: MongoClient is closed");
  }

  inox_loop* loop = inox::loop();

  if (loop == nullptr) {
    if (job->cursor) {
      job->cursor->active = false;
    }

    inox_mongodb_throw("MongoRuntimeError: MongoDB requires an active event loop");
    return inox::Promise();
  }

  job->promise = inox::Promise::create();

  if (!job->promise.valid()) {
    if (job->cursor) {
      job->cursor->active = false;
    }

    return inox::Promise();
  }

  inox::Promise result = job->promise;
  job->request.data = job.get();
  job->client->activeJobs += 1;
  const int status = uv_queue_work(
    inox_libuv_loop_handle(loop),
    &job->request,
    inox_mongodb_run_job,
    inox_mongodb_complete_job
  );

  if (status != 0) {
    job->client->activeJobs -= 1;

    if (job->cursor) {
      job->cursor->active = false;
    }

    result.rejectWith(inox_mongodb_error_value(uv_strerror(status)));
    return result;
  }

  job.release();
  return result;
}

static std::unique_ptr<MongoJob> inox_mongodb_collection_job(
  const std::shared_ptr<MongoCollectionState>& state,
  MongoJobKind kind
) {
  if (!state || !state->client) {
    return {};
  }

  try {
    std::unique_ptr<MongoJob> job(new (std::nothrow) MongoJob());

    if (!job) {
      inox_mongodb_throw_oom();
      return {};
    }

    job->kind = kind;
    job->client = state->client;
    job->database = state->database;
    job->collection = state->name;
    return job;
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return {};
  }
}

static bool inox_mongodb_job_array_and_options(
  MongoJob& job,
  const inox::Value& values,
  const inox::Value* options,
  const char* label
) {
  job.first = inox_mongodb_encode_owned_array(values, label);
  job.second = options == nullptr ? bson_new() : inox_mongodb_encode_owned_document(*options);

  if (job.first == nullptr || job.second == nullptr) {
    if (job.second == nullptr && !inox::thrown()) {
      inox_mongodb_throw_oom();
    }

    return false;
  }

  return true;
}

static inox::Promise inox_mongodb_collection_array_job(
  const std::shared_ptr<MongoCollectionState>& state,
  MongoJobKind kind,
  const inox::Value& values,
  const inox::Value* options,
  const char* label
) {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state, kind);

  if (!job || !inox_mongodb_job_array_and_options(*job, values, options, label)) {
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

static inox::Promise inox_mongodb_two_document_job(
  const std::shared_ptr<MongoCollectionState>& state,
  MongoJobKind kind,
  const inox::Value& first,
  const inox::Value& second
) {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state, kind);

  if (!job) {
    return inox::Promise();
  }

  job->first = inox_mongodb_encode_owned_document(first);
  job->second = inox_mongodb_encode_owned_document(second);

  if (job->first == nullptr || job->second == nullptr) {
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

static inox::Promise inox_mongodb_one_document_job(
  const std::shared_ptr<MongoCollectionState>& state,
  MongoJobKind kind,
  const inox::Value& document
) {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state, kind);

  if (!job) {
    return inox::Promise();
  }

  job->first = inox_mongodb_encode_owned_document(document);

  if (job->first == nullptr) {
    return inox::Promise();
  }

  if (kind == MongoJobKind::insertOne && !inox_mongodb_ensure_id(job->first)) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

static MongoCursor inox_mongodb_collection_cursor(
  const std::shared_ptr<MongoCollectionState>& collection,
  MongoCursorMode mode,
  bson_t* source
) {
  if (!collection || !collection->client || collection->client->closed || collection->client->pool == nullptr) {
    bson_destroy(source);
    inox_mongodb_throw("MongoClientClosedError: MongoClient is closed");
    return MongoCursor();
  }

  if (source == nullptr) {
    return MongoCursor();
  }

  try {
    std::shared_ptr<MongoCursorState> state = std::make_shared<MongoCursorState>();
    state->client = collection->client;
    state->database = collection->database;
    state->collection = collection->name;
    state->mode = mode;
    state->source = source;
    return MongoCursor(std::move(state));
  } catch (const std::bad_alloc&) {
    bson_destroy(source);
    inox_mongodb_throw_oom();
    return MongoCursor();
  }
}

static inox::Promise inox_mongodb_cursor_job(
  const std::shared_ptr<MongoCursorState>& state,
  MongoJobKind kind
) {
  if (!state || !state->client || state->client->closed || state->client->pool == nullptr) {
    return inox_mongodb_rejected_promise("MongoClientClosedError: MongoClient is closed");
  }

  if (state->active) {
    return inox_mongodb_rejected_promise("MongoCursorInUseError: Cursor already has an active operation");
  }

  if (state->exhausted) {
    if (kind == MongoJobKind::cursorNext) {
      return inox::Promise::resolve(inox::Value(inox_null_value()));
    }

    Array empty = Array::create(0);
    return inox::thrown() ? inox::Promise() : inox::Promise::resolve(empty);
  }

  std::unique_ptr<MongoJob> job(new (std::nothrow) MongoJob());

  if (!job) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  try {
    job->kind = kind;
    job->client = state->client;
    job->cursor = state;
    job->database = state->database;
    job->collection = state->collection;
    state->active = true;
    return inox_mongodb_queue_job(std::move(job));
  } catch (const std::bad_alloc&) {
    state->active = false;
    inox_mongodb_throw_oom();
    return inox::Promise();
  }
}

MongoClient::MongoClient() : state_() {}

MongoClient::MongoClient(inox::StringView uri) : state_(inox_mongodb_create_client_state(uri, nullptr)) {}

MongoClient::MongoClient(inox::StringView uri, const inox::Value& options)
  : state_(inox_mongodb_create_client_state(uri, std::addressof(options))) {}

MongoClient::MongoClient(const inox::Value& value) : state_() {
  if (inox::thrown()) {
    return;
  }

  const MongoClient* client = inox_mongodb_facade_instance<MongoClient>(value, inox_mongodb_client_descriptor());

  if (client == nullptr) {
    inox_mongodb_throw("TypeError: value is not a MongoClient");
    return;
  }

  state_ = client->state_;
}

MongoClient::MongoClient(std::shared_ptr<MongoClientState> state) : state_(std::move(state)) {}

inox::Promise MongoClient::connect(inox::StringView uri) {
  MongoClient client(uri);
  return inox::thrown() ? inox::Promise() : client.connect();
}

inox::Promise MongoClient::connect(inox::StringView uri, const inox::Value& options) {
  MongoClient client(uri, options);
  return inox::thrown() ? inox::Promise() : client.connect();
}

bool MongoClient::isMongoClient(const inox::Value& value) {
  return inox_mongodb_is_facade<MongoClient>(value, inox_mongodb_client_descriptor());
}

inox::Promise MongoClient::connect() const {
  if (!valid()) {
    return inox_mongodb_rejected_promise("MongoClientClosedError: MongoClient is closed");
  }

  std::unique_ptr<MongoJob> job(new (std::nothrow) MongoJob());

  if (!job) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  job->kind = MongoJobKind::connect;
  job->client = state_;
  return inox_mongodb_queue_job(std::move(job));
}

MongoDatabase MongoClient::db() const {
  return db(inox::StringView(state_ == nullptr ? nullptr : state_->defaultDatabase.data(), state_ == nullptr ? 0 : state_->defaultDatabase.size()));
}

MongoDatabase MongoClient::db(inox::StringView name) const {
  if (!valid()) {
    inox_mongodb_throw("MongoClientClosedError: MongoClient is closed");
    return MongoDatabase();
  }

  try {
    std::shared_ptr<MongoDatabaseState> state = std::make_shared<MongoDatabaseState>();
    state->client = state_;

    if (!inox_mongodb_copy_string(name, state->name, "TypeError: database name is invalid") || state->name.empty()) {
      if (!inox::thrown()) {
        inox_mongodb_throw("TypeError: database name must not be empty");
      }
      return MongoDatabase();
    }

    return MongoDatabase(std::move(state));
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return MongoDatabase();
  }
}

inox::Promise MongoClient::bulkWrite(const inox::Value& models) const {
  if (!valid()) {
    return inox_mongodb_rejected_promise("MongoClientClosedError: MongoClient is closed");
  }

  std::unique_ptr<MongoJob> job(new (std::nothrow) MongoJob());

  if (!job) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  job->kind = MongoJobKind::clientBulkWrite;
  job->client = state_;

  if (!inox_mongodb_job_array_and_options(
    *job,
    models,
    nullptr,
    "TypeError: MongoClient.bulkWrite expects an array of models"
  )) {
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoClient::bulkWrite(const inox::Value& models, const inox::Value& options) const {
  if (!valid()) {
    return inox_mongodb_rejected_promise("MongoClientClosedError: MongoClient is closed");
  }

  std::unique_ptr<MongoJob> job(new (std::nothrow) MongoJob());

  if (!job) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  job->kind = MongoJobKind::clientBulkWrite;
  job->client = state_;

  if (!inox_mongodb_job_array_and_options(
    *job,
    models,
    std::addressof(options),
    "TypeError: MongoClient.bulkWrite expects an array of models"
  )) {
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoClient::close() const {
  if (!state_ || state_->closed) {
    return inox::Promise::resolve();
  }

  state_->closed = true;

  if (state_->activeJobs == 0) {
    if (state_->pool != nullptr) {
      mongoc_client_pool_destroy(state_->pool);
      state_->pool = nullptr;
    }

    return inox::Promise::resolve();
  }

  inox::Promise promise = inox::Promise::create();

  if (!promise.valid()) {
    return inox::Promise();
  }

  try {
    state_->closeWaiters.push_back(promise);
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  return promise;
}

bool MongoClient::valid() const {
  return state_ != nullptr && !state_->closed && state_->pool != nullptr;
}

inox::Value MongoClient::runtimeValue() const {
  return inox_mongodb_facade_runtime_value(*this, inox_mongodb_client_descriptor());
}

MongoDatabase::MongoDatabase() : state_() {}

MongoDatabase::MongoDatabase(const inox::Value& value) : state_() {
  if (inox::thrown()) {
    return;
  }

  const MongoDatabase* database = inox_mongodb_facade_instance<MongoDatabase>(value, inox_mongodb_database_descriptor());

  if (database == nullptr) {
    inox_mongodb_throw("TypeError: value is not a Db");
    return;
  }

  state_ = database->state_;
}

MongoDatabase::MongoDatabase(std::shared_ptr<MongoDatabaseState> state) : state_(std::move(state)) {}

bool MongoDatabase::isMongoDatabase(const inox::Value& value) {
  return inox_mongodb_is_facade<MongoDatabase>(value, inox_mongodb_database_descriptor());
}

MongoCollection MongoDatabase::collection(inox::StringView name) const {
  if (!valid()) {
    inox_mongodb_throw("MongoClientClosedError: MongoClient is closed");
    return MongoCollection();
  }

  try {
    std::shared_ptr<MongoCollectionState> state = std::make_shared<MongoCollectionState>();
    state->client = state_->client;
    state->database = state_->name;

    if (!inox_mongodb_copy_string(name, state->name, "TypeError: collection name is invalid") || state->name.empty()) {
      if (!inox::thrown()) {
        inox_mongodb_throw("TypeError: collection name must not be empty");
      }
      return MongoCollection();
    }

    return MongoCollection(std::move(state));
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return MongoCollection();
  }
}

bool MongoDatabase::valid() const {
  return state_ != nullptr && state_->client != nullptr && !state_->client->closed && state_->client->pool != nullptr;
}

inox::Value MongoDatabase::runtimeValue() const {
  return inox_mongodb_facade_runtime_value(*this, inox_mongodb_database_descriptor());
}

MongoCursor::MongoCursor() : state_() {}

MongoCursor::MongoCursor(const inox::Value& value) : state_() {
  if (inox::thrown()) {
    return;
  }

  const MongoCursor* cursor = inox_mongodb_facade_instance<MongoCursor>(value, inox_mongodb_cursor_descriptor());

  if (cursor == nullptr) {
    inox_mongodb_throw("TypeError: value is not a MongoDB cursor");
    return;
  }

  state_ = cursor->state_;
}

MongoCursor::MongoCursor(std::shared_ptr<MongoCursorState> state) : state_(std::move(state)) {}

bool MongoCursor::isMongoCursor(const inox::Value& value) {
  return inox_mongodb_is_facade<MongoCursor>(value, inox_mongodb_cursor_descriptor());
}

MongoCursor MongoCursor::sort(const inox::Value& sortValue) const {
  if (!valid()) {
    inox_mongodb_throw("MongoClientClosedError: MongoClient is closed");
    return MongoCursor();
  }

  if (state_->active || state_->offset > 0 || state_->exhausted) {
    inox_mongodb_throw("MongoCursorInUseError: Cursor is already initialized");
    return MongoCursor();
  }

  bson_t* sort = inox_mongodb_encode_owned_document(sortValue);

  if (sort == nullptr) {
    return MongoCursor();
  }

  bson_destroy(state_->sort);
  state_->sort = sort;
  return MongoCursor(state_);
}

MongoCursor MongoCursor::limit(double limitValue) const {
  if (!valid()) {
    inox_mongodb_throw("MongoClientClosedError: MongoClient is closed");
    return MongoCursor();
  }

  if (state_->active || state_->offset > 0 || state_->exhausted) {
    inox_mongodb_throw("MongoCursorInUseError: Cursor is already initialized");
    return MongoCursor();
  }

  if (
    !std::isfinite(limitValue) || limitValue != std::trunc(limitValue) || limitValue < 0 ||
    limitValue > (double)std::numeric_limits<std::int64_t>::max()
  ) {
    inox_mongodb_throw("MongoInvalidArgumentError: Cursor limit must be a non-negative integer");
    return MongoCursor();
  }

  state_->limit = (std::int64_t)limitValue;
  return MongoCursor(state_);
}

inox::Promise MongoCursor::next() const {
  return inox_mongodb_cursor_job(state_, MongoJobKind::cursorNext);
}

inox::Promise MongoCursor::toArray() const {
  return inox_mongodb_cursor_job(state_, MongoJobKind::cursorToArray);
}

bool MongoCursor::valid() const {
  return state_ != nullptr && state_->client != nullptr && !state_->client->closed && state_->client->pool != nullptr;
}

inox::Value MongoCursor::runtimeValue() const {
  return inox_mongodb_facade_runtime_value(*this, inox_mongodb_cursor_descriptor());
}

MongoCollection::MongoCollection() : state_() {}

MongoCollection::MongoCollection(const inox::Value& value) : state_() {
  if (inox::thrown()) {
    return;
  }

  const MongoCollection* collection = inox_mongodb_facade_instance<MongoCollection>(value, inox_mongodb_collection_descriptor());

  if (collection == nullptr) {
    inox_mongodb_throw("TypeError: value is not a Collection");
    return;
  }

  state_ = collection->state_;
}

MongoCollection::MongoCollection(std::shared_ptr<MongoCollectionState> state) : state_(std::move(state)) {}

bool MongoCollection::isMongoCollection(const inox::Value& value) {
  return inox_mongodb_is_facade<MongoCollection>(value, inox_mongodb_collection_descriptor());
}

MongoCursor MongoCollection::find() const {
  bson_t* filter = bson_new();

  if (filter == nullptr) {
    inox_mongodb_throw_oom();
    return MongoCursor();
  }

  return inox_mongodb_collection_cursor(state_, MongoCursorMode::find, filter);
}

MongoCursor MongoCollection::find(const inox::Value& filter) const {
  return inox_mongodb_collection_cursor(
    state_,
    MongoCursorMode::find,
    inox_mongodb_encode_owned_document(filter)
  );
}

inox::Promise MongoCollection::findOne() const {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::findOne);

  if (!job) {
    return inox::Promise();
  }

  job->first = bson_new();

  if (job->first == nullptr) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoCollection::findOne(const inox::Value& filter) const {
  return inox_mongodb_one_document_job(state_, MongoJobKind::findOne, filter);
}

inox::Promise MongoCollection::findOneAndUpdate(const inox::Value& filter, const inox::Value& update) const {
  return inox_mongodb_two_document_job(state_, MongoJobKind::findOneAndUpdate, filter, update);
}

MongoCursor MongoCollection::aggregate() const {
  bson_t* pipeline = bson_new();

  if (pipeline == nullptr) {
    inox_mongodb_throw_oom();
    return MongoCursor();
  }

  return inox_mongodb_collection_cursor(state_, MongoCursorMode::aggregate, pipeline);
}

MongoCursor MongoCollection::aggregate(const inox::Value& pipeline) const {
  return inox_mongodb_collection_cursor(
    state_,
    MongoCursorMode::aggregate,
    inox_mongodb_encode_owned_array(pipeline, "TypeError: aggregate expects an array of pipeline stages")
  );
}

inox::Promise MongoCollection::distinct(inox::StringView key) const {
  bson_t* filter = bson_new();

  if (filter == nullptr) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::distinct);

  if (!job) {
    bson_destroy(filter);
    return inox::Promise();
  }

  job->first = filter;

  if (!inox_mongodb_copy_string(key, job->text, "TypeError: distinct key is invalid") || job->text.empty()) {
    if (!inox::thrown()) {
      inox_mongodb_throw("MongoInvalidArgumentError: distinct key must not be empty");
    }

    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoCollection::distinct(inox::StringView key, const inox::Value& filter) const {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::distinct);

  if (!job) {
    return inox::Promise();
  }

  job->first = inox_mongodb_encode_owned_document(filter);

  if (
    job->first == nullptr ||
    !inox_mongodb_copy_string(key, job->text, "TypeError: distinct key is invalid") ||
    job->text.empty()
  ) {
    if (!inox::thrown() && job->text.empty()) {
      inox_mongodb_throw("MongoInvalidArgumentError: distinct key must not be empty");
    }

    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoCollection::countDocuments() const {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::countDocuments);

  if (!job) {
    return inox::Promise();
  }

  job->first = bson_new();

  if (job->first == nullptr) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoCollection::countDocuments(const inox::Value& filter) const {
  return inox_mongodb_one_document_job(state_, MongoJobKind::countDocuments, filter);
}

inox::Promise MongoCollection::estimatedDocumentCount() const {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::estimatedDocumentCount);
  return job ? inox_mongodb_queue_job(std::move(job)) : inox::Promise();
}

inox::Promise MongoCollection::createIndex(const inox::Value& indexSpec) const {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::createIndex);

  if (!job) {
    return inox::Promise();
  }

  job->first = inox_mongodb_encode_owned_document(indexSpec);
  job->second = bson_new();

  if (job->first == nullptr || job->second == nullptr) {
    if (job->second == nullptr && !inox::thrown()) {
      inox_mongodb_throw_oom();
    }

    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoCollection::createIndex(const inox::Value& indexSpec, const inox::Value& options) const {
  return inox_mongodb_two_document_job(state_, MongoJobKind::createIndex, indexSpec, options);
}

inox::Promise MongoCollection::createIndexes(const inox::Value& indexSpecs) const {
  return inox_mongodb_collection_array_job(
    state_,
    MongoJobKind::createIndexes,
    indexSpecs,
    nullptr,
    "TypeError: createIndexes expects an array of index descriptions"
  );
}

inox::Promise MongoCollection::createIndexes(
  const inox::Value& indexSpecs,
  const inox::Value& options
) const {
  return inox_mongodb_collection_array_job(
    state_,
    MongoJobKind::createIndexes,
    indexSpecs,
    std::addressof(options),
    "TypeError: createIndexes expects an array of index descriptions"
  );
}

inox::Promise MongoCollection::bulkWrite(const inox::Value& operations) const {
  return inox_mongodb_collection_array_job(
    state_,
    MongoJobKind::collectionBulkWrite,
    operations,
    nullptr,
    "TypeError: Collection.bulkWrite expects an array of operations"
  );
}

inox::Promise MongoCollection::bulkWrite(
  const inox::Value& operations,
  const inox::Value& options
) const {
  return inox_mongodb_collection_array_job(
    state_,
    MongoJobKind::collectionBulkWrite,
    operations,
    std::addressof(options),
    "TypeError: Collection.bulkWrite expects an array of operations"
  );
}

inox::Promise MongoCollection::insertOne(const inox::Value& document) const {
  return inox_mongodb_one_document_job(state_, MongoJobKind::insertOne, document);
}

inox::Promise MongoCollection::insertMany(const inox::Value& documents) const {
  std::unique_ptr<MongoJob> job = inox_mongodb_collection_job(state_, MongoJobKind::insertMany);

  if (!job) {
    return inox::Promise();
  }

  Array array(documents);

  if (!array.valid()) {
    inox_mongodb_throw("TypeError: insertMany expects an array of documents");
    return inox::Promise();
  }

  try {
    job->documents.reserve(array.length());

    for (std::size_t index = 0; index < array.length(); index += 1) {
      bson_t* document = inox_mongodb_encode_owned_document(array.get(index));

      if (inox::thrown() || document == nullptr) {
        bson_destroy(document);
        return inox::Promise();
      }

      if (!inox_mongodb_ensure_id(document)) {
        bson_destroy(document);
        inox_mongodb_throw_oom();
        return inox::Promise();
      }

      job->documents.push_back(document);
    }
  } catch (const std::bad_alloc&) {
    inox_mongodb_throw_oom();
    return inox::Promise();
  }

  return inox_mongodb_queue_job(std::move(job));
}

inox::Promise MongoCollection::updateOne(const inox::Value& filter, const inox::Value& update) const {
  return inox_mongodb_two_document_job(state_, MongoJobKind::updateOne, filter, update);
}

inox::Promise MongoCollection::updateMany(const inox::Value& filter, const inox::Value& update) const {
  return inox_mongodb_two_document_job(state_, MongoJobKind::updateMany, filter, update);
}

inox::Promise MongoCollection::deleteOne(const inox::Value& filter) const {
  return inox_mongodb_one_document_job(state_, MongoJobKind::deleteOne, filter);
}

inox::Promise MongoCollection::deleteMany(const inox::Value& filter) const {
  return inox_mongodb_one_document_job(state_, MongoJobKind::deleteMany, filter);
}

bool MongoCollection::valid() const {
  return state_ != nullptr && state_->client != nullptr && !state_->client->closed && state_->client->pool != nullptr;
}

inox::Value MongoCollection::runtimeValue() const {
  return inox_mongodb_facade_runtime_value(*this, inox_mongodb_collection_descriptor());
}
