#include "ccjs/crypto.h"

#include <stdint.h>
#include <stdio.h>
#include "ccjs/binary.h"
#include "ccjs/string.h"

#if defined(CCJS_TLS_BACKEND_BORINGSSL) || defined(CCJS_TLS_BACKEND_OPENSSL)
#include <openssl/evp.h>
#define CCJS_CRYPTO_HASH_HAS_EVP 1
#else
#define CCJS_CRYPTO_HASH_HAS_EVP 0
#endif

#if defined(CCJS_LOOP_BACKEND_LIBUV)
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

static ccjs_status ccjs_crypto_random_bytes_raw(uint8_t* out, size_t len);
static int ccjs_crypto_number_to_size(ccjs_number value, size_t* out);
static int ccjs_crypto_number_is_integer(ccjs_number value);
static int ccjs_crypto_hash_algorithm_is_sha256(const char* algorithm, size_t algorithm_len);
static ccjs_status ccjs_crypto_hash_data(ccjs_value data, const uint8_t** bytes, size_t* len);
static ccjs_status ccjs_crypto_hash_digest_raw(ccjs_crypto_hash* hash, uint8_t* digest, size_t* len);
static char ccjs_crypto_hex_digit(uint8_t value);

struct ccjs_crypto_hash {
  ccjs_allocator* allocator;
#if CCJS_CRYPTO_HASH_HAS_EVP
  EVP_MD_CTX* ctx;
#endif
  int finalized;
};

ccjs_status ccjs_crypto_get_random_values(ccjs_value value) {
  if (value.tag != CCJS_TAG_BYTES || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;

  return ccjs_crypto_random_bytes_raw(bytes->bytes, bytes->len);
}

ccjs_status ccjs_crypto_random_bytes(ccjs_allocator* allocator, ccjs_number size, ccjs_value* out) {
  size_t len = 0;

  if (allocator == 0 || out == 0 || !ccjs_crypto_number_to_size(size, &len)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_status status = ccjs_bytes_new(allocator, len, out);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_crypto_get_random_values(*out);

  if (status != CCJS_OK) {
    ccjs_release(*out);
    *out = ccjs_undefined_value();
  }

  return status;
}

ccjs_status ccjs_crypto_random_fill(ccjs_value value, ccjs_number offset_value, ccjs_number size_value, int has_size) {
  size_t offset = 0;
  size_t size = 0;

  if (value.tag != CCJS_TAG_BYTES || value.as.ref == 0 || !ccjs_crypto_number_to_size(offset_value, &offset)) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;

  if (offset > bytes->len) {
    return CCJS_ERR_FIELD;
  }

  if (has_size) {
    if (!ccjs_crypto_number_to_size(size_value, &size)) {
      return CCJS_ERR_TYPE;
    }
  } else {
    size = bytes->len - offset;
  }

  if (size > bytes->len - offset) {
    return CCJS_ERR_FIELD;
  }

  return ccjs_crypto_random_bytes_raw(bytes->bytes + offset, size);
}

ccjs_status ccjs_crypto_random_int(ccjs_number min, ccjs_number max, ccjs_number* out) {
  if (out == 0 || !ccjs_crypto_number_is_integer(min) || !ccjs_crypto_number_is_integer(max) || !(max > min)) {
    return CCJS_ERR_TYPE;
  }

  const ccjs_number range_double = max - min;

  if (range_double <= 0 || range_double > 281474976710656.0) {
    return CCJS_ERR_TYPE;
  }

  const uint64_t range = (uint64_t)range_double;

  if (range == 0 || (ccjs_number)range != range_double) {
    return CCJS_ERR_TYPE;
  }

  const uint64_t threshold = (UINT64_C(0) - range) % range;
  uint64_t sample = 0;

  do {
    ccjs_status status = ccjs_crypto_random_bytes_raw((uint8_t*)&sample, sizeof(sample));

    if (status != CCJS_OK) {
      return status;
    }
  } while (sample < threshold);

  *out = min + (ccjs_number)(sample % range);

  return CCJS_OK;
}

ccjs_status ccjs_crypto_random_uuid(ccjs_allocator* allocator, ccjs_value* out) {
  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  uint8_t bytes[16];
  ccjs_status status = ccjs_crypto_random_bytes_raw(bytes, sizeof(bytes));

  if (status != CCJS_OK) {
    *out = ccjs_undefined_value();
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

    uuid[index] = ccjs_crypto_hex_digit((uint8_t)(bytes[byte_index] >> 4));
    uuid[index + 1] = ccjs_crypto_hex_digit((uint8_t)(bytes[byte_index] & 0x0fu));
    index += 2;
  }

  return ccjs_string_from_literal(allocator, uuid, sizeof(uuid), out);
}

ccjs_status ccjs_crypto_hash_create(
  ccjs_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  ccjs_crypto_hash** out
) {
  if (allocator == 0 || allocator->alloc == 0 || allocator->free == 0 || algorithm == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (!ccjs_crypto_hash_algorithm_is_sha256(algorithm, algorithm_len)) {
    return CCJS_ERR_UNSUPPORTED;
  }

#if CCJS_CRYPTO_HASH_HAS_EVP
  ccjs_crypto_hash* hash = allocator->alloc(allocator->user, sizeof(ccjs_crypto_hash), _Alignof(ccjs_crypto_hash));

  if (hash == 0) {
    return CCJS_ERR_OOM;
  }

  hash->allocator = allocator;
  hash->ctx = EVP_MD_CTX_new();
  hash->finalized = 0;

  if (hash->ctx == 0) {
    allocator->free(allocator->user, hash, sizeof(ccjs_crypto_hash), _Alignof(ccjs_crypto_hash));
    return CCJS_ERR_OOM;
  }

  if (EVP_DigestInit_ex(hash->ctx, EVP_sha256(), 0) != 1) {
    ccjs_crypto_hash_free(hash);
    return CCJS_ERR_UNSUPPORTED;
  }

  *out = hash;

  return CCJS_OK;
#else
  (void)allocator;

  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_crypto_hash_update(ccjs_crypto_hash* hash, ccjs_value data) {
  if (hash == 0 || hash->finalized) {
    return CCJS_ERR_FIELD;
  }

#if CCJS_CRYPTO_HASH_HAS_EVP
  const uint8_t* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_crypto_hash_data(data, &bytes, &len);

  if (status != CCJS_OK) {
    return status;
  }

  return EVP_DigestUpdate(hash->ctx, bytes, len) == 1 ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
#else
  (void)data;

  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_crypto_hash_digest_bytes(ccjs_allocator* allocator, ccjs_crypto_hash* hash, ccjs_value* out) {
  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

#if CCJS_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  size_t len = 0;
  ccjs_status status = ccjs_crypto_hash_digest_raw(hash, digest, &len);

  if (status != CCJS_OK) {
    return status;
  }

  return ccjs_bytes_from_data(allocator, digest, len, out);
#else
  (void)hash;

  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_crypto_hash_digest_hex(ccjs_allocator* allocator, ccjs_crypto_hash* hash, ccjs_value* out) {
  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

#if CCJS_CRYPTO_HASH_HAS_EVP
  uint8_t digest[EVP_MAX_MD_SIZE];
  char hex[EVP_MAX_MD_SIZE * 2];
  size_t len = 0;
  ccjs_status status = ccjs_crypto_hash_digest_raw(hash, digest, &len);

  if (status != CCJS_OK) {
    return status;
  }

  for (size_t index = 0; index < len; index += 1) {
    hex[index * 2] = ccjs_crypto_hex_digit((uint8_t)(digest[index] >> 4));
    hex[index * 2 + 1] = ccjs_crypto_hex_digit((uint8_t)(digest[index] & 0x0fu));
  }

  return ccjs_string_from_literal(allocator, hex, len * 2, out);
#else
  (void)hash;

  return CCJS_ERR_UNSUPPORTED;
#endif
}

void ccjs_crypto_hash_free(ccjs_crypto_hash* hash) {
  if (hash == 0) {
    return;
  }

#if CCJS_CRYPTO_HASH_HAS_EVP
  if (hash->ctx != 0) {
    EVP_MD_CTX_free(hash->ctx);
  }
#endif

  if (hash->allocator != 0 && hash->allocator->free != 0) {
    hash->allocator->free(hash->allocator->user, hash, sizeof(ccjs_crypto_hash), _Alignof(ccjs_crypto_hash));
  }
}

static ccjs_status ccjs_crypto_random_bytes_raw(uint8_t* out, size_t len) {
  if (out == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (len == 0) {
    return CCJS_OK;
  }

#if defined(CCJS_LOOP_BACKEND_LIBUV)
  return uv_random(0, 0, out, len, 0, 0) == 0 ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
#elif defined(_WIN32)
  return BCryptGenRandom(0, out, (ULONG)len, BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0 ? CCJS_OK : CCJS_ERR_UNSUPPORTED;
#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
  arc4random_buf(out, len);

  return CCJS_OK;
#else
  int fd = open("/dev/urandom", O_RDONLY);

  if (fd < 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  size_t filled = 0;

  while (filled < len) {
    ssize_t read_count = read(fd, out + filled, len - filled);

    if (read_count <= 0) {
      close(fd);
      return CCJS_ERR_UNSUPPORTED;
    }

    filled += (size_t)read_count;
  }

  close(fd);

  return CCJS_OK;
#endif
}

static int ccjs_crypto_number_to_size(ccjs_number value, size_t* out) {
  if (out == 0 || !ccjs_crypto_number_is_integer(value) || value < 0 || value > (ccjs_number)SIZE_MAX) {
    return 0;
  }

  size_t converted = (size_t)value;

  if ((ccjs_number)converted != value) {
    return 0;
  }

  *out = converted;

  return 1;
}

static int ccjs_crypto_number_is_integer(ccjs_number value) {
  if (value != value || value < -9007199254740991.0 || value > 9007199254740991.0) {
    return 0;
  }

  int64_t converted = (int64_t)value;

  return (ccjs_number)converted == value;
}

static int ccjs_crypto_hash_algorithm_is_sha256(const char* algorithm, size_t algorithm_len) {
  return algorithm_len == 6 &&
         algorithm[0] == 's' &&
         algorithm[1] == 'h' &&
         algorithm[2] == 'a' &&
         algorithm[3] == '2' &&
         algorithm[4] == '5' &&
         algorithm[5] == '6';
}

static ccjs_status ccjs_crypto_hash_data(ccjs_value data, const uint8_t** bytes, size_t* len) {
  if (bytes == 0 || len == 0) {
    return CCJS_ERR_TYPE;
  }

  if (data.tag == CCJS_TAG_STRING) {
    if (data.as.ref == 0) {
      return CCJS_ERR_TYPE;
    }

    ccjs_string* string = (ccjs_string*)data.as.ref;

    *bytes = (const uint8_t*)string->bytes;
    *len = string->len;

    return CCJS_OK;
  }

  if (data.tag == CCJS_TAG_BYTES) {
    if (data.as.ref == 0) {
      return CCJS_ERR_TYPE;
    }

    ccjs_bytes* buffer = (ccjs_bytes*)data.as.ref;

    *bytes = buffer->bytes;
    *len = buffer->len;

    return CCJS_OK;
  }

  return CCJS_ERR_TYPE;
}

static ccjs_status ccjs_crypto_hash_digest_raw(ccjs_crypto_hash* hash, uint8_t* digest, size_t* len) {
  if (hash == 0 || hash->finalized || digest == 0 || len == 0) {
    return CCJS_ERR_FIELD;
  }

#if CCJS_CRYPTO_HASH_HAS_EVP
  unsigned int digest_len = 0;

  if (EVP_DigestFinal_ex(hash->ctx, digest, &digest_len) != 1) {
    return CCJS_ERR_UNSUPPORTED;
  }

  hash->finalized = 1;

  if (hash->ctx != 0) {
    EVP_MD_CTX_free(hash->ctx);
    hash->ctx = 0;
  }

  *len = (size_t)digest_len;

  return CCJS_OK;
#else
  (void)hash;
  (void)digest;
  (void)len;

  return CCJS_ERR_UNSUPPORTED;
#endif
}

static char ccjs_crypto_hex_digit(uint8_t value) {
  return (char)(value < 10 ? ('0' + value) : ('a' + (value - 10)));
}
