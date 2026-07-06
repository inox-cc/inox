#include "inox/weak.h"
#ifdef INOX_DEBUG_MEMORY
#include "inox/debug_bridge.h"
#endif

#ifdef INOX_ENABLE_WEAK
static inox_tag inox_weak_tag_from_ref_kind(inox_ref_kind kind) {
  switch (kind) {
    case INOX_REF_STRING:
      return INOX_TAG_STRING;
    case INOX_REF_OBJECT:
      return INOX_TAG_OBJECT;
    case INOX_REF_ARRAY:
      return INOX_TAG_ARRAY;
    case INOX_REF_BYTES:
      return INOX_TAG_BYTES;
    case INOX_REF_FUNCTION:
      return INOX_TAG_FUNCTION;
    case INOX_REF_MAP:
      return INOX_TAG_MAP;
    case INOX_REF_SET:
      return INOX_TAG_SET;
    case INOX_REF_CLASS_INSTANCE:
      return INOX_TAG_CLASS_INSTANCE;
    default:
      return INOX_TAG_UNDEFINED;
  }
}

static void inox_weak_cell_maybe_free(inox_weak_cell* cell) {
  if (cell == 0 || cell->target != 0 || cell->weak_count != 0) {
    return;
  }

  inox_allocator* allocator = cell->allocator;

#ifdef INOX_DEBUG_MEMORY
  inox_debug_memory_record_weak_cell_destroyed();
#endif

  if (allocator != 0 && allocator->free != 0) {
    allocator->free(allocator->user, cell, sizeof(inox_weak_cell), _Alignof(inox_weak_cell));
  }
}
#endif

inox_status inox_weak_from_value(inox_value value, inox_weak_ref* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_weak_null();

#ifndef INOX_ENABLE_WEAK
  (void)value;
  return INOX_ERR_UNSUPPORTED;
#else
  if (value.tag == INOX_TAG_NULL || value.tag == INOX_TAG_UNDEFINED) {
    return INOX_OK;
  }

  if (!inox_is_ref_value(value) || value.as.ref == 0) {
    return INOX_ERR_TYPE;
  }

  inox_ref* ref = value.as.ref;

  if (ref->weak_cell == 0) {
    inox_allocator* allocator = ref->allocator;

    if (allocator == 0 || allocator->alloc == 0) {
      return INOX_ERR_TYPE;
    }

    inox_weak_cell* cell = allocator->alloc(allocator->user, sizeof(inox_weak_cell), _Alignof(inox_weak_cell));

    if (cell == 0) {
      return INOX_ERR_OOM;
    }

    cell->target = ref;
    cell->weak_count = 0;
    cell->allocator = allocator;
    ref->weak_cell = cell;
#ifdef INOX_DEBUG_MEMORY
    inox_debug_memory_record_weak_cell_created();
#endif
  }

  ref->weak_cell->weak_count += 1;
  out->cell = ref->weak_cell;

  return INOX_OK;
#endif
}

void inox_weak_retain(inox_weak_ref weak) {
#ifdef INOX_ENABLE_WEAK
  if (weak.cell != 0) {
    weak.cell->weak_count += 1;
  }
#else
  (void)weak;
#endif
}

void inox_weak_release(inox_weak_ref weak) {
#ifdef INOX_ENABLE_WEAK
  if (weak.cell == 0) {
    return;
  }

  if (weak.cell->weak_count > 0) {
    weak.cell->weak_count -= 1;
  }

  inox_weak_cell_maybe_free(weak.cell);
#else
  (void)weak;
#endif
}

inox_status inox_weak_upgrade(inox_weak_ref weak, inox_value* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_null_value();

#ifndef INOX_ENABLE_WEAK
  (void)weak;
  return INOX_ERR_UNSUPPORTED;
#else
  if (weak.cell == 0 || weak.cell->target == 0) {
    return INOX_OK;
  }

  inox_tag tag = inox_weak_tag_from_ref_kind(weak.cell->target->kind);

  if (tag == INOX_TAG_UNDEFINED) {
    return INOX_ERR_TYPE;
  }

  out->tag = tag;
  out->as.ref = weak.cell->target;
  inox_retain(*out);

  return INOX_OK;
#endif
}

void inox_weak_clear_target(inox_ref* ref) {
#ifdef INOX_ENABLE_WEAK
  if (ref == 0 || ref->weak_cell == 0) {
    return;
  }

  inox_weak_cell* cell = ref->weak_cell;
  cell->target = 0;
  ref->weak_cell = 0;
  inox_weak_cell_maybe_free(cell);
#else
  (void)ref;
#endif
}
