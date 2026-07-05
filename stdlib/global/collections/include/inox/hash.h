#ifndef INOX_HASH_H
#define INOX_HASH_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

uint64_t inox_hash_mix(uint64_t hash, const void* bytes, size_t len);
inox_status inox_hash_value(inox_value value, uint64_t* out);
bool inox_hash_value_equal(inox_value left, inox_value right);

#ifdef __cplusplus
}
#endif

#endif
