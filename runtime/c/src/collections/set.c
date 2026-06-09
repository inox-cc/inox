#include <string.h>
#include "ccjs/set.h"
#include "ccjs/string.h"

static bool ccjs_set_value_equal(ccjs_value left, ccjs_value right) {
  if (left.tag != right.tag) {
    return false;
  }

  if (left.tag == CCJS_TAG_STRING) {
    if (left.as.ref == 0 || right.as.ref == 0) {
      return left.as.ref == right.as.ref;
    }

    ccjs_string* left_string = (ccjs_string*)left.as.ref;
    ccjs_string* right_string = (ccjs_string*)right.as.ref;

    return left_string->len == right_string->len
      && memcmp(left_string->bytes, right_string->bytes, left_string->len) == 0;
  }

  if (left.tag == CCJS_TAG_NUMBER) {
    return left.as.number == right.as.number;
  }

  if (left.tag == CCJS_TAG_BOOL) {
    return left.as.boolean == right.as.boolean;
  }

  if (left.tag == CCJS_TAG_NULL || left.tag == CCJS_TAG_UNDEFINED) {
    return true;
  }

  return left.as.ref == right.as.ref;
}

static ccjs_status ccjs_set_find(ccjs_set* set, ccjs_value value, size_t* index, bool* found) {
  if (set == 0 || index == 0 || found == 0) {
    return CCJS_ERR_TYPE;
  }

  for (size_t current = 0; current < set->len; current += 1) {
    if (ccjs_set_value_equal(set->items[current], value)) {
      *index = current;
      *found = true;
      return CCJS_OK;
    }
  }

  *index = set->len;
  *found = false;

  return CCJS_OK;
}

static ccjs_status ccjs_set_reserve(ccjs_set* set, size_t min_cap) {
  if (set == 0 || set->header.allocator == 0 || set->header.allocator->realloc == 0) {
    return CCJS_ERR_TYPE;
  }

  if (set->cap >= min_cap) {
    return CCJS_OK;
  }

  size_t next_cap = set->cap == 0 ? 4 : set->cap * 2;

  while (next_cap < min_cap) {
    next_cap *= 2;
  }

  ccjs_allocator* allocator = set->header.allocator;
  ccjs_value* items = allocator->realloc(
    allocator->user,
    set->items,
    sizeof(ccjs_value) * set->cap,
    sizeof(ccjs_value) * next_cap,
    _Alignof(ccjs_value)
  );

  if (items == 0) {
    return CCJS_ERR_OOM;
  }

  for (size_t index = set->cap; index < next_cap; index += 1) {
    items[index] = ccjs_undefined_value();
  }

  set->items = items;
  set->cap = next_cap;

  return CCJS_OK;
}

ccjs_status ccjs_set_add(ccjs_value set, ccjs_value value) {
  if (set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  size_t index = 0;
  bool found = false;
  ccjs_status status = ccjs_set_find(instance, value, &index, &found);

  if (status != CCJS_OK || found) {
    return status;
  }

  status = ccjs_set_reserve(instance, instance->len + 1);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_retain(value);
  instance->items[instance->len] = value;
  instance->len += 1;

  return CCJS_OK;
}

ccjs_status ccjs_set_clear(ccjs_value set) {
  if (set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;

  for (size_t index = 0; index < instance->len; index += 1) {
    ccjs_release(instance->items[index]);
    instance->items[index] = ccjs_undefined_value();
  }

  instance->len = 0;

  return CCJS_OK;
}

ccjs_status ccjs_set_delete(ccjs_value set, ccjs_value value, bool* out) {
  if (out == 0 || set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  size_t index = 0;
  bool found = false;
  ccjs_status status = ccjs_set_find(instance, value, &index, &found);

  if (status != CCJS_OK) {
    return status;
  }

  if (!found) {
    *out = false;
    return CCJS_OK;
  }

  ccjs_release(instance->items[index]);
  size_t last = instance->len - 1;

  if (index != last) {
    instance->items[index] = instance->items[last];
  }

  instance->items[last] = ccjs_undefined_value();
  instance->len -= 1;
  *out = true;

  return CCJS_OK;
}

void ccjs_set_dispose(ccjs_set* set) {
  if (set == 0) {
    return;
  }

  for (size_t index = 0; index < set->len; index += 1) {
    ccjs_release(set->items[index]);
  }

  if (set->header.allocator != 0 && set->header.allocator->free != 0 && set->items != 0) {
    set->header.allocator->free(
      set->header.allocator->user,
      set->items,
      sizeof(ccjs_value) * set->cap,
      _Alignof(ccjs_value)
    );
  }
}

ccjs_status ccjs_set_has(ccjs_value set, ccjs_value value, bool* out) {
  if (out == 0 || set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  size_t index = 0;

  return ccjs_set_find(instance, value, &index, out);
}

ccjs_status ccjs_set_new(ccjs_allocator* allocator, ccjs_value* out) {
  if (allocator == 0 || allocator->alloc == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* set = allocator->alloc(allocator->user, sizeof(ccjs_set), _Alignof(ccjs_set));

  if (set == 0) {
    *out = ccjs_undefined_value();
    return CCJS_ERR_OOM;
  }

  set->header.kind = CCJS_REF_SET;
  set->header.ref_count = 1;
  set->header.flags = 0;
  set->header.size = sizeof(ccjs_set);
  set->header.align = _Alignof(ccjs_set);
  set->header.allocator = allocator;
  set->len = 0;
  set->cap = 0;
  set->items = 0;

  out->tag = CCJS_TAG_SET;
  out->as.ref = &set->header;

  return CCJS_OK;
}

ccjs_status ccjs_set_size(ccjs_value set, size_t* out) {
  if (out == 0 || set.tag != CCJS_TAG_SET || set.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_set* instance = (ccjs_set*)set.as.ref;
  *out = instance->len;

  return CCJS_OK;
}
