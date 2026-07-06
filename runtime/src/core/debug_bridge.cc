#include "inox/debug_bridge.h"

#include "inox/debug.h"

extern "C" void inox_debug_memory_record_ref_created(inox_ref_kind kind) {
  inox::debugMemory.recordRefCreated(kind);
}

extern "C" void inox_debug_memory_record_ref_destroyed(inox_ref_kind kind) {
  inox::debugMemory.recordRefDestroyed(kind);
}

extern "C" void inox_debug_memory_record_retain(void) {
  inox::debugMemory.recordRetain();
}

extern "C" void inox_debug_memory_record_release(void) {
  inox::debugMemory.recordRelease();
}

extern "C" void inox_debug_memory_record_promise_created(void) {
  inox::debugMemory.recordPromiseCreated();
}

extern "C" void inox_debug_memory_record_promise_destroyed(void) {
  inox::debugMemory.recordPromiseDestroyed();
}

extern "C" void inox_debug_memory_record_weak_cell_created(void) {
  inox::debugMemory.recordWeakCellCreated();
}

extern "C" void inox_debug_memory_record_weak_cell_destroyed(void) {
  inox::debugMemory.recordWeakCellDestroyed();
}
