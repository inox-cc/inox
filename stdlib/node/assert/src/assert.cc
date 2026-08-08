#include "inox/assert.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <new>
#include <utility>
#include <vector>

#include "inox/array.h"
#include "inox/binary.h"
#include "inox/error.h"
#include "inox/loop.h"
#include "inox/map.h"
#include "inox/object.h"
#include "inox/set.h"
#include "inox/string.h"

namespace {

struct ReferencePair {
  const inox_ref* actual;
  const inox_ref* expected;
};

class AssertionErrorValue : public Error {
public:
  AssertionErrorValue(
    inox::StringView messageValue,
    const inox::Value& actualValue,
    const inox::Value& expectedValue,
    inox::StringView operatorValue,
    bool generatedMessageValue
  )
    : Error(messageValue),
      actual(actualValue),
      expected(expectedValue),
      operation(operatorValue),
      generatedMessage(generatedMessageValue) {
    if (inox::thrown()) {
      return;
    }

    name = inox::String("AssertionError");
    materialize();
  }

  inox::Value actual;
  inox::Value expected;
  inox::String operation;
  bool generatedMessage;

private:
  void materialize() {
    static const inox_field_info fields[] = {
      {"name", INOX_FIELD_READONLY},
      {"message", INOX_FIELD_READONLY},
      {"cause", INOX_FIELD_READONLY},
      {"actual", INOX_FIELD_READONLY},
      {"expected", INOX_FIELD_READONLY},
      {"operator", INOX_FIELD_READONLY},
      {"generatedMessage", INOX_FIELD_READONLY},
    };
    static const inox_shape shape = {7, fields};
    inox::ObjectValue value = inox::ObjectValue::from(
      &shape,
      {
        name,
        message,
        cause,
        actual,
        expected,
        operation,
        inox::Value(inox_bool_value(generatedMessage)),
      }
    );

    if (inox::thrown()) {
      return;
    }

    static_cast<inox::Value&>(*this) = std::move(value);
  }
};

bool sameStrictValue(inox_value actual, inox_value expected) {
  if (actual.tag != expected.tag) {
    return false;
  }

  if (actual.tag == INOX_TAG_NUMBER) {
    if (std::isnan(actual.as.number) && std::isnan(expected.as.number)) {
      return true;
    }

    if (actual.as.number == 0 && expected.as.number == 0) {
      return std::signbit(actual.as.number) == std::signbit(expected.as.number);
    }

    return actual.as.number == expected.as.number;
  }

  if (actual.tag == INOX_TAG_BOOL) {
    return actual.as.boolean == expected.as.boolean;
  }

  if (actual.tag == INOX_TAG_STRING) {
    if (actual.as.ref == nullptr || expected.as.ref == nullptr) {
      return actual.as.ref == expected.as.ref;
    }

    const auto* actualString = reinterpret_cast<const inox_string*>(actual.as.ref);
    const auto* expectedString = reinterpret_cast<const inox_string*>(expected.as.ref);

    if (actualString->len != expectedString->len) {
      return false;
    }

    return actualString->len == 0 ||
           std::memcmp(actualString->bytes, expectedString->bytes, actualString->len) == 0;
  }

  if (inox_is_ref_value(actual)) {
    return actual.as.ref == expected.as.ref;
  }

  return actual.tag == INOX_TAG_NULL || actual.tag == INOX_TAG_UNDEFINED;
}

class DeepComparator {
public:
  bool equal(inox_value actual, inox_value expected) {
    if (sameStrictValue(actual, expected)) {
      return true;
    }

    if (actual.tag != expected.tag || !inox_is_ref_value(actual) || actual.as.ref == nullptr ||
        expected.as.ref == nullptr) {
      return false;
    }

    if (actual.tag == INOX_TAG_ARRAY) {
      return arraysEqual(actual, expected);
    }

    if (actual.tag == INOX_TAG_OBJECT) {
      return objectsEqual(actual, expected);
    }

    if (actual.tag == INOX_TAG_BYTES) {
      return bytesEqual(actual, expected);
    }

    if (actual.tag == INOX_TAG_MAP) {
      return mapsEqual(actual, expected);
    }

    if (actual.tag == INOX_TAG_SET) {
      return setsEqual(actual, expected);
    }

    return false;
  }

private:
  std::vector<ReferencePair> seen_;

  bool markOrSeen(inox_value actual, inox_value expected) {
    for (const ReferencePair& pair : seen_) {
      if (pair.actual == actual.as.ref && pair.expected == expected.as.ref) {
        return true;
      }
    }

    seen_.push_back({actual.as.ref, expected.as.ref});
    return false;
  }

  bool arraysEqual(inox_value actual, inox_value expected) {
    if (markOrSeen(actual, expected)) {
      return true;
    }

    Array actualArray{inox::Value(actual)};
    Array expectedArray{inox::Value(expected)};

    if (!actualArray.valid() || !expectedArray.valid() || actualArray.length() != expectedArray.length()) {
      return false;
    }

    for (std::size_t index = 0; index < actualArray.length(); index += 1) {
      inox::Value actualItem = actualArray.get(index);
      inox::Value expectedItem = expectedArray.get(index);

      if (inox::thrown() || !equal(actualItem.raw(), expectedItem.raw())) {
        return false;
      }
    }

    return true;
  }

  bool objectsEqual(inox_value actual, inox_value expected) {
    if (markOrSeen(actual, expected)) {
      return true;
    }

    const auto* actualObject = reinterpret_cast<const inox_object*>(actual.as.ref);
    const auto* expectedObject = reinterpret_cast<const inox_object*>(expected.as.ref);

    if (actualObject->shape == nullptr || expectedObject->shape == nullptr ||
        actualObject->shape->field_count != expectedObject->shape->field_count) {
      return false;
    }

    for (std::uint32_t actualIndex = 0; actualIndex < actualObject->shape->field_count; actualIndex += 1) {
      const char* name = actualObject->shape->fields[actualIndex].name;
      std::uint32_t expectedIndex = 0;

      if (!findObjectField(*expectedObject, name, expectedIndex)) {
        return false;
      }

      inox::Value actualField;
      inox::Value expectedField;

      if (!readObjectField(actual, actualIndex, actualField) ||
          !readObjectField(expected, expectedIndex, expectedField) ||
          !equal(actualField.raw(), expectedField.raw())) {
        return false;
      }
    }

    return true;
  }

  bool bytesEqual(inox_value actual, inox_value expected) {
    Uint8Array actualBytes{inox::Value(actual)};
    Uint8Array expectedBytes{inox::Value(expected)};

    if (!actualBytes.valid() || !expectedBytes.valid()) {
      return false;
    }

    const auto left = actualBytes.bytes();
    const auto right = expectedBytes.bytes();

    return left.size() == right.size() && std::equal(left.begin(), left.end(), right.begin());
  }

  bool mapsEqual(inox_value actual, inox_value expected) {
    if (markOrSeen(actual, expected)) {
      return true;
    }

    Map actualMap{inox::Value(actual)};
    Map expectedMap{inox::Value(expected)};

    if (!actualMap.valid() || !expectedMap.valid() || actualMap.size() != expectedMap.size()) {
      return false;
    }

    const std::vector<inox::Value> actualEntries = collectMapEntries(actualMap);
    const std::vector<inox::Value> expectedEntries = collectMapEntries(expectedMap);

    if (inox::thrown() || actualEntries.size() != expectedEntries.size()) {
      return false;
    }

    std::vector<bool> matched(expectedEntries.size(), false);

    for (const inox::Value& actualEntry : actualEntries) {
      bool found = false;

      for (std::size_t index = 0; index < expectedEntries.size(); index += 1) {
        if (matched[index]) {
          continue;
        }

        const std::size_t checkpoint = seen_.size();

        if (mapEntriesEqual(actualEntry, expectedEntries[index])) {
          matched[index] = true;
          found = true;
          break;
        }

        seen_.resize(checkpoint);

        if (inox::thrown()) {
          return false;
        }
      }

      if (!found) {
        return false;
      }
    }

    return true;
  }

  bool setsEqual(inox_value actual, inox_value expected) {
    if (markOrSeen(actual, expected)) {
      return true;
    }

    Set actualSet{inox::Value(actual)};
    Set expectedSet{inox::Value(expected)};

    if (!actualSet.valid() || !expectedSet.valid() || actualSet.size() != expectedSet.size()) {
      return false;
    }

    const std::vector<inox::Value> actualValues = collectSetValues(actualSet);
    const std::vector<inox::Value> expectedValues = collectSetValues(expectedSet);

    if (inox::thrown() || actualValues.size() != expectedValues.size()) {
      return false;
    }

    std::vector<bool> matched(expectedValues.size(), false);

    for (const inox::Value& actualValue : actualValues) {
      bool found = false;

      for (std::size_t index = 0; index < expectedValues.size(); index += 1) {
        if (matched[index]) {
          continue;
        }

        const std::size_t checkpoint = seen_.size();

        if (equal(actualValue.raw(), expectedValues[index].raw())) {
          matched[index] = true;
          found = true;
          break;
        }

        seen_.resize(checkpoint);

        if (inox::thrown()) {
          return false;
        }
      }

      if (!found) {
        return false;
      }
    }

    return true;
  }

  static bool findObjectField(const inox_object& object, const char* name, std::uint32_t& index) {
    if (name == nullptr || object.shape == nullptr) {
      return false;
    }

    for (std::uint32_t candidate = 0; candidate < object.shape->field_count; candidate += 1) {
      const char* candidateName = object.shape->fields[candidate].name;

      if (candidateName != nullptr && std::strcmp(candidateName, name) == 0) {
        index = candidate;
        return true;
      }
    }

    return false;
  }

  static bool readObjectField(inox_value object, std::uint32_t index, inox::Value& value) {
    const inox_status status = inox_object_get_known(object, index, value.out());

    if (status == INOX_OK) {
      return true;
    }

    if (status == INOX_ERR_OOM) {
      inox::throw_out_of_memory();
    } else {
      inox::throw_value(inox::String("Assertion object field read failed"));
    }

    return false;
  }

  static std::vector<inox::Value> collectMapEntries(const Map& map) {
    std::vector<inox::Value> values;
    values.reserve(map.size());
    MapIterator iterator = map.entries();

    while (true) {
      MapIterationResult step = iterator.next();

      if (inox::thrown() || step.done) {
        break;
      }

      values.push_back(std::move(step.value));
    }

    return values;
  }

  static std::vector<inox::Value> collectSetValues(const Set& set) {
    std::vector<inox::Value> values;
    values.reserve(set.size());
    SetIterator iterator = set.values();

    while (true) {
      SetIterationResult step = iterator.next();

      if (inox::thrown() || step.done) {
        break;
      }

      values.push_back(std::move(step.value));
    }

    return values;
  }

  bool mapEntriesEqual(const inox::Value& actualEntry, const inox::Value& expectedEntry) {
    Array actualArray{actualEntry};
    Array expectedArray{expectedEntry};

    if (!actualArray.valid() || !expectedArray.valid() || actualArray.length() != 2 || expectedArray.length() != 2) {
      return false;
    }

    inox::Value actualKey = actualArray.get(0);
    inox::Value expectedKey = expectedArray.get(0);

    if (inox::thrown() || !equal(actualKey.raw(), expectedKey.raw())) {
      return false;
    }

    inox::Value actualValue = actualArray.get(1);
    inox::Value expectedValue = expectedArray.get(1);

    return !inox::thrown() && equal(actualValue.raw(), expectedValue.raw());
  }
};

bool deeplyEqual(inox_value actual, inox_value expected) {
  try {
    DeepComparator comparator;
    return comparator.equal(actual, expected);
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return false;
  }
}

void throwAssertion(
  inox::StringView message,
  const inox::Value& actual,
  const inox::Value& expected,
  inox::StringView operation,
  bool generatedMessage
) {
  AssertionErrorValue error(message, actual, expected, operation, generatedMessage);

  if (!inox::thrown()) {
    inox::throw_value(error);
  }
}

void throwGeneratedAssertion(
  const char* message,
  const inox::Value& actual,
  const inox::Value& expected,
  const char* operation
) {
  throwAssertion(inox::StringView(message), actual, expected, inox::StringView(operation), true);
}

} // namespace

void AssertModule::operator()(const inox::Value& value) const {
  ok(value);
}

void AssertModule::operator()(const inox::Value& value, inox::StringView message) const {
  ok(value, message);
}

void AssertModule::ok(const inox::Value& value) const {
  if (!inox_value_truthy(value.raw())) {
    throwGeneratedAssertion(
      "The expression evaluated to a falsy value",
      value,
      inox::Value(inox_bool_value(true)),
      "ok"
    );
  }
}

void AssertModule::ok(const inox::Value& value, inox::StringView message) const {
  if (!inox_value_truthy(value.raw())) {
    throwAssertion(message, value, inox::Value(inox_bool_value(true)), inox::StringView("ok"), false);
  }
}

void AssertModule::strictEqual(const inox::Value& actual, const inox::Value& expected) const {
  if (!sameStrictValue(actual.raw(), expected.raw())) {
    throwGeneratedAssertion("Expected values to be strictly equal", actual, expected, "strictEqual");
  }
}

void AssertModule::strictEqual(
  const inox::Value& actual,
  const inox::Value& expected,
  inox::StringView message
) const {
  if (!sameStrictValue(actual.raw(), expected.raw())) {
    throwAssertion(message, actual, expected, inox::StringView("strictEqual"), false);
  }
}

void AssertModule::notStrictEqual(const inox::Value& actual, const inox::Value& expected) const {
  if (sameStrictValue(actual.raw(), expected.raw())) {
    throwGeneratedAssertion("Expected values to be strictly unequal", actual, expected, "notStrictEqual");
  }
}

void AssertModule::notStrictEqual(
  const inox::Value& actual,
  const inox::Value& expected,
  inox::StringView message
) const {
  if (sameStrictValue(actual.raw(), expected.raw())) {
    throwAssertion(message, actual, expected, inox::StringView("notStrictEqual"), false);
  }
}

void AssertModule::deepStrictEqual(const inox::Value& actual, const inox::Value& expected) const {
  if (!deeplyEqual(actual.raw(), expected.raw()) && !inox::thrown()) {
    throwGeneratedAssertion("Expected values to be deeply strictly equal", actual, expected, "deepStrictEqual");
  }
}

void AssertModule::deepStrictEqual(
  const inox::Value& actual,
  const inox::Value& expected,
  inox::StringView message
) const {
  if (!deeplyEqual(actual.raw(), expected.raw()) && !inox::thrown()) {
    throwAssertion(message, actual, expected, inox::StringView("deepStrictEqual"), false);
  }
}

void AssertModule::notDeepStrictEqual(const inox::Value& actual, const inox::Value& expected) const {
  if (deeplyEqual(actual.raw(), expected.raw()) && !inox::thrown()) {
    throwGeneratedAssertion("Expected values not to be deeply strictly equal", actual, expected, "notDeepStrictEqual");
  }
}

void AssertModule::notDeepStrictEqual(
  const inox::Value& actual,
  const inox::Value& expected,
  inox::StringView message
) const {
  if (deeplyEqual(actual.raw(), expected.raw()) && !inox::thrown()) {
    throwAssertion(message, actual, expected, inox::StringView("notDeepStrictEqual"), false);
  }
}

void AssertModule::fail() const {
  throwGeneratedAssertion("Failed", inox::Value(), inox::Value(), "fail");
}

void AssertModule::fail(inox::StringView message) const {
  throwAssertion(message, inox::Value(), inox::Value(), inox::StringView("fail"), false);
}

void AssertModule::throws(inox::Callback block) const {
  block.call();

  if (inox::thrown()) {
    inox::take_exception();
    return;
  }

  throwGeneratedAssertion("Missing expected exception", inox::Value(), inox::Value(), "throws");
}

void AssertModule::throws(inox::Callback block, inox::StringView message) const {
  block.call();

  if (inox::thrown()) {
    inox::take_exception();
    return;
  }

  throwAssertion(message, inox::Value(), inox::Value(), inox::StringView("throws"), false);
}

void AssertModule::doesNotThrow(inox::Callback block) const {
  block.call();

  if (!inox::thrown()) {
    return;
  }

  inox::Value actual = inox::take_exception();
  throwGeneratedAssertion("Got unwanted exception", actual, inox::Value(), "doesNotThrow");
}

void AssertModule::doesNotThrow(inox::Callback block, inox::StringView message) const {
  block.call();

  if (!inox::thrown()) {
    return;
  }

  inox::Value actual = inox::take_exception();
  throwAssertion(message, actual, inox::Value(), inox::StringView("doesNotThrow"), false);
}

const AssertModule nodeAssert;
