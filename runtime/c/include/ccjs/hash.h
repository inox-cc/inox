#ifndef CCJS_HASH_H
#define CCJS_HASH_H

#include <stdint.h>
#include <string.h>
#include "ccjs/string.h"
#include "ccjs/value.h"

static inline uint64_t ccjs_hash_mix(uint64_t hash, const void* bytes, size_t len) {
  const unsigned char* data = (const unsigned char*)bytes;

  for (size_t index = 0; index < len; index += 1) {
    hash ^= data[index];
    hash *= 1099511628211ULL;
  }

  return hash;
}

static inline ccjs_status ccjs_hash_value(ccjs_value value, uint64_t* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  uint64_t hash = 1469598103934665603ULL;
  uint8_t tag = (uint8_t)value.tag;

  hash = ccjs_hash_mix(hash, &tag, sizeof(tag));

  if (value.tag == CCJS_TAG_STRING) {
    if (value.as.ref == 0) {
      return CCJS_ERR_TYPE;
    }

    ccjs_string* string = (ccjs_string*)value.as.ref;
    *out = ccjs_hash_mix(hash, string->bytes, string->len);
    return CCJS_OK;
  }

  if (value.tag == CCJS_TAG_NUMBER) {
    double number = value.as.number;

    if (number != number) {
      uint64_t nan_bits = 0x7ff8000000000000ULL;
      *out = ccjs_hash_mix(hash, &nan_bits, sizeof(nan_bits));
      return CCJS_OK;
    }

    if (number == 0) {
      number = 0;
    }

    uint64_t bits = 0;
    memcpy(&bits, &number, sizeof(bits));
    *out = ccjs_hash_mix(hash, &bits, sizeof(bits));
    return CCJS_OK;
  }

  if (value.tag == CCJS_TAG_BOOL) {
    uint8_t boolean = value.as.boolean ? 1 : 0;
    *out = ccjs_hash_mix(hash, &boolean, sizeof(boolean));
    return CCJS_OK;
  }

  if (ccjs_is_ref_value(value)) {
    if (value.as.ref == 0) {
      return CCJS_ERR_TYPE;
    }

    uintptr_t ref = (uintptr_t)value.as.ref;
    *out = ccjs_hash_mix(hash, &ref, sizeof(ref));
    return CCJS_OK;
  }

  if (value.tag == CCJS_TAG_NULL || value.tag == CCJS_TAG_UNDEFINED) {
    *out = hash;
    return CCJS_OK;
  }

  return CCJS_ERR_TYPE;
}

static inline bool ccjs_hash_value_equal(ccjs_value left, ccjs_value right) {
  if (left.tag != right.tag) {
    return false;
  }

  if (left.tag == CCJS_TAG_STRING) {
    if (left.as.ref == 0 || right.as.ref == 0) {
      return left.as.ref == right.as.ref;
    }

    ccjs_string* left_string = (ccjs_string*)left.as.ref;
    ccjs_string* right_string = (ccjs_string*)right.as.ref;

    return left_string->len == right_string->len && memcmp(left_string->bytes, right_string->bytes, left_string->len) == 0;
  }

  if (left.tag == CCJS_TAG_NUMBER) {
    if (left.as.number != left.as.number && right.as.number != right.as.number) {
      return true;
    }

    return left.as.number == right.as.number;
  }

  if (left.tag == CCJS_TAG_BOOL) {
    return left.as.boolean == right.as.boolean;
  }

  if (ccjs_is_ref_value(left)) {
    return left.as.ref == right.as.ref;
  }

  return left.tag == CCJS_TAG_NULL || left.tag == CCJS_TAG_UNDEFINED;
}

#endif
