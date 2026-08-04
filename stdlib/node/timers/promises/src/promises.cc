#include "inox/timers_promises.h"

#include <cmath>
#include <new>
#include <utility>

#include "inox/loop.h"

namespace {

struct TimerPromiseContext {
  TimerPromiseContext(inox::Promise source, inox::Value result)
    : promise(std::move(source)), value(std::move(result)) {}

  inox::Promise promise;
  inox::Value value;
};

double normalizeTimerDelay(double delay) {
  if (!std::isfinite(delay) || delay < 1 || delay > 2147483647) {
    return 1;
  }

  return std::trunc(delay);
}

inox_status fulfillTimerPromise(void* context) {
  auto* timer = static_cast<TimerPromiseContext*>(context);
  return timer->promise.fulfill(std::move(timer->value));
}

void finalizeTimerPromise(void* context) {
  delete static_cast<TimerPromiseContext*>(context);
}

void rejectTimerPromise(const inox::Promise& promise) {
  promise.rejectWith(inox::Value());
}

inox::Promise scheduleTimerPromise(double delay, bool immediate, inox::Value value) {
  inox::Promise promise = inox::Promise::create();

  if (!promise.valid()) {
    return promise;
  }

  inox_loop* loop = inox::loop();

  if (loop == nullptr) {
    rejectTimerPromise(promise);
    return promise;
  }

  auto* context = new (std::nothrow) TimerPromiseContext(promise, std::move(value));

  if (context == nullptr) {
    rejectTimerPromise(promise);
    return promise;
  }

  const inox_status status = immediate
    ? inox_loop_queue_immediate(loop, fulfillTimerPromise, context, finalizeTimerPromise, nullptr)
    : inox_loop_set_timeout(loop, normalizeTimerDelay(delay), fulfillTimerPromise, context, finalizeTimerPromise, nullptr);

  if (status != INOX_OK) {
    delete context;
    rejectTimerPromise(promise);
  }

  return promise;
}

} // namespace

inox::Promise TimersPromisesModule::setTimeout() const {
  return setTimeout(1);
}

inox::Promise TimersPromisesModule::setTimeout(double delay) const {
  return setTimeout(delay, inox::Value());
}

inox::Promise TimersPromisesModule::setTimeout(double delay, inox::Value value) const {
  return scheduleTimerPromise(delay, false, std::move(value));
}

inox::Promise TimersPromisesModule::setImmediate() const {
  return setImmediate(inox::Value());
}

inox::Promise TimersPromisesModule::setImmediate(inox::Value value) const {
  return scheduleTimerPromise(0, true, std::move(value));
}

const TimersPromisesModule timersPromises;
