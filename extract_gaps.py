import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from docx import Document
doc = Document('ThryftVerse_UIUX_Research_Analysis_Report.docx')
for p in doc.paragraphs:
    t = p.text.strip()
    if t and ('G' in t or 'P0' in t or 'Priority' in t or 'priority' in t) and any(c.isdigit() for c in t):
        print(t)
