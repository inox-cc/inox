#ifndef CCJS_SET_H
#define CCJS_SET_H

#include <stdbool.h>
#include <stddef.h>
#include "ccjs/allocator.h"
#include "ccjs/value.h"

typedef struct ccjs_set {
  ccjs_ref header;
  size_t len;
  size_t cap;
  ccjs_value* items;
} ccjs_set;

ccjs_status ccjs_set_add(ccjs_value set, ccjs_value value);
ccjs_status ccjs_set_clear(ccjs_value set);
ccjs_status ccjs_set_delete(ccjs_value set, ccjs_value value, bool* out);
void ccjs_set_dispose(ccjs_set* set);
ccjs_status ccjs_set_has(ccjs_value set, ccjs_value value, bool* out);
ccjs_status ccjs_set_new(ccjs_allocator* allocator, ccjs_value* out);
ccjs_status ccjs_set_size(ccjs_value set, size_t* out);

#endif
