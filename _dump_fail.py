import json, io

p = r'c:\Users\User\Desktop\thryftverse-upgrade\frontend\.expo\dev\logs\start.log'
lines = open(p, encoding='utf-8', errors='replace').read().splitlines()
events = [json.loads(l) for l in lines if l.startswith('{')]
fails = [e for e in events if e.get('_e') == 'metro:bundling:failed']
out = io.open(r'c:\Users\User\Desktop\thryftverse-upgrade\bundle-fail.txt', 'w', encoding='utf-8')
if not fails:
    out.write('NO FAILURE EVENT\n')
else:
    f = fails[-1]
    out.write('KEYS: %s\n' % list(f.keys()))
    for k, v in f.items():
        out.write('\n%s = %s\n' % (k, str(v)))
out.close()
print('written')