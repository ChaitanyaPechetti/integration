# Root Cause Analysis (RCA) Feature Documentation

## Overview

The Root Cause Analysis (RCA) feature is an automated system that detects code errors in real-time and provides intelligent analysis to help developers understand and fix issues quickly. The feature is integrated into the RAG Agent extension and works seamlessly with the codebase monitoring system.

## Architecture

The RCA system consists of several components:

### 1. Error Detection (`src/backend/rca/errorDetector.ts`)
- Monitors code files for syntax errors, type errors, and linting issues
- Integrates with VS Code's diagnostic system
- Supports multiple languages: TypeScript, JavaScript, JSON, Python

### 2. RCA Context Builder (`src/backend/rca/rcaContextBuilder.ts`)
- Builds comprehensive context for error analysis
- Includes:
  - Error details (message, location, severity)
  - Surrounding code context
  - Related file information
  - Codebase structure analysis

### 3. Repository Analyzer (`src/backend/rca/repoAnalyzer.ts`)
- Analyzes workspace structure
- Identifies file relationships
- Provides codebase-wide insights

## How It Works

### Automatic Error Detection

1. **File Monitoring**: The extension continuously monitors open files and workspace changes
2. **Real-time Validation**: Files are validated on:
   - Save events
   - Open events
   - Change events (with debouncing)
   - File system changes (create, delete, rename)

3. **Error Detection**: Uses language-specific validators:
   - **TypeScript/JavaScript**: TypeScript compiler diagnostics
   - **JSON**: JSON parser validation
   - **Python**: `py_compile` module

### Auto-RCA Trigger

When errors are detected:

1. **Error Collection**: All errors for a file are collected
2. **Auto-RCA Request**: An `autoRcaRequest` message is sent to the RAG Panel
3. **Context Building**: The RCA context builder creates a comprehensive error report
4. **Analysis**: The RAG agent analyzes the error using:
   - Error message and location
   - Code context
   - Similar patterns in codebase
   - Best practices

### Manual RCA

Users can also trigger RCA manually:

1. Click on an error in the Problems panel
2. Use the "Analyze Error" command
3. Or use the `rag.analyzeCodebase` command for full codebase analysis

## Features

### 1. Real-time Error Monitoring

- **Debouncing**: Validation is debounced (500ms) to avoid excessive checks
- **Throttling**: Same file validation is throttled (200ms) to prevent duplicate work
- **Deduplication**: Duplicate lint updates are filtered (2-second window)

### 2. Comprehensive Error Context

The RCA system provides:

- **Error Details**:
  - Error message
  - File path and line number
  - Character position
  - Severity (Error, Warning, Info)

- **Code Context**:
  - Surrounding code (before and after error)
  - Function/class context
  - Import statements
  - Related files

- **Codebase Analysis**:
  - Similar error patterns
  - Common fixes
  - Best practices

### 3. Intelligent Analysis

The RAG agent uses the error context to:

- Identify root causes
- Suggest specific fixes
- Provide code examples
- Explain why the error occurred
- Suggest prevention strategies

## Configuration

### Settings

The RCA feature uses the following configuration options:

```json
{
  "ragAgent.zerouiContextMaxFiles": 10,  // Max files to include in context
  "ragAgent.zerouiAutoStartServers": false  // Auto-start backend servers
}
```

### Validation Settings

- **Debounce Time**: 500ms (configurable in code)
- **Throttle Time**: 200ms (configurable in code)
- **Deduplication Window**: 2000ms (configurable in code)

## Usage Examples

### Example 1: TypeScript Type Error

**Error Detected:**
```
src/utils/api.ts:23:5 - Type 'string' is not assignable to type 'number'
```

**RCA Analysis:**
The RCA system will:
1. Extract the error location and context
2. Analyze the surrounding code
3. Identify the type mismatch
4. Suggest a fix (e.g., type conversion or correct variable usage)

### Example 2: JSON Syntax Error

**Error Detected:**
```
package.json:15:3 - Expected ',' or '}'
```

**RCA Analysis:**
The RCA system will:
1. Identify the JSON syntax issue
2. Show the problematic line
3. Suggest the correct JSON structure

### Example 3: Python Syntax Error

**Error Detected:**
```
main.py:10:1 - invalid syntax
```

**RCA Analysis:**
The RCA system will:
1. Identify the syntax error
2. Analyze the Python code structure
3. Suggest the correct syntax

## Integration with RAG Pipeline

The RCA feature integrates seamlessly with the RAG pipeline:

1. **Error Detection** → Input to RAG
2. **Context Building** → Retrieval phase
3. **Analysis** → Generation phase
4. **Response** → Output with formatted RCA template

### RCA Response Template

RCA responses use a special template that includes:

- **Error Summary**: Brief description of the issue
- **Root Cause**: Analysis of why the error occurred
- **Suggested Fix**: Step-by-step solution
- **Code Example**: Corrected code snippet
- **Prevention**: Tips to avoid similar errors

## Limitations

1. **Language Support**: Currently supports TypeScript, JavaScript, JSON, and Python
2. **Context Size**: Limited by `zerouiContextMaxFiles` setting
3. **Performance**: Large codebases may experience slight delays
4. **Network Dependency**: Requires FastAPI backend and Ollama to be running

## Future Enhancements

- [ ] Support for more languages (Java, Go, Rust, etc.)
- [ ] Multi-file error correlation
- [ ] Error pattern learning
- [ ] Automatic fix suggestions with code actions
- [ ] Integration with code formatters and linters
- [ ] Historical error tracking

## Troubleshooting

### RCA Not Triggering

1. Check that the extension is activated
2. Verify files are being monitored (check Output channel)
3. Ensure errors are being detected (check Problems panel)
4. Verify backend servers are running

### Slow RCA Responses

1. Reduce `zerouiContextMaxFiles` setting
2. Check network connectivity to FastAPI server
3. Verify Ollama model is loaded
4. Check for large codebase files

### Inaccurate Analysis

1. Ensure error context is complete
2. Check that related files are accessible
3. Verify codebase structure is correct
4. Report issues with specific error patterns

## API Reference

### Auto-RCA Message Format

```typescript
{
  type: 'autoRcaRequest',
  file: string,
  errorMessage: string,
  errors: number,
  issues: Array<{
    message: string,
    severity: number,
    range: {
      start: { line: number, character: number },
      end: { line: number, character: number }
    }
  }>,
  timestamp: number
}
```

### RCA Response Format

```typescript
{
  type: 'response',
  response: string,  // Formatted RCA analysis
  cached: boolean,
  sources: Array<{
    type: 'internal' | 'web',
    title: string,
    url?: string
  }>
}
```

## Contributing

When adding new language support or improving RCA:

1. Add language-specific validator in `src/extension.ts`
2. Update error detection logic
3. Enhance context builder for new language patterns
4. Add tests in `tests/integration/`
5. Update this documentation

