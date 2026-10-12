from pathlib import Path
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .database import (
    init_db, create_document, add_chunk, list_documents, get_chunks,
    get_document, delete_document, add_message, get_messages, get_stats,
)
from .parsers import extract_text
from .rag import chunk_text, retrieve
from . import ai as ai_module
from .ai import ask, embed, generate_quiz, summarize, generate_flashcards

BASE = Path(__file__).resolve().parent.parent
UPLOADS = BASE / "uploads"
UPLOADS.mkdir(exist_ok=True)
MAX_UPLOAD_MB = 20
ALLOWED_EXT = {".pdf", ".docx", ".pptx", ".txt"}

app = FastAPI(title="LearnMate AI", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def home():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": ai_module.client is not None}


@app.get("/api/stats")
def stats():
    return get_stats()


@app.get("/api/documents")
def documents():
    return list_documents()


@app.get("/api/documents/{document_id}/messages")
def document_messages(document_id: int):
    if not get_document(document_id):
        raise HTTPException(404, "Document not found.")
    return get_messages(document_id)


@app.delete("/api/documents/{document_id}")
def remove_document(document_id: int):
    if not get_document(document_id):
        raise HTTPException(404, "Document not found.")
    delete_document(document_id)
    return {"ok": True}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), subject: str = Form(""), language: str = Form("English")):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(400, "Only PDF, DOCX, PPTX and TXT files are supported.")

    safe_name = Path(file.filename).name
    destination = UPLOADS / safe_name

    size = 0
    with destination.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                buffer.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(400, f"File is larger than the {MAX_UPLOAD_MB}MB limit.")
            buffer.write(chunk)

    try:
        text = extract_text(destination)
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(400, f"Could not read document: {exc}")

    if not text.strip():
        destination.unlink(missing_ok=True)
        raise HTTPException(400, "No readable text was found in this file.")

    doc_id = create_document(safe_name, subject, language)
    chunks = chunk_text(text)
    for i, content in enumerate(chunks):
        vector = None
        try:
            vector = embed(content)
        except Exception:
            pass
        add_chunk(doc_id, i, content, vector)

    return {"id": doc_id, "filename": safe_name, "subject": subject, "language": language, "chunks": len(chunks)}


class AskRequest(BaseModel):
    document_id: int
    question: str
    language: str = "English"
    level: str = "Beginner"
    mode: str = "Explain Simply"


@app.post("/api/ask")
def ask_question(req: AskRequest):
    chunks = get_chunks(req.document_id)
    if not chunks:
        raise HTTPException(404, "Document not found.")
    q_emb = None
    try:
        q_emb = embed(req.question)
    except Exception:
        pass
    context = "\n\n---\n\n".join(retrieve(req.question, chunks, q_emb, 5))
    answer = ask(context, req.question, req.language, req.level, req.mode)
    add_message(req.document_id, "user", req.question, req.mode)
    add_message(req.document_id, "ai", answer, req.mode)
    return {"answer": answer}


class ActionRequest(BaseModel):
    document_id: int
    language: str = "English"
    level: str = "Beginner"


@app.post("/api/summary")
def summary(req: ActionRequest):
    chunks = get_chunks(req.document_id)
    if not chunks:
        raise HTTPException(404, "Document not found.")
    context = "\n\n---\n\n".join(c["content"] for c in chunks[:12])
    answer = summarize(context, req.language, req.level)
    add_message(req.document_id, "user", "Give me a summary of my portion.", "Summary")
    add_message(req.document_id, "ai", answer, "Summary")
    return {"answer": answer}


@app.post("/api/quiz")
def quiz(req: ActionRequest):
    chunks = get_chunks(req.document_id)
    if not chunks:
        raise HTTPException(404, "Document not found.")
    context = "\n\n---\n\n".join(c["content"] for c in chunks[:12])
    return generate_quiz(context, req.language, req.level)


@app.post("/api/flashcards")
def flashcards(req: ActionRequest):
    chunks = get_chunks(req.document_id)
    if not chunks:
        raise HTTPException(404, "Document not found.")
    context = "\n\n---\n\n".join(c["content"] for c in chunks[:12])
    return generate_flashcards(context, req.language, req.level)
