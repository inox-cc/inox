#ifndef CCJS_CRYPTO_H
#define CCJS_CRYPTO_H

#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_crypto_hash ccjs_crypto_hash;
typedef struct ccjs_crypto_hmac ccjs_crypto_hmac;

ccjs_status ccjs_crypto_get_hashes(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_crypto_get_random_values(ccjs_value value);
ccjs_status ccjs_crypto_random_bytes(ccjs_allocator* allocator, ccjs_number size, ccjs_value* out);
ccjs_status ccjs_crypto_random_fill(ccjs_value value, ccjs_number offset, ccjs_number size, int has_size);
ccjs_status ccjs_crypto_random_int(ccjs_number min, ccjs_number max, ccjs_number* out);
ccjs_status ccjs_crypto_random_uuid(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_crypto_hash_create(
  ccjs_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  ccjs_crypto_hash** out
);
ccjs_status ccjs_crypto_hash_update(ccjs_crypto_hash* hash, ccjs_value data);
ccjs_status ccjs_crypto_hash_digest_bytes(ccjs_allocator* allocator, ccjs_crypto_hash* hash, ccjs_value* out);
ccjs_status ccjs_crypto_hash_digest_hex(ccjs_allocator* allocator, ccjs_crypto_hash* hash, ccjs_value* out);
ccjs_status ccjs_crypto_hash_oneshot_bytes(
  ccjs_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  ccjs_value data,
  ccjs_value* out
);
ccjs_status ccjs_crypto_hash_oneshot_hex(
  ccjs_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  ccjs_value data,
  ccjs_value* out
);
void ccjs_crypto_hash_free(ccjs_crypto_hash* hash);
ccjs_status ccjs_crypto_hmac_create(
  ccjs_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  ccjs_value key,
  ccjs_crypto_hmac** out
);
ccjs_status ccjs_crypto_hmac_update(ccjs_crypto_hmac* hmac, ccjs_value data);
ccjs_status ccjs_crypto_hmac_digest_bytes(ccjs_allocator* allocator, ccjs_crypto_hmac* hmac, ccjs_value* out);
ccjs_status ccjs_crypto_hmac_digest_hex(ccjs_allocator* allocator, ccjs_crypto_hmac* hmac, ccjs_value* out);
void ccjs_crypto_hmac_free(ccjs_crypto_hmac* hmac);
ccjs_status ccjs_crypto_timing_safe_equal(ccjs_value left, ccjs_value right, int* out);

#endif
