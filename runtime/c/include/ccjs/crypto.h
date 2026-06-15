#ifndef CCJS_CRYPTO_H
#define CCJS_CRYPTO_H

#include "ccjs/allocator.h"
#include "ccjs/value.h"

ccjs_status ccjs_crypto_get_random_values(ccjs_value value);
ccjs_status ccjs_crypto_random_bytes(ccjs_allocator* allocator, ccjs_number size, ccjs_value* out);
ccjs_status ccjs_crypto_random_fill(ccjs_value value, ccjs_number offset, ccjs_number size, int has_size);
ccjs_status ccjs_crypto_random_int(ccjs_number min, ccjs_number max, ccjs_number* out);
ccjs_status ccjs_crypto_random_uuid(ccjs_allocator* allocator, ccjs_value* out);

#endif
