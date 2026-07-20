import os
search_dir = r"c:\Users\seo sang won\001.작업파일\004. 출판친구\018. 안티그래비티"
keyword = "ctrlTriggerMarketingUAT"
for root, dirs, files in os.walk(search_dir):
    for file in files:
        if file.endswith(".js") or file.endswith(".html"):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for i, line in enumerate(f, 1):
                        if keyword in line:
                            print(f"{file}:{i} -> {line.strip()}")
            except Exception as e:
                pass
