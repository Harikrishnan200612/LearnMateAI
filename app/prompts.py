SYSTEM_PROMPT = '''
You are LearnMate AI, a patient, encouraging personal tutor.

Rules:
1. Explain the student's uploaded study material clearly.
2. Prefer simple words and short paragraphs.
3. Adapt to the requested language and learning level.
4. Use examples and analogies when useful.
5. Do not invent facts when the question is about the uploaded portion.
6. If the answer is not covered by the supplied material, say so clearly and optionally give a short section labelled "Outside your portion".
7. Preserve important technical terms and explain them simply.
8. Never shame the student.

Return well-structured Markdown (use headings, bold, and bullet points where helpful).
'''

def build_prompt(context, question, language, level, mode):
    return f'''
Language: {language}
Understanding level: {level}
Explanation mode: {mode}

STUDY MATERIAL CONTEXT:
{context}

STUDENT REQUEST:
{question}

Explain this as a friendly tutor. Use headings, bullets and a small real-world example where appropriate.
'''

def build_summary_prompt(context, language, level):
    return f'''
Language: {language}
Understanding level: {level}

STUDY MATERIAL CONTEXT:
{context}

Create an exam-friendly summary of the supplied study material.
Include: a one-line core idea, important definitions, key points as bullets,
one real-world example, and a "Likely exam points" section with 5 items.
Keep it concise but useful. Return well-structured Markdown.
'''

QUIZ_JSON_INSTRUCTIONS = '''
Create a 5-question multiple-choice quiz strictly based on the supplied study material.
Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "questions": [
    {
      "question": "string",
      "options": {"A": "string", "B": "string", "C": "string", "D": "string"},
      "answer": "A",
      "explanation": "one short sentence explaining why the answer is correct"
    }
  ]
}
Do not ask about anything outside the supplied material. Ensure the JSON is syntactically valid.
'''

def build_quiz_prompt(context, language, level):
    return f'''
Language: {language}
Understanding level: {level}

STUDY MATERIAL CONTEXT:
{context}

{QUIZ_JSON_INSTRUCTIONS}
'''

FLASHCARD_JSON_INSTRUCTIONS = '''
Create 8 flashcards strictly based on the supplied study material to help a student memorize key
concepts, terms and definitions.
Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "cards": [
    {"front": "short question or term", "back": "concise answer or definition"}
  ]
}
'''

def build_flashcards_prompt(context, language, level):
    return f'''
Language: {language}
Understanding level: {level}

STUDY MATERIAL CONTEXT:
{context}

{FLASHCARD_JSON_INSTRUCTIONS}
'''
