#include "inox/crypto.h"

#include <limits.h>
#include <stdint.h>
#include <cstring>
#include <span>
#include <string>
#include <string_view>
#include <utility>
#include "inox/array.h"
#include "inox/binary.h"
#include "inox/buffer.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/string.h"

#if defined(INOX_TLS_BACKEND_BORINGSSL) || defined(INOX_TLS_BACKEND_OPENSSL)
#include <openssl/bn.h>
#include <openssl/crypto.h>
#include <openssl/ec.h>
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/objects.h>
#include <openssl/pem.h>
#include <openssl/rsa.h>
#define INOX_CRYPTO_HAS_EVP 1
#else
#define INOX_CRYPTO_HAS_EVP 0
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
#if INOX_CRYPTO_HAS_EVP
static const EVP_MD* inox_crypto_digest_algorithm(const char* algorithm, size_t algorithm_len);
#endif
static inox_status inox_crypto_data(inox_value data, const uint8_t** bytes, size_t* len);
#if INOX_CRYPTO_HAS_EVP
struct InoxCryptoScryptOptions {
  size_t cost;
  size_t block_size;
  size_t parallelization;
  size_t max_memory;
};

static int inox_crypto_scrypt_options(
  const inox::Value& value,
  InoxCryptoScryptOptions* out
);
static inox_status inox_crypto_hkdf(
  const EVP_MD* digest,
  const uint8_t* ikm,
  size_t ikm_len,
  const uint8_t* salt,
  size_t salt_len,
  const uint8_t* info,
  size_t info_len,
  uint8_t* out,
  size_t out_len
);
#endif
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
static inox_status CryptoCipherState_create(
  inox_allocator* allocator,
  inox::StringView algorithm,
  const uint8_t* key_bytes,
  size_t key_len,
  inox_value iv,
  const inox::Value& options,
  bool encrypt,
  CryptoCipherState** out
);
static void CryptoCipherState_free(CryptoCipherState* cipher);
static inox_status CryptoKeyState_create(
  inox_allocator* allocator,
  const uint8_t* bytes,
  size_t len,
  bool private_key,
  CryptoKeyState** out
);
static inox_status CryptoKeyState_create_secret(
  inox_allocator* allocator,
  const uint8_t* bytes,
  size_t len,
  CryptoKeyState** out
);
static inox_status CryptoKeyState_generate_pair(
  inox_allocator* allocator,
  inox::StringView type,
  const inox::Value& options,
  CryptoKeyState** public_key,
  CryptoKeyState** private_key
);
static inox_status CryptoKeyState_clone_public(
  inox_allocator* allocator,
  const CryptoKeyState* key,
  CryptoKeyState** out
);
static void CryptoKeyState_retain(CryptoKeyState* key);
static void CryptoKeyState_free(CryptoKeyState* key);
static Buffer inox_crypto_sign(
  CryptoKeyState* key,
  inox::StringView algorithm,
  const uint8_t* bytes,
  size_t len
);
static Buffer inox_crypto_rsa_crypt(
  CryptoKeyState* key,
  const uint8_t* bytes,
  size_t len,
  bool decrypt,
  inox::StringView oaep_hash,
  const uint8_t* oaep_label,
  size_t oaep_label_len,
  const char* message
);
static inox_status inox_crypto_verify(
  CryptoKeyState* key,
  inox::StringView algorithm,
  const uint8_t* bytes,
  size_t len,
  const uint8_t* signature,
  size_t signature_len,
  bool* out
);
static Buffer inox_crypto_cipher_update_raw(
  CryptoCipherState* cipher,
  const uint8_t* bytes,
  size_t len,
  const char* message
);
static Buffer inox_crypto_cipher_final(CryptoCipherState* cipher, const char* message);
static Buffer inox_crypto_cipher_auth_tag(CryptoCipherState* cipher, const char* message);
static inox_status inox_crypto_cipher_set_aad(
  CryptoCipherState* cipher,
  const uint8_t* bytes,
  size_t len
);
static inox_status inox_crypto_cipher_set_aad(
  CryptoCipherState* cipher,
  inox::StringView data,
  const inox::Value& options
);
static inox_status inox_crypto_cipher_set_auth_tag(
  CryptoCipherState* cipher,
  const uint8_t* bytes,
  size_t len
);
static int inox_crypto_cipher_output_encoding(inox::StringView encoding, bool decrypt);
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
static char inox_crypto_hex_digit(uint8_t value);
static void inox_crypto_throw_failed(const char* message);

struct CryptoHashState {
  inox_allocator* allocator;
#if INOX_CRYPTO_HAS_EVP
  EVP_MD_CTX* ctx;
#endif
  int finalized;
};

struct CryptoHmacState {
  inox_allocator* allocator;
#if INOX_CRYPTO_HAS_EVP
  HMAC_CTX* ctx;
#endif
  int finalized;
};

struct CryptoCipherState {
  inox_allocator* allocator;
#if INOX_CRYPTO_HAS_EVP
  EVP_CIPHER_CTX* ctx;
#endif
  size_t auth_tag_length;
  int encrypt;
  int finalized;
  int updated;
  int auth_tag_set;
};

enum InoxCryptoKeyType {
  INOX_CRYPTO_KEY_RSA = 1,
  INOX_CRYPTO_KEY_RSA_PSS = 2,
  INOX_CRYPTO_KEY_EC = 3,
  INOX_CRYPTO_KEY_SECRET = 4
};

struct CryptoKeyState {
  inox_allocator* allocator;
  size_t refs;
#if INOX_CRYPTO_HAS_EVP
  EVP_PKEY* key;
#endif
  uint8_t* secret_bytes;
  size_t secret_len;
  int private_key;
  int key_type;
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
  Buffer decoded = Buffer::from(data, encoding);

  if (inox::thrown()) {
    return *this;
  }

  if (!decoded.valid()) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
    return *this;
  }

  if (CryptoHashState_update(handle_, decoded.bytes().data(), decoded.length()) != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
  }

  return *this;
}

Hash& Hash::update(const inox::Value& data) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    inox_crypto_data(data.raw(), &bytes, &len) != INOX_OK ||
    CryptoHashState_update(handle_, bytes, len) != INOX_OK
  ) {
    inox_crypto_throw_failed("crypto.Hash.update failed");
  }

  return *this;
}

Hash& Hash::update(const inox::Value& data, inox::StringView encoding) {
  (void)encoding;

  return update(data);
}

Buffer Hash::digest() {
#if INOX_CRYPTO_HAS_EVP
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
  Buffer result = digest();

  if (inox::thrown()) {
    return inox::String();
  }

  return result.toString(encoding);
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
  Buffer decoded = Buffer::from(data, encoding);

  if (inox::thrown()) {
    return *this;
  }

  if (!decoded.valid()) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
    return *this;
  }

  if (CryptoHmacState_update(handle_, decoded.bytes().data(), decoded.length()) != INOX_OK) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
  }

  return *this;
}

Hmac& Hmac::update(const inox::Value& data) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    inox_crypto_data(data.raw(), &bytes, &len) != INOX_OK ||
    CryptoHmacState_update(handle_, bytes, len) != INOX_OK
  ) {
    inox_crypto_throw_failed("crypto.Hmac.update failed");
  }

  return *this;
}

Hmac& Hmac::update(const inox::Value& data, inox::StringView encoding) {
  (void)encoding;

  return update(data);
}

Buffer Hmac::digest() {
#if INOX_CRYPTO_HAS_EVP
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
  Buffer result = digest();

  if (inox::thrown()) {
    return inox::String();
  }

  return result.toString(encoding);
}

static Buffer inox_crypto_cipher_update_value(
  CryptoCipherState* cipher,
  const inox::Value& data,
  const char* message
) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (inox_crypto_data(data.raw(), &bytes, &len) != INOX_OK) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed(message);
    }

    return Buffer();
  }

  return inox_crypto_cipher_update_raw(cipher, bytes, len, message);
}

static Buffer inox_crypto_cipher_update_string(
  CryptoCipherState* cipher,
  inox::StringView data,
  inox::StringView input_encoding,
  const char* message
) {
  Buffer decoded = Buffer::from(data, input_encoding);

  if (inox::thrown() || !decoded.valid()) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed(message);
    }

    return Buffer();
  }

  return inox_crypto_cipher_update_raw(cipher, decoded.bytes().data(), decoded.length(), message);
}

static inox::String inox_crypto_cipher_output(
  Buffer& bytes,
  inox::StringView encoding,
  bool decrypt,
  const char* message
) {
  if (!inox_crypto_cipher_output_encoding(encoding, decrypt)) {
    inox_crypto_throw_failed(message);
    return inox::String();
  }

  inox::String output = bytes.toString(encoding);

  if (!output.valid() && !inox::thrown()) {
    inox_crypto_throw_failed(message);
  }

  return output;
}

Cipheriv::Cipheriv() : handle_(0) {}

Cipheriv::Cipheriv(CryptoCipherState* handle) : handle_(handle) {}

Cipheriv::~Cipheriv() {
  CryptoCipherState_free(handle_);
}

Cipheriv::Cipheriv(Cipheriv&& other) noexcept : handle_(other.handle_) {
  other.handle_ = 0;
}

Cipheriv& Cipheriv::operator=(Cipheriv&& other) noexcept {
  if (this != &other) {
    CryptoCipherState_free(handle_);
    handle_ = other.handle_;
    other.handle_ = 0;
  }

  return *this;
}

Buffer Cipheriv::update(inox::StringView data) {
  return inox_crypto_cipher_update_raw(handle_, (const uint8_t*)data.bytes, data.len, "crypto.Cipheriv.update failed");
}

Buffer Cipheriv::update(const inox::Value& data) {
  return inox_crypto_cipher_update_value(handle_, data, "crypto.Cipheriv.update failed");
}

Buffer Cipheriv::update(inox::StringView data, inox::StringView input_encoding) {
  return inox_crypto_cipher_update_string(handle_, data, input_encoding, "crypto.Cipheriv.update failed");
}

Buffer Cipheriv::update(const inox::Value& data, inox::StringView input_encoding) {
  (void)input_encoding;
  return inox_crypto_cipher_update_value(handle_, data, "crypto.Cipheriv.update failed");
}

inox::String Cipheriv::update(
  inox::StringView data,
  inox::StringView input_encoding,
  inox::StringView output_encoding
) {
  if (!inox_crypto_cipher_output_encoding(output_encoding, false)) {
    inox_crypto_throw_failed("crypto.Cipheriv.update failed");
    return inox::String();
  }

  Buffer result = inox_crypto_cipher_update_string(handle_, data, input_encoding, "crypto.Cipheriv.update failed");

  if (inox::thrown()) {
    return inox::String();
  }

  return inox_crypto_cipher_output(result, output_encoding, false, "crypto.Cipheriv.update failed");
}

inox::String Cipheriv::update(
  const inox::Value& data,
  inox::StringView input_encoding,
  inox::StringView output_encoding
) {
  (void)input_encoding;

  if (!inox_crypto_cipher_output_encoding(output_encoding, false)) {
    inox_crypto_throw_failed("crypto.Cipheriv.update failed");
    return inox::String();
  }

  Buffer result = inox_crypto_cipher_update_value(handle_, data, "crypto.Cipheriv.update failed");

  if (inox::thrown()) {
    return inox::String();
  }

  return inox_crypto_cipher_output(result, output_encoding, false, "crypto.Cipheriv.update failed");
}

Buffer Cipheriv::final() {
  return inox_crypto_cipher_final(handle_, "crypto.Cipheriv.final failed");
}

inox::String Cipheriv::final(inox::StringView output_encoding) {
  if (!inox_crypto_cipher_output_encoding(output_encoding, false)) {
    inox_crypto_throw_failed("crypto.Cipheriv.final failed");
    return inox::String();
  }

  Buffer result = inox_crypto_cipher_final(handle_, "crypto.Cipheriv.final failed");

  if (inox::thrown()) {
    return inox::String();
  }

  return inox_crypto_cipher_output(result, output_encoding, false, "crypto.Cipheriv.final failed");
}

Buffer Cipheriv::getAuthTag() {
  return inox_crypto_cipher_auth_tag(handle_, "crypto.Cipheriv.getAuthTag failed");
}

Cipheriv& Cipheriv::setAAD(inox::StringView data, const inox::Value& options) {
  if (inox_crypto_cipher_set_aad(handle_, data, options) != INOX_OK && !inox::thrown()) {
    inox_crypto_throw_failed("crypto.Cipheriv.setAAD failed");
  }

  return *this;
}

Cipheriv& Cipheriv::setAAD(const inox::Value& data, const inox::Value& options) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    (options.tag != INOX_TAG_UNDEFINED &&
     options.tag != INOX_TAG_NULL &&
     options.tag != INOX_TAG_OBJECT &&
     options.tag != INOX_TAG_CLASS_INSTANCE) ||
    inox_crypto_data(data.raw(), &bytes, &len) != INOX_OK ||
    inox_crypto_cipher_set_aad(handle_, bytes, len) != INOX_OK
  ) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.Cipheriv.setAAD failed");
    }
  }

  return *this;
}

Decipheriv::Decipheriv() : handle_(0) {}

Decipheriv::Decipheriv(CryptoCipherState* handle) : handle_(handle) {}

Decipheriv::~Decipheriv() {
  CryptoCipherState_free(handle_);
}

Decipheriv::Decipheriv(Decipheriv&& other) noexcept : handle_(other.handle_) {
  other.handle_ = 0;
}

Decipheriv& Decipheriv::operator=(Decipheriv&& other) noexcept {
  if (this != &other) {
    CryptoCipherState_free(handle_);
    handle_ = other.handle_;
    other.handle_ = 0;
  }

  return *this;
}

Buffer Decipheriv::update(inox::StringView data) {
  return inox_crypto_cipher_update_raw(handle_, (const uint8_t*)data.bytes, data.len, "crypto.Decipheriv.update failed");
}

Buffer Decipheriv::update(const inox::Value& data) {
  return inox_crypto_cipher_update_value(handle_, data, "crypto.Decipheriv.update failed");
}

Buffer Decipheriv::update(inox::StringView data, inox::StringView input_encoding) {
  return inox_crypto_cipher_update_string(handle_, data, input_encoding, "crypto.Decipheriv.update failed");
}

Buffer Decipheriv::update(const inox::Value& data, inox::StringView input_encoding) {
  (void)input_encoding;
  return inox_crypto_cipher_update_value(handle_, data, "crypto.Decipheriv.update failed");
}

inox::String Decipheriv::update(
  inox::StringView data,
  inox::StringView input_encoding,
  inox::StringView output_encoding
) {
  if (!inox_crypto_cipher_output_encoding(output_encoding, true)) {
    inox_crypto_throw_failed("crypto.Decipheriv.update failed");
    return inox::String();
  }

  Buffer result = inox_crypto_cipher_update_string(handle_, data, input_encoding, "crypto.Decipheriv.update failed");

  if (inox::thrown()) {
    return inox::String();
  }

  return inox_crypto_cipher_output(result, output_encoding, true, "crypto.Decipheriv.update failed");
}

inox::String Decipheriv::update(
  const inox::Value& data,
  inox::StringView input_encoding,
  inox::StringView output_encoding
) {
  (void)input_encoding;

  if (!inox_crypto_cipher_output_encoding(output_encoding, true)) {
    inox_crypto_throw_failed("crypto.Decipheriv.update failed");
    return inox::String();
  }

  Buffer result = inox_crypto_cipher_update_value(handle_, data, "crypto.Decipheriv.update failed");

  if (inox::thrown()) {
    return inox::String();
  }

  return inox_crypto_cipher_output(result, output_encoding, true, "crypto.Decipheriv.update failed");
}

Buffer Decipheriv::final() {
  return inox_crypto_cipher_final(handle_, "crypto.Decipheriv.final failed");
}

inox::String Decipheriv::final(inox::StringView output_encoding) {
  if (!inox_crypto_cipher_output_encoding(output_encoding, true)) {
    inox_crypto_throw_failed("crypto.Decipheriv.final failed");
    return inox::String();
  }

  Buffer result = inox_crypto_cipher_final(handle_, "crypto.Decipheriv.final failed");

  if (inox::thrown()) {
    return inox::String();
  }

  return inox_crypto_cipher_output(result, output_encoding, true, "crypto.Decipheriv.final failed");
}

Decipheriv& Decipheriv::setAAD(inox::StringView data, const inox::Value& options) {
  if (inox_crypto_cipher_set_aad(handle_, data, options) != INOX_OK && !inox::thrown()) {
    inox_crypto_throw_failed("crypto.Decipheriv.setAAD failed");
  }

  return *this;
}

Decipheriv& Decipheriv::setAAD(const inox::Value& data, const inox::Value& options) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    (options.tag != INOX_TAG_UNDEFINED &&
     options.tag != INOX_TAG_NULL &&
     options.tag != INOX_TAG_OBJECT &&
     options.tag != INOX_TAG_CLASS_INSTANCE) ||
    inox_crypto_data(data.raw(), &bytes, &len) != INOX_OK ||
    inox_crypto_cipher_set_aad(handle_, bytes, len) != INOX_OK
  ) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.Decipheriv.setAAD failed");
    }
  }

  return *this;
}

Decipheriv& Decipheriv::setAuthTag(inox::StringView tag) {
  if (inox_crypto_cipher_set_auth_tag(handle_, (const uint8_t*)tag.bytes, tag.len) != INOX_OK && !inox::thrown()) {
    inox_crypto_throw_failed("crypto.Decipheriv.setAuthTag failed");
  }

  return *this;
}

Decipheriv& Decipheriv::setAuthTag(const inox::Value& tag) {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    inox_crypto_data(tag.raw(), &bytes, &len) != INOX_OK ||
    inox_crypto_cipher_set_auth_tag(handle_, bytes, len) != INOX_OK
  ) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.Decipheriv.setAuthTag failed");
    }
  }

  return *this;
}

Decipheriv& Decipheriv::setAuthTag(inox::StringView tag, inox::StringView encoding) {
  Buffer decoded = Buffer::from(tag, encoding);

  if (
    !inox::thrown() &&
    decoded.valid() &&
    inox_crypto_cipher_set_auth_tag(handle_, decoded.bytes().data(), decoded.length()) == INOX_OK
  ) {
    return *this;
  }

  if (!inox::thrown()) {
    inox_crypto_throw_failed("crypto.Decipheriv.setAuthTag failed");
  }

  return *this;
}

Decipheriv& Decipheriv::setAuthTag(const inox::Value& tag, inox::StringView encoding) {
  (void)encoding;
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (
    inox_crypto_data(tag.raw(), &bytes, &len) != INOX_OK ||
    inox_crypto_cipher_set_auth_tag(handle_, bytes, len) != INOX_OK
  ) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.Decipheriv.setAuthTag failed");
    }
  }

  return *this;
}

KeyObject::KeyObject() : handle_(0) {}

KeyObject::KeyObject(CryptoKeyState* handle) : handle_(handle) {}

KeyObject::~KeyObject() {
  CryptoKeyState_free(handle_);
}

KeyObject::KeyObject(const KeyObject& other) : handle_(other.handle_) {
  CryptoKeyState_retain(handle_);
}

KeyObject& KeyObject::operator=(const KeyObject& other) {
  if (this != &other) {
    CryptoKeyState_retain(other.handle_);
    CryptoKeyState_free(handle_);
    handle_ = other.handle_;
  }

  return *this;
}

KeyObject::KeyObject(KeyObject&& other) noexcept : handle_(other.handle_) {
  other.handle_ = 0;
}

KeyObject& KeyObject::operator=(KeyObject&& other) noexcept {
  if (this != &other) {
    CryptoKeyState_free(handle_);
    handle_ = other.handle_;
    other.handle_ = 0;
  }

  return *this;
}

inox::StringView KeyObject::type() const {
  if (handle_ == 0) {
    inox::fatal("crypto.KeyObject.type native facade invariant failed");
  }

  if (handle_->key_type == INOX_CRYPTO_KEY_SECRET) {
    return inox::StringView("secret", 6);
  }

  return handle_->private_key
    ? inox::StringView("private", 7)
    : inox::StringView("public", 6);
}

inox::Value KeyObject::asymmetricKeyType() const {
  if (handle_ == 0) {
    inox::fatal("crypto.KeyObject.asymmetricKeyType native facade invariant failed");
  }

  if (handle_->key_type == INOX_CRYPTO_KEY_RSA) {
    return inox::String("rsa", 3);
  }

  if (handle_->key_type == INOX_CRYPTO_KEY_RSA_PSS) {
    return inox::String("rsa-pss", 7);
  }

  if (handle_->key_type == INOX_CRYPTO_KEY_EC) {
    return inox::String("ec", 2);
  }

  if (handle_->key_type == INOX_CRYPTO_KEY_SECRET) {
    return inox::Value();
  }

  inox::fatal("crypto.KeyObject.asymmetricKeyType native facade invariant failed");
}

inox::Value KeyObject::symmetricKeySize() const {
  if (handle_ == 0) {
    inox::fatal("crypto.KeyObject.symmetricKeySize native facade invariant failed");
  }

  if (handle_->key_type == INOX_CRYPTO_KEY_SECRET) {
    return inox::Value(inox_number_value((double)handle_->secret_len));
  }

  return inox::Value();
}

Buffer KeyObject::exportKey() const {
  if (handle_ == 0 || handle_->key_type != INOX_CRYPTO_KEY_SECRET) {
    inox_crypto_throw_failed("crypto.KeyObject.export failed");
    return Buffer();
  }

  return Buffer(std::span<const uint8_t>(handle_->secret_bytes, handle_->secret_len));
}

inox::String KeyObject::exportKey(const inox::Value& options) const {
  if (
    handle_ == 0 ||
    handle_->key_type == INOX_CRYPTO_KEY_SECRET ||
    (options.tag != INOX_TAG_OBJECT && options.tag != INOX_TAG_CLASS_INSTANCE)
  ) {
    inox_crypto_throw_failed("crypto.KeyObject.export failed");
    return inox::String();
  }

  inox::Value format_value = inox::get(options.raw(), "format");
  inox::Value type_value = inox::get(options.raw(), "type");

  if (inox::thrown()) {
    return inox::String();
  }

  if (
    format_value.tag != INOX_TAG_STRING ||
    format_value.as.ref == 0 ||
    type_value.tag != INOX_TAG_STRING ||
    type_value.as.ref == 0
  ) {
    inox_crypto_throw_failed("crypto.KeyObject.export failed");
    return inox::String();
  }

  const inox::String format(format_value);
  const inox::String key_type(type_value);
  const std::string_view format_name(format.bytes(), format.length());
  const std::string_view type_name(key_type.bytes(), key_type.length());

  if (
    format_name != "pem" ||
    (handle_->private_key ? type_name != "pkcs8" : type_name != "spki")
  ) {
    inox_crypto_throw_failed("crypto.KeyObject.export failed");
    return inox::String();
  }

#if INOX_CRYPTO_HAS_EVP
  BIO* output = BIO_new(BIO_s_mem());

  if (output == 0) {
    inox::throw_out_of_memory();
    return inox::String();
  }

  const int written = handle_->private_key
    ? PEM_write_bio_PrivateKey(output, handle_->key, 0, 0, 0, 0, 0)
    : PEM_write_bio_PUBKEY(output, handle_->key);
  char* bytes = 0;
  const long length = written == 1 ? BIO_get_mem_data(output, &bytes) : 0;

  if (written != 1 || length <= 0 || bytes == 0) {
    BIO_free(output);
    ERR_clear_error();
    inox_crypto_throw_failed("crypto.KeyObject.export failed");
    return inox::String();
  }

  inox::String result(bytes, (size_t)length);
  BIO_free(output);
  return result;
#else
  inox_crypto_throw_failed("crypto.KeyObject.export failed");
  return inox::String();
#endif
}

CryptoKeyPair::CryptoKeyPair() : publicKey(), privateKey() {}

CryptoKeyPair::CryptoKeyPair(KeyObject&& public_key, KeyObject&& private_key)
  : publicKey(std::move(public_key)), privateKey(std::move(private_key)) {}

CryptoKeyPair::~CryptoKeyPair() {}

CryptoKeyPair::CryptoKeyPair(const CryptoKeyPair& other)
  : publicKey(other.publicKey), privateKey(other.privateKey) {}

CryptoKeyPair& CryptoKeyPair::operator=(const CryptoKeyPair& other) {
  if (this != &other) {
    publicKey = other.publicKey;
    privateKey = other.privateKey;
  }

  return *this;
}

CryptoKeyPair::CryptoKeyPair(CryptoKeyPair&& other) noexcept
  : publicKey(std::move(other.publicKey)), privateKey(std::move(other.privateKey)) {}

CryptoKeyPair& CryptoKeyPair::operator=(CryptoKeyPair&& other) noexcept {
  if (this != &other) {
    publicKey = std::move(other.publicKey);
    privateKey = std::move(other.privateKey);
  }

  return *this;
}

Array crypto::getHashes() const {
#if INOX_CRYPTO_HAS_EVP
  auto hashes = Array::from({
    inox::String("sha1", 4),
    inox::String("sha224", 6),
    inox::String("sha256", 6),
    inox::String("sha384", 6),
    inox::String("sha512", 6)
  });

  if (inox::thrown() || !hashes.valid()) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.getHashes failed");
    }
    return Array();
  }

  return hashes;
#else
  inox_crypto_throw_failed("crypto.getHashes failed");
  return Array();
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

Buffer crypto::pbkdf2Sync(
  const inox::Value& password,
  const inox::Value& salt,
  inox_number iterations_value,
  inox_number keylen_value,
  inox::StringView digest_name
) const {
#if INOX_CRYPTO_HAS_EVP
  const EVP_MD* digest = inox_crypto_digest_algorithm(digest_name.bytes, digest_name.len);
  const uint8_t* password_bytes = 0;
  const uint8_t* salt_bytes = 0;
  size_t password_len = 0;
  size_t salt_len = 0;
  size_t iterations = 0;
  size_t keylen = 0;

  if (
    digest == 0 ||
    inox_crypto_data(password.raw(), &password_bytes, &password_len) != INOX_OK ||
    inox_crypto_data(salt.raw(), &salt_bytes, &salt_len) != INOX_OK ||
    !inox_crypto_number_to_size(iterations_value, &iterations) ||
    !inox_crypto_number_to_size(keylen_value, &keylen) ||
    iterations == 0 ||
    keylen == 0 ||
    password_len > (size_t)INT_MAX ||
    salt_len > (size_t)INT_MAX ||
    iterations > (size_t)INT_MAX ||
    keylen > (size_t)INT_MAX
  ) {
    inox_crypto_throw_failed("crypto.pbkdf2Sync failed");
    return Buffer();
  }

  Buffer result = Buffer::alloc((double)keylen);

  if (inox::thrown() || !result.valid()) {
    return Buffer();
  }

  if (
    PKCS5_PBKDF2_HMAC(
      (const char*)password_bytes,
      password_len,
      salt_bytes,
      salt_len,
      iterations,
      digest,
      keylen,
      result.bytes().data()
    ) != 1
  ) {
    inox_crypto_throw_failed("crypto.pbkdf2Sync failed");
    return Buffer();
  }

  return result;
#else
  (void)password;
  (void)salt;
  (void)iterations_value;
  (void)keylen_value;
  (void)digest_name;
  inox_crypto_throw_failed("crypto.pbkdf2Sync failed");
  return Buffer();
#endif
}

Buffer crypto::hkdfSync(
  inox::StringView digest_name,
  const inox::Value& ikm,
  const inox::Value& salt,
  const inox::Value& info,
  inox_number keylen_value
) const {
#if INOX_CRYPTO_HAS_EVP
  const EVP_MD* digest = inox_crypto_digest_algorithm(digest_name.bytes, digest_name.len);
  const uint8_t* ikm_bytes = 0;
  const uint8_t* salt_bytes = 0;
  const uint8_t* info_bytes = 0;
  size_t ikm_len = 0;
  size_t salt_len = 0;
  size_t info_len = 0;
  size_t keylen = 0;
  size_t digest_len = digest == 0 ? 0 : (size_t)EVP_MD_size(digest);

  if (
    digest == 0 ||
    digest_len == 0 ||
    inox_crypto_data(ikm.raw(), &ikm_bytes, &ikm_len) != INOX_OK ||
    inox_crypto_data(salt.raw(), &salt_bytes, &salt_len) != INOX_OK ||
    inox_crypto_data(info.raw(), &info_bytes, &info_len) != INOX_OK ||
    !inox_crypto_number_to_size(keylen_value, &keylen) ||
    keylen == 0 ||
    keylen > 255 * digest_len ||
    salt_len > (size_t)INT_MAX ||
    info_len > 1024
  ) {
    inox_crypto_throw_failed("crypto.hkdfSync failed");
    return Buffer();
  }

  Buffer result = Buffer::alloc((double)keylen);

  if (inox::thrown() || !result.valid()) {
    return Buffer();
  }

  if (
    inox_crypto_hkdf(
      digest,
      ikm_bytes,
      ikm_len,
      salt_bytes,
      salt_len,
      info_bytes,
      info_len,
      result.bytes().data(),
      keylen
    ) != INOX_OK
  ) {
    inox_crypto_throw_failed("crypto.hkdfSync failed");
    return Buffer();
  }

  return result;
#else
  (void)digest_name;
  (void)ikm;
  (void)salt;
  (void)info;
  (void)keylen_value;
  inox_crypto_throw_failed("crypto.hkdfSync failed");
  return Buffer();
#endif
}

Buffer crypto::scryptSync(
  const inox::Value& password,
  const inox::Value& salt,
  inox_number keylen_value,
  const inox::Value& options_value
) const {
#if INOX_CRYPTO_HAS_EVP
  const uint8_t* password_bytes = 0;
  const uint8_t* salt_bytes = 0;
  size_t password_len = 0;
  size_t salt_len = 0;
  size_t keylen = 0;
  InoxCryptoScryptOptions options;

  if (
    inox_crypto_data(password.raw(), &password_bytes, &password_len) != INOX_OK ||
    inox_crypto_data(salt.raw(), &salt_bytes, &salt_len) != INOX_OK ||
    !inox_crypto_number_to_size(keylen_value, &keylen) ||
    !inox_crypto_scrypt_options(options_value, &options)
  ) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.scryptSync failed");
    }

    return Buffer();
  }

  Buffer result = Buffer::alloc((double)keylen);

  if (inox::thrown() || !result.valid()) {
    return Buffer();
  }

  if (
    EVP_PBE_scrypt(
      (const char*)password_bytes,
      password_len,
      salt_bytes,
      salt_len,
      options.cost,
      options.block_size,
      options.parallelization,
      options.max_memory,
      result.bytes().data(),
      keylen
    ) != 1
  ) {
    inox_crypto_throw_failed("crypto.scryptSync failed");
    return Buffer();
  }

  return result;
#else
  (void)password;
  (void)salt;
  (void)keylen_value;
  (void)options_value;
  inox_crypto_throw_failed("crypto.scryptSync failed");
  return Buffer();
#endif
}

Cipheriv crypto::createCipheriv(
  inox::StringView algorithm,
  const inox::Value& key,
  const inox::Value& iv,
  const inox::Value& options
) const {
  const uint8_t* key_bytes = 0;
  size_t key_len = 0;
  CryptoCipherState* cipher = 0;
  inox_status status = inox_crypto_data(key.raw(), &key_bytes, &key_len);

  if (status == INOX_OK) {
    status = CryptoCipherState_create(
      &inox_default_allocator,
      algorithm,
      key_bytes,
      key_len,
      iv.raw(),
      options,
      true,
      &cipher
    );
  }

  if (status != INOX_OK) {
    CryptoCipherState_free(cipher);

    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.createCipheriv failed");
    }

    return Cipheriv();
  }

  return Cipheriv(cipher);
}

Cipheriv crypto::createCipheriv(
  inox::StringView algorithm,
  const KeyObject& key,
  const inox::Value& iv,
  const inox::Value& options
) const {
  CryptoCipherState* cipher = 0;
  const inox_status status = key.handle_ != 0 && key.handle_->key_type == INOX_CRYPTO_KEY_SECRET
    ? CryptoCipherState_create(
        &inox_default_allocator,
        algorithm,
        key.handle_->secret_bytes,
        key.handle_->secret_len,
        iv.raw(),
        options,
        true,
        &cipher
      )
    : INOX_ERR_TYPE;

  if (status != INOX_OK) {
    CryptoCipherState_free(cipher);

    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.createCipheriv failed");
    }

    return Cipheriv();
  }

  return Cipheriv(cipher);
}

Decipheriv crypto::createDecipheriv(
  inox::StringView algorithm,
  const inox::Value& key,
  const inox::Value& iv,
  const inox::Value& options
) const {
  const uint8_t* key_bytes = 0;
  size_t key_len = 0;
  CryptoCipherState* cipher = 0;
  inox_status status = inox_crypto_data(key.raw(), &key_bytes, &key_len);

  if (status == INOX_OK) {
    status = CryptoCipherState_create(
      &inox_default_allocator,
      algorithm,
      key_bytes,
      key_len,
      iv.raw(),
      options,
      false,
      &cipher
    );
  }

  if (status != INOX_OK) {
    CryptoCipherState_free(cipher);

    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.createDecipheriv failed");
    }

    return Decipheriv();
  }

  return Decipheriv(cipher);
}

Decipheriv crypto::createDecipheriv(
  inox::StringView algorithm,
  const KeyObject& key,
  const inox::Value& iv,
  const inox::Value& options
) const {
  CryptoCipherState* cipher = 0;
  const inox_status status = key.handle_ != 0 && key.handle_->key_type == INOX_CRYPTO_KEY_SECRET
    ? CryptoCipherState_create(
        &inox_default_allocator,
        algorithm,
        key.handle_->secret_bytes,
        key.handle_->secret_len,
        iv.raw(),
        options,
        false,
        &cipher
      )
    : INOX_ERR_TYPE;

  if (status != INOX_OK) {
    CryptoCipherState_free(cipher);

    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.createDecipheriv failed");
    }

    return Decipheriv();
  }

  return Decipheriv(cipher);
}

KeyObject crypto::createSecretKey(
  const inox::Value& key,
  inox::StringView encoding,
  bool has_encoding
) const {
  const uint8_t* bytes = 0;
  size_t len = 0;
  CryptoKeyState* state = 0;
  inox_status status = INOX_OK;

  if (has_encoding && key.tag == INOX_TAG_STRING && key.as.ref != 0) {
    Buffer decoded = Buffer::from(inox::String(key), encoding);

    if (inox::thrown() || !decoded.valid()) {
      return KeyObject();
    }

    status = CryptoKeyState_create_secret(
      &inox_default_allocator,
      decoded.bytes().data(),
      decoded.length(),
      &state
    );
  } else {
    status = inox_crypto_data(key.raw(), &bytes, &len);

    if (status == INOX_OK) {
      status = CryptoKeyState_create_secret(&inox_default_allocator, bytes, len, &state);
    }
  }

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (!inox::thrown()) {
      if (status == INOX_ERR_OOM) {
        inox::throw_out_of_memory();
      } else {
        inox_crypto_throw_failed("crypto.createSecretKey failed");
      }
    }

    return KeyObject();
  }

  return KeyObject(state);
}

KeyObject crypto::createPrivateKey(const inox::Value& key) const {
  const uint8_t* bytes = 0;
  size_t len = 0;
  CryptoKeyState* state = 0;
  inox_status status = inox_crypto_data(key.raw(), &bytes, &len);

  if (status == INOX_OK) {
    status = CryptoKeyState_create(&inox_default_allocator, bytes, len, true, &state);
  }

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (!inox::thrown()) {
      if (status == INOX_ERR_OOM) {
        inox::throw_out_of_memory();
      } else {
        inox_crypto_throw_failed("crypto.createPrivateKey failed");
      }
    }

    return KeyObject();
  }

  return KeyObject(state);
}

KeyObject crypto::createPublicKey(const inox::Value& key) const {
  const uint8_t* bytes = 0;
  size_t len = 0;
  CryptoKeyState* state = 0;
  inox_status status = inox_crypto_data(key.raw(), &bytes, &len);

  if (status == INOX_OK) {
    status = CryptoKeyState_create(&inox_default_allocator, bytes, len, false, &state);
  }

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (!inox::thrown()) {
      if (status == INOX_ERR_OOM) {
        inox::throw_out_of_memory();
      } else {
        inox_crypto_throw_failed("crypto.createPublicKey failed");
      }
    }

    return KeyObject();
  }

  return KeyObject(state);
}

KeyObject crypto::createPublicKey(const KeyObject& key) const {
  CryptoKeyState* state = 0;
  inox_status status = CryptoKeyState_clone_public(&inox_default_allocator, key.handle_, &state);

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (status == INOX_ERR_OOM) {
      inox::throw_out_of_memory();
    } else {
      inox_crypto_throw_failed("crypto.createPublicKey failed");
    }

    return KeyObject();
  }

  return KeyObject(state);
}

Buffer crypto::privateDecrypt(
  const inox::Value& private_key,
  const inox::Value& buffer,
  inox::StringView oaep_hash,
  bool has_oaep_hash,
  const inox::Value& oaep_label,
  bool has_oaep_label
) const {
  const uint8_t* key_bytes = 0;
  const uint8_t* data_bytes = 0;
  const uint8_t* label_bytes = 0;
  size_t key_len = 0;
  size_t data_len = 0;
  size_t label_len = 0;
  CryptoKeyState* state = 0;
  inox_status status = inox_crypto_data(private_key.raw(), &key_bytes, &key_len);

  if (status == INOX_OK) {
    status = inox_crypto_data(buffer.raw(), &data_bytes, &data_len);
  }

  if (status == INOX_OK && has_oaep_label) {
    status = inox_crypto_data(oaep_label.raw(), &label_bytes, &label_len);
  }

  if (status == INOX_OK) {
    status = CryptoKeyState_create(&inox_default_allocator, key_bytes, key_len, true, &state);
  }

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (!inox::thrown()) {
      if (status == INOX_ERR_OOM) {
        inox::throw_out_of_memory();
      } else {
        inox_crypto_throw_failed("crypto.privateDecrypt failed");
      }
    }

    return Buffer();
  }

  Buffer result = inox_crypto_rsa_crypt(
    state,
    data_bytes,
    data_len,
    true,
    has_oaep_hash ? oaep_hash : inox::StringView("sha1", 4),
    label_bytes,
    label_len,
    "crypto.privateDecrypt failed"
  );
  CryptoKeyState_free(state);
  return result;
}

Buffer crypto::privateDecrypt(
  const KeyObject& private_key,
  const inox::Value& buffer,
  inox::StringView oaep_hash,
  bool has_oaep_hash,
  const inox::Value& oaep_label,
  bool has_oaep_label
) const {
  const uint8_t* bytes = 0;
  const uint8_t* label_bytes = 0;
  size_t len = 0;
  size_t label_len = 0;
  inox_status status = inox_crypto_data(buffer.raw(), &bytes, &len);

  if (status == INOX_OK && has_oaep_label) {
    status = inox_crypto_data(oaep_label.raw(), &label_bytes, &label_len);
  }

  if (status != INOX_OK) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.privateDecrypt failed");
    }

    return Buffer();
  }

  return inox_crypto_rsa_crypt(
    private_key.handle_,
    bytes,
    len,
    true,
    has_oaep_hash ? oaep_hash : inox::StringView("sha1", 4),
    label_bytes,
    label_len,
    "crypto.privateDecrypt failed"
  );
}

Buffer crypto::publicEncrypt(
  const inox::Value& key,
  const inox::Value& buffer,
  inox::StringView oaep_hash,
  bool has_oaep_hash,
  const inox::Value& oaep_label,
  bool has_oaep_label
) const {
  const uint8_t* key_bytes = 0;
  const uint8_t* data_bytes = 0;
  const uint8_t* label_bytes = 0;
  size_t key_len = 0;
  size_t data_len = 0;
  size_t label_len = 0;
  CryptoKeyState* state = 0;
  inox_status status = inox_crypto_data(key.raw(), &key_bytes, &key_len);

  if (status == INOX_OK) {
    status = inox_crypto_data(buffer.raw(), &data_bytes, &data_len);
  }

  if (status == INOX_OK && has_oaep_label) {
    status = inox_crypto_data(oaep_label.raw(), &label_bytes, &label_len);
  }

  if (status == INOX_OK) {
    status = CryptoKeyState_create(&inox_default_allocator, key_bytes, key_len, false, &state);
  }

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (!inox::thrown()) {
      if (status == INOX_ERR_OOM) {
        inox::throw_out_of_memory();
      } else {
        inox_crypto_throw_failed("crypto.publicEncrypt failed");
      }
    }

    return Buffer();
  }

  Buffer result = inox_crypto_rsa_crypt(
    state,
    data_bytes,
    data_len,
    false,
    has_oaep_hash ? oaep_hash : inox::StringView("sha1", 4),
    label_bytes,
    label_len,
    "crypto.publicEncrypt failed"
  );
  CryptoKeyState_free(state);
  return result;
}

Buffer crypto::publicEncrypt(
  const KeyObject& key,
  const inox::Value& buffer,
  inox::StringView oaep_hash,
  bool has_oaep_hash,
  const inox::Value& oaep_label,
  bool has_oaep_label
) const {
  const uint8_t* bytes = 0;
  const uint8_t* label_bytes = 0;
  size_t len = 0;
  size_t label_len = 0;
  inox_status status = inox_crypto_data(buffer.raw(), &bytes, &len);

  if (status == INOX_OK && has_oaep_label) {
    status = inox_crypto_data(oaep_label.raw(), &label_bytes, &label_len);
  }

  if (status != INOX_OK) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed("crypto.publicEncrypt failed");
    }

    return Buffer();
  }

  return inox_crypto_rsa_crypt(
    key.handle_,
    bytes,
    len,
    false,
    has_oaep_hash ? oaep_hash : inox::StringView("sha1", 4),
    label_bytes,
    label_len,
    "crypto.publicEncrypt failed"
  );
}

CryptoKeyPair crypto::generateKeyPairSync(
  inox::StringView type,
  const inox::Value& options
) const {
  CryptoKeyState* public_state = 0;
  CryptoKeyState* private_state = 0;
  const inox_status status = CryptoKeyState_generate_pair(
    &inox_default_allocator,
    type,
    options,
    &public_state,
    &private_state
  );

  if (status != INOX_OK) {
    CryptoKeyState_free(public_state);
    CryptoKeyState_free(private_state);

    if (!inox::thrown()) {
      if (status == INOX_ERR_OOM) {
        inox::throw_out_of_memory();
      } else {
        inox_crypto_throw_failed("crypto.generateKeyPairSync failed");
      }
    }

    return CryptoKeyPair();
  }

  return CryptoKeyPair(KeyObject(public_state), KeyObject(private_state));
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

Hmac crypto::createHmac(inox::StringView algorithm, const KeyObject& key) const {
  CryptoHmacState* hmac = 0;

  if (
    key.handle_ == 0 ||
    key.handle_->key_type != INOX_CRYPTO_KEY_SECRET ||
    CryptoHmacState_create(
      &inox_default_allocator,
      algorithm.bytes,
      algorithm.len,
      key.handle_->secret_bytes,
      key.handle_->secret_len,
      &hmac
    ) != INOX_OK
  ) {
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

inox::String crypto::hash(
  inox::StringView algorithm,
  inox::StringView data,
  inox::StringView output_encoding
) const {
  Hash hash = createHash(algorithm);

  if (inox::thrown()) {
    return inox::String();
  }

  hash.update(data);

  if (inox::thrown()) {
    return inox::String();
  }

  return hash.digest(output_encoding);
}

inox::String crypto::hash(
  inox::StringView algorithm,
  const inox::Value& data,
  inox::StringView output_encoding
) const {
  Hash hash = createHash(algorithm);

  if (inox::thrown()) {
    return inox::String();
  }

  hash.update(data);

  if (inox::thrown()) {
    return inox::String();
  }

  return hash.digest(output_encoding);
}

Buffer crypto::hashBuffer(inox::StringView algorithm, inox::StringView data) const {
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

Buffer crypto::hashBuffer(inox::StringView algorithm, const inox::Value& data) const {
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

Buffer crypto::sign(
  inox::StringView algorithm,
  const inox::Value& data,
  const KeyObject& key
) const {
  const uint8_t* bytes = 0;
  size_t len = 0;

  if (inox_crypto_data(data.raw(), &bytes, &len) != INOX_OK) {
    inox_crypto_throw_failed("crypto.sign failed");
    return Buffer();
  }

  return inox_crypto_sign(key.handle_, algorithm, bytes, len);
}

Buffer crypto::sign(
  inox::StringView algorithm,
  const inox::Value& data,
  const inox::Value& key
) const {
  const uint8_t* data_bytes = 0;
  const uint8_t* key_bytes = 0;
  size_t data_len = 0;
  size_t key_len = 0;
  CryptoKeyState* state = 0;
  inox_status status = inox_crypto_data(data.raw(), &data_bytes, &data_len);

  if (status == INOX_OK) {
    status = inox_crypto_data(key.raw(), &key_bytes, &key_len);
  }

  if (status == INOX_OK) {
    status = CryptoKeyState_create(&inox_default_allocator, key_bytes, key_len, true, &state);
  }

  if (status != INOX_OK) {
    CryptoKeyState_free(state);

    if (status == INOX_ERR_OOM) {
      inox::throw_out_of_memory();
    } else {
      inox_crypto_throw_failed("crypto.sign failed");
    }

    return Buffer();
  }

  Buffer result = inox_crypto_sign(state, algorithm, data_bytes, data_len);
  CryptoKeyState_free(state);
  return result;
}

bool crypto::verify(
  inox::StringView algorithm,
  const inox::Value& data,
  const KeyObject& key,
  const inox::Value& signature
) const {
  const uint8_t* data_bytes = 0;
  const uint8_t* signature_bytes = 0;
  size_t data_len = 0;
  size_t signature_len = 0;
  bool result = false;
  inox_status status = INOX_OK;

  status = inox_crypto_data(data.raw(), &data_bytes, &data_len);

  if (status == INOX_OK) {
    status = inox_crypto_data(signature.raw(), &signature_bytes, &signature_len);
  }

  if (status == INOX_OK) {
    status = inox_crypto_verify(
      key.handle_,
      algorithm,
      data_bytes,
      data_len,
      signature_bytes,
      signature_len,
      &result
    );
  }

  if (status != INOX_OK) {
    if (status == INOX_ERR_OOM) {
      inox::throw_out_of_memory();
    } else {
      inox_crypto_throw_failed("crypto.verify failed");
    }

    return false;
  }

  return result;
}

bool crypto::verify(
  inox::StringView algorithm,
  const inox::Value& data,
  const inox::Value& key,
  const inox::Value& signature
) const {
  const uint8_t* data_bytes = 0;
  const uint8_t* key_bytes = 0;
  const uint8_t* signature_bytes = 0;
  size_t data_len = 0;
  size_t key_len = 0;
  size_t signature_len = 0;
  CryptoKeyState* state = 0;
  inox_status status = inox_crypto_data(data.raw(), &data_bytes, &data_len);

  if (status == INOX_OK) {
    status = inox_crypto_data(key.raw(), &key_bytes, &key_len);
  }

  if (status == INOX_OK) {
    status = inox_crypto_data(signature.raw(), &signature_bytes, &signature_len);
  }

  if (status == INOX_OK) {
    status = CryptoKeyState_create(&inox_default_allocator, key_bytes, key_len, false, &state);
  }

  bool result = false;

  if (status == INOX_OK) {
    status = inox_crypto_verify(
      state,
      algorithm,
      data_bytes,
      data_len,
      signature_bytes,
      signature_len,
      &result
    );
  }

  CryptoKeyState_free(state);

  if (status != INOX_OK) {
    if (status == INOX_ERR_OOM) {
      inox::throw_out_of_memory();
    } else {
      inox_crypto_throw_failed("crypto.verify failed");
    }

    return false;
  }

  return result;
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

#if INOX_CRYPTO_HAS_EVP
  const EVP_MD* digest = inox_crypto_digest_algorithm(algorithm, algorithm_len);

  if (digest == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

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

  if (EVP_DigestInit_ex(hash->ctx, digest, 0) != 1) {
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

#if INOX_CRYPTO_HAS_EVP
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

  if (key_bytes == 0 && key_len != 0) {
    return INOX_ERR_TYPE;
  }

  if (key_len > (size_t)INT_MAX) {
    return INOX_ERR_TYPE;
  }

#if INOX_CRYPTO_HAS_EVP
  const EVP_MD* digest = inox_crypto_digest_algorithm(algorithm, algorithm_len);

  if (digest == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

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

  if (HMAC_Init_ex(hmac->ctx, key_bytes, (int)key_len, digest, 0) != 1) {
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

  const uint8_t* key_bytes = 0;
  size_t key_len = 0;
  inox_status status = inox_crypto_data(key, &key_bytes, &key_len);

  if (status != INOX_OK) {
    return status;
  }

  return CryptoHmacState_create(allocator, algorithm, algorithm_len, key_bytes, key_len, out);
}

static void CryptoHmacState_free(CryptoHmacState* hmac) {
  if (hmac == 0) {
    return;
  }

#if INOX_CRYPTO_HAS_EVP
  if (hmac->ctx != 0) {
    HMAC_CTX_free(hmac->ctx);
  }
#endif

  if (hmac->allocator != 0 && hmac->allocator->free != 0) {
    hmac->allocator->free(hmac->allocator->user, hmac, sizeof(CryptoHmacState), alignof(CryptoHmacState));
  }
}

#if INOX_CRYPTO_HAS_EVP
static const EVP_CIPHER* inox_crypto_cipher_algorithm(
  inox::StringView algorithm,
  size_t* key_length
) {
  const std::string_view name(algorithm.bytes, algorithm.len);

  if (name == "aes-128-gcm") {
    *key_length = 16;
    return EVP_aes_128_gcm();
  }

  if (name == "aes-192-gcm") {
    *key_length = 24;
    return EVP_aes_192_gcm();
  }

  if (name == "aes-256-gcm") {
    *key_length = 32;
    return EVP_aes_256_gcm();
  }

  return 0;
}

static int inox_crypto_auth_tag_length(const inox::Value& options, size_t* out) {
  *out = 16;

  if (options.tag == INOX_TAG_UNDEFINED || options.tag == INOX_TAG_NULL) {
    return 1;
  }

  if (options.tag != INOX_TAG_OBJECT && options.tag != INOX_TAG_CLASS_INSTANCE) {
    return 0;
  }

  inox::Value value = inox::get(options.raw(), "authTagLength");

  if (inox::thrown()) {
    return 0;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    return 1;
  }

  if (value.tag != INOX_TAG_NUMBER || !inox_crypto_number_to_size(value.as.number, out)) {
    return 0;
  }

  return *out == 4 || *out == 8 || (*out >= 12 && *out <= 16);
}
#endif

static inox_status CryptoCipherState_create(
  inox_allocator* allocator,
  inox::StringView algorithm,
  const uint8_t* key_bytes,
  size_t key_len,
  inox_value iv,
  const inox::Value& options,
  bool encrypt,
  CryptoCipherState** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

#if INOX_CRYPTO_HAS_EVP
  const uint8_t* iv_bytes = 0;
  size_t iv_len = 0;
  size_t expected_key_len = 0;
  size_t auth_tag_len = 0;
  const EVP_CIPHER* cipher = inox_crypto_cipher_algorithm(algorithm, &expected_key_len);

  if (
    cipher == 0 ||
    (key_bytes == 0 && key_len != 0) ||
    inox_crypto_data(iv, &iv_bytes, &iv_len) != INOX_OK ||
    !inox_crypto_auth_tag_length(options, &auth_tag_len) ||
    key_len != expected_key_len ||
    iv_len == 0 ||
    iv_len > (size_t)INT_MAX
  ) {
    return inox::thrown() ? INOX_ERR_THROW : INOX_ERR_TYPE;
  }

  CryptoCipherState* state = (CryptoCipherState*)allocator->alloc(
    allocator->user,
    sizeof(CryptoCipherState),
    alignof(CryptoCipherState)
  );

  if (state == 0) {
    return INOX_ERR_OOM;
  }

  state->allocator = allocator;
  state->ctx = EVP_CIPHER_CTX_new();
  state->auth_tag_length = auth_tag_len;
  state->encrypt = encrypt ? 1 : 0;
  state->finalized = 0;
  state->updated = 0;
  state->auth_tag_set = 0;

  if (state->ctx == 0) {
    allocator->free(allocator->user, state, sizeof(CryptoCipherState), alignof(CryptoCipherState));
    return INOX_ERR_OOM;
  }

  if (
    EVP_CipherInit_ex(state->ctx, cipher, 0, 0, 0, encrypt ? 1 : 0) != 1 ||
    EVP_CIPHER_CTX_ctrl(state->ctx, EVP_CTRL_GCM_SET_IVLEN, (int)iv_len, 0) != 1 ||
    EVP_CipherInit_ex(state->ctx, 0, 0, key_bytes, iv_bytes, encrypt ? 1 : 0) != 1
  ) {
    CryptoCipherState_free(state);
    return INOX_ERR_UNSUPPORTED;
  }

  *out = state;
  return INOX_OK;
#else
  (void)algorithm;
  (void)key_bytes;
  (void)key_len;
  (void)iv;
  (void)options;
  (void)encrypt;

  return INOX_ERR_UNSUPPORTED;
#endif
}

static void CryptoCipherState_free(CryptoCipherState* cipher) {
  if (cipher == 0) {
    return;
  }

#if INOX_CRYPTO_HAS_EVP
  if (cipher->ctx != 0) {
    EVP_CIPHER_CTX_free(cipher->ctx);
  }
#endif

  if (cipher->allocator != 0 && cipher->allocator->free != 0) {
    cipher->allocator->free(
      cipher->allocator->user,
      cipher,
      sizeof(CryptoCipherState),
      alignof(CryptoCipherState)
    );
  }
}

#if INOX_CRYPTO_HAS_EVP
static int inox_crypto_no_pem_password(char* buffer, int size, int writing, void* user) {
  (void)buffer;
  (void)size;
  (void)writing;
  (void)user;
  return 0;
}

static int inox_crypto_key_type(EVP_PKEY* key) {
  if (key == 0) {
    return 0;
  }

  const int type = EVP_PKEY_id(key);

  if (type == EVP_PKEY_RSA) {
    return INOX_CRYPTO_KEY_RSA;
  }

  if (type == EVP_PKEY_RSA_PSS) {
    return INOX_CRYPTO_KEY_RSA_PSS;
  }

  if (type == EVP_PKEY_EC) {
    return INOX_CRYPTO_KEY_EC;
  }

  return 0;
}

static EVP_PKEY* inox_crypto_read_pem_key(const uint8_t* bytes, size_t len, bool private_key) {
  if (bytes == 0 || len == 0 || len > (size_t)INT_MAX) {
    return 0;
  }

  BIO* input = BIO_new_mem_buf(bytes, (int)len);

  if (input == 0) {
    return 0;
  }

  EVP_PKEY* key = private_key
    ? PEM_read_bio_PrivateKey(input, 0, inox_crypto_no_pem_password, 0)
    : PEM_read_bio_PUBKEY(input, 0, inox_crypto_no_pem_password, 0);

  BIO_free(input);

  if (key != 0 || private_key) {
    return key;
  }

  ERR_clear_error();
  input = BIO_new_mem_buf(bytes, (int)len);

  if (input == 0) {
    return 0;
  }

  key = PEM_read_bio_PrivateKey(input, 0, inox_crypto_no_pem_password, 0);
  BIO_free(input);
  return key;
}

static const EVP_MD* inox_crypto_signature_algorithm(inox::StringView algorithm) {
  const std::string_view name(algorithm.bytes, algorithm.len);

  if (name == "sha256") {
    return EVP_sha256();
  }

  if (name == "sha384") {
    return EVP_sha384();
  }

  if (name == "sha512") {
    return EVP_sha512();
  }

  return 0;
}
#endif

static inox_status CryptoKeyState_create(
  inox_allocator* allocator,
  const uint8_t* bytes,
  size_t len,
  bool private_key,
  CryptoKeyState** out
) {
  if (
    allocator == 0 ||
    allocator->alloc == 0 ||
    allocator->free == 0 ||
    bytes == 0 ||
    len == 0 ||
    out == 0
  ) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

#if INOX_CRYPTO_HAS_EVP
  EVP_PKEY* parsed = inox_crypto_read_pem_key(bytes, len, private_key);

  if (parsed == 0) {
    ERR_clear_error();
    return INOX_ERR_TYPE;
  }

  const int key_type = inox_crypto_key_type(parsed);

  if (key_type == 0) {
    EVP_PKEY_free(parsed);
    ERR_clear_error();
    return INOX_ERR_TYPE;
  }

  CryptoKeyState* state = (CryptoKeyState*)allocator->alloc(
    allocator->user,
    sizeof(CryptoKeyState),
    alignof(CryptoKeyState)
  );

  if (state == 0) {
    EVP_PKEY_free(parsed);
    return INOX_ERR_OOM;
  }

  state->allocator = allocator;
  state->refs = 1;
  state->key = parsed;
  state->secret_bytes = 0;
  state->secret_len = 0;
  state->private_key = private_key ? 1 : 0;
  state->key_type = key_type;
  *out = state;
  return INOX_OK;
#else
  (void)private_key;
  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status CryptoKeyState_create_secret(
  inox_allocator* allocator,
  const uint8_t* bytes,
  size_t len,
  CryptoKeyState** out
) {
  if (
    allocator == 0 ||
    allocator->alloc == 0 ||
    allocator->free == 0 ||
    (bytes == 0 && len != 0) ||
    out == 0
  ) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  CryptoKeyState* state = (CryptoKeyState*)allocator->alloc(
    allocator->user,
    sizeof(CryptoKeyState),
    alignof(CryptoKeyState)
  );

  if (state == 0) {
    return INOX_ERR_OOM;
  }

  state->allocator = allocator;
  state->refs = 1;
#if INOX_CRYPTO_HAS_EVP
  state->key = 0;
#endif
  state->secret_bytes = 0;
  state->secret_len = len;
  state->private_key = 0;
  state->key_type = INOX_CRYPTO_KEY_SECRET;

  if (len > 0) {
    state->secret_bytes = (uint8_t*)allocator->alloc(
      allocator->user,
      len,
      alignof(uint8_t)
    );

    if (state->secret_bytes == 0) {
      allocator->free(
        allocator->user,
        state,
        sizeof(CryptoKeyState),
        alignof(CryptoKeyState)
      );
      return INOX_ERR_OOM;
    }

    std::memcpy(state->secret_bytes, bytes, len);
  }

  *out = state;
  return INOX_OK;
}

static inox_status CryptoKeyState_generate_pair(
  inox_allocator* allocator,
  inox::StringView type,
  const inox::Value& options,
  CryptoKeyState** public_key,
  CryptoKeyState** private_key
) {
  if (
    allocator == 0 ||
    allocator->alloc == 0 ||
    allocator->free == 0 ||
    public_key == 0 ||
    private_key == 0 ||
    (options.tag != INOX_TAG_OBJECT && options.tag != INOX_TAG_CLASS_INSTANCE)
  ) {
    return INOX_ERR_TYPE;
  }

  *public_key = 0;
  *private_key = 0;

#if INOX_CRYPTO_HAS_EVP
  const std::string_view key_type(type.bytes, type.len);
  EVP_PKEY_CTX* context = 0;
  BIGNUM* exponent = 0;

  if (key_type == "rsa") {
    inox::Value modulus_value = inox::get(options.raw(), "modulusLength");
    inox::Value exponent_value = inox::get(options.raw(), "publicExponent");

    if (inox::thrown()) {
      return INOX_ERR_THROW;
    }

    size_t modulus_length = 0;

    if (
      modulus_value.tag != INOX_TAG_NUMBER ||
      !inox_crypto_number_to_size(modulus_value.as.number, &modulus_length) ||
      modulus_length < 512 ||
      modulus_length > (size_t)INT_MAX
    ) {
      return INOX_ERR_TYPE;
    }

    size_t public_exponent = 65537;

    if (
      exponent_value.tag != INOX_TAG_UNDEFINED &&
      (
        exponent_value.tag != INOX_TAG_NUMBER ||
        !inox_crypto_number_to_size(exponent_value.as.number, &public_exponent)
      )
    ) {
      return INOX_ERR_TYPE;
    }

    if (public_exponent < 3 || (public_exponent & 1u) == 0 || public_exponent > (size_t)ULONG_MAX) {
      return INOX_ERR_TYPE;
    }

    context = EVP_PKEY_CTX_new_id(EVP_PKEY_RSA, 0);
    exponent = BN_new();

    if (context == 0 || exponent == 0) {
      EVP_PKEY_CTX_free(context);
      BN_free(exponent);
      return INOX_ERR_OOM;
    }

    if (
      EVP_PKEY_keygen_init(context) != 1 ||
      EVP_PKEY_CTX_set_rsa_keygen_bits(context, (int)modulus_length) != 1 ||
      BN_set_word(exponent, (BN_ULONG)public_exponent) != 1 ||
      EVP_PKEY_CTX_set_rsa_keygen_pubexp(context, exponent) != 1
    ) {
      EVP_PKEY_CTX_free(context);
      BN_free(exponent);
      ERR_clear_error();
      return INOX_ERR_TYPE;
    }

    exponent = 0;
  } else if (key_type == "ec") {
    inox::Value curve_value = inox::get(options.raw(), "namedCurve");

    if (inox::thrown()) {
      return INOX_ERR_THROW;
    }

    if (curve_value.tag != INOX_TAG_STRING || curve_value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    const inox::String curve(curve_value);
    const std::string curve_name(curve.bytes(), curve.length());
    int curve_id = EC_curve_nist2nid(curve_name.c_str());

    if (curve_id == NID_undef) {
      curve_id = OBJ_txt2nid(curve_name.c_str());
    }

    if (curve_id == NID_undef) {
      return INOX_ERR_TYPE;
    }

    context = EVP_PKEY_CTX_new_id(EVP_PKEY_EC, 0);

    if (context == 0) {
      return INOX_ERR_OOM;
    }

    if (
      EVP_PKEY_keygen_init(context) != 1 ||
      EVP_PKEY_CTX_set_ec_paramgen_curve_nid(context, curve_id) != 1
    ) {
      EVP_PKEY_CTX_free(context);
      ERR_clear_error();
      return INOX_ERR_TYPE;
    }
  } else {
    return INOX_ERR_TYPE;
  }

  EVP_PKEY* generated = 0;

  if (EVP_PKEY_keygen(context, &generated) != 1 || generated == 0) {
    EVP_PKEY_CTX_free(context);
    ERR_clear_error();
    return INOX_ERR_TYPE;
  }

  EVP_PKEY_CTX_free(context);
  const int generated_type = inox_crypto_key_type(generated);

  if (generated_type == 0) {
    EVP_PKEY_free(generated);
    return INOX_ERR_TYPE;
  }

  CryptoKeyState* private_state = (CryptoKeyState*)allocator->alloc(
    allocator->user,
    sizeof(CryptoKeyState),
    alignof(CryptoKeyState)
  );

  if (private_state == 0) {
    EVP_PKEY_free(generated);
    return INOX_ERR_OOM;
  }

  private_state->allocator = allocator;
  private_state->refs = 1;
  private_state->key = generated;
  private_state->secret_bytes = 0;
  private_state->secret_len = 0;
  private_state->private_key = 1;
  private_state->key_type = generated_type;

  const inox_status public_status = CryptoKeyState_clone_public(
    allocator,
    private_state,
    public_key
  );

  if (public_status != INOX_OK) {
    CryptoKeyState_free(private_state);
    return public_status;
  }

  *private_key = private_state;
  return INOX_OK;
#else
  (void)type;
  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status CryptoKeyState_clone_public(
  inox_allocator* allocator,
  const CryptoKeyState* key,
  CryptoKeyState** out
) {
  if (
    allocator == 0 ||
    allocator->alloc == 0 ||
    allocator->free == 0 ||
    key == 0 ||
    out == 0
  ) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

#if INOX_CRYPTO_HAS_EVP
  if (key->key == 0) {
    return INOX_ERR_TYPE;
  }

  BIO* public_pem = BIO_new(BIO_s_mem());

  if (public_pem == 0) {
    return INOX_ERR_OOM;
  }

  if (PEM_write_bio_PUBKEY(public_pem, key->key) != 1) {
    BIO_free(public_pem);
    ERR_clear_error();
    return INOX_ERR_TYPE;
  }

  EVP_PKEY* public_key = PEM_read_bio_PUBKEY(public_pem, 0, inox_crypto_no_pem_password, 0);
  BIO_free(public_pem);

  if (public_key == 0) {
    ERR_clear_error();
    return INOX_ERR_TYPE;
  }

  CryptoKeyState* state = (CryptoKeyState*)allocator->alloc(
    allocator->user,
    sizeof(CryptoKeyState),
    alignof(CryptoKeyState)
  );

  if (state == 0) {
    EVP_PKEY_free(public_key);
    return INOX_ERR_OOM;
  }

  state->allocator = allocator;
  state->refs = 1;
  state->key = public_key;
  state->secret_bytes = 0;
  state->secret_len = 0;
  state->private_key = 0;
  state->key_type = key->key_type;
  *out = state;
  return INOX_OK;
#else
  return INOX_ERR_UNSUPPORTED;
#endif
}

static void CryptoKeyState_retain(CryptoKeyState* key) {
  if (key != 0) {
    key->refs += 1;
  }
}

static void CryptoKeyState_free(CryptoKeyState* key) {
  if (key == 0) {
    return;
  }

  if (key->refs > 1) {
    key->refs -= 1;
    return;
  }

#if INOX_CRYPTO_HAS_EVP
  EVP_PKEY_free(key->key);
#endif

  if (key->secret_bytes != 0) {
    volatile uint8_t* bytes = key->secret_bytes;

    for (size_t index = 0; index < key->secret_len; index += 1) {
      bytes[index] = 0;
    }

    if (key->allocator != 0 && key->allocator->free != 0) {
      key->allocator->free(
        key->allocator->user,
        key->secret_bytes,
        key->secret_len,
        alignof(uint8_t)
      );
    }
  }

  if (key->allocator != 0 && key->allocator->free != 0) {
    key->allocator->free(
      key->allocator->user,
      key,
      sizeof(CryptoKeyState),
      alignof(CryptoKeyState)
    );
  }
}

static Buffer inox_crypto_sign(
  CryptoKeyState* key,
  inox::StringView algorithm,
  const uint8_t* bytes,
  size_t len
) {
  if (key == 0 || !key->private_key || (bytes == 0 && len != 0)) {
    inox_crypto_throw_failed("crypto.sign failed");
    return Buffer();
  }

#if INOX_CRYPTO_HAS_EVP
  const EVP_MD* digest = inox_crypto_signature_algorithm(algorithm);
  EVP_MD_CTX* context = EVP_MD_CTX_new();

  if (context == 0) {
    inox::throw_out_of_memory();
    return Buffer();
  }

  const uint8_t empty = 0;
  const uint8_t* input = bytes == 0 ? &empty : bytes;
  size_t signature_len = 0;

  if (
    digest == 0 ||
    key->key == 0 ||
    EVP_DigestSignInit(context, 0, digest, 0, key->key) != 1 ||
    EVP_DigestSign(context, 0, &signature_len, input, len) != 1 ||
    signature_len == 0
  ) {
    EVP_MD_CTX_free(context);
    ERR_clear_error();
    inox_crypto_throw_failed("crypto.sign failed");
    return Buffer();
  }

  Buffer signature = Buffer::alloc((double)signature_len);

  if (inox::thrown() || !signature.valid()) {
    EVP_MD_CTX_free(context);
    return Buffer();
  }

  size_t actual_len = signature_len;

  if (
    EVP_DigestSign(context, signature.bytes().data(), &actual_len, input, len) != 1 ||
    actual_len == 0 ||
    actual_len > signature_len
  ) {
    EVP_MD_CTX_free(context);
    ERR_clear_error();
    inox_crypto_throw_failed("crypto.sign failed");
    return Buffer();
  }

  EVP_MD_CTX_free(context);

  if (actual_len == signature_len) {
    return signature;
  }

  return signature.slice(0, (double)actual_len);
#else
  (void)algorithm;
  (void)bytes;
  (void)len;
  inox_crypto_throw_failed("crypto.sign failed");
  return Buffer();
#endif
}

static Buffer inox_crypto_rsa_crypt(
  CryptoKeyState* key,
  const uint8_t* bytes,
  size_t len,
  bool decrypt,
  inox::StringView oaep_hash,
  const uint8_t* oaep_label,
  size_t oaep_label_len,
  const char* message
) {
  if (
    key == 0 ||
    key->key_type != INOX_CRYPTO_KEY_RSA ||
    (decrypt && !key->private_key) ||
    (bytes == 0 && len != 0) ||
    (oaep_label == 0 && oaep_label_len != 0) ||
    oaep_label_len > INT_MAX
  ) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

#if INOX_CRYPTO_HAS_EVP
  if (key->key == 0) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  const EVP_MD* digest = inox_crypto_digest_algorithm(oaep_hash.bytes, oaep_hash.len);

  if (digest == 0) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  EVP_PKEY_CTX* context = EVP_PKEY_CTX_new(key->key, 0);

  if (context == 0) {
    inox::throw_out_of_memory();
    return Buffer();
  }

  const uint8_t empty = 0;
  const uint8_t* input = bytes == 0 ? &empty : bytes;
  size_t output_len = 0;
  const int initialized = decrypt
    ? EVP_PKEY_decrypt_init(context)
    : EVP_PKEY_encrypt_init(context);

  if (
    initialized != 1 ||
    EVP_PKEY_CTX_set_rsa_padding(context, RSA_PKCS1_OAEP_PADDING) != 1 ||
    EVP_PKEY_CTX_set_rsa_oaep_md(context, digest) != 1 ||
    EVP_PKEY_CTX_set_rsa_mgf1_md(context, digest) != 1
  ) {
    EVP_PKEY_CTX_free(context);
    ERR_clear_error();
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  if (oaep_label_len > 0) {
    uint8_t* label_copy = static_cast<uint8_t*>(OPENSSL_malloc(oaep_label_len));

    if (label_copy == 0) {
      EVP_PKEY_CTX_free(context);
      inox::throw_out_of_memory();
      return Buffer();
    }

    std::memcpy(label_copy, oaep_label, oaep_label_len);

    if (EVP_PKEY_CTX_set0_rsa_oaep_label(context, label_copy, (int)oaep_label_len) != 1) {
      OPENSSL_free(label_copy);
      EVP_PKEY_CTX_free(context);
      ERR_clear_error();
      inox_crypto_throw_failed(message);
      return Buffer();
    }
  }

  if (
    (
      decrypt
        ? EVP_PKEY_decrypt(context, 0, &output_len, input, len)
        : EVP_PKEY_encrypt(context, 0, &output_len, input, len)
    ) != 1 ||
    output_len == 0
  ) {
    EVP_PKEY_CTX_free(context);
    ERR_clear_error();
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  Buffer output = Buffer::alloc((double)output_len);

  if (inox::thrown() || !output.valid()) {
    EVP_PKEY_CTX_free(context);
    return Buffer();
  }

  size_t actual_len = output_len;
  const int completed = decrypt
    ? EVP_PKEY_decrypt(context, output.bytes().data(), &actual_len, input, len)
    : EVP_PKEY_encrypt(context, output.bytes().data(), &actual_len, input, len);
  EVP_PKEY_CTX_free(context);

  if (completed != 1 || (!decrypt && actual_len == 0) || actual_len > output_len) {
    ERR_clear_error();
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  if (actual_len == output_len) {
    return output;
  }

  return output.slice(0, (double)actual_len);
#else
  (void)bytes;
  (void)len;
  (void)decrypt;
  (void)oaep_hash;
  (void)oaep_label;
  (void)oaep_label_len;
  inox_crypto_throw_failed(message);
  return Buffer();
#endif
}

static inox_status inox_crypto_verify(
  CryptoKeyState* key,
  inox::StringView algorithm,
  const uint8_t* bytes,
  size_t len,
  const uint8_t* signature,
  size_t signature_len,
  bool* out
) {
  if (
    key == 0 ||
    (bytes == 0 && len != 0) ||
    signature == 0 ||
    signature_len == 0 ||
    out == 0
  ) {
    return INOX_ERR_TYPE;
  }

  *out = false;

#if INOX_CRYPTO_HAS_EVP
  const EVP_MD* digest = inox_crypto_signature_algorithm(algorithm);
  EVP_MD_CTX* context = EVP_MD_CTX_new();

  if (context == 0) {
    return INOX_ERR_OOM;
  }

  const uint8_t empty = 0;
  const uint8_t* input = bytes == 0 ? &empty : bytes;

  if (digest == 0 || key->key == 0 || EVP_DigestVerifyInit(context, 0, digest, 0, key->key) != 1) {
    EVP_MD_CTX_free(context);
    ERR_clear_error();
    return INOX_ERR_UNSUPPORTED;
  }

  const int result = EVP_DigestVerify(context, signature, signature_len, input, len);
  EVP_MD_CTX_free(context);

  if (result == 1) {
    *out = true;
    return INOX_OK;
  }

  ERR_clear_error();
  return result == 0 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#else
  (void)algorithm;
  (void)bytes;
  (void)len;
  (void)signature;
  (void)signature_len;
  return INOX_ERR_UNSUPPORTED;
#endif
}

static Buffer inox_crypto_cipher_update_raw(
  CryptoCipherState* cipher,
  const uint8_t* bytes,
  size_t len,
  const char* message
) {
  if (
    cipher == 0 ||
    cipher->finalized ||
    (bytes == 0 && len != 0) ||
    len > (size_t)INT_MAX
  ) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

#if INOX_CRYPTO_HAS_EVP
  Buffer result = Buffer::alloc((double)len);

  if (inox::thrown() || !result.valid()) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed(message);
    }

    return Buffer();
  }

  int output_len = 0;

  if (
    EVP_CipherUpdate(cipher->ctx, result.bytes().data(), &output_len, bytes, (int)len) != 1 ||
    output_len < 0 ||
    (size_t)output_len > len
  ) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  cipher->updated = 1;

  if ((size_t)output_len == len) {
    return result;
  }

  return result.slice(0, (double)output_len);
#else
  (void)bytes;
  (void)len;
  inox_crypto_throw_failed(message);
  return Buffer();
#endif
}

static Buffer inox_crypto_cipher_final(CryptoCipherState* cipher, const char* message) {
  if (cipher == 0 || cipher->finalized) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  cipher->finalized = 1;

#if INOX_CRYPTO_HAS_EVP
  uint8_t output[EVP_MAX_BLOCK_LENGTH];
  int output_len = 0;

  if (EVP_CipherFinal_ex(cipher->ctx, output, &output_len) != 1 || output_len < 0) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  Buffer result(std::span<const uint8_t>(output, (size_t)output_len));

  if (inox::thrown() || !result.valid()) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed(message);
    }

    return Buffer();
  }

  return result;
#else
  inox_crypto_throw_failed(message);
  return Buffer();
#endif
}

static Buffer inox_crypto_cipher_auth_tag(CryptoCipherState* cipher, const char* message) {
  if (cipher == 0 || !cipher->encrypt || !cipher->finalized) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

#if INOX_CRYPTO_HAS_EVP
  Buffer tag = Buffer::alloc((double)cipher->auth_tag_length);

  if (inox::thrown() || !tag.valid()) {
    if (!inox::thrown()) {
      inox_crypto_throw_failed(message);
    }

    return Buffer();
  }

  if (
    EVP_CIPHER_CTX_ctrl(
      cipher->ctx,
      EVP_CTRL_GCM_GET_TAG,
      (int)cipher->auth_tag_length,
      tag.bytes().data()
    ) != 1
  ) {
    inox_crypto_throw_failed(message);
    return Buffer();
  }

  return tag;
#else
  inox_crypto_throw_failed(message);
  return Buffer();
#endif
}

static inox_status inox_crypto_cipher_set_aad(
  CryptoCipherState* cipher,
  const uint8_t* bytes,
  size_t len
) {
  if (
    cipher == 0 ||
    cipher->finalized ||
    cipher->updated ||
    (bytes == 0 && len != 0) ||
    len > (size_t)INT_MAX
  ) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HAS_EVP
  int output_len = 0;
  return EVP_CipherUpdate(cipher->ctx, 0, &output_len, bytes, (int)len) == 1
    ? INOX_OK
    : INOX_ERR_UNSUPPORTED;
#else
  (void)bytes;
  (void)len;
  return INOX_ERR_UNSUPPORTED;
#endif
}

static inox_status inox_crypto_cipher_set_aad(
  CryptoCipherState* cipher,
  inox::StringView data,
  const inox::Value& options
) {
  if (options.tag == INOX_TAG_UNDEFINED || options.tag == INOX_TAG_NULL) {
    return inox_crypto_cipher_set_aad(cipher, (const uint8_t*)data.bytes, data.len);
  }

  if (options.tag != INOX_TAG_OBJECT && options.tag != INOX_TAG_CLASS_INSTANCE) {
    return INOX_ERR_TYPE;
  }

  inox::Value encoding_value = inox::get(options.raw(), "encoding");

  if (inox::thrown()) {
    return INOX_ERR_THROW;
  }

  if (encoding_value.tag == INOX_TAG_UNDEFINED) {
    return inox_crypto_cipher_set_aad(cipher, (const uint8_t*)data.bytes, data.len);
  }

  if (encoding_value.tag != INOX_TAG_STRING || encoding_value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  Buffer decoded = Buffer::from(data, inox::String(encoding_value));

  if (inox::thrown() || !decoded.valid()) {
    return inox::thrown() ? INOX_ERR_THROW : INOX_ERR_TYPE;
  }

  return inox_crypto_cipher_set_aad(cipher, decoded.bytes().data(), decoded.length());
}

static inox_status inox_crypto_cipher_set_auth_tag(
  CryptoCipherState* cipher,
  const uint8_t* bytes,
  size_t len
) {
  if (
    cipher == 0 ||
    cipher->encrypt ||
    cipher->finalized ||
    cipher->auth_tag_set ||
    bytes == 0 ||
    len != cipher->auth_tag_length
  ) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HAS_EVP
  if (
    EVP_CIPHER_CTX_ctrl(
      cipher->ctx,
      EVP_CTRL_GCM_SET_TAG,
      (int)len,
      (void*)bytes
    ) != 1
  ) {
    return INOX_ERR_UNSUPPORTED;
  }

  cipher->auth_tag_set = 1;
  return INOX_OK;
#else
  (void)bytes;
  (void)len;
  return INOX_ERR_UNSUPPORTED;
#endif
}

static int inox_crypto_cipher_output_encoding(inox::StringView encoding, bool decrypt) {
  const std::string_view name(encoding.bytes, encoding.len);

  return name == "hex" || (decrypt && (name == "utf8" || name == "utf-8"));
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

#if INOX_CRYPTO_HAS_EVP
static const EVP_MD* inox_crypto_digest_algorithm(const char* algorithm, size_t algorithm_len) {
  const std::string_view name(algorithm, algorithm_len);

  if (name == "sha1") {
    return EVP_sha1();
  }

  if (name == "sha224") {
    return EVP_sha224();
  }

  if (name == "sha256") {
    return EVP_sha256();
  }

  if (name == "sha384") {
    return EVP_sha384();
  }

  if (name == "sha512") {
    return EVP_sha512();
  }

  return 0;
}
#endif

static inox_status inox_crypto_data(inox_value data, const uint8_t** bytes, size_t* len) {
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

#if INOX_CRYPTO_HAS_EVP
static int inox_crypto_scrypt_option(
  const inox::Value& options,
  const char* name,
  size_t* out,
  bool* present
) {
  inox::Value value = inox::get(options.raw(), name);

  if (inox::thrown()) {
    return 0;
  }

  if (value.tag == INOX_TAG_UNDEFINED) {
    *present = false;
    return 1;
  }

  if (value.tag != INOX_TAG_NUMBER || !inox_crypto_number_to_size(value.as.number, out)) {
    return 0;
  }

  *present = true;
  return 1;
}

static int inox_crypto_scrypt_options(
  const inox::Value& value,
  InoxCryptoScryptOptions* out
) {
  static const size_t default_max_memory = 32u * 1024u * 1024u;

  if (out == 0) {
    return 0;
  }

  out->cost = 16384;
  out->block_size = 8;
  out->parallelization = 1;
  out->max_memory = default_max_memory;

  if (value.tag == INOX_TAG_UNDEFINED || value.tag == INOX_TAG_NULL) {
    return 1;
  }

  if (value.tag != INOX_TAG_OBJECT && value.tag != INOX_TAG_CLASS_INSTANCE) {
    return 0;
  }

  size_t cost = 0;
  size_t cost_alias = 0;
  size_t block_size = 0;
  size_t block_size_alias = 0;
  size_t parallelization = 0;
  size_t parallelization_alias = 0;
  size_t max_memory = 0;
  bool has_cost = false;
  bool has_cost_alias = false;
  bool has_block_size = false;
  bool has_block_size_alias = false;
  bool has_parallelization = false;
  bool has_parallelization_alias = false;
  bool has_max_memory = false;

  if (
    !inox_crypto_scrypt_option(value, "cost", &cost, &has_cost) ||
    !inox_crypto_scrypt_option(value, "N", &cost_alias, &has_cost_alias) ||
    !inox_crypto_scrypt_option(value, "blockSize", &block_size, &has_block_size) ||
    !inox_crypto_scrypt_option(value, "r", &block_size_alias, &has_block_size_alias) ||
    !inox_crypto_scrypt_option(value, "parallelization", &parallelization, &has_parallelization) ||
    !inox_crypto_scrypt_option(value, "p", &parallelization_alias, &has_parallelization_alias) ||
    !inox_crypto_scrypt_option(value, "maxmem", &max_memory, &has_max_memory) ||
    (has_cost && has_cost_alias) ||
    (has_block_size && has_block_size_alias) ||
    (has_parallelization && has_parallelization_alias)
  ) {
    return 0;
  }

  if (has_cost || has_cost_alias) {
    out->cost = has_cost ? cost : cost_alias;
  }

  if (has_block_size || has_block_size_alias) {
    out->block_size = has_block_size ? block_size : block_size_alias;
  }

  if (has_parallelization || has_parallelization_alias) {
    out->parallelization = has_parallelization ? parallelization : parallelization_alias;
  }

  if (has_max_memory && max_memory != 0) {
    out->max_memory = max_memory;
  }

  return
    out->cost >= 2 &&
    (out->cost & (out->cost - 1)) == 0 &&
    out->block_size > 0 &&
    out->parallelization > 0;
}

static inox_status inox_crypto_hkdf(
  const EVP_MD* digest,
  const uint8_t* ikm,
  size_t ikm_len,
  const uint8_t* salt,
  size_t salt_len,
  const uint8_t* info,
  size_t info_len,
  uint8_t* out,
  size_t out_len
) {
  uint8_t prk[EVP_MAX_MD_SIZE];
  uint8_t previous[EVP_MAX_MD_SIZE];
  unsigned int prk_len = 0;
  unsigned int previous_len = 0;

  if (HMAC(digest, salt, salt_len, ikm, ikm_len, prk, &prk_len) == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  HMAC_CTX* ctx = HMAC_CTX_new();

  if (ctx == 0) {
    return INOX_ERR_OOM;
  }

  size_t written = 0;
  uint8_t counter = 1;

  while (written < out_len) {
    if (
      HMAC_Init_ex(ctx, prk, prk_len, digest, 0) != 1 ||
      (previous_len > 0 && HMAC_Update(ctx, previous, previous_len) != 1) ||
      (info_len > 0 && HMAC_Update(ctx, info, info_len) != 1) ||
      HMAC_Update(ctx, &counter, 1) != 1 ||
      HMAC_Final(ctx, previous, &previous_len) != 1
    ) {
      HMAC_CTX_free(ctx);
      return INOX_ERR_UNSUPPORTED;
    }

    size_t remaining = out_len - written;
    size_t count = remaining < previous_len ? remaining : previous_len;

    for (size_t index = 0; index < count; index += 1) {
      out[written + index] = previous[index];
    }

    written += count;
    counter += 1;
  }

  HMAC_CTX_free(ctx);
  return INOX_OK;
}
#endif

static inox_status CryptoHashState_update(CryptoHashState* hash, const uint8_t* bytes, size_t len) {
  if (hash == 0 || hash->finalized || (bytes == 0 && len != 0)) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HAS_EVP
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

#if INOX_CRYPTO_HAS_EVP
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

#if INOX_CRYPTO_HAS_EVP
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

#if INOX_CRYPTO_HAS_EVP
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

static char inox_crypto_hex_digit(uint8_t value) {
  return (char)(value < 10 ? ('0' + value) : ('a' + (value - 10)));
}
