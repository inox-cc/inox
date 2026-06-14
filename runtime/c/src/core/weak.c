#include "ccjs/weak.h"
#ifdef CCJS_DEBUG_MEMORY
#include "ccjs/debug.h"
#endif

#ifdef CCJS_ENABLE_WEAK
static ccjs_tag ccjs_weak_tag_from_ref_kind(ccjs_ref_kind kind) {
  switch (kind) {
    case CCJS_REF_STRING:
      return CCJS_TAG_STRING;
    case CCJS_REF_OBJECT:
      return CCJS_TAG_OBJECT;
    case CCJS_REF_ARRAY:
      return CCJS_TAG_ARRAY;
    case CCJS_REF_BYTES:
      return CCJS_TAG_BYTES;
    case CCJS_REF_FUNCTION:
      return CCJS_TAG_FUNCTION;
    case CCJS_REF_MAP:
      return CCJS_TAG_MAP;
    case CCJS_REF_SET:
      return CCJS_TAG_SET;
    default:
      return CCJS_TAG_UNDEFINED;
  }
}

static void ccjs_weak_cell_maybe_free(ccjs_weak_cell* cell) {
  if (cell == 0 || cell->target != 0 || cell->weak_count != 0) {
    return;
  }

  ccjs_allocator* allocator = cell->allocator;

#ifdef CCJS_DEBUG_MEMORY
  ccjs_debug_memory_record_weak_cell_destroyed();
#endif

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, cell, sizeof(ccjs_weak_cell), _Alignof(ccjs_weak_cell));
  }
}
#endif

ccjs_status ccjs_weak_from_value(ccjs_value value, ccjs_weak_ref* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_weak_null();

#ifndef CCJS_ENABLE_WEAK
  (void)value;
  return CCJS_ERR_UNSUPPORTED;
#else
  if (value.tag == CCJS_TAG_NULL || value.tag == CCJS_TAG_UNDEFINED) {
    return CCJS_OK;
  }

  if (!ccjs_is_ref_value(value) || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_ref* ref = value.as.ref;

  if (ref->weak_cell == 0) {
    ccjs_allocator* allocator = ref->allocator;

    if (allocator == 0 || allocator->alloc == 0) {
      return CCJS_ERR_TYPE;
    }

    ccjs_weak_cell* cell = allocator->alloc(allocator->user, sizeof(ccjs_weak_cell), _Alignof(ccjs_weak_cell));

    if (cell == 0) {
      return CCJS_ERR_OOM;
    }

    cell->target = ref;
    cell->weak_count = 0;
    cell->allocator = allocator;
    ref->weak_cell = cell;
#ifdef CCJS_DEBUG_MEMORY
    ccjs_debug_memory_record_weak_cell_created();
#endif
  }

  ref->weak_cell->weak_count += 1;
  out->cell = ref->weak_cell;

  return CCJS_OK;
#endif
}

void ccjs_weak_retain(ccjs_weak_ref weak) {
#ifdef CCJS_ENABLE_WEAK
  if (weak.cell != 0) {
    weak.cell->weak_count += 1;
  }
#else
  (void)weak;
#endif
}

void ccjs_weak_release(ccjs_weak_ref weak) {
#ifdef CCJS_ENABLE_WEAK
  if (weak.cell == 0) {
    return;
  }

  if (weak.cell->weak_count > 0) {
    weak.cell->weak_count -= 1;
  }

  ccjs_weak_cell_maybe_free(weak.cell);
#else
  (void)weak;
#endif
}

ccjs_status ccjs_weak_upgrade(ccjs_weak_ref weak, ccjs_value* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_null_value();

#ifndef CCJS_ENABLE_WEAK
  (void)weak;
  return CCJS_ERR_UNSUPPORTED;
#else
  if (weak.cell == 0 || weak.cell->target == 0) {
    return CCJS_OK;
  }

  ccjs_tag tag = ccjs_weak_tag_from_ref_kind(weak.cell->target->kind);

  if (tag == CCJS_TAG_UNDEFINED) {
    return CCJS_ERR_TYPE;
  }

  out->tag = tag;
  out->as.ref = weak.cell->target;
  ccjs_retain(*out);

  return CCJS_OK;
#endif
}

void ccjs_weak_clear_target(ccjs_ref* ref) {
#ifdef CCJS_ENABLE_WEAK
  if (ref == 0 || ref->weak_cell == 0) {
    return;
  }

  ccjs_weak_cell* cell = ref->weak_cell;
  cell->target = 0;
  ref->weak_cell = 0;
  ccjs_weak_cell_maybe_free(cell);
#else
  (void)ref;
#endif
}
