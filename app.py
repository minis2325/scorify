import os

from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory, Response

from evaluate import (
    EvaluationError,
    evaluate_submission,
    read_text_from_upload,
    read_text_input,
)
from local_storage import list_objects, load_bytes, load_text

app = Flask(__name__, static_folder="frontend", static_url_path="/frontend")

HISTORY_LIMIT = 25
evaluation_history = []


def _add_history(entry):
    evaluation_history.insert(0, entry)
    if len(evaluation_history) > HISTORY_LIMIT:
        evaluation_history.pop()


def _history_summary():
    total_spend = sum(item.get("cost", 0) for item in evaluation_history)
    return {
        "entries": evaluation_history,
        "total_spend": total_spend,
    }


def _pdf_escape(value):
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_invoice_pdf(data):
    breakdown = data.get("breakdown", {})
    lines = [
        "Scorify",
        "Invoice",
        "",
        f"Score: {data.get('score', 0)} / 10",
        f"Base Fee: Rs {breakdown.get('base_fee', 0)}",
        f"Complexity: Rs {breakdown.get('complexity_surcharge', 0)}",
        f"Heavy Script: Rs {breakdown.get('heavy_penalty', 0)}",
        f"Words: {breakdown.get('word_count', 0)}",
        f"File Size: {breakdown.get('file_size_bytes', 0)} bytes",
        f"Total: Rs {data.get('cost', 0)}",
    ]

    text_lines = " ".join(
        f"({_pdf_escape(line)}) Tj T*" for line in lines
    )
    content = f"BT /F1 12 Tf 72 720 Td 16 TL {text_lines} ET"
    content_bytes = content.encode("latin-1")

    objects = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj")
    objects.append(b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj")
    objects.append(
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >> endobj"
    )
    objects.append(
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"
    )
    objects.append(
        b"5 0 obj << /Length %d >> stream\n" % len(content_bytes)
        + content_bytes
        + b"\nendstream endobj"
    )

    header = b"%PDF-1.4\n"
    offsets = [len(header)]
    body = header
    for obj in objects:
        body += obj + b"\n"
        offsets.append(len(body))

    xref_offset = len(body)
    xref = [b"xref", b"0 6", b"0000000000 65535 f "]
    for offset in offsets[:-1]:
        xref.append(f"{offset:010d} 00000 n ".encode("ascii"))
    xref.append(b"trailer << /Size 6 /Root 1 0 R >>")
    xref.append(b"startxref")
    xref.append(str(xref_offset).encode("ascii"))
    xref.append(b"%%EOF")

    return body + b"\n" + b"\n".join(xref)


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/evaluate", methods=["POST"])
def evaluate():
    try:
        pricing_mode = "file"
        model_filename = None
        student_filename = None
        model_storage_key = None
        student_storage_key = None
        if request.is_json:
            data = request.get_json(silent=True) or {}
            correct_text = data.get("correct_answer", "").strip()
            student_text = data.get("student_answer", "").strip()

            if not correct_text or not student_text:
                return jsonify({"error": "Both answers are required."}), 400

            correct_text, _, model_storage_key = read_text_input(correct_text, "model_answer")
            student_text, size_bytes, student_storage_key = read_text_input(
                student_text, "student_answer"
            )
            pricing_mode = "text"
        else:
            model_file = request.files.get("model_file")
            student_file = request.files.get("student_file")

            if model_file:
                model_filename = model_file.filename
                correct_text, _, model_storage_key = read_text_from_upload(model_file)
            else:
                correct_text = request.form.get("correct_answer", "").strip()
                if correct_text:
                    correct_text, _, model_storage_key = read_text_input(
                        correct_text, "model_answer"
                    )

            if student_file:
                student_filename = student_file.filename
                student_text, size_bytes, student_storage_key = read_text_from_upload(
                    student_file
                )
            else:
                student_text = request.form.get("student_answer", "").strip()
                student_text, size_bytes, student_storage_key = read_text_input(
                    student_text, "student_answer"
                )
                pricing_mode = "text"

            if not correct_text or not student_text:
                return jsonify({"error": "Provide both model and student answers."}), 400

        score, cost, breakdown = evaluate_submission(
            student_text, correct_text, size_bytes, pricing_mode
        )

        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "single",
            "mode": pricing_mode,
            "score": score,
            "cost": cost,
            "word_count": breakdown.get("word_count", 0),
            "filename": student_filename or "text_input",
        }
        _add_history(entry)

        return jsonify({
            "score": score,
            "cost": cost,
            "breakdown": breakdown,
            "model_text": correct_text,
            "student_text": student_text,
            "model_filename": model_filename,
            "student_filename": student_filename,
            "model_storage_key": model_storage_key,
            "student_storage_key": student_storage_key,
        })
    except EvaluationError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/batch", methods=["POST"])
def batch():
    try:
        model_file = request.files.get("model_file")
        if model_file:
            correct_text, _, model_storage_key = read_text_from_upload(model_file)
        else:
            correct_text = request.form.get("correct_answer", "").strip()
            if correct_text:
                correct_text, _, model_storage_key = read_text_input(
                    correct_text, "model_answer"
                )
            else:
                model_storage_key = None

        if not correct_text:
            return jsonify({"error": "A model answer is required for batch processing."}), 400

        student_files = request.files.getlist("student_files")
        if not student_files:
            return jsonify({"error": "Upload at least one student file."}), 400

        results = []
        cost_spike = 0

        for upload in student_files:
            student_filename = upload.filename or "student_file"
            student_text, size_bytes, student_storage_key = read_text_from_upload(upload)
            score, cost, breakdown = evaluate_submission(
                student_text, correct_text, size_bytes, "file"
            )
            cost_spike += cost

            _add_history({
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "type": "batch",
                "mode": "file",
                "score": score,
                "cost": cost,
                "word_count": breakdown.get("word_count", 0),
                "filename": student_filename,
            })

            results.append({
                "filename": student_filename,
                "score": score,
                "cost": cost,
                "breakdown": breakdown,
                "student_text": student_text,
                "student_storage_key": student_storage_key,
            })

        return jsonify({
            "results": results,
            "cost_spike": cost_spike,
            "count": len(results),
            "model_text": correct_text,
            "model_storage_key": model_storage_key,
        })
    except EvaluationError as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/history", methods=["GET"])
def history():
    return jsonify(_history_summary())


@app.route("/invoice/pdf", methods=["POST"])
def invoice_pdf():
    data = request.get_json(silent=True) or {}
    pdf_bytes = build_invoice_pdf(data)
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={"Content-Disposition": "attachment; filename=invoice.pdf"},
    )


@app.route("/storage", methods=["GET"])
def storage_list():
    return jsonify({"items": list_objects()})


@app.route("/storage/download/<key>", methods=["GET"])
def storage_download(key):
    data = load_bytes(key)
    if data is None:
        return jsonify({"error": "File not found."}), 404
    return Response(
        data,
        mimetype="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={key}"},
    )


@app.route("/storage/text/<key>", methods=["GET"])
def storage_text(key):
    text = load_text(key)
    if text is None:
        return jsonify({"error": "File not found."}), 404
    return jsonify({"text": text, "key": key})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
