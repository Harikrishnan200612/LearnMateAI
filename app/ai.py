import os, json, re
from dotenv import load_dotenv
from groq import Groq
from .prompts import (
    SYSTEM_PROMPT, build_prompt, build_summary_prompt,
    build_quiz_prompt, build_flashcards_prompt,
)

load_dotenv()

# Groq is used for all AI generation in LearnMate AI.
# Keep the API key only in the local .env file; never put it in frontend code.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Current Groq production model. You can change this in .env if needed.
CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "openai/gpt-oss-120b")

DEMO_QUIZ = {
    "questions": [
        {
            "question": "Add GROQ_API_KEY to your .env file to unlock real, material-grounded quizzes. Which step enables live AI mode?",
            "options": {
                "A": "Restarting the browser",
                "B": "Adding a Groq API key to .env and restarting the server",
                "C": "Uploading a bigger file",
                "D": "Changing the quiz language",
            },
            "answer": "B",
            "explanation": "LearnMate AI needs a valid Groq API key in .env to call the AI model; restart the server after adding it.",
        }
    ]
}

DEMO_FLASHCARDS = {
    "cards": [
        {"front": "How do I enable real AI responses?", "back": "Add GROQ_API_KEY to .env and restart the server."},
        {"front": "What happens without an API key?", "back": "LearnMate AI runs in demo mode with placeholder content."},
    ]
}


def _extract_json(text: str):
    """Best-effort extraction of a JSON object from a model response."""
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text.strip(), flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text.strip()).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def _generate(instructions: str, prompt: str) -> str:
    """Generate text through Groq's chat-completions API."""
    if not client:
        return ""

    response = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": instructions},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content or ""


def embed(text):
    """
    Groq does not provide the OpenAI embeddings endpoint used by the old app.
    Retrieval therefore falls back to the local lexical scorer in rag.py.
    This function is kept for compatibility with main.py.
    """
    return None


def ask(context, question, language="English", level="Beginner", mode="Explain Simply"):
    if not client:
        return (
            "### Demo Mode\n\n"
            "Add `GROQ_API_KEY` to `.env` and restart the server to enable real, "
            f"material-grounded AI answers.\n\n**Your question:** {question}\n\n"
            "Once a key is configured, LearnMate AI will answer strictly from your "
            "uploaded portion, in your chosen language, level and explanation style."
        )

    return _generate(
        SYSTEM_PROMPT,
        build_prompt(context, question, language, level, mode),
    )


def summarize(context, language="English", level="Beginner"):
    if not client:
        return (
            "### Demo Mode Summary\n\n"
            "Add `GROQ_API_KEY` to `.env` and restart the server to generate a "
            "real, exam-focused summary of your uploaded portion."
        )

    return _generate(
        SYSTEM_PROMPT,
        build_summary_prompt(context, language, level),
    )


def generate_quiz(context, language="English", level="Beginner"):
    if not client:
        return DEMO_QUIZ

    raw = _generate(
        "You produce only strictly valid JSON. Never include markdown fences or prose outside the JSON object.",
        build_quiz_prompt(context, language, level),
    )
    try:
        data = _extract_json(raw)
        if "questions" in data and isinstance(data["questions"], list) and data["questions"]:
            return data
    except Exception:
        pass

    return {"questions": [], "raw": raw}


def generate_flashcards(context, language="English", level="Beginner"):
    if not client:
        return DEMO_FLASHCARDS

    raw = _generate(
        "You produce only strictly valid JSON. Never include markdown fences or prose outside the JSON object.",
        build_flashcards_prompt(context, language, level),
    )
    try:
        data = _extract_json(raw)
        if "cards" in data and isinstance(data["cards"], list) and data["cards"]:
            return data
    except Exception:
        pass

    return {"cards": [], "raw": raw}
