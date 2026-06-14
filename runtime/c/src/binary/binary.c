#include <string.h>
#include "ccjs/binary.h"
#ifdef CCJS_DEBUG_MEMORY
#include "ccjs/debug.h"
#endif
#include "ccjs/string.h"

static ccjs_status ccjs_bytes_allocate(ccjs_allocator* allocator, size_t len, ccjs_bytes** out);

ccjs_status ccjs_bytes_new(ccjs_allocator* allocator, size_t len, ccjs_value* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_bytes* bytes = 0;
  ccjs_status status = ccjs_bytes_allocate(allocator, len, &bytes);

  if (status != CCJS_OK) {
    return status;
  }

  if (len != 0) {
    memset(bytes->bytes, 0, len);
  }

  out->tag = CCJS_TAG_BYTES;
  out->as.ref = &bytes->header;

  return CCJS_OK;
}

ccjs_status ccjs_bytes_from_data(ccjs_allocator* allocator, const uint8_t* data, size_t len, ccjs_value* out) {
  if (out == 0 || (data == 0 && len != 0)) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_bytes* bytes = 0;
  ccjs_status status = ccjs_bytes_allocate(allocator, len, &bytes);

  if (status != CCJS_OK) {
    return status;
  }

  if (len != 0) {
    memcpy(bytes->bytes, data, len);
  }

  out->tag = CCJS_TAG_BYTES;
  out->as.ref = &bytes->header;

  return CCJS_OK;
}

ccjs_status ccjs_bytes_get(ccjs_value value, size_t index, uint8_t* out) {
  if (out == 0 || value.tag != CCJS_TAG_BYTES || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;

  if (index >= bytes->len) {
    *out = 0;
    return CCJS_ERR_FIELD;
  }

  *out = bytes->bytes[index];

  return CCJS_OK;
}

ccjs_status ccjs_bytes_len(ccjs_value value, size_t* out) {
  if (out == 0 || value.tag != CCJS_TAG_BYTES || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;
  *out = bytes->len;

  return CCJS_OK;
}

ccjs_status ccjs_bytes_set(ccjs_value value, size_t index, uint8_t byte) {
  if (value.tag != CCJS_TAG_BYTES || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;

  if (index >= bytes->len) {
    return CCJS_ERR_FIELD;
  }

  bytes->bytes[index] = byte;

  return CCJS_OK;
}

ccjs_status ccjs_bytes_slice(ccjs_value value, size_t start, size_t end, ccjs_value* out) {
  if (out == 0 || value.tag != CCJS_TAG_BYTES || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();

  ccjs_bytes* source = (ccjs_bytes*)value.as.ref;

  if (start > source->len) {
    start = source->len;
  }

  if (end > source->len) {
    end = source->len;
  }

  if (end < start) {
    end = start;
  }

  return ccjs_bytes_from_data(source->header.allocator, source->bytes + start, end - start, out);
}

ccjs_status ccjs_bytes_to_string(ccjs_allocator* allocator, ccjs_value value, ccjs_value* out) {
  if (out == 0 || value.tag != CCJS_TAG_BYTES || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;

  return ccjs_string_from_literal(allocator, (const char*)bytes->bytes, bytes->len, out);
}

static ccjs_status ccjs_bytes_allocate(ccjs_allocator* allocator, size_t len, ccjs_bytes** out) {
  if (out == 0 || allocator == 0 || allocator->alloc == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (len > ((size_t)-1) - sizeof(ccjs_bytes)) {
    return CCJS_ERR_OOM;
  }

  size_t size = sizeof(ccjs_bytes) + len;
  ccjs_bytes* bytes = allocator->alloc(allocator->user, size, _Alignof(ccjs_bytes));

  if (bytes == 0) {
    return CCJS_ERR_OOM;
  }

  bytes->header.kind = CCJS_REF_BYTES;
  bytes->header.ref_count = 1;
  bytes->header.flags = 0;
  bytes->header.size = size;
  bytes->header.align = _Alignof(ccjs_bytes);
  bytes->header.allocator = allocator;
  bytes->len = len;
  *out = bytes;
#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_ref_created(CCJS_REF_BYTES);
#endif

  return CCJS_OK;
}
