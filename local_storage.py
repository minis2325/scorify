import os
import re
from datetime import datetime

BASE_DIR = os.path.join(os.path.dirname(__file__), "local_s3_storage")


def ensure_storage_dir():
    os.makedirs(BASE_DIR, exist_ok=True)


def safe_filename(name):
    if not name:
        return "upload"
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return sanitized or "upload"


def _timestamp():
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")


def save_bytes(original_name, data):
    ensure_storage_dir()
    filename = f"{_timestamp()}_{safe_filename(original_name)}"
    path = os.path.join(BASE_DIR, filename)
    with open(path, "wb") as handle:
        handle.write(data)
    return filename


def save_text(label, text):
    ensure_storage_dir()
    filename = f"{_timestamp()}_{safe_filename(label)}.txt"
    path = os.path.join(BASE_DIR, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return filename


def _resolve_path(key):
    safe_key = safe_filename(key)
    path = os.path.join(BASE_DIR, safe_key)
    if not os.path.isfile(path):
        return None
    return path


def list_objects():
    ensure_storage_dir()
    items = []
    for name in os.listdir(BASE_DIR):
        path = os.path.join(BASE_DIR, name)
        if not os.path.isfile(path):
            continue
        stat = os.stat(path)
        items.append({
            "key": name,
            "size": stat.st_size,
            "modified": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
        })
    items.sort(key=lambda item: item["modified"], reverse=True)
    return items


def load_bytes(key):
    path = _resolve_path(key)
    if not path:
        return None
    with open(path, "rb") as handle:
        return handle.read()


def load_text(key):
    data = load_bytes(key)
    if data is None:
        return None
    for encoding in ("utf-8", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")
