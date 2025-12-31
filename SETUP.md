# RAG Agent Extension - Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Extension**
   ```bash
   npm run compile
   ```

3. **Run the Extension**
   - Press `F5` in Cursor IDE/VS Code
   - A new Extension Development Host window will open
   - Click the "RAG: Ready" status bar item or run `RAG Agent: Open RAG Agent` command

## Project Structure

```
RAG Agent/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── webview/
│   │   ├── ragPanel.ts       # Webview panel manager
│   │   ├── ragPanel.js       # Webview JavaScript (client-side)
│   │   └── ragPanel.css      # Webview styles
│   └── utils/
│       ├── cacheManager.ts   # Cache management utility
│       └── outputChannel.ts  # Output logging utility
├── media/                    # Webview assets (copied during build)
│   ├── ragPanel.js
│   └── ragPanel.css
├── out/                      # Compiled TypeScript (generated)
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
└── README.md                 # Documentation
```

## Development Workflow

### Building

```bash
# Compile TypeScript and copy media files
npm run compile

# Watch mode (auto-compile on changes)
npm run watch
```

### Testing

1. Open the project in Cursor IDE/VS Code
2. Press `F5` to launch Extension Development Host
3. Test the extension in the new window
4. Check the Debug Console for logs

### Debugging

- Extension logs appear in the Debug Console
- Webview logs appear in the browser DevTools (right-click webview → Inspect)
- Output channel: Run `RAG Agent: Show Output` command

## Configuration

Configure the extension in Settings (`File > Preferences > Settings`):

- Search for "RAG Agent"
- Set your OpenAI API key
- Adjust cache settings, model selection, etc.

## Features Implemented

✅ Status bar integration  
✅ Webview panel with header  
✅ Chat interface with message bubbles  
✅ Input field with Submit/Clear Chat buttons  
✅ Example questions  
✅ Cache statistics display  
✅ Cache management controls  
✅ Security & Performance Features accordion  
✅ Email functionality UI  
✅ Copy response functionality  
✅ Theme adaptation (light/dark)  
✅ Command palette integration  
✅ Settings UI  

## Backend Integration

**Current Status**: The extension includes a simulated RAG backend for UI testing. The actual RAG processing will be implemented separately.

**To Integrate Backend**:
1. Update `src/webview/ragPanel.ts` → `handleQuery()` method
2. Implement document ingestion, embedding, vector search
3. Integrate with LLM API (OpenAI, etc.)
4. Connect to vector database (ChromaDB, etc.)

## Troubleshooting

### Extension doesn't activate
- Check Debug Console for errors
- Verify `package.json` activation events
- Ensure all dependencies are installed

### Webview doesn't load
- Check that media files are copied to `media/` directory
- Verify webview HTML references correct paths
- Check browser console (right-click webview → Inspect)

### Cache not working
- Check Output channel for cache logs
- Verify cache configuration in Settings
- Check `cacheManager.ts` implementation

## Next Steps

1. Implement actual RAG backend processing
2. Add document ingestion pipeline
3. Integrate vector database
4. Connect to LLM API
5. Add error handling and retry logic
6. Implement email sending functionality

