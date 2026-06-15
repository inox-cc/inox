#ifndef CCJS_URL_H
#define CCJS_URL_H

#include "ccjs/allocator.h"
#include "ccjs/object.h"
#include "ccjs/value.h"

ccjs_status ccjs_url_file_url_to_path(ccjs_allocator* allocator, ccjs_value url, ccjs_value* out);
ccjs_status ccjs_url_path_to_file_url(ccjs_allocator* allocator, ccjs_value path, const ccjs_shape* shape, ccjs_value* out);
ccjs_status ccjs_url_new(
  ccjs_allocator* allocator,
  ccjs_value input,
  ccjs_value base,
  int has_base,
  const ccjs_shape* shape,
  ccjs_value* out
);

#endif
