import base64
import os

file_path = '출판친구_발주서.xlsx'
if os.path.exists(file_path):
    with open(file_path, 'rb') as f:
        print(base64.b64encode(f.read()).decode('utf-8'))
