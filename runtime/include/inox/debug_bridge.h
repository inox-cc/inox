#ifndef INOX_DEBUG_BRIDGE_H
#define INOX_DEBUG_BRIDGE_H

#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

void inox_debug_memory_record_ref_created(inox_ref_kind kind);
void inox_debug_memory_record_ref_destroyed(inox_ref_kind kind);
void inox_debug_memory_record_retain(void);
void inox_debug_memory_record_release(void);
void inox_debug_memory_record_promise_created(void);
void inox_debug_memory_record_promise_destroyed(void);
void inox_debug_memory_record_weak_cell_created(void);
void inox_debug_memory_record_weak_cell_destroyed(void);

#ifdef __cplusplus
}
#endif

#endif
