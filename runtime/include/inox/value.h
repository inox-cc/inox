#ifndef INOX_VALUE_H
#define INOX_VALUE_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "inox/allocator.h"

typedef double inox_number;

typedef enum inox_status {
  INOX_OK,
  INOX_ERR_OOM,
  INOX_ERR_TYPE,
  INOX_ERR_THROW,
  INOX_ERR_FIELD,
  INOX_ERR_READONLY,
  INOX_ERR_UNSUPPORTED
} inox_status;

typedef enum inox_tag {
  INOX_TAG_UNDEFINED,
  INOX_TAG_NULL,
  INOX_TAG_BOOL,
  INOX_TAG_NUMBER,
  INOX_TAG_STRING,
  INOX_TAG_OBJECT,
  INOX_TAG_ARRAY,
  INOX_TAG_BYTES,
  INOX_TAG_FUNCTION,
  INOX_TAG_MAP,
  INOX_TAG_SET,
  INOX_TAG_CLASS_INSTANCE
} inox_tag;

typedef enum inox_ref_kind {
  INOX_REF_STRING,
  INOX_REF_OBJECT,
  INOX_REF_ARRAY,
  INOX_REF_BYTES,
  INOX_REF_FUNCTION,
  INOX_REF_MAP,
  INOX_REF_SET,
  INOX_REF_CLASS_INSTANCE,
  INOX_REF_KIND_COUNT
} inox_ref_kind;

typedef struct inox_ref inox_ref;
typedef struct inox_weak_cell inox_weak_cell;
typedef void (*inox_ref_dispose_fn)(inox_ref* ref);

struct inox_ref {
  inox_ref_kind kind;
  uint32_t ref_count;
  uint32_t flags;
  size_t size;
  size_t align;
  inox_allocator* allocator;
  inox_ref_dispose_fn dispose;
#ifdef INOX_ENABLE_WEAK
  inox_weak_cell* weak_cell;
#endif
};

typedef struct inox_value {
  inox_tag tag;
  union {
    bool boolean;
    inox_number number;
    inox_ref* ref;
  } as;
} inox_value;

static inline inox_value inox_undefined_value(void) {
  inox_value value = { INOX_TAG_UNDEFINED };

  return value;
}

static inline inox_value inox_null_value(void) {
  inox_value value = { INOX_TAG_NULL };

  return value;
}

static inline inox_value inox_bool_value(bool boolean) {
  inox_value value = { INOX_TAG_BOOL };
  value.as.boolean = boolean;

  return value;
}

static inline inox_value inox_number_value(inox_number number) {
  inox_value value = { INOX_TAG_NUMBER };
  value.as.number = number;

  return value;
}

static inline bool inox_is_ref_value(inox_value value) {
  return value.tag == INOX_TAG_STRING || value.tag == INOX_TAG_OBJECT || value.tag == INOX_TAG_ARRAY ||
         value.tag == INOX_TAG_BYTES || value.tag == INOX_TAG_FUNCTION || value.tag == INOX_TAG_MAP ||
         value.tag == INOX_TAG_SET || value.tag == INOX_TAG_CLASS_INSTANCE;
}

bool inox_value_truthy(inox_value value);

static inline void inox_ref_init_weak(inox_ref* ref) {
#ifdef INOX_ENABLE_WEAK
  if (ref != 0) {
    ref->weak_cell = 0;
  }
#else
  (void)ref;
#endif
}

void inox_retain(inox_value value);
void inox_release(inox_value value);

#ifdef __cplusplus
}
#endif

#endif
