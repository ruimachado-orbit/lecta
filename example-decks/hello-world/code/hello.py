# Python Demo - Running in Pyodide (WebAssembly)

import sys
import math

print(f"Python {sys.version}")
print(f"Running in: {'Pyodide (WebAssembly)' if 'pyodide' in sys.modules else 'Native Python'}")
print()

# Basic computation
numbers = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]
roots = [math.sqrt(n) for n in numbers]

print("Square roots:")
for n, r in zip(numbers, roots):
    print(f"  sqrt({n:3d}) = {r:.1f}")

print()
print(f"Sum of roots: {sum(roots):.2f}")
print(f"Pi approximation: {math.pi:.10f}")
