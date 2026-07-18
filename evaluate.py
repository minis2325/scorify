import io
import math
import re
from difflib import SequenceMatcher

from local_storage import save_bytes, save_text


class EvaluationError(Exception):
    pass


def simple_stem(word):
    suffixes = ["ing", "ed", "ly", "ity", "s"]
    for suffix in suffixes:
        if word.endswith(suffix) and len(word) > len(suffix) + 2:
            return word[: -len(suffix)]
    return word


def _tokenize(text):
    return re.findall(r"[a-zA-Z0-9]+", text.lower())


def _extract_keywords(text):
    stopwords = {
        "is",
        "the",
        "and",
        "in",
        "of",
        "to",
        "a",
        "an",
        "for",
        "on",
        "with",
        "as",
        "by",
        "at",
        "from",
    }

    return {
        simple_stem(word)
        for word in _tokenize(text)
        if word not in stopwords
    }


def evaluate_answer(student, correct):
    student_tokens = [simple_stem(word) for word in _tokenize(student)]
    correct_tokens = [simple_stem(word) for word in _tokenize(correct)]

    student_words = _extract_keywords(student)
    correct_words = _extract_keywords(correct)

    if not correct_words or not correct_tokens:
        return 0

    common = student_words.intersection(correct_words)
    if not common:
        return 0

    if len(student_tokens) > len(correct_tokens):
        return 10
    coverage = len(common) / len(correct_words)

    union = student_words.union(correct_words)
    jaccard = len(common) / len(union) if union else 0

    student_counts = {}
    for word in student_tokens:
        student_counts[word] = student_counts.get(word, 0) + 1

    correct_counts = {}
    for word in correct_tokens:
        correct_counts[word] = correct_counts.get(word, 0) + 1

    dot = 0
    student_norm = 0
    correct_norm = 0

    for word, count in student_counts.items():
        student_norm += count * count
        if word in correct_counts:
            dot += count * correct_counts[word]

    for count in correct_counts.values():
        correct_norm += count * count

    if student_norm == 0 or correct_norm == 0:
        cosine = 0
    else:
        cosine = dot / ((student_norm ** 0.5) * (correct_norm ** 0.5))

    length_ratio = min(len(student_tokens), len(correct_tokens)) / max(
        len(student_tokens), len(correct_tokens)
    )

    sequence_ratio = SequenceMatcher(None, student.lower(), correct.lower()).ratio()

    blended = (
        (0.2 * coverage)
        + (0.2 * jaccard)
        + (0.2 * cosine)
        + (0.1 * length_ratio)
        + (0.3 * sequence_ratio)
    )

    soft_floor = max(sequence_ratio * 7, 1)
    final_score = max(blended * 10, soft_floor)
    final_score = min(final_score, 10)

    return round(max(final_score, 1), 2)


def compute_fee(word_count, size_bytes, pricing_mode):
    if pricing_mode == "text":
        base_fee = 5
        complexity_surcharge = word_count * 1
        heavy_penalty = 0
    else:
        base_fee = 10
        complexity_units = math.ceil(word_count / 500) if word_count > 0 else 0
        complexity_surcharge = complexity_units * 5
        heavy_penalty = 15 if size_bytes > 1_048_576 else 0

    total = base_fee + complexity_surcharge + heavy_penalty

    breakdown = {
        "base_fee": base_fee,
        "complexity_surcharge": complexity_surcharge,
        "heavy_penalty": heavy_penalty,
        "word_count": word_count,
        "file_size_bytes": size_bytes,
        "is_heavy": size_bytes > 1_048_576,
    }

    return total, breakdown


def _decode_bytes(data):
    for encoding in ("utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def _extract_pdf_text(data):
    try:
        import PyPDF2
    except ImportError as exc:
        raise EvaluationError(
            "PyPDF2 is required to process PDF files. Install it with 'pip install PyPDF2'."
        ) from exc

    reader = PyPDF2.PdfReader(io.BytesIO(data))
    pages_text = []
    for page in reader.pages:
        pages_text.append(page.extract_text() or "")
    return "\n".join(pages_text)


def read_text_from_upload(upload):
    original_name = upload.filename or "upload"
    data = upload.read()
    size_bytes = len(data)
    storage_key = save_bytes(original_name, data)

    ext = original_name.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        text = _extract_pdf_text(data)
    else:
        text = _decode_bytes(data)

    return text, size_bytes, storage_key


def read_text_input(text, label):
    storage_key = save_text(label, text)
    size_bytes = len(text.encode("utf-8"))
    return text, size_bytes, storage_key


def count_words(text):
    return len(_tokenize(text))


def evaluate_submission(student_text, correct_text, size_bytes, pricing_mode):
    word_count = count_words(student_text)
    score = evaluate_answer(student_text, correct_text)
    cost, breakdown = compute_fee(word_count, size_bytes, pricing_mode)
    return score, cost, breakdown
