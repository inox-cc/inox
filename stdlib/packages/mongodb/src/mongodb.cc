#include "inox/mongodb.h"

#include "inox/array.h"
#include "inox/class_descriptor.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/time.h"

#include <bson/bson.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
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
