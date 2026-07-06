#include "inox/crypto.h"

#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "inox/array.h"
#include "inox/binary.h"
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
static int inox_crypto_hash_algorithm_is_sha256(const char* algorithm, size_t algorithm_len);
static inox_status inox_crypto_hash_data(inox_value data, const uint8_t** bytes, size_t* len);
static inox_status inox_crypto_hash_digest_raw(inox_crypto_hash* hash, uint8_t* digest, size_t* len);
static inox_status inox_crypto_hmac_digest_raw(inox_crypto_hmac* hmac, uint8_t* digest, size_t* len);
static inox_status inox_crypto_copy_bytes_result(Uint8Array bytes, inox_value* out);
static char inox_crypto_hex_digit(uint8_t value);

struct inox_crypto_hash {
  inox_allocator* allocator;
#if INOX_CRYPTO_HASH_HAS_EVP
  EVP_MD_CTX* ctx;
#endif
  int finalized;
};

struct inox_crypto_hmac {
  inox_allocator* allocator;
#if INOX_CRYPTO_HASH_HAS_EVP
  HMAC_CTX* ctx;
#endif
  int finalized;
};

inox_status inox_crypto_get_hashes(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

#if INOX_CRYPTO_HASH_HAS_EVP
  inox_value hashes = inox_undefined_value();
  inox_value sha256 = inox_undefined_value();
  inox_status status = Array.make(allocator, 1, &hashes);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_string_from_literal(allocator, "sha256", 6, &sha256);

  if (status == INOX_OK) {
    status = Array.set(hashes, 0, sha256);
  }

  inox_release(sha256);

  if (status != INOX_OK) {
    inox_release(hashes);
    return status;
  }

  *out = hashes;

  return INOX_OK;
#else
  (void)allocator;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_get_random_values(inox_value value) {
  if (value.tag != INOX_TAG_BYTES || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;

  return inox_crypto_random_bytes_raw(bytes->bytes, bytes->len);
}

inox_status inox_crypto_random_bytes(inox_allocator* allocator, inox_number size, inox_value* out) {
  size_t len = 0;

  if (allocator == 0 || out == 0 || !inox_crypto_number_to_size(size, &len)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_status status = inox_crypto_copy_bytes_result(Uint8Array::create(allocator, len), out);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_crypto_get_random_values(*out);

  if (status != INOX_OK) {
    inox_release(*out);
    *out = inox_undefined_value();
  }

  return status;
}

inox_status inox_crypto_random_fill(inox_value value, inox_number offset_value, inox_number size_value, int has_size) {
  size_t offset = 0;
  size_t size = 0;

  if (value.tag != INOX_TAG_BYTES || value.as.ref == 0 || !inox_crypto_number_to_size(offset_value, &offset)) {
    return INOX_ERR_TYPE;
  }

  inox_bytes* bytes = (inox_bytes*)value.as.ref;

  if (offset > bytes->len) {
    return INOX_ERR_FIELD;
  }

  if (has_size) {
    if (!inox_crypto_number_to_size(size_value, &size)) {
      return INOX_ERR_TYPE;
    }
  } else {
    size = bytes->len - offset;
  }

  if (size > bytes->len - offset) {
    return INOX_ERR_FIELD;
  }

  return inox_crypto_random_bytes_raw(bytes->bytes + offset, size);
}

inox_status inox_crypto_random_int(inox_number min, inox_number max, inox_number* out) {
  if (out == 0 || !inox_crypto_number_is_integer(min) || !inox_crypto_number_is_integer(max) || !(max > min)) {
    return INOX_ERR_TYPE;
  }

  const inox_number range_double = max - min;

  if (range_double <= 0 || range_double > 281474976710656.0) {
    return INOX_ERR_TYPE;
  }

  const uint64_t range = (uint64_t)range_double;

  if (range == 0 || (inox_number)range != range_double) {
    return INOX_ERR_TYPE;
  }

  const uint64_t threshold = (UINT64_C(0) - range) % range;
  uint64_t sample = 0;

  do {
    inox_status status = inox_crypto_random_bytes_raw((uint8_t*)&sample, sizeof(sample));

    if (status != INOX_OK) {
      return status;
    }
  } while (sample < threshold);

  *out = min + (inox_number)(sample % range);

  return INOX_OK;
}

inox_status inox_crypto_random_uuid(inox_allocator* allocator, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  uint8_t bytes[16];
  inox_status status = inox_crypto_random_bytes_raw(bytes, sizeof(bytes));

  if (status != INOX_OK) {
    *out = inox_undefined_value();
    return status;
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

  return inox_string_from_literal(allocator, uuid, sizeof(uuid), out);
}

inox_status inox_crypto_hash_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_crypto_hash** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || algorithm == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (!inox_crypto_hash_algorithm_is_sha256(algorithm, algorithm_len)) {
    return INOX_ERR_UNSUPPORTED;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  inox_crypto_hash* hash = (inox_crypto_hash*)allocator->alloc(allocator->user, sizeof(inox_crypto_hash), alignof(inox_crypto_hash));

  if (hash == 0) {
    return INOX_ERR_OOM;
  }

  hash->allocator = allocator;
  hash->ctx = EVP_MD_CTX_new();
  hash->finalized = 0;

  if (hash->ctx == 0) {
    allocator->free(allocator->user, hash, sizeof(inox_crypto_hash), alignof(inox_crypto_hash));
    return INOX_ERR_OOM;
  }

  if (EVP_DigestInit_ex(hash->ctx, EVP_sha256(), 0) != 1) {
    inox_crypto_hash_free(hash);
    return INOX_ERR_UNSUPPORTED;
  }

  *out = hash;

  return INOX_OK;
#else
  (void)allocator;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hash_update(inox_crypto_hash* hash, inox_value data) {
  if (hash == 0 || hash->finalized) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  const uint8_t* bytes = 0;
  size_t len = 0;
  inox_status status = inox_crypto_hash_data(data, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  return EVP_DigestUpdate(hash->ctx, bytes, len) == 1 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#else
  (void)data;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hash_digest_bytes(inox_allocator* allocator, inox_crypto_hash* hash, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  size_t len = 0;
  inox_status status = inox_crypto_hash_digest_raw(hash, digest, &len);

  if (status != INOX_OK) {
    return status;
  }

  return inox_crypto_copy_bytes_result(Uint8Array::from(allocator, digest, len), out);
#else
  (void)hash;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hash_digest_hex(inox_allocator* allocator, inox_crypto_hash* hash, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  char hex[EVP_MAX_MD_SIZE * 2];
  size_t len = 0;
  inox_status status = inox_crypto_hash_digest_raw(hash, digest, &len);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < len; index += 1) {
    hex[index * 2] = inox_crypto_hex_digit((uint8_t)(digest[index] >> 4));
    hex[index * 2 + 1] = inox_crypto_hex_digit((uint8_t)(digest[index] & 0x0fu));
  }

  return inox_string_from_literal(allocator, hex, len * 2, out);
#else
  (void)hash;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hash_oneshot_bytes(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value data,
  inox_value* out
) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_crypto_hash* hash = 0;
  inox_status status = inox_crypto_hash_create(allocator, algorithm, algorithm_len, &hash);

  if (status == INOX_OK) {
    status = inox_crypto_hash_update(hash, data);
  }

  if (status == INOX_OK) {
    status = inox_crypto_hash_digest_bytes(allocator, hash, out);
  }

  inox_crypto_hash_free(hash);

  return status;
}

inox_status inox_crypto_hash_oneshot_hex(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value data,
  inox_value* out
) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_crypto_hash* hash = 0;
  inox_status status = inox_crypto_hash_create(allocator, algorithm, algorithm_len, &hash);

  if (status == INOX_OK) {
    status = inox_crypto_hash_update(hash, data);
  }

  if (status == INOX_OK) {
    status = inox_crypto_hash_digest_hex(allocator, hash, out);
  }

  inox_crypto_hash_free(hash);

  return status;
}

void inox_crypto_hash_free(inox_crypto_hash* hash) {
  if (hash == 0) {
    return;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  if (hash->ctx != 0) {
    EVP_MD_CTX_free(hash->ctx);
  }
#endif

  if (hash->allocator != 0 && hash->allocator->free != 0) {
    hash->allocator->free(hash->allocator->user, hash, sizeof(inox_crypto_hash), alignof(inox_crypto_hash));
  }
}

inox_status inox_crypto_hmac_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value key,
  inox_crypto_hmac** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || algorithm == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (!inox_crypto_hash_algorithm_is_sha256(algorithm, algorithm_len)) {
    return INOX_ERR_UNSUPPORTED;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  const uint8_t* key_bytes = 0;
  size_t key_len = 0;
  inox_status status = inox_crypto_hash_data(key, &key_bytes, &key_len);

  if (status != INOX_OK) {
    return status;
  }

  if (key_len > (size_t)INT_MAX) {
    return INOX_ERR_TYPE;
  }

  inox_crypto_hmac* hmac = (inox_crypto_hmac*)allocator->alloc(allocator->user, sizeof(inox_crypto_hmac), alignof(inox_crypto_hmac));

  if (hmac == 0) {
    return INOX_ERR_OOM;
  }

  hmac->allocator = allocator;
  hmac->ctx = HMAC_CTX_new();
  hmac->finalized = 0;

  if (hmac->ctx == 0) {
    allocator->free(allocator->user, hmac, sizeof(inox_crypto_hmac), alignof(inox_crypto_hmac));
    return INOX_ERR_OOM;
  }

  if (HMAC_Init_ex(hmac->ctx, key_bytes, (int)key_len, EVP_sha256(), 0) != 1) {
    inox_crypto_hmac_free(hmac);
    return INOX_ERR_UNSUPPORTED;
  }

  *out = hmac;

  return INOX_OK;
#else
  (void)allocator;
  (void)key;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hmac_update(inox_crypto_hmac* hmac, inox_value data) {
  if (hmac == 0 || hmac->finalized) {
    return INOX_ERR_FIELD;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  const uint8_t* bytes = 0;
  size_t len = 0;
  inox_status status = inox_crypto_hash_data(data, &bytes, &len);

  if (status != INOX_OK) {
    return status;
  }

  return HMAC_Update(hmac->ctx, bytes, len) == 1 ? INOX_OK : INOX_ERR_UNSUPPORTED;
#else
  (void)data;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hmac_digest_bytes(inox_allocator* allocator, inox_crypto_hmac* hmac, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  size_t len = 0;
  inox_status status = inox_crypto_hmac_digest_raw(hmac, digest, &len);

  if (status != INOX_OK) {
    return status;
  }

  return inox_crypto_copy_bytes_result(Uint8Array::from(allocator, digest, len), out);
#else
  (void)hmac;

  return INOX_ERR_UNSUPPORTED;
#endif
}

inox_status inox_crypto_hmac_digest_hex(inox_allocator* allocator, inox_crypto_hmac* hmac, inox_value* out) {
  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

#if INOX_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  char hex[EVP_MAX_MD_SIZE * 2];
  size_t len = 0;
  inox_status status = inox_crypto_hmac_digest_raw(hmac, digest, &len);

  if (status != INOX_OK) {
    return status;
  }

  for (size_t index = 0; index < len; index += 1) {
    hex[index * 2] = inox_crypto_hex_digit((uint8_t)(digest[index] >> 4));
    hex[index * 2 + 1] = inox_crypto_hex_digit((uint8_t)(digest[index] & 0x0fu));
  }

  return inox_string_from_literal(allocator, hex, len * 2, out);
#else
  (void)hmac;

  return INOX_ERR_UNSUPPORTED;
#endif
}

void inox_crypto_hmac_free(inox_crypto_hmac* hmac) {
  if (hmac == 0) {
    return;
  }

#if INOX_CRYPTO_HASH_HAS_EVP
  if (hmac->ctx != 0) {
    HMAC_CTX_free(hmac->ctx);
  }
#endif

  if (hmac->allocator != 0 && hmac->allocator->free != 0) {
    hmac->allocator->free(hmac->allocator->user, hmac, sizeof(inox_crypto_hmac), alignof(inox_crypto_hmac));
  }
}

inox_status inox_crypto_timing_safe_equal(inox_value left, inox_value right, int* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  const uint8_t* left_bytes = 0;
  const uint8_t* right_bytes = 0;
  size_t left_len = 0;
  size_t right_len = 0;
  inox_status status = inox_crypto_hash_data(left, &left_bytes, &left_len);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_crypto_hash_data(right, &right_bytes, &right_len);

  if (status != INOX_OK) {
    return status;
  }

  if (left_len != right_len) {
    return INOX_ERR_FIELD;
  }

  uint8_t diff = 0;

  for (size_t index = 0; index < left_len; index += 1) {
    diff = (uint8_t)(diff | (left_bytes[index] ^ right_bytes[index]));
  }

  *out = diff == 0 ? 1 : 0;

  return INOX_OK;
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

static int inox_crypto_hash_algorithm_is_sha256(const char* algorithm, size_t algorithm_len) {
  return algorithm_len == 6 &&
         algorithm[0] == 's' &&
         algorithm[1] == 'h' &&
         algorithm[2] == 'a' &&
         algorithm[3] == '2' &&
         algorithm[4] == '5' &&
         algorithm[5] == '6';
}

static inox_status inox_crypto_hash_data(inox_value data, const uint8_t** bytes, size_t* len) {
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

    inox_bytes* buffer = (inox_bytes*)data.as.ref;

    *bytes = buffer->bytes;
    *len = buffer->len;

    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

static inox_status inox_crypto_hash_digest_raw(inox_crypto_hash* hash, uint8_t* digest, size_t* len) {
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

static inox_status inox_crypto_hmac_digest_raw(inox_crypto_hmac* hmac, uint8_t* digest, size_t* len) {
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

static inox_status inox_crypto_copy_bytes_result(Uint8Array bytes, inox_value* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  if (inox::thrown()) {
    inox::take_exception();
    return INOX_ERR_TYPE;
  }

  if (!bytes.valid()) {
    return INOX_ERR_TYPE;
  }

  return bytes.copy_to(out);
}

static char inox_crypto_hex_digit(uint8_t value) {
  return (char)(value < 10 ? ('0' + value) : ('a' + (value - 10)));
}
