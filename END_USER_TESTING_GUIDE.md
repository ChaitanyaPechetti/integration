# End User Testing Guide: Integration Verification

## 📋 Prerequisites

**Required:**
- VS Code installed
- Rag-Experiements extension installed
- ai-log-helper-gui project (for source code sharing)
- Python 3.7+ installed
- Ollama server running (for LLM functionality)

**Optional:**
- Sample log files for testing Log Helper functions

---

## 🧪 Step-by-Step Testing Guide

### Phase 1: Configuration Setup

#### Step 1.1: Configure Log Helper Source Path (Optional but Recommended)

**Method A: VS Code Settings UI**
1. Open VS Code
2. Press `Ctrl+,` (Windows/Linux) or `Cmd+,` (Mac) to open Settings
3. Search for: `ragAgent.logHelperSourcePath`
4. Enter the path to ai-log-helper-gui src folder:
   ```
   C:\Users\user\Desktop\ai-log-helper-gui\src
   ```
   Or on Unix systems:
   ```
   /path/to/ai-log-helper-gui/src
   ```
5. Click OK
6. **Do not reload VS Code yet**

**Method B: Environment Variable (Alternative)**
```bash
# Windows Command Prompt
set LOG_HELPER_SOURCE_PATH=C:\Users\user\Desktop\ai-log-helper-gui\src

# Windows PowerShell
$env:LOG_HELPER_SOURCE_PATH="C:\Users\user\Desktop\ai-log-helper-gui\src"

# Linux/Mac
export LOG_HELPER_SOURCE_PATH=/path/to/ai-log-helper-gui/src
```

**Method C: Auto-Detection (Default)**
- Place ai-log-helper-gui at: `../ai-log-helper-gui/src` relative to Rag-Experiements
- No configuration needed

#### Step 1.2: Enable Log Helper Feature

1. In VS Code Settings, search for: `ragAgent.logHelperEnabled`
2. Set value to: `true`
3. Verify `ragAgent.logHelperUrl` is set to: `http://localhost:8001`
4. Optionally enable auto-start: `ragAgent.zerouiAutoStartServers` to `true`

#### Step 1.3: Reload VS Code

1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: `Developer: Reload Window`
3. Press Enter
4. Wait for VS Code to reload

---

### Phase 2: Server Startup Verification

#### Step 2.1: Check FastAPI Server Auto-Start

**If `ragAgent.zerouiAutoStartServers` is `true`:**
1. Open VS Code Output panel: `View → Output`
2. Select "Zeroui AI Agent" from dropdown
3. Look for:
   ```
   ✓ FastAPI server started successfully
   [Log Helper] Using source path: <path>
   ```

**Expected Messages:**
- `[Log Helper] Using configured source path: C:\Users\user\Desktop\ai-log-helper-gui\src`
- OR `[Log Helper] Using source path: <path>` (from FastAPI server)

#### Step 2.2: Manual Server Start (If Auto-Start Disabled)

1. Open terminal/command prompt
2. Navigate to Rag-Experiements folder:
   ```bash
   cd /path/to/Rag-Experiements
   ```
3. Start FastAPI server:
   ```bash
   python fastapi_server.py
   ```
4. Verify server starts without errors
5. Look for log message:
   ```
   [Log Helper] Using source path: <path>
   ```

#### Step 2.3: Verify Server Health

1. Open browser
2. Navigate to: `http://localhost:8001/api/health`
3. Should return:
   ```json
   {"status":"ready","ollama_endpoint":"http://localhost:11434","responses_endpoint":"/api/chat"}
   ```

---

### Phase 3: VS Code Extension UI Testing

#### Step 3.1: Open RAG Agent Panel

1. In VS Code, press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: `RAG Agent`
3. Select: `RAG Agent: Open RAG Agent`
4. Panel should open on right side

**Expected:** Webview panel opens with chat interface and Log Helper section

#### Step 3.2: Verify Log Helper Section Visibility

**Check that Log Helper section appears:**
```
Log analysis
[Select log files] (0 file(s) selected)
[Run Pattern Agent] [Show User Actions]
[Enter error message for MMM...] [Run MMM]
[Output area - empty]
```

**If section doesn't appear:**
1. Check `ragAgent.logHelperEnabled` is `true`
2. Reload VS Code window
3. Verify FastAPI server is running

---

### Phase 4: Log Helper Functionality Testing

#### Test 4.1: Pattern Agent

1. In Log Helper section, click **"Select log files"**
2. Choose one or more log files (.log or .txt)
3. Verify file count updates: "(X file(s) selected)"
4. Click **"Run Pattern Agent"**
5. Wait for processing (button shows "Running..." then re-enables)
6. Check output area for results

**Expected Output Format:**
```
🤖 AI PATTERN AGENT ANALYSIS
==================================================
📁 Files: 1 file(s) analyzed
📊 Transactions: X found
🔍 Top Keywords: error(X) warn(Y) ...

📋 PATTERNS
  • [Error pattern descriptions]

🔍 ROOT CAUSES
  • [Root cause analysis]

⚠️ HIGH-RISK TRANSACTIONS
  • [High-risk transaction analysis]

🎯 NEXT ACTIONS
  • [Recommended actions]
```

#### Test 4.2: User Actions

1. Ensure log files are selected (from previous step)
2. Click **"Show User Actions"**
3. Wait for processing
4. Check output area

**Expected Output Format:**
```
User Actions by Transaction (last tail)
----------------------------------------
Transaction: [transaction_id]
  [action lines...]
```

#### Test 4.3: MMM (Mirror/Mentor/Multiplier)

1. In MMM input field, enter an error message:
   ```
   Payment processing failed with error code PAY_001
   ```
2. Click **"Run MMM"**
3. Wait for processing
4. Check output area

**Expected Output Format:**
```
=== MMM — Mirror / Mentor / Multiplier ===

Mirror: [What the error reflects]
Mentor: [Guidance on fixing]
Multiplier: [Prevention strategies]
```

---

### Phase 5: Error Analysis (RCA) Testing

#### Test 5.1: Query-Based Error Analysis

1. In main chat area (top of panel), type:
   ```
   What errors are in my repo?
   ```
2. Press Enter or click send
3. Wait for analysis
4. Check for response

**Expected Response:**
- If no errors: "✅ No errors found in your codebase!"
- If errors found: Structured analysis with root causes and solutions

#### Test 5.2: Specific Error Query

1. Type: `Analyze errors in my codebase`
2. Send query
3. Verify error collection and analysis

#### Test 5.3: Automatic Error Detection

1. Create or modify a file with syntax errors
2. Save the file
3. Wait a few seconds
4. Check if error notification appears

---

### Phase 6: RAG Query Testing

#### Test 6.1: Basic RAG Query

1. In chat area, type a question:
   ```
   What is the capital of France?
   ```
2. Send query
3. Verify response with sources

**Expected:** Response with answer and source links

#### Test 6.2: Cached Response

1. Send same query again
2. Check for "(cached)" indicator
3. Verify faster response

---

### Phase 7: Email Functionality Testing

#### Test 7.1: Email Setup

1. Scroll to bottom of panel
2. Fill Subject and Body fields
3. Click **"Send Email"**
4. Check for success/error message

---

### Phase 8: Advanced Verification

#### Test 8.1: Path Resolution Verification

1. Open VS Code Output panel
2. Select "Zeroui AI Agent"
3. Look for path resolution messages:
   ```
   [Log Helper] Using configured source path: C:\Users\user\Desktop\ai-log-helper-gui\src
   ```
   OR
   ```
   [Log Helper] Using source path: <path>
   ```

#### Test 8.2: API Endpoint Testing

**Test Pattern Agent API:**
```bash
curl -X POST "http://localhost:8001/api/log-helper/pattern-agent" \
  -H "Content-Type: application/json" \
  -d '{"log_files": ["/path/to/test.log"]}'
```

**Test MMM API:**
```bash
curl -X POST "http://localhost:8001/api/log-helper/mmm" \
  -H "Content-Type: application/json" \
  -d '{"last_error": "Test error", "persona": "developer"}'
```

**Test User Actions API:**
```bash
curl -X POST "http://localhost:8001/api/log-helper/user-actions" \
  -H "Content-Type: application/json" \
  -d '{"log_files": ["/path/to/test.log"]}'
```

---

## ✅ Success Criteria Checklist

### Configuration
- [ ] VS Code setting `ragAgent.logHelperSourcePath` configured
- [ ] `ragAgent.logHelperEnabled` set to `true`
- [ ] FastAPI server starts with path resolution message

### UI Functionality
- [ ] RAG Agent panel opens
- [ ] Log Helper section visible
- [ ] All buttons present (Select files, Run Pattern Agent, Show User Actions, Run MMM)

### Log Helper Features
- [ ] Pattern Agent analyzes files and shows structured output
- [ ] User Actions displays transaction-based actions
- [ ] MMM shows Mirror/Mentor/Multiplier for error message
- [ ] File selection works
- [ ] Output area shows results

### RAG Features
- [ ] Basic queries work with sources
- [ ] Cached responses indicated
- [ ] Error analysis queries work

### Error Analysis
- [ ] "What errors are in my repo?" collects and analyzes errors
- [ ] Provides root cause analysis and solutions
- [ ] Handles no-errors scenario

### Integration
- [ ] Path resolution works (configured or auto-detected)
- [ ] No duplicate code (uses ai-log-helper-gui source)
- [ ] Both projects remain functional independently

---

## 🚨 Troubleshooting

### Issue: Log Helper section not visible

**Check:**
1. `ragAgent.logHelperEnabled` is `true`
2. FastAPI server is running
3. Reload VS Code window

### Issue: "Log Helper is disabled" message

**Check:**
1. `ragAgent.logHelperEnabled` setting
2. `ragAgent.logHelperUrl` setting
3. FastAPI server running on correct port

### Issue: Pattern Agent returns error

**Check:**
1. Log files selected
2. Files exist and are readable
3. Ollama server running (for LLM analysis)
4. Check Output panel for detailed errors

### Issue: No path resolution message

**Check:**
1. VS Code setting configured
2. Path exists and contains `analyzer.py`
3. FastAPI server logs in Output panel
4. Try environment variable instead

### Issue: FastAPI server won't start

**Check:**
1. Python installed: `python --version`
2. Dependencies installed: `pip install -r requirements.txt`
3. Port 8001 available
4. Path to Rag-Experiements correct

---

## 📊 Expected Results Summary

### Working Integration Indicators

**VS Code Output Panel:**
```
✓ FastAPI server started successfully
[Log Helper] Using configured source path: C:\Users\user\Desktop\ai-log-helper-gui\src
```

**FastAPI Server Console:**
```
[Log Helper] Using source path: C:\Users\user\Desktop\ai-log-helper-gui\src
INFO:     Uvicorn running on http://127.0.0.1:8001
```

**RAG Agent Panel:**
- ✅ Chat interface works
- ✅ Log Helper section with all buttons
- ✅ Pattern Agent produces structured analysis
- ✅ User Actions shows transaction data
- ✅ MMM provides Mirror/Mentor/Multiplier
- ✅ Error queries trigger analysis

### Path Resolution Working

**Priority order confirmed:**
1. ✅ Environment variable (if set)
2. ✅ VS Code setting (now implemented)
3. ✅ Auto-detection (`../ai-log-helper-gui/src`)
4. ✅ Fallback (`python/` folder)

---

## 🎯 Final Verification

**Complete Integration Test:**

1. **Configure:** Set `ragAgent.logHelperSourcePath`
2. **Enable:** Set `ragAgent.logHelperEnabled` to `true`
3. **Start:** FastAPI server (auto or manual)
4. **Open:** RAG Agent panel in VS Code
5. **Test:** All 3 Log Helper functions
6. **Test:** Error analysis queries
7. **Test:** Basic RAG queries
8. **Verify:** All functionality works in one unified UI

**Result:** If all tests pass, integration is complete and working.

---

**Testing Status: Ready for End User Verification**
