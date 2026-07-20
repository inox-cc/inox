include_guard(GLOBAL)

function(inox_set_compiler_mode_runtime_output output_dir)
  if(NOT INOX_COMPILER_MODE STREQUAL "node" AND NOT INOX_COMPILER_MODE STREQUAL "native")
    message(FATAL_ERROR "INOX_COMPILER_MODE must be node or native.")
  endif()

  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${output_dir}/${INOX_COMPILER_MODE}" PARENT_SCOPE)

  foreach(config DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${config} "${output_dir}/${INOX_COMPILER_MODE}" PARENT_SCOPE)
  endforeach()
endfunction()

function(inox_prepare_compiler_library_native_plan)
  if(INOX_STDLIB_NATIVE_PLAN)
    if(NOT EXISTS "${INOX_STDLIB_NATIVE_PLAN}")
      message(FATAL_ERROR "INOX_STDLIB_NATIVE_PLAN does not exist: ${INOX_STDLIB_NATIVE_PLAN}")
    endif()

    set(INOX_STDLIB_NATIVE_PLAN "${INOX_STDLIB_NATIVE_PLAN}" PARENT_SCOPE)
    return()
  endif()

  if(NOT INOX_REPO_ROOT)
    message(FATAL_ERROR "INOX_REPO_ROOT is required to prepare the compiler library native plan.")
  endif()

  set(INOX_GENERATED_STDLIB_NATIVE_PLAN "${INOX_REPO_ROOT}/dist/compiler-libraries/native-plan.cmake")

  if(INOX_COMPILER_MODE STREQUAL "node")
    if(NOT NODE_EXECUTABLE)
      message(FATAL_ERROR "NODE_EXECUTABLE is required for the Node compiler mode.")
    endif()

    execute_process(
      COMMAND "${NODE_EXECUTABLE}" "${INOX_REPO_ROOT}/scripts/generate-compiler-library-registry.ts"
      WORKING_DIRECTORY "${INOX_REPO_ROOT}"
      RESULT_VARIABLE INOX_COMPILER_LIBRARY_GENERATION_RESULT
      OUTPUT_VARIABLE INOX_COMPILER_LIBRARY_GENERATION_OUTPUT
      ERROR_VARIABLE INOX_COMPILER_LIBRARY_GENERATION_ERROR
    )

    if(NOT INOX_COMPILER_LIBRARY_GENERATION_RESULT EQUAL 0)
      message(FATAL_ERROR
        "Failed to generate the compiler library native plan.\n"
        "${INOX_COMPILER_LIBRARY_GENERATION_OUTPUT}"
        "${INOX_COMPILER_LIBRARY_GENERATION_ERROR}"
      )
    endif()
  elseif(NOT INOX_COMPILER_MODE STREQUAL "native")
    message(FATAL_ERROR "INOX_COMPILER_MODE must be node or native.")
  endif()

  if(NOT EXISTS "${INOX_GENERATED_STDLIB_NATIVE_PLAN}")
    message(FATAL_ERROR
      "Compiler library native plan was not found: ${INOX_GENERATED_STDLIB_NATIVE_PLAN}. "
      "Build the native compiler or use the Node compiler mode to generate it."
    )
  endif()

  set(INOX_STDLIB_NATIVE_PLAN "${INOX_GENERATED_STDLIB_NATIVE_PLAN}" PARENT_SCOPE)
endfunction()
