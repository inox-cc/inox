#ifndef INOX_CALLBACK_H
#define INOX_CALLBACK_H

#include <stddef.h>
#include "inox/allocator.h"
#include "inox/value.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef inox_status (*inox_callback_call_fn)(void* context, const inox_value* args, size_t arg_count, inox_value* out);
typedef inox_status (*inox_callback_async_call_fn)(
  void* context,
  const inox_value* args,
  size_t arg_count,
  void* out
);
typedef void (*inox_callback_finalizer_fn)(void* context);

typedef struct inox_callback {
  inox_ref header;
  inox_callback_call_fn call;
  inox_callback_async_call_fn async_call;
  void* context;
  inox_callback_finalizer_fn finalizer;
} inox_callback;

typedef struct inox_shared_number_box {
  size_t ref_count;
  inox_allocator* allocator;
  double value;
} inox_shared_number_box;

typedef struct inox_shared_value_box {
  size_t ref_count;
  inox_allocator* allocator;
  inox_value value;
} inox_shared_value_box;

inox_status inox_callback_new(
  inox_allocator* allocator,
  inox_callback_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
);
inox_status inox_callback_new_async(
  inox_allocator* allocator,
  inox_callback_async_call_fn call,
  void* context,
  inox_callback_finalizer_fn finalizer,
  inox_value* out
);
inox_status inox_callback_call(inox_value callback, const inox_value* args, size_t arg_count, inox_value* out);
inox_status inox_callback_call_async(
  inox_value callback,
  const inox_value* args,
  size_t arg_count,
  void* out
);
inox_status inox_shared_number_box_new(inox_allocator* allocator, double value, inox_shared_number_box** out);
void inox_shared_number_box_retain(inox_shared_number_box* box);
void inox_shared_number_box_release(inox_shared_number_box* box);
inox_status inox_shared_value_box_new(inox_allocator* allocator, inox_value value, inox_shared_value_box** out);
void inox_shared_value_box_retain(inox_shared_value_box* box);
void inox_shared_value_box_release(inox_shared_value_box* box);

#ifdef __cplusplus
}
#endif

#ifdef __cplusplus

#include <span>

namespace inox {

class Callback {
private:
  Value value_;

public:
  Callback();
  Callback(inox_value value);
  Callback(const Value& value);
  Callback(Value&& value);
  Callback(const Callback& other);
  Callback(Callback&& other) noexcept;
  Callback& operator=(const Callback& other);
  Callback& operator=(Callback&& other) noexcept;
  ~Callback();

  bool valid() const;
  bool same(const Callback& other) const;
  Value call() const;
  Value call(std::span<const Value> args) const;
};

class SharedNumberBox {
private:
  inox_shared_number_box* box_;

public:
  SharedNumberBox();
  explicit SharedNumberBox(inox_shared_number_box* box);
  SharedNumberBox(const SharedNumberBox& other);
  SharedNumberBox(SharedNumberBox&& other) noexcept;
  SharedNumberBox& operator=(const SharedNumberBox& other);
  SharedNumberBox& operator=(SharedNumberBox&& other) noexcept;
  ~SharedNumberBox();

  inox_shared_number_box* operator->() const;
  bool valid() const;
};

class SharedValueBox {
private:
  inox_shared_value_box* box_;

public:
  SharedValueBox();
  explicit SharedValueBox(inox_shared_value_box* box);
  SharedValueBox(const SharedValueBox& other);
  SharedValueBox(SharedValueBox&& other) noexcept;
  SharedValueBox& operator=(const SharedValueBox& other);
  SharedValueBox& operator=(SharedValueBox&& other) noexcept;
  ~SharedValueBox();

  inox_shared_value_box* operator->() const;
  bool valid() const;
};

} // namespace inox

#endif

#endif
