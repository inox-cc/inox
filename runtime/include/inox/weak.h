#ifndef INOX_WEAK_H
#define INOX_WEAK_H

#include <stdbool.h>
#include <stdint.h>
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

struct inox_weak_cell {
  inox_ref* target;
  uint32_t weak_count;
  inox_allocator* allocator;
};

typedef struct inox_weak_ref {
  inox_weak_cell* cell;
} inox_weak_ref;

static inline inox_weak_ref inox_weak_null(void) {
  inox_weak_ref weak = { 0 };

  return weak;
}

static inline bool inox_weak_is_empty(inox_weak_ref weak) {
  return weak.cell == 0;
}

inox_status inox_weak_from_value(inox_value value, inox_weak_ref* out);
void inox_weak_retain(inox_weak_ref weak);
void inox_weak_release(inox_weak_ref weak);
inox_status inox_weak_upgrade(inox_weak_ref weak, inox_value* out);
void inox_weak_clear_target(inox_ref* ref);

#ifdef __cplusplus
}

namespace inox {

class WeakValue {
private:
  inox_weak_ref weak_;

public:
  WeakValue() : weak_(inox_weak_null()) {}

  WeakValue(const WeakValue& other) : weak_(other.weak_) {
    inox_weak_retain(weak_);
  }

  WeakValue(WeakValue&& other) noexcept : weak_(other.weak_) {
    other.weak_ = inox_weak_null();
  }

  WeakValue& operator=(const WeakValue& other) {
    if (this != &other) {
      inox_weak_retain(other.weak_);
      inox_weak_release(weak_);
      weak_ = other.weak_;
    }

    return *this;
  }

  WeakValue& operator=(WeakValue&& other) noexcept {
    if (this != &other) {
      inox_weak_release(weak_);
      weak_ = other.weak_;
      other.weak_ = inox_weak_null();
    }

    return *this;
  }

  ~WeakValue() {
    inox_weak_release(weak_);
  }

  inox_status assign(inox_value value) {
    inox_weak_ref replacement = inox_weak_null();
    inox_status status = inox_weak_from_value(value, &replacement);

    if (status != INOX_OK) {
      return status;
    }

    inox_weak_release(weak_);
    weak_ = replacement;
    return INOX_OK;
  }

  inox_status copy_to(inox_value* out) const {
    return inox_weak_upgrade(weak_, out);
  }
};

} // namespace inox
#endif

#endif
