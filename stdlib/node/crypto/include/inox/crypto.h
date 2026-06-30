#ifndef INOX_CRYPTO_H
#define INOX_CRYPTO_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_crypto_hash inox_crypto_hash;
typedef struct inox_crypto_hmac inox_crypto_hmac;

inox_status inox_crypto_get_hashes(inox_allocator* allocator, inox_value* out);
inox_status inox_crypto_get_random_values(inox_value value);
inox_status inox_crypto_random_bytes(inox_allocator* allocator, inox_number size, inox_value* out);
inox_status inox_crypto_random_fill(inox_value value, inox_number offset, inox_number size, int has_size);
inox_status inox_crypto_random_int(inox_number min, inox_number max, inox_number* out);
inox_status inox_crypto_random_uuid(inox_allocator* allocator, inox_value* out);
inox_status inox_crypto_hash_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_crypto_hash** out
);
inox_status inox_crypto_hash_update(inox_crypto_hash* hash, inox_value data);
inox_status inox_crypto_hash_digest_bytes(inox_allocator* allocator, inox_crypto_hash* hash, inox_value* out);
inox_status inox_crypto_hash_digest_hex(inox_allocator* allocator, inox_crypto_hash* hash, inox_value* out);
inox_status inox_crypto_hash_oneshot_bytes(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value data,
  inox_value* out
);
inox_status inox_crypto_hash_oneshot_hex(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value data,
  inox_value* out
);
void inox_crypto_hash_free(inox_crypto_hash* hash);
inox_status inox_crypto_hmac_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_value key,
  inox_crypto_hmac** out
);
inox_status inox_crypto_hmac_update(inox_crypto_hmac* hmac, inox_value data);
inox_status inox_crypto_hmac_digest_bytes(inox_allocator* allocator, inox_crypto_hmac* hmac, inox_value* out);
inox_status inox_crypto_hmac_digest_hex(inox_allocator* allocator, inox_crypto_hmac* hmac, inox_value* out);
void inox_crypto_hmac_free(inox_crypto_hmac* hmac);
inox_status inox_crypto_timing_safe_equal(inox_value left, inox_value right, int* out);

#ifdef __cplusplus
}
#endif

#endif
