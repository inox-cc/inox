#ifndef INOX_HASH_H
#define INOX_HASH_H

#include <stdint.h>
#include <string.h>
#include "inox/string.h"
#include "inox/value.h"

static inline uint64_t inox_hash_mix(uint64_t hash, const void* bytes, size_t len) {
  const unsigned char* data = (const unsigned char*)bytes;

  for (size_t index = 0; index < len; index += 1) {
    hash ^= data[index];
    hash *= 1099511628211ULL;
  }

  return hash;
}

static inline inox_status inox_hash_value(inox_value value, uint64_t* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  uint64_t hash = 1469598103934665603ULL;
  uint8_t tag = (uint8_t)value.tag;

  hash = inox_hash_mix(hash, &tag, sizeof(tag));

  if (value.tag == INOX_TAG_STRING) {
    if (value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    inox_string* string = (inox_string*)value.as.ref;
    *out = inox_hash_mix(hash, string->bytes, string->len);
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NUMBER) {
    double number = value.as.number;

    if (number != number) {
      uint64_t nan_bits = 0x7ff8000000000000ULL;
      *out = inox_hash_mix(hash, &nan_bits, sizeof(nan_bits));
      return INOX_OK;
    }

    if (number == 0) {
      number = 0;
    }

    uint64_t bits = 0;
    memcpy(&bits, &number, sizeof(bits));
    *out = inox_hash_mix(hash, &bits, sizeof(bits));
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_BOOL) {
    uint8_t boolean = value.as.boolean ? 1 : 0;
    *out = inox_hash_mix(hash, &boolean, sizeof(boolean));
    return INOX_OK;
  }

  if (inox_is_ref_value(value)) {
    if (value.as.ref == 0) {
      return INOX_ERR_TYPE;
    }

    uintptr_t ref = (uintptr_t)value.as.ref;
    *out = inox_hash_mix(hash, &ref, sizeof(ref));
    return INOX_OK;
  }

  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    *out = hash;
    return INOX_OK;
  }

  return INOX_ERR_TYPE;
}

static inline bool inox_hash_value_equal(inox_value left, inox_value right) {
  if (left.tag != right.tag) {
    return false;
  }

  if (left.tag == INOX_TAG_STRING) {
    if (left.as.ref == 0 || right.as.ref == 0) {
      return left.as.ref == right.as.ref;
    }

    inox_string* left_string = (inox_string*)left.as.ref;
    inox_string* right_string = (inox_string*)right.as.ref;

    return left_string->len == right_string->len && memcmp(left_string->bytes, right_string->bytes, left_string->len) == 0;
  }

  if (left.tag == INOX_TAG_NUMBER) {
    if (left.as.number != left.as.number && right.as.number != right.as.number) {
      return true;
    }

    return left.as.number == right.as.number;
  }

  if (left.tag == INOX_TAG_BOOL) {
    return left.as.boolean == right.as.boolean;
  }

  if (inox_is_ref_value(left)) {
    return left.as.ref == right.as.ref;
  }

  return left.tag == INOX_TAG_NULL || left.tag == INOX_TAG_UNDEFINED;
}

#endif
