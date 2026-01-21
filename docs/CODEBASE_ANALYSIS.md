# Codebase Analysis Feature

## Overview

The Codebase Analysis feature enables comprehensive indexing and querying of your entire codebase. It allows you to ask questions about your code and receive guaranteed information through intelligent indexing and retrieval systems.

## Key Features

- **Comprehensive Codebase Indexing**: Deep indexing of codebase structure including functions, classes, interfaces, imports, exports, and documentation
- **Guaranteed Information Retrieval**: Multi-level fallback system ensuring you always receive information
- **Intelligent Query Detection**: Automatic detection of codebase-related questions
- **Automatic Indexing**: Codebase is automatically indexed when the extension activates
- **Incremental Updates**: File watcher automatically updates index when files change
- **Comprehensive Analysis**: Deep analysis of codebase structure, dependencies, architecture, complexity, and patterns

## How It Works

### Automatic Indexing

When you open the RAG Agent panel, the extension automatically indexes your codebase:

1. Scans workspace for code files (TypeScript, JavaScript, Python, Java, Go, Rust, C++, C, C#)
2. Extracts code structure (functions, classes, interfaces, etc.)
3. Creates indexed documents stored in memory
4. Index is refreshed if older than 1 hour

### Query Processing

When you ask a question:

1. **Query Detection**: System detects if your question is about the codebase
2. **Guaranteed Retrieval**: Retrieves relevant codebase documents with multi-level fallbacks
3. **Context Building**: Formats codebase information for the LLM
4. **Response Generation**: LLM generates response using codebase context
5. **Guaranteed Response**: If response is empty, builds response from codebase data

### Fallback System

The system uses a 5-level fallback strategy:

1. **Primary Retrieval**: Query-specific codebase documents (exact matches)
2. **Fallback 1**: Related codebase documents (broader search)
3. **Fallback 2**: File-level summaries
4. **Fallback 3**: Codebase structure overview
5. **Fallback 4**: General codebase overview (always available)

## Query Examples

### Structure Queries
- "What is the structure of extension.ts?"
- "Show me the structure of src/backend"
- "How is ragPanel.ts organized?"

### Function Queries
- "What functions are in extension.ts?"
- "How does handleQuery work?"
- "Show me function handleQuery"
- "What does indexEntireCodebase do?"

### Class Queries
- "What classes are in ragPanel.ts?"
- "Explain class RAGPanel"
- "Show me class ComprehensiveCodebaseIndexer"

### File Queries
- "Show me extension.ts"
- "What is in src/backend/retriever.ts?"
- "Analyze src/webview/ragPanel.ts"

### Dependency Queries
- "What dependencies does extension.ts have?"
- "What imports handleQuery?"
- "Where is ExternalMemory used?"

### Usage Queries
- "Where is handleQuery used?"
- "What uses ComprehensiveCodebaseIndexer?"
- "Show me usages of indexEntireCodebase"

## Configuration

### Settings

All settings are in VS Code settings under `ragAgent`:

- **`ragAgent.codebaseAutoIndex`** (boolean, default: `true`)
  - Automatically index codebase when extension activates

- **`ragAgent.codebaseIndexMaxFiles`** (number, default: `1000`)
  - Maximum number of files to index

- **`ragAgent.codebaseIndexMaxSizeBytes`** (number, default: `2000000`)
  - Maximum file size in bytes to index (2MB default)

- **`ragAgent.codebaseIndexLanguages`** (array, default: `["typescript", "javascript", "python", "java", "go", "rust", "cpp", "c", "csharp"]`)
  - File extensions to index

- **`ragAgent.codebaseIndexDepth`** (string, enum: `"shallow" | "medium" | "deep"`, default: `"deep"`)
  - Indexing depth:
    - `shallow`: Files only
    - `medium`: Files + functions
    - `deep`: Files + functions + classes + interfaces + chunks

- **`ragAgent.codebaseGuaranteedInfo`** (boolean, default: `true`)
  - Always return codebase information (use fallbacks if needed)

## Commands

### Index Entire Codebase
- **Command**: `rag.indexCodebase`
- **Description**: Manually trigger comprehensive codebase indexing
- **Usage**: Command Palette → "RAG Agent: Index Entire Codebase"

### Comprehensive Codebase Analysis
- **Command**: `rag.analyzeCodebaseComprehensive`
- **Description**: Run comprehensive analysis of codebase structure, dependencies, architecture, complexity, and patterns
- **Usage**: Command Palette → "RAG Agent: Comprehensive Codebase Analysis"

## File Watcher

The extension automatically watches for file changes:

- **On File Change**: Re-indexes file after 3 seconds of inactivity (debounced)
- **On File Create**: Immediately indexes new files
- **On File Delete**: Removes indexed documents for deleted files

## Guaranteed Information System

The system **guarantees** that you always receive information:

1. **Never Returns Empty**: If specific query fails, uses fallbacks
2. **Always Provides Context**: Even if exact match not found, provides related information
3. **Codebase Overview**: Ultimate fallback provides codebase statistics and structure

## Performance Considerations

- **Indexing**: Initial indexing may take time for large codebases (limited to 1000 files by default)
- **File Size**: Files larger than 2MB are skipped
- **Incremental Updates**: Only changed files are re-indexed
- **Caching**: Indexed documents are cached for performance

## Troubleshooting

### Indexing Not Working
- Check that `ragAgent.codebaseAutoIndex` is enabled
- Check output channel for error messages
- Try manual indexing: Command Palette → "RAG Agent: Index Entire Codebase"

### No Results for Queries
- Ensure codebase has been indexed (check output channel)
- Try more specific queries (file names, function names)
- Check that file extensions are in `ragAgent.codebaseIndexLanguages`

### Performance Issues
- Reduce `ragAgent.codebaseIndexMaxFiles`
- Set `ragAgent.codebaseIndexDepth` to `"shallow"` or `"medium"`
- Disable auto-indexing and use manual indexing

## Architecture

### Components

1. **ComprehensiveCodebaseIndexer**: Indexes codebase files and extracts structure
2. **GuaranteedCodebaseRetriever**: Retrieves codebase documents with fallbacks
3. **CodebaseQueryRouter**: Detects and routes codebase queries
4. **CodebaseAnalyzer**: Performs comprehensive codebase analysis

### Integration

The feature integrates seamlessly with the existing RAG pipeline:

- Codebase queries are detected automatically
- Codebase documents are merged with regular internal documents
- Context builder prioritizes codebase information
- Guaranteed response system ensures information is always provided

## Best Practices

1. **Use Specific Queries**: More specific queries yield better results
   - Good: "What functions are in extension.ts?"
   - Less specific: "Tell me about extension.ts"

2. **File Names**: Include file extensions for better matching
   - Good: "Show me ragPanel.ts"
   - Less specific: "Show me ragPanel"

3. **Function/Class Names**: Use exact names when possible
   - Good: "How does handleQuery work?"
   - Less specific: "How does query handling work?"

4. **Indexing Depth**: Use `deep` for comprehensive queries, `shallow` for performance

## Limitations

- **Language Support**: Currently supports TypeScript, JavaScript, Python, Java, Go, Rust, C++, C, C#
- **File Size**: Files larger than 2MB are skipped
- **File Count**: Limited to 1000 files by default
- **In-Memory Storage**: Indexed documents are stored in memory (not persisted)

## Future Enhancements

- Vector database integration for better semantic search
- Persistent index storage
- Support for more languages
- Advanced code analysis (call graphs, dependency graphs)
- Code refactoring suggestions

