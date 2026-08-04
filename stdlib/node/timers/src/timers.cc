#include "inox/timers.h"

#include <cmath>
#include <memory>
#include <new>
#include <utility>

#include "inox/allocator.h"
#include "inox/loop.h"

namespace {

struct TimerHandleState {
  explicit TimerHandleState(inox::Callback callback)
    : callback_(std::move(callback)), handle_(nullptr), active_(false), cleared_(false), running_(false) {}

  inox::Callback callback_;
  inox_timer_handle* handle_;
  bool active_;
  bool cleared_;
  bool running_;
};

struct TimerHandleCarrier {
  explicit TimerHandleCarrier(std::shared_ptr<TimerHandleState> state) : state_(std::move(state)) {}

  std::shared_ptr<TimerHandleState> state_;
};

using TimerStateOwner = std::shared_ptr<TimerHandleState>;

double normalizeTimerDelay(double delay) {
  if (!std::isfinite(delay) || delay < 1 || delay > 2147483647) {
    return 1;
  }

  return std::trunc(delay);
}

inox_status timerCarrierCall(void*, const inox_value*, std::size_t, inox_value*) {
  return INOX_ERR_UNSUPPORTED;
}

void finalizeTimerCarrier(void* context) {
  delete static_cast<TimerHandleCarrier*>(context);
}

std::shared_ptr<TimerHandleState> timerState(const inox::Value& value) {
  const inox_value raw = value.raw();

  if (raw.tag != INOX_TAG_FUNCTION || raw.as.ref == nullptr || raw.as.ref->kind != INOX_REF_FUNCTION) {
    return {};
  }

  auto* callback = reinterpret_cast<inox_callback*>(raw.as.ref);

  if (callback->call != timerCarrierCall || callback->context == nullptr) {
    return {};
  }

  return static_cast<TimerHandleCarrier*>(callback->context)->state_;
}

inox::Value createTimerCarrier(const std::shared_ptr<TimerHandleState>& state) {
  auto* carrier = new (std::nothrow) TimerHandleCarrier(state);

  if (carrier == nullptr) {
    inox::throw_value(inox::Value());
    return {};
  }

  inox_value raw = inox_undefined_value();
  const inox_status status = inox_callback_new(
    &inox_default_allocator,
    timerCarrierCall,
    carrier,
    finalizeTimerCarrier,
    &raw
  );

  if (status != INOX_OK) {
    delete carrier;
    inox::throw_value(inox::Value());
    return {};
  }

  return inox::adopt(raw);
}

inox_status runTimer(void* context) {
  auto state = *static_cast<TimerStateOwner*>(context);

  if (!state || !state->active_ || state->cleared_) {
    return INOX_OK;
  }

  state->running_ = true;
  state->callback_.call();
  state->running_ = false;

  return inox::thrown() ? INOX_ERR_THROW : INOX_OK;
}

void finalizeTimer(void* context) {
  auto* owner = static_cast<TimerStateOwner*>(context);
  std::shared_ptr<TimerHandleState> state = *owner;

  state->active_ = false;
  state->handle_ = nullptr;
  state->callback_ = inox::Callback();
  delete owner;
}

template <typename Handle, typename Schedule>
Handle scheduleTimer(inox::Callback callback, Schedule schedule) {
  auto state = std::make_shared<TimerHandleState>(std::move(callback));
  inox::Value carrier = createTimerCarrier(state);

  if (!carrier.raw().as.ref || inox::thrown()) {
    return {};
  }

  auto* owner = new (std::nothrow) TimerStateOwner(state);

  if (owner == nullptr) {
    state->callback_ = inox::Callback();
    inox::throw_value(inox::Value());
    return {};
  }

  const inox_status status = schedule(runTimer, owner, finalizeTimer, &state->handle_);

  if (status != INOX_OK) {
    delete owner;
    state->callback_ = inox::Callback();
    inox::throw_value(inox::Value());
    return {};
  }

  state->active_ = true;
  return Handle(std::move(carrier));
}

void clearTimer(const inox::Value& handle) {
  const std::shared_ptr<TimerHandleState> state = timerState(handle);

  if (!state || state->cleared_) {
    return;
  }

  state->cleared_ = true;
  state->active_ = false;
  inox_timer_handle* raw = state->handle_;

  if (raw == nullptr) {
    if (!state->running_) {
      state->callback_ = inox::Callback();
    }
    return;
  }

  inox_loop_clear_timer(raw);
}

void setTimerReferenced(const inox::Value& handle, bool referenced) {
  const std::shared_ptr<TimerHandleState> state = timerState(handle);

  if (!state || state->handle_ == nullptr) {
    return;
  }

  if (referenced) {
    inox_loop_ref_timer(state->handle_);
  } else {
    inox_loop_unref_timer(state->handle_);
  }
}

bool timerHasRef(const inox::Value& handle) {
  const std::shared_ptr<TimerHandleState> state = timerState(handle);
  return state && state->handle_ != nullptr && inox_loop_timer_has_ref(state->handle_);
}

} // namespace

TimeoutHandle::TimeoutHandle() : inox::Value() {}
TimeoutHandle::TimeoutHandle(const inox::Value& value) : inox::Value(value) {}
TimeoutHandle::TimeoutHandle(inox::Value&& value) : inox::Value(std::move(value)) {}
TimeoutHandle::TimeoutHandle(const TimeoutHandle& other) : inox::Value(other) {}
TimeoutHandle::TimeoutHandle(TimeoutHandle&& other) noexcept : inox::Value(std::move(other)) {}
TimeoutHandle& TimeoutHandle::operator=(const TimeoutHandle& other) {
  inox::Value::operator=(other);
  return *this;
}
TimeoutHandle& TimeoutHandle::operator=(TimeoutHandle&& other) noexcept {
  inox::Value::operator=(std::move(other));
  return *this;
}
TimeoutHandle::~TimeoutHandle() {}

TimeoutHandle TimeoutHandle::ref() const {
  setTimerReferenced(*this, true);
  return TimeoutHandle(*this);
}

TimeoutHandle TimeoutHandle::unref() const {
  setTimerReferenced(*this, false);
  return TimeoutHandle(*this);
}

bool TimeoutHandle::hasRef() const {
  return timerHasRef(*this);
}

IntervalHandle::IntervalHandle() : inox::Value() {}
IntervalHandle::IntervalHandle(const inox::Value& value) : inox::Value(value) {}
IntervalHandle::IntervalHandle(inox::Value&& value) : inox::Value(std::move(value)) {}
IntervalHandle::IntervalHandle(const IntervalHandle& other) : inox::Value(other) {}
IntervalHandle::IntervalHandle(IntervalHandle&& other) noexcept : inox::Value(std::move(other)) {}
IntervalHandle& IntervalHandle::operator=(const IntervalHandle& other) {
  inox::Value::operator=(other);
  return *this;
}
IntervalHandle& IntervalHandle::operator=(IntervalHandle&& other) noexcept {
  inox::Value::operator=(std::move(other));
  return *this;
}
IntervalHandle::~IntervalHandle() {}

IntervalHandle IntervalHandle::ref() const {
  setTimerReferenced(*this, true);
  return IntervalHandle(*this);
}

IntervalHandle IntervalHandle::unref() const {
  setTimerReferenced(*this, false);
  return IntervalHandle(*this);
}

bool IntervalHandle::hasRef() const {
  return timerHasRef(*this);
}

ImmediateHandle::ImmediateHandle() : inox::Value() {}
ImmediateHandle::ImmediateHandle(const inox::Value& value) : inox::Value(value) {}
ImmediateHandle::ImmediateHandle(inox::Value&& value) : inox::Value(std::move(value)) {}
ImmediateHandle::ImmediateHandle(const ImmediateHandle& other) : inox::Value(other) {}
ImmediateHandle::ImmediateHandle(ImmediateHandle&& other) noexcept : inox::Value(std::move(other)) {}
ImmediateHandle& ImmediateHandle::operator=(const ImmediateHandle& other) {
  inox::Value::operator=(other);
  return *this;
}
ImmediateHandle& ImmediateHandle::operator=(ImmediateHandle&& other) noexcept {
  inox::Value::operator=(std::move(other));
  return *this;
}
ImmediateHandle::~ImmediateHandle() {}

ImmediateHandle ImmediateHandle::ref() const {
  setTimerReferenced(*this, true);
  return ImmediateHandle(*this);
}

ImmediateHandle ImmediateHandle::unref() const {
  setTimerReferenced(*this, false);
  return ImmediateHandle(*this);
}

bool ImmediateHandle::hasRef() const {
  return timerHasRef(*this);
}

TimeoutHandle TimersModule::setTimeout(inox::Callback callback, double delay) const {
  inox_loop* loop = inox::loop();

  if (loop == nullptr) {
    inox::throw_value(inox::Value());
    return {};
  }

  const double normalized_delay = normalizeTimerDelay(delay);

  return scheduleTimer<TimeoutHandle>(
    std::move(callback),
    [loop, normalized_delay](inox_loop_callback_fn run, void* context,
                             inox_loop_callback_finalizer_fn finalizer, inox_timer_handle** out) {
      return inox_loop_set_timeout(loop, normalized_delay, run, context, finalizer, out);
    }
  );
}

void TimersModule::clearTimeout(const TimeoutHandle& handle) const {
  clearTimer(handle);
}

IntervalHandle TimersModule::setInterval(inox::Callback callback, double delay) const {
  inox_loop* loop = inox::loop();

  if (loop == nullptr) {
    inox::throw_value(inox::Value());
    return {};
  }

  const double normalized_delay = normalizeTimerDelay(delay);

  return scheduleTimer<IntervalHandle>(
    std::move(callback),
    [loop, normalized_delay](inox_loop_callback_fn run, void* context,
                             inox_loop_callback_finalizer_fn finalizer, inox_timer_handle** out) {
      return inox_loop_set_interval(loop, normalized_delay, run, context, finalizer, out);
    }
  );
}

void TimersModule::clearInterval(const IntervalHandle& handle) const {
  clearTimer(handle);
}

ImmediateHandle TimersModule::setImmediate(inox::Callback callback) const {
  inox_loop* loop = inox::loop();

  if (loop == nullptr) {
    inox::throw_value(inox::Value());
    return {};
  }

  return scheduleTimer<ImmediateHandle>(
    std::move(callback),
    [loop](inox_loop_callback_fn run, void* context, inox_loop_callback_finalizer_fn finalizer,
           inox_timer_handle** out) {
      return inox_loop_queue_immediate(loop, run, context, finalizer, out);
    }
  );
}

void TimersModule::clearImmediate(const ImmediateHandle& handle) const {
  clearTimer(handle);
}

const TimersModule timers;
