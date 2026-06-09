#ifndef CCJS_VALUE_H
#define CCJS_VALUE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "ccjs/allocator.h"

typedef double ccjs_number;

typedef enum ccjs_status {
  CCJS_OK,
  CCJS_ERR_OOM,
  CCJS_ERR_TYPE,
  CCJS_ERR_FIELD,
  CCJS_ERR_READONLY
} ccjs_status;

typedef enum ccjs_tag {
  CCJS_TAG_UNDEFINED,
  CCJS_TAG_NULL,
  CCJS_TAG_BOOL,
  CCJS_TAG_NUMBER,
  CCJS_TAG_STRING,
  CCJS_TAG_OBJECT,
  CCJS_TAG_ARRAY,
  CCJS_TAG_FUNCTION,
  CCJS_TAG_MAP,
  CCJS_TAG_SET
} ccjs_tag;

typedef enum ccjs_ref_kind {
  CCJS_REF_STRING,
  CCJS_REF_OBJECT,
  CCJS_REF_ARRAY,
  CCJS_REF_FUNCTION,
  CCJS_REF_MAP,
  CCJS_REF_SET
} ccjs_ref_kind;

typedef struct ccjs_ref {
  ccjs_ref_kind kind;
  uint32_t ref_count;
  uint32_t flags;
  size_t size;
  size_t align;
  ccjs_allocator* allocator;
} ccjs_ref;

typedef struct ccjs_value {
  ccjs_tag tag;
  union {
    bool boolean;
    ccjs_number number;
    ccjs_ref* ref;
  } as;
} ccjs_value;

static inline ccjs_value ccjs_undefined_value(void) {
  ccjs_value value = {
    .tag = CCJS_TAG_UNDEFINED
  };

  return value;
}

static inline ccjs_value ccjs_null_value(void) {
  ccjs_value value = {
    .tag = CCJS_TAG_NULL
  };

  return value;
}

static inline ccjs_value ccjs_bool_value(bool boolean) {
  ccjs_value value = {
    .tag = CCJS_TAG_BOOL,
    .as.boolean = boolean
  };

  return value;
}

static inline ccjs_value ccjs_number_value(ccjs_number number) {
  ccjs_value value = {
    .tag = CCJS_TAG_NUMBER,
    .as.number = number
  };

  return value;
}

static inline bool ccjs_is_ref_value(ccjs_value value) {
  return value.tag == CCJS_TAG_STRING
    || value.tag == CCJS_TAG_OBJECT
    || value.tag == CCJS_TAG_ARRAY
    || value.tag == CCJS_TAG_FUNCTION
    || value.tag == CCJS_TAG_MAP
    || value.tag == CCJS_TAG_SET;
}

void ccjs_retain(ccjs_value value);
void ccjs_release(ccjs_value value);

#endif
