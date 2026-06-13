#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "ccjs/string.h"

static void* ccjs_default_alloc(void* user, size_t size, size_t align) {
  (void)user;
  (void)align;
  return calloc(1, size);
}

static void* ccjs_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void ccjs_default_free(void* user, void* ptr, size_t size, size_t align) {
  (void)user;
  (void)size;
  (void)align;
  free(ptr);
}

static ccjs_allocator ccjs_default_allocator = {
  0,
  ccjs_default_alloc,
  ccjs_default_realloc,
  ccjs_default_free
};

double add(double left, double right);

double add(double left, double right) {
  double ccjs_return = 0;
  ccjs_return = (left + right);
  goto ccjs_cleanup;

ccjs_cleanup:
  return ccjs_return;
}

int main(void) {
  double ccjs_return = 0;
  ccjs_value ccjs_value_0 = ccjs_undefined_value();
  ccjs_value ccjs_value_2 = ccjs_undefined_value();
  const double total = add(2, 3);
  ccjs_release(ccjs_value_0);
  ccjs_value_0 = ccjs_undefined_value();

  if (ccjs_string_from_number(&ccjs_default_allocator, total, &ccjs_value_0) != CCJS_OK) {
    goto ccjs_cleanup;
  }

  ccjs_string* ccjs_template_string_1 = (ccjs_string*)ccjs_value_0.as.ref;
  ccjs_release(ccjs_value_2);
  ccjs_value_2 = ccjs_undefined_value();

  if (
    ccjs_string_concat_parts(
      &ccjs_default_allocator,
      "total ",
      6,
      ccjs_template_string_1->bytes,
      ccjs_template_string_1->len,
      &ccjs_value_2
    ) != CCJS_OK
  ) {
    goto ccjs_cleanup;
  }

  ccjs_string* ccjs_log_string_3 = (ccjs_string*)ccjs_value_2.as.ref;
  printf("%.*s\n", (int)ccjs_log_string_3->len, ccjs_log_string_3->bytes);

ccjs_cleanup:
  ccjs_release(ccjs_value_2);
  ccjs_release(ccjs_value_0);
  return (int)ccjs_return;
}
