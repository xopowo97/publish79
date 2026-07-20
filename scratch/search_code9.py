import os
path = r"c:\Users\seo sang won\001.작업파일\004. 출판친구\018. 안티그래비티\script.js"
with open(path, "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "showMarketingAssetModal" in line:
            print(f"Line {i}: {line.strip()}")
