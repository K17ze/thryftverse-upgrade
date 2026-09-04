import re, io
d = io.open(r'c:\Users\User\Desktop\thryftverse-upgrade\ui.xml', encoding='utf-8', errors='replace').read()
print('=== clickable nodes ===')
for m in re.finditer(r'<node[^>]*clickable="true"[^>]*>', d):
    s = m.group(0)
    txt = re.search(r'text="([^"]*)"', s)
    b = re.search(r'bounds="([^"]*)"', s)
    print('TXT=', txt.group(1) if txt else '', '| bounds=', b.group(1) if b else '')
print('=== text nodes ===')
for m in re.finditer(r'<node[^>]*text="([^"]+)"[^>]*>', d):
    print(m.group(1))
print('=== done ===')