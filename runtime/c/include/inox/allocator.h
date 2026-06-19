#ifndef INOX_ALLOCATOR_H
#define INOX_ALLOCATOR_H

#include <stddef.h>

typedef struct inox_allocator {
  void* user;
  void* (*alloc)(void* user, size_t size, size_t align);
  void* (*realloc)(void* user, void* ptr, size_t old_size, size_t new_size, size_t align);
  void (*free)(void* user, void* ptr, size_t size, size_t align);
} inox_allocator;

#endif
