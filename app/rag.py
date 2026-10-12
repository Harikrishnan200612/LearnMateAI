import json
import numpy as np

def chunk_text(text: str, max_chars=1800, overlap=250):
    text = " ".join(text.split())
    if not text: return []
    chunks=[]; start=0
    while start < len(text):
        end=min(start+max_chars,len(text))
        piece=text[start:end]
        if end < len(text):
            br=max(piece.rfind(". "),piece.rfind(" "))
            if br > max_chars*0.55:
                end=start+br+1; piece=text[start:end]
        chunks.append(piece.strip())
        if end >= len(text): break
        start=max(0,end-overlap)
    return chunks

def cosine_similarity(a,b):
    a,b=np.array(a),np.array(b)
    denom=np.linalg.norm(a)*np.linalg.norm(b)
    return float(np.dot(a,b)/denom) if denom else 0.0

def lexical_score(query,text):
    q=set(query.lower().split()); t=set(text.lower().split())
    return len(q&t)/max(len(q),1)

def retrieve(query,chunks,query_embedding=None,top_k=5):
    scored=[]
    for c in chunks:
        score=lexical_score(query,c["content"])
        if query_embedding and c.get("embedding"):
            try:
                score=.75*cosine_similarity(query_embedding,json.loads(c["embedding"]))+.25*score
            except Exception:
                pass
        scored.append((score,c["content"]))
    scored.sort(reverse=True,key=lambda x:x[0])
    return [x[1] for x in scored[:top_k]]
