import sqlite3, json
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "learnmate.db"

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_conn()
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        subject TEXT DEFAULT '',
        language TEXT DEFAULT 'English',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding TEXT,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        mode TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    ''')
    conn.commit(); conn.close()

def create_document(filename, subject, language):
    conn = get_conn()
    cur = conn.execute("INSERT INTO documents(filename,subject,language) VALUES(?,?,?)",
                       (filename, subject, language))
    conn.commit(); doc_id = cur.lastrowid; conn.close()
    return doc_id

def add_chunk(document_id, index, content, embedding=None):
    conn = get_conn()
    conn.execute("INSERT INTO chunks(document_id,chunk_index,content,embedding) VALUES(?,?,?,?)",
                 (document_id, index, content, json.dumps(embedding) if embedding else None))
    conn.commit(); conn.close()

def list_documents():
    conn = get_conn()
    rows = conn.execute('''
        SELECT d.id,d.filename,d.subject,d.language,d.created_at,
               COUNT(c.id) AS chunk_count
        FROM documents d LEFT JOIN chunks c ON c.document_id=d.id
        GROUP BY d.id ORDER BY d.id DESC
    ''').fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_document(document_id):
    conn = get_conn()
    row = conn.execute("SELECT id,filename,subject,language,created_at FROM documents WHERE id=?",
                        (document_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_document(document_id):
    conn = get_conn()
    conn.execute("DELETE FROM documents WHERE id=?", (document_id,))
    conn.commit(); conn.close()

def get_chunks(document_id):
    conn = get_conn()
    rows = conn.execute("SELECT id,chunk_index,content,embedding FROM chunks WHERE document_id=? ORDER BY chunk_index",
                        (document_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_message(document_id, role, content, mode=""):
    conn = get_conn()
    conn.execute("INSERT INTO messages(document_id,role,content,mode) VALUES(?,?,?,?)",
                 (document_id, role, content, mode))
    conn.commit(); conn.close()

def get_messages(document_id):
    conn = get_conn()
    rows = conn.execute("SELECT role,content,mode,created_at FROM messages WHERE document_id=? ORDER BY id",
                        (document_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_stats():
    conn = get_conn()
    docs = conn.execute("SELECT COUNT(*) AS n FROM documents").fetchone()["n"]
    questions = conn.execute("SELECT COUNT(*) AS n FROM messages WHERE role='user'").fetchone()["n"]
    conn.close()
    return {"documents": docs, "questions": questions}
