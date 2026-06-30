#include "inox/allocator.h"

#include <stdlib.h>

void* inox_default_alloc(void* user, size_t size, size_t align) {
  (void)user;
  (void)align;
  return calloc(1, size);
}

void* inox_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

void inox_default_free(void* user, void* ptr, size_t size, size_t align) {
  (void)user;
  (void)size;
  (void)align;
  free(ptr);
}

inox_allocator inox_default_base_allocator = {
  0,
  inox_default_alloc,
  inox_default_realloc,
  inox_default_free
};

inox_allocator inox_default_allocator = {
  0,
  inox_default_alloc,
  inox_default_realloc,
  inox_default_free
};
