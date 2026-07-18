# Scorify

Scorify is a Flask-based subjective answer evaluation system that compares a student's answer with a model answer and generates an evaluation score along with detailed feedback. The application uses multiple text similarity techniques to assess answer quality through an intuitive web interface.

---
## Live Demo

🔗 https://your-render-url.onrender.com

---
## Features

- Evaluate subjective answers against a model answer
- Generate an overall evaluation score
- Analyze keyword coverage
- Compare textual similarity using multiple techniques
- Provide detailed evaluation feedback
- Maintain evaluation history
- Generate downloadable evaluation invoices
- Store evaluation records locally

---

## Technologies Used

### Backend
- Python
- Flask

### Frontend
- HTML
- CSS
- JavaScript

### Evaluation Techniques
- Keyword Matching
- Text Tokenization
- Jaccard Similarity
- Cosine Similarity
- Sequence Matching

---

## Project Structure

```
scorify/
│
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── script.js
│
├── sample_data/
│   ├── Question.txt
│   ├── Model_Answer.txt
│   └── Student_Answer.txt
│
├── local_s3_storage/
│
├── app.py
├── evaluate.py
├── local_storage.py
├── requirements.txt
├── README.md
└── .gitignore
```

---
## Sample Data

The `sample_data` folder contains example files that can be used to test the application:

- `Question.txt`
- `Model_Answer.txt`
- `Student_Answer.txt`

---

## How It Works

1. Enter or upload the question.
2. Provide the model answer.
3. Submit the student's answer.
4. Scorify compares both answers using multiple text similarity techniques.
5. The system generates:
   - Overall evaluation score
   - Keyword analysis
   - Similarity metrics
   - Detailed feedback

---

## Future Improvements

- Improve evaluation accuracy
- Store evaluation history in a database
- Enhance the user interface

---

## Author

Developed as an academic project using Python and Flask.
