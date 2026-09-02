#!/usr/bin/env python3
"""
runProfile.py - empirical time + space complexity profiler.

This is the measurement engine. It knows nothing about AI. The BoxLang agent
shells out to it and gets JSON back.

Contract for a target file:
    solution(x)        - REQUIRED. The function under test.
    make_input(n)      - OPTIONAL. Returns the argument passed to solution(n).
                         If absent, solution(n) is called with the raw size.

Usage:
    python runProfile.py --target examples/sum_squares_list.py --sizes 100000,200000,400000,800000
    python runProfile.py --target examples/fib.py --sizes 20,24,28,30,32 --func solution --repeats 5

Output: a single JSON object on stdout.
Stdlib only. Works on Windows (no `resource` module dependency).
"""

import argparse
import gc
import importlib.util
import json
import math
import subprocess
import sys
import time
import tracemalloc


# --------------------------------------------------------------------------
# Worker: runs inside a fresh subprocess, measures ONE input size, prints JSON.
# --------------------------------------------------------------------------
def _load_target(path):
    spec = importlib.util.spec_from_file_location("_target", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _worker(path, func_name, size, repeats):
    mod = _load_target(path)
    fn = getattr(mod, func_name)
    make_input = getattr(mod, "make_input", None)
    arg = make_input(size) if make_input else size

    gc.collect()
    gc.disable()

    # Timing: best-of-N with perf_counter (min = least noise from the OS).
    best = math.inf
    result = None
    for _ in range(repeats):
        start = time.perf_counter()
        result = fn(arg) if not isinstance(arg, tuple) else fn(*arg)
        elapsed = time.perf_counter() - start
        best = min(best, elapsed)

    # Memory: one clean run under tracemalloc for peak Python-level allocation.
    tracemalloc.start()
    fn(arg) if not isinstance(arg, tuple) else fn(*arg)
    _current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    gc.enable()

    print(json.dumps({
        "size": size,
        "time_ms": best * 1000.0,
        "peak_kb": peak / 1024.0,
        "result_repr": repr(result)[:120],
    }))


# --------------------------------------------------------------------------
# Curve fitting (no numpy): least squares on transformed axes.
# --------------------------------------------------------------------------
def _linfit(xs, ys):
    """Return (slope, intercept, r2) for a linear least-squares fit."""
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    slope = sxy / sxx if sxx else 0.0
    intercept = my - slope * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 - ss_res / ss_tot if ss_tot else 1.0
    return slope, intercept, r2


def _fit_axis(sizes, values):
    """Fit both a power law (log-log) and an exponential (semi-log); pick a label."""
    if len(sizes) < 2:
        return {"label": "insufficient data (need >= 2 successful runs)",
                "exponent": None, "power_r2": None, "exp_r2": None}

    pts = [(s, v) for s, v in zip(sizes, values) if s > 0 and v > 0]
    if len(pts) < 2:
        return {"label": "O(1) - negligible heap allocation "
                         "(recursion stack depth is not measured by tracemalloc)",
                "exponent": 0.0, "power_r2": None, "exp_r2": None}

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]

    p_slope, _, p_r2 = _linfit([math.log(x) for x in xs], [math.log(y) for y in ys])
    e_slope, _, e_r2 = _linfit(xs, [math.log(y) for y in ys])

    # True exponential growth drives the power-law exponent absurdly high while
    # the semi-log fit stays near-perfect. Either a decisive semi-log win or a
    # runaway power exponent (with a good semi-log fit) is enough to call it.
    exponential = (e_slope > 0 and e_r2 > 0.99
                   and (e_r2 >= p_r2 + 0.02 or p_slope > 3.5))

    if exponential:
        label = "O(2^n) - exponential"
    elif p_slope < 0.30:
        label = "O(1) - constant"
    elif p_slope < 0.85:
        label = "sub-linear (~O(log n))"
    elif p_slope < 1.25:
        label = "O(n) - linear"
    elif p_slope < 1.60:
        label = "O(n log n)"
    elif p_slope < 2.40:
        label = "O(n^2) - quadratic"
    elif p_slope < 3.40:
        label = "O(n^3) - cubic"
    else:
        label = f"O(n^{p_slope:.1f}) - polynomial"

    return {
        "label": label,
        "exponent": round(p_slope, 3),
        "power_r2": round(p_r2, 4),
        "exp_r2": round(e_r2, 4),
    }


# --------------------------------------------------------------------------
# Orchestrator: one subprocess per size, then fit and report.
# --------------------------------------------------------------------------
def _orchestrate(target, func_name, sizes, repeats, timeout):
    runs = []
    for n in sizes:
        cmd = [sys.executable, __file__, "--_worker",
               "--target", target, "--func", func_name,
               "--size", str(n), "--repeats", str(repeats)]
        try:
            out = subprocess.run(cmd, capture_output=True, text=True,
                                 timeout=timeout, check=True)
            runs.append({**json.loads(out.stdout.strip().splitlines()[-1]),
                         "status": "ok"})
        except subprocess.TimeoutExpired:
            runs.append({"size": n, "status": "timeout",
                         "time_ms": None, "peak_kb": None})
        except subprocess.CalledProcessError as e:
            runs.append({"size": n, "status": "error",
                         "stderr": e.stderr.strip()[-500:],
                         "time_ms": None, "peak_kb": None})

    ok = [r for r in runs if r["status"] == "ok"]
    ok_sizes = [r["size"] for r in ok]

    report = {
        "target": target,
        "function": func_name,
        "runs": runs,
        "time_complexity": _fit_axis(ok_sizes, [r["time_ms"] for r in ok]),
        "space_complexity": _fit_axis(ok_sizes, [r["peak_kb"] for r in ok]),
        "dominant_axis": None,
        "caveats": [
            "tracemalloc measures Python-level allocations only; C-extension "
            "memory (numpy, pandas) is undercounted.",
            "Complexity labels are empirical estimates from a small number of "
            "input sizes, not formal proofs.",
        ],
    }

    tc = report["time_complexity"]["exponent"]
    sc = report["space_complexity"]["exponent"]
    if tc is not None and sc is not None:
        report["dominant_axis"] = "time" if tc >= sc else "space"

    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target")
    ap.add_argument("--func", default="solution")
    ap.add_argument("--sizes")
    ap.add_argument("--repeats", type=int, default=5)
    ap.add_argument("--timeout", type=int, default=15)
    ap.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--size", type=int, help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args._worker:
        _worker(args.target, args.func, args.size, args.repeats)
        return

    sizes = [int(s) for s in args.sizes.split(",")]
    report = _orchestrate(args.target, args.func, sizes, args.repeats, args.timeout)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
