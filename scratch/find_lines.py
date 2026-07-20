import os

fpath = 'control.js'
keywords = ['ctrl-btn-pipeline', 'DOMContentLoaded', 'ctrl-btn-bulk-assets']

try:
    with open(fpath, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            for kw in keywords:
                if kw in line:
                    print(f"{i} [{kw}] -> {line.strip()}")
except Exception as e:
    print("Error:", e)
