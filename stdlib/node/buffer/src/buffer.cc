#include <string.h>
#include <utility>
#include "inox/binary.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/loop.h"

static Uint8Array make_bytes(
  inox_allocator* allocator,
  const uint8_t* data,
  size_t length,
  bool zero_fill
);
static inox_status allocate_bytes(inox_allocator* allocator, size_t length, BytesStorage** out);
static void throw_bytes_error(const char* message);
static size_t uint8_decimal_length(uint8_t value);
static size_t write_uint8_decimal(uint8_t value, char* out);

Uint8Array::Uint8Array() : inox::Value() {}

Uint8Array::Uint8Array(const inox::Value& value) : inox::Value(value) {}

Uint8Array::Uint8Array(inox::Value&& value) : inox::Value(std::move(value)) {}

Uint8Array Uint8Array::create(size_t length) {
  Uint8Array result = make_bytes(&inox_default_allocator, nullptr, length, true);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Uint8Array allocation failed");
    return Uint8Array();
  }

  return result;
}

Uint8Array Uint8Array::from(const uint8_t* bytes, size_t length) {
  Uint8Array result = make_bytes(&inox_default_allocator, bytes, length, false);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Uint8Array allocation failed");
    return Uint8Array();
  }

  return result;
}

bool Uint8Array::valid() const {
  inox_value value = raw();

  return value.tag == INOX_TAG_BYTES && value.as.ref != nullptr;
}

size_t Uint8Array::length() const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array.length receiver is not a Uint8Array");
    return 0;
  }

  return instance->length;
}

const uint8_t* Uint8Array::bytes() const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array bytes receiver is not a Uint8Array");
    return nullptr;
  }

  return instance->bytes;
}

uint8_t* Uint8Array::bytes() {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array bytes receiver is not a Uint8Array");
    return nullptr;
  }

  return instance->bytes;
}

uint8_t Uint8Array::get(size_t index) const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array index receiver is not a Uint8Array");
    return 0;
  }

  if (index >= instance->length) {
    throw_bytes_error("TypeError: Uint8Array index is out of bounds");
    return 0;
  }

  return instance->bytes[index];
}

void Uint8Array::set(size_t index, uint8_t byte) const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array index receiver is not a Uint8Array");
    return;
  }

  if (index >= instance->length) {
    throw_bytes_error("TypeError: Uint8Array index is out of bounds");
    return;
  }

  instance->bytes[index] = byte;
}

Uint8Array Uint8Array::slice(size_t start, size_t end) const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array.slice receiver is not a Uint8Array");
    return Uint8Array();
  }

  if (start > instance->length) {
    start = instance->length;
  }

  if (end > instance->length) {
    end = instance->length;
  }

  if (end < start) {
    end = start;
  }

  Uint8Array result = make_bytes(instance->header.allocator, instance->bytes + start, end - start, false);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Uint8Array allocation failed");
    return Uint8Array();
  }

  return result;
}

inox::String Uint8Array::toString() const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Uint8Array.toString receiver is not a Uint8Array");
    return inox::String();
  }

  if (instance->length == 0) {
    return inox::String("", 0);
  }

  size_t total_length = 0;

  for (size_t index = 0; index < instance->length; ++index) {
    const size_t comma_length = index == 0 ? 0 : 1;
    const size_t digit_length = uint8_decimal_length(instance->bytes[index]);

    if (
      total_length > ((size_t)-1) - comma_length ||
      total_length + comma_length > ((size_t)-1) - digit_length
    ) {
      throw_bytes_error("TypeError: Uint8Array string allocation failed");
      return inox::String();
    }

    total_length += comma_length + digit_length;
  }

  inox_allocator* allocator = instance->header.allocator;

  if (allocator == nullptr || allocator->alloc == nullptr || allocator->free == nullptr) {
    throw_bytes_error("TypeError: Uint8Array allocator is not available");
    return inox::String();
  }

  char* text = (char*)allocator->alloc(allocator->user, total_length, alignof(char));

  if (text == nullptr) {
    throw_bytes_error("TypeError: Uint8Array string allocation failed");
    return inox::String();
  }

  size_t offset = 0;

  for (size_t index = 0; index < instance->length; ++index) {
    if (index > 0) {
      text[offset] = ',';
      offset += 1;
    }

    offset += write_uint8_decimal(instance->bytes[index], text + offset);
  }

  inox::String result(text, total_length);
  allocator->free(allocator->user, text, total_length, alignof(char));

  return result;
}

BytesStorage* Uint8Array::data() const {
  inox_value value = raw();

  if (value.tag != INOX_TAG_BYTES || value.as.ref == nullptr) {
    return nullptr;
  }

  return (BytesStorage*)value.as.ref;
}

Buffer::Buffer() : Uint8Array() {}

Buffer::Buffer(const inox::Value& value) : Uint8Array(value) {}

Buffer::Buffer(inox::Value&& value) : Uint8Array(std::move(value)) {}

Buffer::Buffer(const Uint8Array& value) : Uint8Array(value) {}

Buffer::Buffer(Uint8Array&& value) : Uint8Array(std::move(value)) {}

Buffer Buffer::alloc(size_t length) {
  Uint8Array result = make_bytes(&inox_default_allocator, nullptr, length, true);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Buffer allocation failed");
    return Buffer();
  }

  return Buffer(std::move(result));
}

Buffer Buffer::from(inox::StringView text) {
  Uint8Array result = make_bytes(&inox_default_allocator, (const uint8_t*)text.bytes, text.len, false);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Buffer allocation failed");
    return Buffer();
  }

  return Buffer(std::move(result));
}

Buffer Buffer::from(const uint8_t* bytes, size_t length) {
  Uint8Array result = make_bytes(&inox_default_allocator, bytes, length, false);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Buffer allocation failed");
    return Buffer();
  }

  return Buffer(std::move(result));
}

bool Buffer::isBuffer(const inox::Value& value) {
  inox_value raw = value.raw();

  return raw.tag == INOX_TAG_BYTES && raw.as.ref != nullptr;
}

Buffer Buffer::slice(size_t start, size_t end) const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Buffer.slice receiver is not a Buffer");
    return Buffer();
  }

  if (start > instance->length) {
    start = instance->length;
  }

  if (end > instance->length) {
    end = instance->length;
  }

  if (end < start) {
    end = start;
  }

  Uint8Array result = make_bytes(instance->header.allocator, instance->bytes + start, end - start, false);

  if (!result.valid()) {
    throw_bytes_error("TypeError: Buffer allocation failed");
    return Buffer();
  }

  return Buffer(std::move(result));
}

inox::String Buffer::toString() const {
  BytesStorage* instance = data();

  if (instance == nullptr) {
    throw_bytes_error("TypeError: Buffer.toString receiver is not a Buffer");
    return inox::String();
  }

  return inox::String((const char*)instance->bytes, instance->length);
}

static Uint8Array make_bytes(
  inox_allocator* allocator,
  const uint8_t* data,
  size_t length,
  bool zero_fill
) {
  if (allocator == nullptr || allocator->alloc == nullptr || (data == nullptr && length != 0 && !zero_fill)) {
    return Uint8Array();
  }

  BytesStorage* bytes = nullptr;
  inox_status status = allocate_bytes(allocator, length, &bytes);

  if (status != INOX_OK) {
    return Uint8Array();
  }

  if (data != nullptr && length != 0) {
    memcpy(bytes->bytes, data, length);
  } else if (zero_fill && length != 0) {
    memset(bytes->bytes, 0, length);
  }

  inox_value value = { INOX_TAG_BYTES };
  value.as.ref = &bytes->header;

  return Uint8Array(inox::adopt(value));
}

static inox_status allocate_bytes(inox_allocator* allocator, size_t length, BytesStorage** out) {
  if (out == nullptr || allocator == nullptr || allocator->alloc == nullptr) {
    return INOX_ERR_TYPE;
  }

  *out = nullptr;

  if (length > ((size_t)-1) - sizeof(BytesStorage)) {
    return INOX_ERR_OOM;
  }

  size_t size = sizeof(BytesStorage) + length;
  BytesStorage* bytes = (BytesStorage*)allocator->alloc(allocator->user, size, alignof(BytesStorage));

  if (bytes == nullptr) {
    return INOX_ERR_OOM;
  }

  bytes->header.kind = INOX_REF_BYTES;
  bytes->header.ref_count = 1;
  bytes->header.flags = 0;
  bytes->header.size = size;
  bytes->header.align = alignof(BytesStorage);
  bytes->header.allocator = allocator;
  bytes->header.dispose = 0;
  inox_ref_init_weak(&bytes->header);
  bytes->length = length;
  *out = bytes;
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_BYTES);
#endif

  return INOX_OK;
}

static void throw_bytes_error(const char* message) {
  inox::throw_value(inox::String(message));
}

static size_t uint8_decimal_length(uint8_t value) {
  if (value >= 100) {
    return 3;
  }

  if (value >= 10) {
    return 2;
  }

  return 1;
}

static size_t write_uint8_decimal(uint8_t value, char* out) {
  if (value >= 100) {
    out[0] = (char)('0' + (value / 100));
    out[1] = (char)('0' + ((value / 10) % 10));
    out[2] = (char)('0' + (value % 10));
    return 3;
  }

  if (value >= 10) {
    out[0] = (char)('0' + (value / 10));
    out[1] = (char)('0' + (value % 10));
    return 2;
  }

  out[0] = (char)('0' + value);
  return 1;
}
