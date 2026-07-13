#include "inox/crypto.h"

#include <limits.h>
#include <stdint.h>
#include <span>
#include <utility>
#include "inox/array.h"
#include "inox/binary.h"
#include "inox/buffer.h"
#include "inox/loop.h"
#include "inox/string.h"

#if defined(INOX_TLS_BACKEND_BORINGSSL) || defined(INOX_TLS_BACKEND_OPENSSL)
#include <openssl/evp.h>
#include <openssl/hmac.h>
#define INOX_CRYPTO_HASH_HAS_EVP 1
#else
#define INOX_CRYPTO_HASH_HAS_EVP 0
#endif

#if defined(INOX_LOOP_BACKEND_LIBUV)
#include <uv.h>
#elif defined(_WIN32)
#include <bcrypt.h>
#include <windows.h>
#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
#include <stdlib.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

static inox_status inox_crypto_random_bytes_raw(uint8_t* out, size_t len);
static int inox_crypto_number_to_size(inox_number value, size_t* out);
static int inox_crypto_number_is_integer(inox_number value);
static int CryptoHashState_algorithm_is_sha256(const char* algorithm, size_t algorithm_len);
static inox_status CryptoHashState_data(inox_value data, const uint8_t** bytes, size_t* len);
static inox_status CryptoHashState_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  CryptoHashState** out
);
static void CryptoHashState_free(CryptoHashState* hash);
static inox_status CryptoHmacState_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  const uint8_t* key_bytes,
  size_t key_len,
  CryptoHmacState** out
);
static inox_status CryptoHmacState_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value key,
  CryptoHmacState** out
);
static void CryptoHmacState_free(CryptoHmacState* hmac);
static inox_status CryptoHashState_digest_raw(CryptoHashState* hash, uint8_t* digest, size_t* len);
static inox_status CryptoHmacState_digest_raw(CryptoHmacState* hmac, uint8_t* digest, size_t* len);
static inox_status CryptoHashState_update(CryptoHashState* hash, const uint8_t* bytes, size_t len);
static inox_status CryptoHmacState_update(CryptoHmacState* hmac, const uint8_t* bytes, size_t len);
static Uint8Array inox_crypto_random_fill_sync(
  Uint8Array value,
  inox_number offset,
  inox_number size,
  bool has_size
);
static bool inox_crypto_string_equals(inox::StringView value, const char* expected, size_t expected_len);
static char inox_crypto_hex_digit(uint8_t value);
static void inox_crypto_throw_failed(const char* message);

struct CryptoHashState {
  inox_allocator* allocator;
#if INOX_CRYPTO_HASH_HAS_EVP
  EVP_MD_CTX* ctx;
#endif
  int finalized;
};

struct CryptoHmacState {
  inox_allocator* allocator;
#if INOX_CRYPTO_HASH_HAS_EVP
  HMAC_CTX* ctx;
#endif
  int finalized;
};

Hash::Hash() : handle_(0) {}

Hash::Hash(CryptoHashState* handle) : handle_(handle) {}

Hash::~Hash() {
  CryptoHashState_free(handle_);
}

Hash::Hash(Hash&& other) noexcept : handle_(other.handle_) {
  other.handle_ = 0;
}

Hash& Hash::operator=(Hash&& other) noexcept {
  if (this != &other) {
    CryptoHashState_free(handle_);
    handle_ = other.handle_;
    other.handle_ = 0;
  }

  return *this;
}

Hash& Hash::update(inox::StringView data) {
  if (CryptoHashState_update(handle_, (const uint8_t*)data.bytes, data.len) != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
  }

  return *this;
}

Hash& Hash::update(inox::StringView data, inox::StringView encoding) {
  if (!inox_crypto_string_equals(encoding, "utf8", 4)) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
    return *this;
  }

  return update(data);
}

Hash& Hash::update(const inox::Value& data) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    CryptoHashState_data(data.raw(), &bytes, &len) != INOX_OK ||
    CryptoHashState_update(handle_, bytes, len) != INOX_OK
  ) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
  }

  return *this;
}

Hash& Hash::update(const inox::Value& data, inox::StringView encoding) {
  if (!inox_crypto_string_equals(encoding, "utf8", 4)) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
    return *this;
  }

  return update(data);
}

Buffer Hash::digest() {
#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  size_t len = 0;
  inox_status status = CryptoHashState_digest_raw(handle_, digest, &len);

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hash.digest failed");
    return Buffer();
  }

  Buffer bytes(std::span<const uint8_t>(digest, len));

  if (inox::thrown() || !bytes.valid()) {
    inox_crypto_throw_failed("crypto.Hash.digest failed");
    return Buffer();
  }

  return bytes;
#else
  inox_crypto_throw_failed("crypto.Hash.digest failed");
  return Buffer();
#endif
}

inox::String Hash::digest(inox::StringView encoding) {
  if (!inox_crypto_string_equals(encoding, "hex", 3)) {
    inox_crypto_throw_failed("crypto.Hash.digest failed");
    return inox::String();
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  char hex[EVP_MAX_MD_SIZE * 2];
  size_t len = 0;
  inox_status status = CryptoHashState_digest_raw(handle_, digest, &len);

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hash.digest failed");
    return inox::String();
  }

  for (size_t index = 0; index < len; index += 1) {
    hex[index * 2] = inox_crypto_hex_digit((uint8_t)(digest[index] >> 4));
    hex[index * 2 + 1] = inox_crypto_hex_digit((uint8_t)(digest[index] & 0x0fu));
  }

  inox::String result(hex, len * 2);

  if (!result.valid()) {
    inox_crypto_throw_failed("crypto.Hash.digest failed");
    return inox::String();
  }

  return result;
#else
  inox_crypto_throw_failed("crypto.Hash.digest failed");
  return inox::String();
#endif
}

Hmac::Hmac() : handle_(0) {}

Hmac::Hmac(CryptoHmacState* handle) : handle_(handle) {}

Hmac::~Hmac() {
  CryptoHmacState_free(handle_);
}

Hmac::Hmac(Hmac&& other) noexcept : handle_(other.handle_) {
  other.handle_ = 0;
}

Hmac& Hmac::operator=(Hmac&& other) noexcept {
  if (this != &other) {
    CryptoHmacState_free(handle_);
    handle_ = other.handle_;
    other.handle_ = 0;
  }

  return *this;
}

Hmac& Hmac::update(inox::StringView data) {
  if (CryptoHmacState_update(handle_, (const uint8_t*)data.bytes, data.len) != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
  }

  return *this;
}

Hmac& Hmac::update(inox::StringView data, inox::StringView encoding) {
  if (!inox_crypto_string_equals(encoding, "utf8", 4)) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
    return *this;
  }

  return update(data);
}

Hmac& Hmac::update(const inox::Value& data) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    CryptoHashState_data(data.raw(), &bytes, &len) != INOX_OK ||
    CryptoHmacState_update(handle_, bytes, len) != INOX_OK
  ) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
  }

  return *this;
}

Hmac& Hmac::update(const inox::Value& data, inox::StringView encoding) {
  if (!inox_crypto_string_equals(encoding, "utf8", 4)) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
    return *this;
  }

  return update(data);
}

Buffer Hmac::digest() {
#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  size_t len = 0;
  inox_status status = CryptoHmacState_digest_raw(handle_, digest, &len);

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hmac.digest failed");
    return Buffer();
  }

  Buffer bytes(std::span<const uint8_t>(digest, len));

  if (inox::thrown() || !bytes.valid()) {
    inox_crypto_throw_failed("crypto.Hmac.digest failed");
    return Buffer();
  }

  return bytes;
#else
  inox_crypto_throw_failed("crypto.Hmac.digest failed");
  return Buffer();
#endif
}

inox::String Hmac::digest(inox::StringView encoding) {
  if (!inox_crypto_string_equals(encoding, "hex", 3)) {
    inox_crypto_throw_failed("crypto.Hmac.digest failed");
    return inox::String();
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  char hex[EVP_MAX_MD_SIZE * 2];
  size_t len = 0;
  inox_status status = CryptoHmacState_digest_raw(handle_, digest, &len);

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hmac.digest failed");
    return inox::String();
  }

  for (size_t index = 0; index < len; index += 1) {
    hex[index * 2] = inox_crypto_hex_digit((uint8_t)(digest[index] >> 4));
    hex[index * 2 + 1] = inox_crypto_hex_digit((uint8_t)(digest[index] & 0x0fu));
  }

  inox::String result(hex, len * 2);

  if (!result.valid()) {
    inox_crypto_throw_failed("crypto.Hmac.digest failed");
    return inox::String();
  }

  return result;
#else
  inox_crypto_throw_failed("crypto.Hmac.digest failed");
  return inox::String();
#endif
}

ArrayClass crypto::getHashes() const {
#if INOX_CRYPTO_HASH_HAS_EVP
  auto hashes = ArrayClass::create(1);

  if (inox::thrown() || !hashes.valid()) {
    inox_crypto_throw_failed("crypto.getHashes failed");
    return ArrayClass();
  }

  auto sha256 = inox::String("sha256", 6);

  if (!sha256.valid()) {
    inox_crypto_throw_failed("crypto.getHashes failed");
    return ArrayClass();
  }

  hashes.set(0, sha256);

  if (inox::thrown()) {
    inox_crypto_throw_failed("crypto.getHashes failed");
    return ArrayClass();
  }

  return hashes;
#else
  inox_crypto_throw_failed("crypto.getHashes failed");
  return ArrayClass();
#endif
}

Uint8Array crypto::getRandomValues(Uint8Array value) const {
  if (!value.valid()) {
    inox_crypto_throw_failed("crypto.getRandomValues failed");
    return Uint8Array();
  }

  inox_status status = inox_crypto_random_bytes_raw(value.bytes().data(), value.length());

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.getRandomValues failed");
    return Uint8Array();
  }

  return Uint8Array(value);
}

Buffer crypto::randomBytes(inox_number size) const {
  size_t len = 0;

  if (!inox_crypto_number_to_size(size, &len)) {
    inox_crypto_throw_failed("crypto.randomBytes failed");
    return Buffer();
  }

  Buffer out = Buffer::alloc(static_cast<double>(len));

  if (inox::thrown()) {
    return Buffer();
  }

  if (!out.valid()) {
    inox_crypto_throw_failed("crypto.randomBytes failed");
    return Buffer();
  }

  inox_status status = inox_crypto_random_bytes_raw(out.bytes().data(), out.length());

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.randomBytes failed");
    return Buffer();
  }

  return out;
}

Uint8Array crypto::randomFillSync(Uint8Array value) const {
  return inox_crypto_random_fill_sync(value, 0, 0, false);
}

Uint8Array crypto::randomFillSync(Uint8Array value, inox_number offset) const {
  return inox_crypto_random_fill_sync(value, offset, 0, false);
}

Uint8Array crypto::randomFillSync(Uint8Array value, inox_number offset, inox_number size) const {
  return inox_crypto_random_fill_sync(value, offset, size, true);
}

static Uint8Array inox_crypto_random_fill_sync(
  Uint8Array value,
  inox_number offset_value,
  inox_number size_value,
  bool has_size
) {
  size_t offset = 0;
  size_t size = 0;

  if (!value.valid() || !inox_crypto_number_to_size(offset_value, &offset)) {
    inox_crypto_throw_failed("crypto.randomFillSync failed");
    return Uint8Array();
  }

  if (offset > value.length()) {
    inox_crypto_throw_failed("crypto.randomFillSync failed");
    return Uint8Array();
  }

  if (has_size) {
    if (!inox_crypto_number_to_size(size_value, &size)) {
      inox_crypto_throw_failed("crypto.randomFillSync failed");
      return Uint8Array();
    }
  } else {
    size = value.length() - offset;
  }

  if (size > value.length() - offset) {
    inox_crypto_throw_failed("crypto.randomFillSync failed");
    return Uint8Array();
  }

  inox_status status = inox_crypto_random_bytes_raw(value.bytes().data() + offset, size);

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.randomFillSync failed");
    return Uint8Array();
  }

  return Uint8Array(value);
}

inox_number crypto::randomInt(inox_number max) const {
  const inox_number min = 0;

  if (!inox_crypto_number_is_integer(max) || !(max > min)) {
    inox_crypto_throw_failed("crypto.randomInt failed");
    return 0;
  }

  const inox_number range_double = max - min;

  if (range_double <= 0 || range_double > 281474976710656.0) {
    inox_crypto_throw_failed("crypto.randomInt failed");
    return 0;
  }

  const uint64_t range = (uint64_t)range_double;

  if (range == 0 || (inox_number)range != range_double) {
    inox_crypto_throw_failed("crypto.randomInt failed");
    return 0;
  }

  const uint64_t threshold = (UINT64_C(0) - range) % range;
  uint64_t sample = 0;

  do {
    inox_status status = inox_crypto_random_bytes_raw((uint8_t*)&sample, sizeof(sample));

    if (status != INOX_OK) {
      inox_crypto_throw_failed("crypto.randomInt failed");
      return 0;
    }
  } while (sample < threshold);

  return (inox_number)(sample % range);
}

inox_number crypto::randomInt(inox_number min, inox_number max) const {
  if (!inox_crypto_number_is_integer(min) || !inox_crypto_number_is_integer(max) || !(max > min)) {
    inox_crypto_throw_failed("crypto.randomInt failed");
    return 0;
  }

  const inox_number range_double = max - min;

  if (range_double <= 0 || range_double > 281474976710656.0) {
    inox_crypto_throw_failed("crypto.randomInt failed");
    return 0;
  }

  const uint64_t range = (uint64_t)range_double;

  if (range == 0 || (inox_number)range != range_double) {
    inox_crypto_throw_failed("crypto.randomInt failed");
    return 0;
  }

  const uint64_t threshold = (UINT64_C(0) - range) % range;
  uint64_t sample = 0;

  do {
    inox_status status = inox_crypto_random_bytes_raw((uint8_t*)&sample, sizeof(sample));

    if (status != INOX_OK) {
      inox_crypto_throw_failed("crypto.randomInt failed");
      return 0;
    }
  } while (sample < threshold);

  return min + (inox_number)(sample % range);
}

inox::String crypto::randomUUID() const {
  uint8_t bytes[16];
  inox_status status = inox_crypto_random_bytes_raw(bytes, sizeof(bytes));

  if (status != INOX_OK) {
    inox_crypto_throw_failed("crypto.randomUUID failed");
    return inox::String();
  }

  bytes[6] = (uint8_t)((bytes[6] & 0x0fu) | 0x40u);
  bytes[8] = (uint8_t)((bytes[8] & 0x3fu) | 0x80u);

  char uuid[36];
  size_t index = 0;

  for (size_t byte_index = 0; byte_index < sizeof(bytes); byte_index += 1) {
    if (byte_index == 4 || byte_index == 6 || byte_index == 8 || byte_index == 10) {
      uuid[index] = '-';
      index += 1;
    }

    uuid[index] = inox_crypto_hex_digit((uint8_t)(bytes[byte_index] >> 4));
    uuid[index + 1] = inox_crypto_hex_digit((uint8_t)(bytes[byte_index] & 0x0fu));
    index += 2;
  }

  return inox::String(uuid, sizeof(uuid));
}

Hash crypto::createHash(inox::StringView algorithm) const {
  CryptoHashState* hash = 0;

  if (CryptoHashState_create(&inox_default_allocator, algorithm.bytes, algorithm.len, &hash) != INOX_OK) {
    CryptoHashState_free(hash);
    inox_crypto_throw_failed("crypto.createHash failed");
    return Hash();
  }

  return Hash(hash);
}

Hmac crypto::createHmac(inox::StringView algorithm, inox::StringView key) const {
  CryptoHmacState* hmac = 0;

  if (
    CryptoHmacState_create(
      &inox_default_allocator,
      algorithm.bytes,
      algorithm.len,
      (const uint8_t*)key.bytes,
      key.len,
      &hmac
    ) != INOX_OK
  ) {
    CryptoHmacState_free(hmac);
    inox_crypto_throw_failed("crypto.createHmac failed");
    return Hmac();
  }

  return Hmac(hmac);
}

Hmac crypto::createHmac(inox::StringView algorithm, const inox::Value& key) const {
  CryptoHmacState* hmac = 0;

  if (CryptoHmacState_create(&inox_default_allocator, algorithm.bytes, algorithm.len, key.raw(), &hmac) != INOX_OK) {
    CryptoHmacState_free(hmac);
    inox_crypto_throw_failed("crypto.createHmac failed");
    return Hmac();
  }

  return Hmac(hmac);
}

inox::String crypto::hash(inox::StringView algorithm, inox::StringView data) const {
  Hash hash = createHash(algorithm);

  if (inox::thrown()) {
    return inox::String();
  }

  hash.update(data);

  if (inox::thrown()) {
    return inox::String();
  }

  return hash.digest("hex");
}

inox::String crypto::hash(inox::StringView algorithm, const inox::Value& data) const {
  Hash hash = createHash(algorithm);

  if (inox::thrown()) {
    return inox::String();
  }

  hash.update(data);

  if (inox::thrown()) {
    return inox::String();
  }

  return hash.digest("hex");
}

Buffer crypto::hash(
  inox::StringView algorithm,
  inox::StringView data,
  inox::StringView output_encoding
) const {
  if (!inox_crypto_string_equals(output_encoding, "buffer", 6)) {
    inox_crypto_throw_failed("crypto.hash failed");
    return Buffer();
  }

  Hash hash = createHash(algorithm);

  if (inox::thrown()) {
    return Buffer();
  }

  hash.update(data);

  if (inox::thrown()) {
    return Buffer();
  }

  return hash.digest();
}

Buffer crypto::hash(
  inox::StringView algorithm,
  const inox::Value& data,
  inox::StringView output_encoding
) const {
  if (!inox_crypto_string_equals(output_encoding, "buffer", 6)) {
    inox_crypto_throw_failed("crypto.hash failed");
    return Buffer();
  }

  Hash hash = createHash(algorithm);

  if (inox::thrown()) {
    return Buffer();
  }

  hash.update(data);

  if (inox::thrown()) {
    return Buffer();
  }

  return hash.digest();
}

bool crypto::timingSafeEqual(const Uint8Array& left, const Uint8Array& right) const {
  if (!left.valid() || !right.valid() || left.length() != right.length()) {
    inox_crypto_throw_failed("crypto.timingSafeEqual failed");
    return false;
  }

  uint8_t diff = 0;

  for (size_t index = 0; index < left.length(); index += 1) {
    diff = (uint8_t)(diff | (left.bytes()[index] ^ right.bytes()[index]));
  }

  return diff == 0;
}

class crypto crypto;

static inox_status CryptoHashState_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  CryptoHashState** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || algorithm == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (!CryptoHashState_algorithm_is_sha256(algorithm, algorithm_len)) {
    return INOX_ERR_UNSUPPORTED;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  CryptoHashState* hash = (CryptoHashState*)allocator->alloc(allocator->user, sizeof(CryptoHashState), alignof(CryptoHashState));

  if (hash == 0) {
    return INOX_ERR_OOM;
  }

  hash->allocator = allocator;
  hash->ctx = EVP_MD_CTX_new();
  hash->finalized = 0;

  if (hash->ctx == 0) {
    allocator->free(allocator->user, hash, sizeof(CryptoHashState), alignof(CryptoHashState));
    return INOX_ERR_OOM;
  }

  if (EVP_DigestInit_ex(hash->ctx, EVP_sha256(), 0) != 1) {
    CryptoHashState_free(hash);
    return INOX_ERR_UNSUPPORTED;
  }

  *out = hash;

  return INOX_OK;
#else
  (void)allocator;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static void CryptoHashState_free(CryptoHashState* hash) {
  if (hash == 0) {
    return;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  if (hash->ctx != 0) {
    EVP_MD_CTX_free(hash->ctx);
  }
#endif

  if (hash->allocator != 0 && hash->allocator->free != 0) {
    hash->allocator->free(hash->allocator->user, hash, sizeof(CryptoHashState), alignof(CryptoHashState));
  }
}

static inox_status CryptoHmacState_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  const uint8_t* key_bytes,
  size_t key_len,
  CryptoHmacState** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || algorithm == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (!CryptoHashState_algorithm_is_sha256(algorithm, algorithm_len)) {
    return INOX_ERR_UNSUPPORTED;
  }

  if (key_bytes == 0 && key_len != 0) {
    return INOX_ERR_TYPE;
  }

  if (key_len > (size_t)INT_MAX) {
    return INOX_ERR_TYPE;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  CryptoHmacState* hmac = (CryptoHmacState*)allocator->alloc(allocator->user, sizeof(CryptoHmacState), alignof(CryptoHmacState));

  if (hmac == 0) {
    return INOX_ERR_OOM;
  }

  hmac->allocator = allocator;
  hmac->ctx = HMAC_CTX_new();
  hmac->finalized = 0;

  if (hmac->ctx == 0) {
    allocator->free(allocator->user, hmac, sizeof(CryptoHmacState), alignof(CryptoHmacState));
    return INOX_ERR_OOM;
  }

  if (HMAC_Init_ex(hmac->ctx, key_bytes, (int)key_len, EVP_sha256(), 0) != 1) {
    CryptoHmacState_free(hmac);
    return INOX_ERR_UNSUPPORTED;
  }

  *out = hmac;

  return INOX_OK;
#else
  (void)allocator;
  (void)key_bytes;
  (void)key_len;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status CryptoHmacState_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value key,
  CryptoHmacState** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || algorithm == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (!CryptoHashState_algorithm_is_sha256(algorithm, algorithm_len)) {
    return INOX_ERR_UNSUPPORTED;
  }

  const uint8_t* key_bytes = 0;
  size_t key_len = 0;
  inox_status status = CryptoHashState_data(key, &key_bytes, &key_len);

  if (status != INOX_OK) {
    return status;
  }

  return CryptoHmacState_create(allocator, algorithm, algorithm_len, key_bytes, key_len, out);
}

static void CryptoHmacState_free(CryptoHmacState* hmac) {
  if (hmac == 0) {
    return;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  if (hmac->ctx != 0) {
    HMAC_CTX_free(hmac->ctx);
  }
#endif

  if (hmac->allocator != 0 && hmac->allocator->free != 0) {
    hmac->allocator->free(hmac->allocator->user, hmac, sizeof(CryptoHmacState), alignof(CryptoHmacState));
  }
}

static void inox_crypto_throw_failed(const char* message) {
  inox::throw_value(inox::String(message == 0 ? "crypto operation failed" : message));
}

static inox_status inox_crypto_random_bytes_raw(uint8_t* out, size_t len) {
  if (out == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

  if (len == 0) {
    return INOX_OK;
  }

#if defined(INOX_LOOP_BACKEND_LIBUV)
  return uv_random(0, 0, out, len, 0, 0) == 0 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#elif defined(_WIN32)
  return BCryptGenRandom(0, out, (ULONG)len, BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
  arc4random_buf(out, len);

  return INOX_OK;
#else
  int fd = open("/dev/urandom", O_RDONLY);

  if (fd < 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  size_t filled = 0;

  while (filled < len) {
    ssize_t read_count = read(fd, out + filled, len - filled);

    if (read_count <= 0) {
      close(fd);
      return INOX_ERR_UNSUPPORTED;
    }

    filled += (size_t)read_count;
  }

  close(fd);

  return INOX_OK;
#endif
}

static int inox_crypto_number_to_size(inox_number value, size_t* out) {
  if (out == 0 || !inox_crypto_number_is_integer(value) || value < 0 || value > (inox_number)SIZE_MAX) {
    return 0;
  }

  size_t converted = (size_t)value;

  if ((inox_number)converted != value) {
    return 0;
  }

  *out = converted;

  return 1;
}

static int inox_crypto_number_is_integer(inox_number value) {
  if (value != value || value < -9007199254740991.0 || value > 9007199254740991.0) {
    return 0;
  }

  int64_t converted = (int64_t)value;

  return (inox_number)converted == value;
}

static int CryptoHashState_algorithm_is_sha256(const char* algorithm, size_t algorithm_len) {
  return algorithm_len == 6 &&
         algorithm[0] == 's' &&
         algorithm[1] == 'h' &&
         algorithm[2] == 'a' &&
         algorithm[3] == '2' &&
         algorithm[4] == '5' &&
         algorithm[5] == '6';
}

static inox_status CryptoHashState_data(inox_value data, const uint8_t** bytes, size_t* len) {
  if (bytes == 0 || len == 0) {
    return INOX_ERR_TYPE;
  }

  if (data.tag == INOX_TAG_STRING) {
    if (data.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    inox_string* string = (inox_string*)data.as.ref;

    *bytes = (const uint8_t*)string->bytes;
    *len = string->len;

    return INOX_OK;
  }

  if (data.tag == INOX_TAG_BYTES) {
    if (data.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    inox::Value value(data);
    Uint8Array buffer(value);
    const auto view = buffer.bytes();

    if (inox::thrown()) {
      return INOX_ERR_TYPE;
    }

    *bytes = view.data();
    *len = view.size();

    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

static inox_status CryptoHashState_update(CryptoHashState* hash, const uint8_t* bytes, size_t len) {
  if (hash == 0 || hash->finalized || (bytes == 0 && len != 0)) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  return EVP_DigestUpdate(hash->ctx, bytes, len) == 1 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#else
  (void)bytes;
  (void)len;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status CryptoHmacState_update(CryptoHmacState* hmac, const uint8_t* bytes, size_t len) {
  if (hmac == 0 || hmac->finalized || (bytes == 0 && len != 0)) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  return HMAC_Update(hmac->ctx, bytes, len) == 1 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#else
  (void)bytes;
  (void)len;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status CryptoHashState_digest_raw(CryptoHashState* hash, uint8_t* digest, size_t* len) {
  if (hash == 0 || hash->finalized || digest == 0 || len == 0) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  unsigned int digest_len = 0;

  if (EVP_DigestFinal_ex(hash->ctx, digest, &digest_len) != 1) {
    return INOX_ERR_UNSUPPORTED;
  }

  hash->finalized = 1;

  if (hash->ctx != 0) {
    EVP_MD_CTX_free(hash->ctx);
    hash->ctx = 0;
  }

  *len = (size_t)digest_len;

  return INOX_OK;
#else
  (void)hash;
  (void)digest;
  (void)len;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status CryptoHmacState_digest_raw(CryptoHmacState* hmac, uint8_t* digest, size_t* len) {
  if (hmac == 0 || hmac->finalized || digest == 0 || len == 0) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  unsigned int digest_len = 0;

  if (HMAC_Final(hmac->ctx, digest, &digest_len) != 1) {
    return INOX_ERR_UNSUPPORTED;
  }

  hmac->finalized = 1;

  if (hmac->ctx != 0) {
    HMAC_CTX_free(hmac->ctx);
    hmac->ctx = 0;
  }

  *len = (size_t)digest_len;

  return INOX_OK;
#else
  (void)hmac;
  (void)digest;
  (void)len;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static bool inox_crypto_string_equals(inox::StringView value, const char* expected, size_t expected_len) {
  if (expected == 0 || value.len != expected_len) {
    return false;
  }

  for (size_t index = 0; index < expected_len; index += 1) {
    if (value.bytes[index] != expected[index]) {
      return false;
    }
  }

  return true;
}

static char inox_crypto_hex_digit(uint8_t value) {
  return (char)(value < 10 ? ('0' + value) : ('a' + (value - 10)));
}
