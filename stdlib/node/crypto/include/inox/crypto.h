#ifndef INOX_CRYPTO_H
#define INOX_CRYPTO_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus

struct inox_crypto_hash;
struct inox_crypto_hmac;

#include "inox/array.h"
#include "inox/binary.h"
#include "inox/string.h"
#include "inox/string_view.h"

class crypto {
public:
  ArrayClass getHashes() const;
  Uint8Array getRandomValues(inox_value value) const;
  Buffer randomBytes(inox_number size) const;
  Uint8Array randomFillSync(inox_value value, inox_number offset, inox_number size, bool has_size) const;
  inox_number randomInt(inox_number max) const;
  inox_number randomInt(inox_number min, inox_number max) const;
  inox::String randomUUID() const;
  Buffer hash(inox::StringView algorithm, inox_value data) const;
  inox::String hashHex(inox::StringView algorithm, inox_value data) const;
  bool timingSafeEqual(inox_value left, inox_value right) const;
};

extern crypto crypto;

inox_status inox_crypto_hash_create(
  inox_allocator* allocator,
  const char* algorithm,
  size_t algorithm_len,
  inox_crypto_hash** out
);
inox_status inox_crypto_hash_update(inox_crypto_hash* hash, inox_value data);
inox_status inox_crypto_hash_digest_bytes(inox_allocator* allocator, inox_crypto_hash* hash, inox_value* out);
inox_status inox_crypto_hash_digest_hex(inox_allocator* allocator, inox_crypto_hash* hash, inox_value* out);
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

#endif

#endif
