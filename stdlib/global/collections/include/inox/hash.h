#ifndef INOX_HASH_H
#define INOX_HASH_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/value.h"

#ifdef __cplusplus
namespace inox {

uint64_t hash_mix(uint64_t hash, const void* bytes, size_t len);
bool hash_value(inox_value value, uint64_t& out);
bool value_equal(inox_value left, inox_value right);

} // namespace inox
#endif

#endif
