#include <stdio.h>
#include <stdlib.h>
#include "inox/console.h"
#include <string.h>
#include "inox/string.h"

static void* inox_default_alloc(void* user, size_t size, size_t align) {
  (void)user;
  (void)align;
  return calloc(1, size);
}

static void* inox_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void inox_default_free(void* user, void* ptr, size_t size, size_t align) {
  (void)user;
  (void)size;
  (void)align;
  free(ptr);
}

static inox_allocator inox_default_allocator = {
  0,
  inox_default_alloc,
  inox_default_realloc,
  inox_default_free
};

double add(double left, double right);

double add(double left, double right) {
  double inox_return = 0;
  inox_return = (left + right);
  goto inox_cleanup;

inox_cleanup:
  return inox_return;
}

int main(void) {
  double inox_return = 0;
  inox_value inox_value_0 = inox_undefined_value();
  inox_value inox_value_2 = inox_undefined_value();
  const double total = add(2, 3);
  inox_release(inox_value_0);
  inox_value_0 = inox_undefined_value();

  if (inox_string_from_number(&inox_default_allocator, total, &inox_value_0) != INOX_OK) {
    goto inox_cleanup;
  }

  inox_string* inox_template_string_1 = (inox_string*)inox_value_0.as.ref;
  inox_release(inox_value_2);
  inox_value_2 = inox_undefined_value();

  if (
    inox_string_concat_parts(
      &inox_default_allocator,
      "total ",
      6,
      inox_template_string_1->bytes,
      inox_template_string_1->len,
      &inox_value_2
    ) != INOX_OK
  ) {
    goto inox_cleanup;
  }

  inox_string* inox_log_string_3 = (inox_string*)inox_value_2.as.ref;
  printf("%.*s\n", (int)inox_log_string_3->len, inox_log_string_3->bytes);

inox_cleanup:
  inox_release(inox_value_2);
  inox_release(inox_value_0);
  return (int)inox_return;
}
