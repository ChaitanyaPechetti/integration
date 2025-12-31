from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
import json
import os
import re

app = FastAPI(title="Zeroui AI Agent FastAPI Server")

# CORS middleware to allow VS Code extension to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Ollama configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
# FastAPI port configuration (default 8001 to avoid conflicts)
FASTAPI_PORT = int(os.getenv("FASTAPI_PORT", "8001"))

class Message(BaseModel):
    role: str  # 'user', 'assistant', or 'system'
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: List[Message]
    stream: bool = True

class InputValidationRequest(BaseModel):
    message: str
    max_length: Optional[int] = 10000

class PreloadRequest(BaseModel):
    model_name: Optional[str] = None

def fine_tune_user_message(message_content: str, conversation_context: List[Message] = None) -> str:
    """
    Automatically fine-tune user message to improve clarity and get better responses.
    This function enhances the message without changing its intent.
    All processing is done in the backend.
    """
    if not message_content or not message_content.strip():
        return message_content
    
    # Start with the original message
    tuned_message = message_content.strip()
    
    # 1. Fix common typos and grammar issues
    # Fix common contractions
    tuned_message = re.sub(r'\b(cant|wont|dont|isnt|arent|wasnt|werent)\b', lambda m: m.group(1)[0] + "'" + m.group(1)[1:], tuned_message, flags=re.IGNORECASE)
    
    # Fix common word errors
    common_fixes = {
        r'\bteh\b': 'the',
        r'\badn\b': 'and',
        r'\byoru\b': 'your',
        r'\byou\s+are\s+right\b': 'you are correct',
    }
    for pattern, replacement in common_fixes.items():
        tuned_message = re.sub(pattern, replacement, tuned_message, flags=re.IGNORECASE)
    
    # 2. Add clarity improvements
    # If message is too short or vague, add context
    if len(tuned_message.split()) < 3 and not tuned_message.endswith('?'):
        # Don't modify if it's a simple greeting or command
        if not any(word in tuned_message.lower() for word in ['hi', 'hello', 'help', 'thanks', 'thank']):
            # Add a clarifying phrase if needed
            if '?' not in tuned_message:
                tuned_message = f"Please explain: {tuned_message}"
    
    # 3. Improve question formatting
    # Ensure questions end with proper punctuation
    question_words = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'should', 'would', 'is', 'are', 'do', 'does', 'did']
    if any(tuned_message.lower().startswith(word) for word in question_words) and not tuned_message.endswith('?'):
        if not tuned_message.endswith('.'):
            tuned_message = tuned_message.rstrip('.!') + '?'
    
    # 4. Add context from conversation history if available
    if conversation_context and len(conversation_context) > 1:
        # Check if the message refers to previous context
        context_keywords = ['it', 'this', 'that', 'above', 'previous', 'earlier', 'before']
        if any(keyword in tuned_message.lower() for keyword in context_keywords):
            # The message likely refers to previous conversation
            # Keep it as-is but ensure it's clear
            pass
    
    # 5. Normalize whitespace
    tuned_message = re.sub(r'\s+', ' ', tuned_message)
    tuned_message = tuned_message.strip()
    
    # 6. Capitalize first letter if needed
    if tuned_message and not tuned_message[0].isupper() and tuned_message[0].isalpha():
        tuned_message = tuned_message[0].upper() + tuned_message[1:]
    
    # 7. Ensure proper sentence ending
    if tuned_message and tuned_message[-1].isalnum():
        # Add period if it's a statement (not a question)
        if not any(word in tuned_message.lower() for word in question_words):
            tuned_message += '.'
    
    return tuned_message

@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify FastAPI and Ollama connectivity"""
    try:
        # Create httpx client with no timeout to prevent connection timeouts
        timeout_config = httpx.Timeout(None, connect=None, read=None, write=None, pool=None)
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            # Check if Ollama is accessible
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                return {"status": "healthy", "ollama_connected": True}
            else:
                return {"status": "degraded", "ollama_connected": False}
    except Exception as e:
        return {"status": "unhealthy", "ollama_connected": False, "error": str(e)}

@app.post("/api/chat")
async def chat_stream(request: ChatRequest):
    """Stream chat responses from Ollama through FastAPI with automatic message fine-tuning"""
    async def stream_response():
        try:
            # Validate and sanitize model name - ensure it's not empty, invalid, or placeholder
            model_name = request.model
            if not model_name or model_name.strip() == '' or model_name.lower() == 'string':
                # Use default model if invalid model name provided
                default_model = os.getenv("DEFAULT_MODEL", "phi3:mini-128k")
                print(f"Warning: Invalid model name '{request.model}' provided. Using default: {default_model}")
                model_name = default_model
            else:
                model_name = model_name.strip()
            
            # Fine-tune user messages before sending to Ollama (backend processing)
            fine_tuned_messages = []
            for i, msg in enumerate(request.messages):
                if msg.role == 'user':
                    # Fine-tune user messages automatically in backend
                    conversation_context = request.messages[:i] if i > 0 else None
                    tuned_content = fine_tune_user_message(
                        msg.content, 
                        conversation_context=conversation_context
                    )
                    fine_tuned_messages.append({
                        "role": msg.role,
                        "content": tuned_content
                    })
                else:
                    # Keep assistant and system messages as-is
                    fine_tuned_messages.append({
                        "role": msg.role,
                        "content": msg.content
                    })
            
            # Create httpx client with no timeout to prevent connection timeouts
            timeout_config = httpx.Timeout(None, connect=None, read=None, write=None, pool=None)
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                # Forward request to Ollama with fine-tuned messages
                ollama_url = f"{OLLAMA_BASE_URL}/api/chat"
                
                ollama_request = {
                    "model": model_name,  # Use validated model name
                    "messages": fine_tuned_messages,  # Use fine-tuned messages
                    "stream": request.stream
                }
                
                try:
                    async with client.stream(
                        "POST",
                        ollama_url,
                        json=ollama_request,
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        if response.status_code != 200:
                            error_text = await response.aread()
                            error_detail = f"Ollama API error: {response.status_code}"
                            try:
                                error_json = json.loads(error_text.decode())
                                error_detail = error_json.get("error", error_detail)
                            except:
                                pass
                            yield f'{{"error": "{error_detail}"}}\n'
                            return
                        
                        async for line in response.aiter_lines():
                            if line:
                                try:
                                    # Check if this line contains an error from Ollama
                                    try:
                                        line_data = json.loads(line)
                                        if "error" in line_data:
                                            error_msg = line_data.get("error", "")
                                            # Provide more helpful error messages for common issues
                                            if "timed out waiting for llama runner" in error_msg or "timeout" in error_msg.lower():
                                                yield f'{{"error": "Model loading timeout. The model may be loading for the first time. Please try again in a moment, or check if the model \\"{model_name}\\" is properly installed in Ollama."}}\n'
                                            elif "model" in error_msg.lower() and ("not found" in error_msg.lower() or "does not exist" in error_msg.lower()):
                                                yield f'{{"error": "Model \\"{model_name}\\" not found in Ollama. Please install it using: ollama pull {model_name}"}}\n'
                                            else:
                                                yield f'{{"error": "{error_msg}"}}\n'
                                            return
                                    except (json.JSONDecodeError, KeyError):
                                        # Not a JSON error, just pass through the line
                                        pass
                                    yield f"{line}\n"
                                except Exception as e:
                                    print(f"Error yielding line: {e}")
                                    continue
                except httpx.TimeoutException:
                    yield f'{{"error": "Request timeout to Ollama. Make sure Ollama is running and responsive."}}\n'
                    return
                except httpx.ConnectError as e:
                    yield f'{{"error": "Cannot connect to Ollama server at {OLLAMA_BASE_URL}. Make sure Ollama is running."}}\n'
                    return
        except Exception as e:
            yield f'{{"error": "Internal server error: {str(e)}"}}\n'
    
    return StreamingResponse(
        stream_response(),
        media_type="text/plain",
        headers={"Content-Type": "text/event-stream"}
    )

@app.post("/api/submit")
async def submit_message(request: ChatRequest):
    """Submit button endpoint - handles message submission and forwards to chat endpoint"""
    # This endpoint explicitly handles the submit button action
    # It forwards to the chat endpoint which handles both submission and streaming responses
    return await chat_stream(request)

@app.get("/api/ollama/endpoint")
async def get_ollama_endpoint():
    """Get the configured Ollama LLM endpoint"""
    return {
        "ollama_endpoint": OLLAMA_BASE_URL,
        "fastapi_endpoint": f"http://localhost:{FASTAPI_PORT}",
        "status": "configured"
    }

@app.post("/api/input/validate")
async def validate_input(validation_request: InputValidationRequest):
    """Input field endpoint - validates input before submission"""
    message = validation_request.message
    max_length = validation_request.max_length or 10000
    
    if not message or not message.strip():
        return {
            "valid": False,
            "error": "Input cannot be empty"
        }
    
    if len(message) > max_length:
        return {
            "valid": False,
            "error": f"Input exceeds maximum length of {max_length} characters",
            "current_length": len(message),
            "max_length": max_length
        }
    
    return {
        "valid": True,
        "message_length": len(message)
    }

@app.post("/api/model/preload")
async def preload_model(request: PreloadRequest = PreloadRequest()):
    """Pre-load a model into Ollama memory to prevent loading timeouts"""
    try:
        # Use default model if not specified
        model_name = request.model_name if request.model_name else os.getenv("DEFAULT_MODEL", "phi3:mini-128k")
        
        timeout_config = httpx.Timeout(60.0, connect=10.0, read=60.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            # Send a minimal request to Ollama to trigger model loading
            preload_request = {
                "model": model_name,
                "messages": [{"role": "user", "content": "test"}],
                "stream": False
            }
            
            try:
                response = await client.post(
                    f"{OLLAMA_BASE_URL}/api/chat",
                    json=preload_request,
                    timeout=60.0
                )
                
                if response.status_code == 200:
                    return {
                        "status": "success",
                        "model": model_name,
                        "message": f"Model {model_name} pre-loaded successfully"
                    }
                else:
                    error_text = response.text
                    return {
                        "status": "error",
                        "model": model_name,
                        "error": f"Failed to pre-load model: {error_text}"
                    }
            except httpx.TimeoutException:
                return {
                    "status": "timeout",
                    "model": model_name,
                    "message": f"Model {model_name} pre-load timed out, but it may still be loading"
                }
            except httpx.ConnectError:
                return {
                    "status": "error",
                    "model": model_name,
                    "error": f"Cannot connect to Ollama server at {OLLAMA_BASE_URL}"
                }
    except Exception as e:
        return {
            "status": "error",
            "model": model_name if 'model_name' in locals() else "unknown",
            "error": str(e)
        }

@app.get("/api/responses")
async def get_responses_status():
    """Ollama LLM responses endpoint - returns status of the responses endpoint"""
    try:
        timeout_config = httpx.Timeout(None, connect=None, read=None, write=None, pool=None)
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            # Check if Ollama is accessible
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                return {
                    "status": "ready",
                    "ollama_endpoint": OLLAMA_BASE_URL,
                    "responses_endpoint": "/api/chat",
                    "ollama_connected": True
                }
            else:
                return {
                    "status": "degraded",
                    "ollama_endpoint": OLLAMA_BASE_URL,
                    "responses_endpoint": "/api/chat",
                    "ollama_connected": False
                }
    except Exception as e:
        return {
            "status": "unavailable",
            "ollama_endpoint": OLLAMA_BASE_URL,
            "responses_endpoint": "/api/chat",
            "ollama_connected": False,
            "error": str(e)
        }

@app.get("/")
async def root():
    return {"message": "Zeroui AI Agent FastAPI Server", "status": "running"}

if __name__ == "__main__":
    import uvicorn
    import socket
    import sys
    
    def is_port_in_use(port: int) -> bool:
        """Check if a port is already in use"""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return False
            except OSError:
                return True
    
    PORT = FASTAPI_PORT
    
    # Check if port is in use
    if is_port_in_use(PORT):
        print("=" * 60)
        print(f"ERROR: Port {PORT} is already in use!")
        print("=" * 60)
        print(f"Please stop any existing FastAPI server or other service using port {PORT}.")
        print("You can find and stop the process using:")
        print(f"  Windows: netstat -ano | findstr :{PORT}")
        print(f"  Then: taskkill /PID <process_id> /F")
        print("=" * 60)
        sys.exit(1)
    
    print("=" * 60)
    print("Zeroui AI Agent FastAPI Server")
    print("=" * 60)
    print(f"Server starting on http://localhost:{PORT}")
    print(f"Ollama endpoint: {OLLAMA_BASE_URL}")
    print("=" * 60)
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    try:
        # Use reload=False to prevent issues, and bind to 0.0.0.0 for proper network binding
        # Set timeout_keep_alive to a very high value to prevent 504 Gateway Timeout
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=PORT, 
            log_level="info", 
            access_log=True,
            reload=False,
            loop="asyncio",
            timeout_keep_alive=3600,  # 1 hour keep-alive timeout (prevents 504 errors)
            timeout_graceful_shutdown=3600  # 1 hour graceful shutdown timeout
        )
    except OSError as e:
        if "10048" in str(e) or "address already in use" in str(e).lower():
            print("\n" + "=" * 60)
            print(f"ERROR: Port {PORT} is already in use!")
            print("=" * 60)
            print(f"Another process is using port {PORT}. Please stop it first.")
            print(f"Run: Get-NetTCPConnection -LocalPort {PORT} | Stop-Process -Id {{OwningProcess}} -Force")
            sys.exit(1)
        else:
            raise
    except KeyboardInterrupt:
        print("\n" + "=" * 60)
        print("Server stopped by user")
        print("=" * 60)
        sys.exit(0)
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"ERROR: Server failed to start: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)
