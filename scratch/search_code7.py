import os
path = r"c:\Users\seo sang won\001.작업파일\004. 출판친구\018. 안티그래비티\script.js"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
for i, line in enumerate(lines, 1):
    if "loadMarketingAssets(" in line and "function" not in line:
        print(f"=== Found call at line {i} ===")
        for j in range(max(0, i-5), min(len(lines), i+15)):
            print(f"{j+1}: {lines[j].strip()}")
