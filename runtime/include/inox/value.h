#ifndef INOX_VALUE_H
#define INOX_VALUE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef double inox_number;

typedef enum inox_status {
  INOX_OK,
  INOX_ERR_OOM,
  INOX_ERR_TYPE,
  INOX_ERR_THROW,
  INOX_ERR_FIELD,
  INOX_ERR_READONLY,
  INOX_ERR_UNSUPPORTED
} inox_status;

typedef enum inox_tag {
  INOX_TAG_UNDEFINED,
  INOX_TAG_NULL,
  INOX_TAG_BOOL,
  INOX_TAG_NUMBER,
  INOX_TAG_STRING,
  INOX_TAG_OBJECT,
  INOX_TAG_ARRAY,
  INOX_TAG_BYTES,
  INOX_TAG_FUNCTION,
  INOX_TAG_MAP,
  INOX_TAG_SET,
  INOX_TAG_CLASS_INSTANCE
} inox_tag;

typedef enum inox_ref_kind {
  INOX_REF_STRING,
  INOX_REF_OBJECT,
  INOX_REF_ARRAY,
  INOX_REF_BYTES,
  INOX_REF_FUNCTION,
  INOX_REF_MAP,
  INOX_REF_SET,
  INOX_REF_CLASS_INSTANCE,
  INOX_REF_KIND_COUNT
} inox_ref_kind;

typedef struct inox_ref inox_ref;
typedef struct inox_weak_cell inox_weak_cell;
typedef void (*inox_ref_dispose_fn)(inox_ref* ref);

struct inox_ref {
  inox_ref_kind kind;
  uint32_t ref_count;
  uint32_t flags;
  size_t size;
  size_t align;
  inox_allocator* allocator;
  inox_ref_dispose_fn dispose;
#ifdef INOX_ENABLE_WEAK
  inox_weak_cell* weak_cell;
#endif
};

typedef struct inox_value {
  inox_tag tag;
  union {
    bool boolean;
    inox_number number;
    inox_ref* ref;
  } as;
} inox_value;

static inline inox_value inox_undefined_value(void) {
  inox_value value = { INOX_TAG_UNDEFINED };

  return value;
}

static inline inox_value inox_null_value(void) {
  inox_value value = { INOX_TAG_NULL };

  return value;
}

static inline inox_value inox_bool_value(bool boolean) {
  inox_value value = { INOX_TAG_BOOL };
  value.as.boolean = boolean;

  return value;
}

static inline inox_value inox_number_value(inox_number number) {
  inox_value value = { INOX_TAG_NUMBER };
  value.as.number = number;

  return value;
}

static inline bool inox_is_ref_value(inox_value value) {
  return value.tag == INOX_TAG_STRING || value.tag == INOX_TAG_OBJECT || value.tag == INOX_TAG_ARRAY ||
         value.tag == INOX_TAG_BYTES || value.tag == INOX_TAG_FUNCTION || value.tag == INOX_TAG_MAP ||
         value.tag == INOX_TAG_SET || value.tag == INOX_TAG_CLASS_INSTANCE;
}

bool inox_value_truthy(inox_value value);

static inline void inox_ref_init_weak(inox_ref* ref) {
#ifdef INOX_ENABLE_WEAK
  if (ref != 0) {
    ref->weak_cell = 0;
  }
#else
  (void)ref;
#endif
}

void inox_retain(inox_value value);
void inox_release(inox_value value);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

class Array;

#include <memory>
#include <utility>
#include <string.h>
#include "inox/string_view.h"
#include "inox/string.h"

namespace inox {

struct AdoptValue {
};

inline constexpr AdoptValue adopt_value = {};

class Value {
private:
  inox_value value_;

public:
  using Storage = decltype(((inox_value*)0)->as);

  inox_tag& tag;
  Storage& as;

  Value() : value_(inox_undefined_value()), tag(value_.tag), as(value_.as) {}

  Value(inox_value value) : value_(value), tag(value_.tag), as(value_.as) {
    inox_retain(value_);
  }

  Value(AdoptValue, inox_value value) : value_(value), tag(value_.tag), as(value_.as) {}

  Value(const Value& other) : value_(other.value_), tag(value_.tag), as(value_.as) {
    inox_retain(value_);
  }

  Value(Value&& other) noexcept : value_(other.value_), tag(value_.tag), as(value_.as) {
    other.value_ = inox_undefined_value();
  }

  Value& operator=(const Value& other) {
    if (this != std::addressof(other)) {
      inox_retain(other.value_);
      inox_release(value_);
      value_ = other.value_;
    }

    return *this;
  }

  Value& operator=(Value&& other) noexcept {
    if (this != std::addressof(other)) {
      inox_release(value_);
      value_ = other.value_;
      other.value_ = inox_undefined_value();
    }

    return *this;
  }

  Value& operator=(inox_value value) {
    inox_retain(value);
    inox_release(value_);
    value_ = value;

    return *this;
  }

  ~Value() {
    inox_release(value_);
  }

  inox_value raw() const {
    return value_;
  }

  operator inox_value() const {
    return value_;
  }

  inox_value* operator&() {
    return &value_;
  }

  const inox_value* operator&() const {
    return &value_;
  }

  inox_value* out() {
    reset();
    return &value_;
  }

  void reset() {
    inox_release(value_);
    value_ = inox_undefined_value();
  }

  inox_value release() {
    inox_value value = value_;
    value_ = inox_undefined_value();

    return value;
  }

  inox_status copy_to(inox_value* out) const {
    if (out == nullptr) {
      return INOX_ERR_TYPE;
    }

    *out = value_;
    inox_retain(*out);
    return INOX_OK;
  }
};

inline Value adopt(inox_value value) {
  return Value(adopt_value, value);
}

class String : public Value {
private:
  static Value make(const char* bytes, size_t len) {
    inox_value value = inox_undefined_value();

    if (bytes == nullptr) {
      return Value();
    }

    if (inox_string_from_literal(&inox_default_allocator, bytes, len, &value) != INOX_OK) {
      return Value();
    }

    return adopt(value);
  }

  static inox_value from_ref(inox_string* string) {
    if (string == nullptr) {
      return inox_undefined_value();
    }

    inox_value value = { INOX_TAG_STRING };
    value.as.ref = (inox_ref*)&string->header;

    return value;
  }

  static size_t non_negative_index(double raw) {
    if (raw != raw || raw <= 0) {
      return 0;
    }

    if (raw > (double)((size_t)-1)) {
      return (size_t)-1;
    }

    return (size_t)raw;
  }

  static size_t slice_index(double raw, size_t length) {
    if (raw != raw) {
      return 0;
    }

    if (raw <= -((double)length)) {
      return 0;
    }

    if (raw >= ((double)length)) {
      return length;
    }

    long long index = (long long)raw;

    if (index < 0) {
      long long from_end = (long long)length + index;
      return from_end < 0 ? 0 : (size_t)from_end;
    }

    return (size_t)index;
  }

  String transform(inox_status (*fn)(inox_allocator*, const char*, size_t, inox_value*)) const {
    if (!valid()) {
      return String();
    }

    inox_value out = inox_undefined_value();

    if (fn(&inox_default_allocator, bytes(), length(), &out) != INOX_OK) {
      return String();
    }

    return String(adopt_value, out);
  }

public:
  String() : Value() {}

  String(const char* bytes) : Value(make(bytes, bytes == nullptr ? 0 : strlen(bytes))) {}

  String(const char* bytes, size_t len) : Value(make(bytes, len)) {}

  String(StringView view) : Value(make(view.bytes, view.len)) {}

  explicit String(inox_string* string) : Value(from_ref(string)) {}

  explicit String(const Value& value) : Value(value) {}

  explicit String(Value&& value) : Value(std::move(value)) {}

  explicit String(inox_value value) : Value(value) {}

  String(AdoptValue, inox_value value) : Value(adopt_value, value) {}

  using Value::operator=;

  bool valid() const {
    inox_value value = raw();

    return value.tag == INOX_TAG_STRING && value.as.ref != nullptr;
  }

  size_t length() const {
    if (!valid()) {
      return 0;
    }

    return ((inox_string*)raw().as.ref)->len;
  }

  const char* bytes() const {
    if (!valid()) {
      return "";
    }

    return ((inox_string*)raw().as.ref)->bytes;
  }

  operator StringView() const {
    return StringView(bytes(), length());
  }

  String trim() const {
    return transform(inox_string_trim_parts);
  }

  String trimStart() const {
    return transform(inox_string_trim_start_parts);
  }

  String trimLeft() const {
    return trimStart();
  }

  String trimEnd() const {
    return transform(inox_string_trim_end_parts);
  }

  String trimRight() const {
    return trimEnd();
  }

  String toUpperCase() const {
    return transform(inox_string_to_upper_case_parts);
  }

  String padStart(double target_len) const {
    return padStart(target_len, StringView(" "));
  }

  String padStart(double target_len, StringView pad) const {
    if (!valid()) {
      return String();
    }

    inox_value out = inox_undefined_value();
    size_t target = non_negative_index(target_len);

    if (inox_string_pad_start_parts(&inox_default_allocator, bytes(), length(), target, pad.bytes, pad.len, &out) != INOX_OK) {
      return String();
    }

    return String(adopt_value, out);
  }

  String slice(double start) const {
    return slice(start, (double)inox_string_code_unit_length_parts(bytes(), length()));
  }

  String slice(double start, double end) const {
    if (!valid()) {
      return String();
    }

    inox_value out = inox_undefined_value();
    const size_t code_unit_length = inox_string_code_unit_length_parts(bytes(), length());
    size_t start_index = slice_index(start, code_unit_length);
    size_t end_index = slice_index(end, code_unit_length);

    if (end_index < start_index) {
      end_index = start_index;
    }

    if (inox_string_slice_parts(&inox_default_allocator, bytes(), length(), start_index, end_index, &out) != INOX_OK) {
      return String();
    }

    return String(adopt_value, out);
  }

  ::Array split(StringView separator) const;

  bool includes(StringView search) const {
    return valid() && inox_string_includes_parts(bytes(), length(), search.bytes, search.len);
  }

  bool includes(StringView search, double start) const {
    return valid() && inox_string_includes_from_parts(bytes(), length(), search.bytes, search.len, non_negative_index(start));
  }

  bool startsWith(StringView search) const {
    return valid() && inox_string_starts_with_parts(bytes(), length(), search.bytes, search.len);
  }

  bool endsWith(StringView search) const {
    return valid() && inox_string_ends_with_parts(bytes(), length(), search.bytes, search.len);
  }

  double indexOf(StringView search) const {
    return indexOf(search, 0);
  }

  double indexOf(StringView search, double start) const {
    if (!valid()) {
      return -1;
    }

    return inox_string_index_of_parts(bytes(), length(), search.bytes, search.len, non_negative_index(start));
  }

  double lastIndexOf(StringView search) const {
    if (!valid()) {
      return -1;
    }

    return inox_string_last_index_of_parts(
      bytes(),
      length(),
      search.bytes,
      search.len,
      inox_string_code_unit_length_parts(bytes(), length())
    );
  }

  double lastIndexOf(StringView search, double start) const {
    if (!valid()) {
      return -1;
    }

    return inox_string_last_index_of_parts(bytes(), length(), search.bytes, search.len, non_negative_index(start));
  }
};

inline String string(const char* bytes, size_t len) {
  return String(bytes, len);
}

inline String string(StringView view) {
  return String(view);
}

inline String string(const char* bytes) {
  return String(bytes);
}

} // namespace inox

inline void inox_release(inox::Value& value) {
  value.reset();
}

#endif

#endif
