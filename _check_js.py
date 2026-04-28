"""Check JS bracket balance around edited areas."""
with open("/home/fatih-root/TIRPAN/web/static/app.js") as f:
    content = f.read()
lines = content.split("\n")
start, end = 2495, 2620
balance = 0
for i in range(start - 1, min(end, len(lines))):
    line = lines[i]
    opens = line.count("{")
    closes = line.count("}")
    balance += opens - closes
    print(f"{i+1:>5d}: B={balance:>3d} | {line[:110]}")
