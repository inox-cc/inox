include_guard(GLOBAL)

set(INOX_CMAKE_MODULE_DIR "${CMAKE_CURRENT_LIST_DIR}")
get_filename_component(INOX_DEFAULT_TOOLCHAIN_ROOT "${INOX_CMAKE_MODULE_DIR}/.." ABSOLUTE)

function(inox_json_array output json key)
  string(JSON INOX_JSON_ARRAY_LENGTH LENGTH "${json}" "${key}")
  set(INOX_JSON_ARRAY_VALUES)

  if(INOX_JSON_ARRAY_LENGTH GREATER 0)
    math(EXPR INOX_JSON_ARRAY_LAST "${INOX_JSON_ARRAY_LENGTH} - 1")

    foreach(INOX_JSON_ARRAY_INDEX RANGE 0 ${INOX_JSON_ARRAY_LAST})
      string(JSON INOX_JSON_ARRAY_VALUE GET "${json}" "${key}" ${INOX_JSON_ARRAY_INDEX})
      list(APPEND INOX_JSON_ARRAY_VALUES "${INOX_JSON_ARRAY_VALUE}")
    endforeach()
  endif()

  set(${output} "${INOX_JSON_ARRAY_VALUES}" PARENT_SCOPE)
endfunction()

function(inox_default_compiler_command output dependency_output toolchain_root)
  if(INOX_COMPILER_COMMAND)
    set(${output} "${INOX_COMPILER_COMMAND}" PARENT_SCOPE)
    set(${dependency_output} "${INOX_COMPILER_DEPENDS}" PARENT_SCOPE)
    return()
  endif()

  if(EXISTS "${toolchain_root}/dist/inox")
    set(${output} "${toolchain_root}/dist/inox" PARENT_SCOPE)
    set(${dependency_output} "${toolchain_root}/dist/inox" PARENT_SCOPE)
    return()
  endif()

  find_program(INOX_NODE_EXECUTABLE node REQUIRED)

  if(NOT EXISTS "${toolchain_root}/compiler/index.ts")
    message(FATAL_ERROR "Inox compiler was not found under ${toolchain_root}.")
  endif()

  set(${output} "${INOX_NODE_EXECUTABLE};${toolchain_root}/compiler/index.ts" PARENT_SCOPE)
  set(${dependency_output} "${toolchain_root}/compiler/index.ts" PARENT_SCOPE)
endfunction()

function(inox_add_executable target)
  set(INOX_OPTIONS)
  set(INOX_ONE_VALUE_ARGS ENTRY GENERATED_DIR MANIFEST ROOT)
  set(INOX_MULTI_VALUE_ARGS COMPILER_COMMAND COMPILER_DEPENDS COMPILER_OPTIONS)
  cmake_parse_arguments(INOX "${INOX_OPTIONS}" "${INOX_ONE_VALUE_ARGS}" "${INOX_MULTI_VALUE_ARGS}" ${ARGN})

  if(NOT INOX_ENTRY)
    message(FATAL_ERROR "inox_add_executable(${target}) requires ENTRY.")
  endif()

  if(INOX_UNPARSED_ARGUMENTS)
    message(FATAL_ERROR "Unknown inox_add_executable arguments: ${INOX_UNPARSED_ARGUMENTS}")
  endif()

  if(INOX_ROOT)
    get_filename_component(INOX_TARGET_TOOLCHAIN_ROOT "${INOX_ROOT}" ABSOLUTE BASE_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
  elseif(DEFINED INOX_TOOLCHAIN_ROOT AND NOT INOX_TOOLCHAIN_ROOT STREQUAL "")
    get_filename_component(INOX_TARGET_TOOLCHAIN_ROOT "${INOX_TOOLCHAIN_ROOT}" ABSOLUTE BASE_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
  else()
    set(INOX_TARGET_TOOLCHAIN_ROOT "${INOX_DEFAULT_TOOLCHAIN_ROOT}")
  endif()

  if(INOX_GENERATED_DIR)
    get_filename_component(INOX_TARGET_GENERATED_DIR "${INOX_GENERATED_DIR}" ABSOLUTE BASE_DIR "${CMAKE_CURRENT_BINARY_DIR}")
  else()
    set(INOX_TARGET_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/inox/${target}/generated")
  endif()

  if(INOX_MANIFEST)
    get_filename_component(INOX_TARGET_MANIFEST "${INOX_MANIFEST}" ABSOLUTE BASE_DIR "${CMAKE_CURRENT_BINARY_DIR}")
  else()
    set(INOX_TARGET_MANIFEST "${CMAKE_CURRENT_BINARY_DIR}/inox/${target}/build-manifest.json")
  endif()

  if(INOX_COMPILER_COMMAND)
    set(INOX_TARGET_COMPILER_COMMAND ${INOX_COMPILER_COMMAND})
    set(INOX_TARGET_COMPILER_DEPENDS ${INOX_COMPILER_DEPENDS})
  else()
    inox_default_compiler_command(
      INOX_TARGET_COMPILER_COMMAND
      INOX_TARGET_COMPILER_DEPENDS
      "${INOX_TARGET_TOOLCHAIN_ROOT}"
    )
  endif()

  set(INOX_TARGET_COMPILER_OPTIONS ${INOX_COMPILER_OPTIONS})

  if(DEFINED INOX_LOOP_BACKEND AND NOT INOX_LOOP_BACKEND STREQUAL "")
    list(APPEND INOX_TARGET_COMPILER_OPTIONS "--loop-backend" "${INOX_LOOP_BACKEND}")
  endif()

  if(DEFINED INOX_TLS_BACKEND AND NOT INOX_TLS_BACKEND STREQUAL "")
    list(APPEND INOX_TARGET_COMPILER_OPTIONS "--tls-backend" "${INOX_TLS_BACKEND}")
  endif()

  set(INOX_TARGET_COMPILER_ARGS
    "${INOX_ENTRY}"
    --emit cc
    --out-dir "${INOX_TARGET_GENERATED_DIR}"
    --entry
    --build-manifest "${INOX_TARGET_MANIFEST}"
    ${INOX_TARGET_COMPILER_OPTIONS}
  )

  file(MAKE_DIRECTORY "${INOX_TARGET_GENERATED_DIR}")
  get_filename_component(INOX_TARGET_MANIFEST_DIR "${INOX_TARGET_MANIFEST}" DIRECTORY)
  file(MAKE_DIRECTORY "${INOX_TARGET_MANIFEST_DIR}")

  execute_process(
    COMMAND ${INOX_TARGET_COMPILER_COMMAND} ${INOX_TARGET_COMPILER_ARGS}
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    RESULT_VARIABLE INOX_TARGET_CODEGEN_RESULT
    OUTPUT_VARIABLE INOX_TARGET_CODEGEN_OUTPUT
    ERROR_VARIABLE INOX_TARGET_CODEGEN_ERROR
  )

  if(NOT INOX_TARGET_CODEGEN_RESULT EQUAL 0)
    message(FATAL_ERROR
      "Inox code generation failed for ${target}.\n"
      "${INOX_TARGET_CODEGEN_OUTPUT}${INOX_TARGET_CODEGEN_ERROR}"
    )
  endif()

  file(READ "${INOX_TARGET_MANIFEST}" INOX_TARGET_BUILD_MANIFEST)
  string(JSON INOX_TARGET_MANIFEST_VERSION GET "${INOX_TARGET_BUILD_MANIFEST}" version)

  if(NOT INOX_TARGET_MANIFEST_VERSION EQUAL 1)
    message(FATAL_ERROR "Unsupported Inox build manifest version ${INOX_TARGET_MANIFEST_VERSION}.")
  endif()

  inox_json_array(INOX_TARGET_INPUT_FILES "${INOX_TARGET_BUILD_MANIFEST}" inputFiles)
  inox_json_array(INOX_TARGET_SOURCE_FILES "${INOX_TARGET_BUILD_MANIFEST}" sourceFiles)
  inox_json_array(INOX_TARGET_HEADER_FILES "${INOX_TARGET_BUILD_MANIFEST}" headerFiles)
  inox_json_array(INOX_TARGET_DECLARATION_FILES "${INOX_TARGET_BUILD_MANIFEST}" declarationFiles)

  if(NOT INOX_TARGET_SOURCE_FILES)
    message(FATAL_ERROR "Inox compiler produced no C++ sources for ${target}.")
  endif()

  set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${INOX_TARGET_INPUT_FILES})

  add_custom_command(
    OUTPUT ${INOX_TARGET_SOURCE_FILES}
    BYPRODUCTS
      ${INOX_TARGET_HEADER_FILES}
      ${INOX_TARGET_DECLARATION_FILES}
      "${INOX_TARGET_MANIFEST}"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${INOX_TARGET_GENERATED_DIR}"
    COMMAND ${INOX_TARGET_COMPILER_COMMAND} ${INOX_TARGET_COMPILER_ARGS}
    DEPENDS ${INOX_TARGET_INPUT_FILES} ${INOX_TARGET_COMPILER_DEPENDS}
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    VERBATIM
  )

  if(NOT TARGET inox_runtime)
    if(NOT INOX_STDLIB_NATIVE_PLAN)
      set(INOX_STDLIB_NATIVE_PLAN "${INOX_TARGET_TOOLCHAIN_ROOT}/dist/compiler-libraries/native-plan.cmake")
    endif()

    if(NOT EXISTS "${INOX_STDLIB_NATIVE_PLAN}")
      message(FATAL_ERROR "Inox native library plan was not found: ${INOX_STDLIB_NATIVE_PLAN}")
    endif()

    add_subdirectory(
      "${INOX_TARGET_TOOLCHAIN_ROOT}/runtime"
      "${CMAKE_CURRENT_BINARY_DIR}/inox/runtime"
    )
  endif()

  add_executable(${target} ${INOX_TARGET_SOURCE_FILES})
  target_include_directories(${target} PRIVATE "${INOX_TARGET_GENERATED_DIR}")
  target_link_libraries(${target} PRIVATE inox_runtime)
  set_property(TARGET ${target} PROPERTY LINKER_LANGUAGE CXX)

  set_property(TARGET ${target} PROPERTY INOX_ENTRY "${INOX_ENTRY}")
  set_property(TARGET ${target} PROPERTY INOX_GENERATED_DIR "${INOX_TARGET_GENERATED_DIR}")
  set_property(TARGET ${target} PROPERTY INOX_BUILD_MANIFEST "${INOX_TARGET_MANIFEST}")
endfunction()
