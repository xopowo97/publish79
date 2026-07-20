import os
search_dir = r"c:\Users\seo sang won\001.작업파일\004. 출판친구\018. 안티그래비티"
keyword = "get-marketing-assets"
for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith(".js"):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    for i, line in enumerate(lines, 1):
                        if keyword in line:
                            print(f"=== {file} : {i} ===")
                            start = max(0, i-5)
                            end = min(len(lines), i+15)
                            for j in range(start, end):
                                print(f"{j+1}: {lines[j].strip()}")
            except Exception as e:
                pass
