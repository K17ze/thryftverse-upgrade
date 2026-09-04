from PIL import Image
import sys

im = Image.open(r'c:\Users\User\Desktop\thryftverse-upgrade\app2.png').convert('RGB')
w, h = im.size
print('size', w, h)
small = im.resize((w // 4, h // 4))
colors = small.getcolors(w // 4 * h // 4)
colors.sort(reverse=True)
print('top-colors:')
for cnt, col in colors[:8]:
    print('  ', col, cnt)
# Sample a horizontal strip across the middle to detect text/layout bands
mid = im.crop((0, h // 2 - 10, w, h // 2 + 10))
px = list(mid.getdata())
unique = len(set(px))
print('midband-unique-colors:', unique)
# Brightness histogram of the whole image
gray = im.convert('L')
hist = gray.histogram()
total = sum(hist)
dark = sum(hist[:64]); midgray = sum(hist[64:192]); bright = sum(hist[192:])
print(f'dark% {100*dark/total:.1f}  mid% {100*midgray/total:.1f}  bright% {100*bright/total:.1f}')