#ifndef INOX_ALLOCATOR_H
#define INOX_ALLOCATOR_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

typedef struct inox_allocator {
  void* user;
  void* (*alloc)(void* user, size_t size, size_t align);
  void* (*realloc)(void* user, void* ptr, size_t old_size, size_t new_size, size_t align);
  void (*free)(void* user, void* ptr, size_t size, size_t align);
} inox_allocator;

void* inox_default_alloc(void* user, size_t size, size_t align);
void* inox_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align);
void inox_default_free(void* user, void* ptr, size_t size, size_t align);

extern inox_allocator inox_default_base_allocator;
extern inox_allocator inox_default_allocator;

#ifdef __cplusplus
}
#endif

#endif
