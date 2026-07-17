#include "inox/binary.h"

#include <cmath>
#include <cstring>
#include <limits>
#include <utility>

#ifdef INOX_DEBUG_MEMORY
#include "inox/debug.h"
#endif
#include "inox/loop.h"
#include "inox/array.h"

namespace {

enum class BytesKind : std::uint8_t {
  uint8Array,
  buffer
};

struct BytesStorage {
  inox_ref header;
  BytesStorage* owner;
  std::size_t offset;
  std::size_t length;
  BytesKind kind;
};

void throwBytesError(const char* message) {
  inox::throw_value(inox::String(message));
}

void initializeRef(inox_ref& ref, inox_allocator* allocator, std::size_t size);

void disposeBytes(inox_ref* ref) {
  auto* storage = reinterpret_cast<BytesStorage*>(ref);

  if (storage->owner == nullptr) {
    return;
  }

  inox_value owner{};
  owner.tag = INOX_TAG_BYTES;
  owner.as.ref = &storage->owner->header;
  inox_release(owner);
}

BytesStorage* storage(const inox::Value& value) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_BYTES || raw.as.ref == nullptr) {
    return nullptr;
  }

  return reinterpret_cast<BytesStorage*>(raw.as.ref);
}

BytesStorage* rootStorage(BytesStorage* value) {
  return value->owner == nullptr ? value : value->owner;
}

std::uint8_t* rootBytes(BytesStorage* value) {
  auto* root = rootStorage(value);
  return reinterpret_cast<std::uint8_t*>(root + 1);
}

std::uint8_t* storageBytes(BytesStorage* value) {
  return rootBytes(value) + value->offset;
}

bool numberToLength(double value, std::size_t maximum, std::size_t& result) {
  if (!std::isfinite(value) || value < 0 || std::trunc(value) != value || value > static_cast<double>(maximum)) {
    return false;
  }

  result = static_cast<std::size_t>(value);
  return static_cast<double>(result) == value;
}

std::size_t sliceIndex(double value, std::size_t length) {
  if (std::isnan(value)) {
    return 0;
  }

  if (value == std::numeric_limits<double>::infinity()) {
    return length;
  }

  if (value == -std::numeric_limits<double>::infinity()) {
    return 0;
  }

  const double integer = std::trunc(value);

  if (integer < 0) {
    const double relative = static_cast<double>(length) + integer;
    return relative <= 0 ? 0 : static_cast<std::size_t>(relative);
  }

  return integer >= static_cast<double>(length) ? length : static_cast<std::size_t>(integer);
}

bool arrayIndex(double value, std::size_t length, std::size_t& result) {
  return numberToLength(value, length == 0 ? 0 : length - 1, result) && result < length;
}

std::uint8_t toUint8(double value) {
  if (!std::isfinite(value) || value == 0) {
    return 0;
  }

  double integer = std::trunc(value);
  integer = std::fmod(integer, 256.0);

  if (integer < 0) {
    integer += 256.0;
  }

  return static_cast<std::uint8_t>(integer);
}

Uint8Array adoptStorage(BytesStorage* value) {
  inox_value raw{};
  raw.tag = INOX_TAG_BYTES;
  raw.as.ref = &value->header;
  return Uint8Array(inox::adopt(raw));
}

BytesStorage* allocateStorage(std::size_t length, BytesKind kind) {
  inox_allocator* allocator = &inox_default_allocator;

  if (allocator->alloc == nullptr || length > std::numeric_limits<std::size_t>::max() - sizeof(BytesStorage)) {
    return nullptr;
  }

  const std::size_t size = sizeof(BytesStorage) + length;
  auto* value = reinterpret_cast<BytesStorage*>(allocator->alloc(allocator->user, size, alignof(BytesStorage)));

  if (value == nullptr) {
    return nullptr;
  }

  initializeRef(value->header, allocator, size);
  value->owner = nullptr;
  value->offset = 0;
  value->length = length;
  value->kind = kind;

  return value;
}

BytesStorage* allocateView(BytesStorage* source, std::size_t start, std::size_t length, BytesKind kind) {
  inox_allocator* allocator = source->header.allocator;

  if (allocator == nullptr || allocator->alloc == nullptr) {
    return nullptr;
  }

  auto* value = reinterpret_cast<BytesStorage*>(
    allocator->alloc(allocator->user, sizeof(BytesStorage), alignof(BytesStorage))
  );

  if (value == nullptr) {
    return nullptr;
  }

  initializeRef(value->header, allocator, sizeof(BytesStorage));
  value->owner = rootStorage(source);
  value->offset = source->offset + start;
  value->length = length;
  value->kind = kind;

  inox_value owner{};
  owner.tag = INOX_TAG_BYTES;
  owner.as.ref = &value->owner->header;
  inox_retain(owner);

  return value;
}

void initializeRef(inox_ref& ref, inox_allocator* allocator, std::size_t size) {
  ref.kind = INOX_REF_BYTES;
  ref.ref_count = 1;
  ref.flags = 0;
  ref.size = size;
  ref.align = alignof(BytesStorage);
  ref.allocator = allocator;
  ref.dispose = disposeBytes;
  inox_ref_init_weak(&ref);
#ifdef INOX_DEBUG_MEMORY
  inox::debugMemory.recordRefCreated(INOX_REF_BYTES);
#endif
}

std::size_t uint8DecimalLength(std::uint8_t value) {
  if (value >= 100) {
    return 3;
  }

  return value >= 10 ? 2 : 1;
}

std::size_t writeUint8Decimal(std::uint8_t value, char* out) {
  if (value >= 100) {
    out[0] = static_cast<char>('0' + (value / 100));
    out[1] = static_cast<char>('0' + ((value / 10) % 10));
    out[2] = static_cast<char>('0' + (value % 10));
    return 3;
  }

  if (value >= 10) {
    out[0] = static_cast<char>('0' + (value / 10));
    out[1] = static_cast<char>('0' + (value % 10));
    return 2;
  }

  out[0] = static_cast<char>('0' + value);
  return 1;
}

} // namespace

Uint8Array::Reference::Reference(Uint8Array* owner, double index) : owner_(owner), index_(index) {}

Uint8Array::Reference& Uint8Array::Reference::operator=(double value) {
  owner_->write(index_, value);
  return *this;
}

Uint8Array::Reference::operator double() const {
  return owner_->read(index_);
}

Uint8Array::Uint8Array() : inox::Value() {}

Uint8Array::Uint8Array(double length) : inox::Value() {
  auto value = allocate(length, false);
  inox::Value::operator=(std::move(value));
}

Uint8Array::Uint8Array(std::initializer_list<double> values) : inox::Value() {
  auto value = allocate(static_cast<double>(values.size()), false);
  inox::Value::operator=(std::move(value));

  if (!valid()) {
    return;
  }

  std::size_t index = 0;
  for (const double item : values) {
    write(static_cast<double>(index), item);
    index += 1;
  }
}

Uint8Array::Uint8Array(std::span<const std::uint8_t> values) : inox::Value() {
  auto value = copy(values, false);
  inox::Value::operator=(std::move(value));
}

Uint8Array::Uint8Array(const inox::Value& value) : inox::Value() {
  if (storage(value) != nullptr) {
    inox::Value::operator=(value);
    return;
  }

  Array array(value);

  if (!array.valid()) {
    inox::Value::operator=(value);
    return;
  }

  auto converted = allocate(static_cast<double>(array.length()), false);
  inox::Value::operator=(std::move(converted));

  if (!valid()) {
    return;
  }

  for (std::size_t index = 0; index < array.length(); index += 1) {
    const inox_value item = array.get(index).raw();

    if (item.tag != INOX_TAG_NUMBER) {
      throwBytesError("TypeError: Uint8Array values must be numbers");
      inox::Value::operator=(inox::Value());
      return;
    }

    write(static_cast<double>(index), item.as.number);

    if (inox::thrown()) {
      inox::Value::operator=(inox::Value());
      return;
    }
  }
}

Uint8Array::Uint8Array(inox::Value&& value) : Uint8Array(static_cast<const inox::Value&>(value)) {}

bool Uint8Array::valid() const {
  return storage(*this) != nullptr;
}

std::size_t Uint8Array::length() const {
  auto* value = storage(*this);

  if (value == nullptr) {
    throwBytesError("TypeError: Uint8Array.length receiver is not a Uint8Array");
    return 0;
  }

  return value->length;
}

std::span<const std::uint8_t> Uint8Array::bytes() const {
  auto* value = storage(*this);

  if (value == nullptr) {
    throwBytesError("TypeError: Uint8Array bytes receiver is not a Uint8Array");
    return {};
  }

  return { storageBytes(value), value->length };
}

std::span<std::uint8_t> Uint8Array::bytes() {
  auto* value = storage(*this);

  if (value == nullptr) {
    throwBytesError("TypeError: Uint8Array bytes receiver is not a Uint8Array");
    return {};
  }

  return { storageBytes(value), value->length };
}

Uint8Array::Reference Uint8Array::operator[](double index) {
  return Reference(this, index);
}

double Uint8Array::operator[](double index) const {
  return read(index);
}

Uint8Array Uint8Array::slice(double start) const {
  return slice(start, static_cast<double>(length()));
}

Uint8Array Uint8Array::slice(double start, double end) const {
  auto* value = storage(*this);

  if (value == nullptr) {
    throwBytesError("TypeError: Uint8Array.slice receiver is not a Uint8Array");
    return Uint8Array();
  }

  const std::size_t first = sliceIndex(start, value->length);
  const std::size_t last = sliceIndex(end, value->length);
  const std::size_t count = last < first ? 0 : last - first;
  return copy({ storageBytes(value) + first, count }, false);
}

inox::String Uint8Array::toString() const {
  const auto values = bytes();

  if (inox::thrown()) {
    return inox::String();
  }

  if (values.empty()) {
    return inox::String("", 0);
  }

  std::size_t totalLength = 0;

  for (std::size_t index = 0; index < values.size(); index += 1) {
    const std::size_t commaLength = index == 0 ? 0 : 1;
    const std::size_t digitLength = uint8DecimalLength(values[index]);

    if (
      totalLength > std::numeric_limits<std::size_t>::max() - commaLength ||
      totalLength + commaLength > std::numeric_limits<std::size_t>::max() - digitLength
    ) {
      throwBytesError("TypeError: Uint8Array string allocation failed");
      return inox::String();
    }

    totalLength += commaLength + digitLength;
  }

  auto* allocator = storage(*this)->header.allocator;
  auto* text = static_cast<char*>(allocator->alloc(allocator->user, totalLength, alignof(char)));

  if (text == nullptr) {
    throwBytesError("TypeError: Uint8Array string allocation failed");
    return inox::String();
  }

  std::size_t offset = 0;
  for (std::size_t index = 0; index < values.size(); index += 1) {
    if (index > 0) {
      text[offset] = ',';
      offset += 1;
    }

    offset += writeUint8Decimal(values[index], text + offset);
  }

  inox::String result(text, totalLength);
  allocator->free(allocator->user, text, totalLength, alignof(char));
  return result;
}

Uint8Array Uint8Array::allocate(double length, bool buffer) {
  std::size_t converted = 0;

  if (!numberToLength(length, maximumLength(), converted)) {
    throwBytesError("RangeError: byte array length is invalid");
    return Uint8Array();
  }

  auto* value = allocateStorage(converted, buffer ? BytesKind::buffer : BytesKind::uint8Array);

  if (value == nullptr) {
    throwBytesError("TypeError: byte array allocation failed");
    return Uint8Array();
  }

  if (converted > 0) {
    std::memset(storageBytes(value), 0, converted);
  }

  return adoptStorage(value);
}

Uint8Array Uint8Array::copy(std::span<const std::uint8_t> values, bool buffer) {
  auto result = allocate(static_cast<double>(values.size()), buffer);

  if (!result.valid()) {
    return Uint8Array();
  }

  if (!values.empty()) {
    std::memcpy(result.bytes().data(), values.data(), values.size());
  }

  return result;
}

std::size_t Uint8Array::maximumLength() {
  constexpr std::uint64_t maxSafeInteger = 9007199254740991ULL;
  const std::size_t allocationMaximum = std::numeric_limits<std::size_t>::max() - sizeof(BytesStorage);
  return allocationMaximum < maxSafeInteger
    ? allocationMaximum
    : static_cast<std::size_t>(maxSafeInteger);
}

Uint8Array Uint8Array::view(double start, double end, bool buffer) const {
  auto* source = storage(*this);

  if (source == nullptr) {
    throwBytesError("TypeError: byte array slice receiver is invalid");
    return Uint8Array();
  }

  const std::size_t first = sliceIndex(start, source->length);
  const std::size_t last = sliceIndex(end, source->length);
  const std::size_t count = last < first ? 0 : last - first;
  auto* result = allocateView(source, first, count, buffer ? BytesKind::buffer : BytesKind::uint8Array);

  if (result == nullptr) {
    throwBytesError("TypeError: byte array view allocation failed");
    return Uint8Array();
  }

  return adoptStorage(result);
}

bool Uint8Array::isBufferValue() const {
  auto* value = storage(*this);
  return value != nullptr && value->kind == BytesKind::buffer;
}

double Uint8Array::read(double index) const {
  auto* value = storage(*this);
  std::size_t converted = 0;

  if (value == nullptr || !arrayIndex(index, value->length, converted)) {
    throwBytesError("TypeError: Uint8Array index is out of bounds");
    return 0;
  }

  return storageBytes(value)[converted];
}

void Uint8Array::write(double index, double value) {
  auto* target = storage(*this);
  std::size_t converted = 0;

  if (target == nullptr || !arrayIndex(index, target->length, converted)) {
    throwBytesError("TypeError: Uint8Array index is out of bounds");
    return;
  }

  storageBytes(target)[converted] = toUint8(value);
}
