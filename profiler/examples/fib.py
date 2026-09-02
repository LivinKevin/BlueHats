"""Naive recursive Fibonacci - exponential time, linear stack space.

The other canonical demo: the time curve is a straight line on a semi-log plot
(exponential), and the agent's fix is memoisation.
"""


def make_input(n):
    return n


def solution(n):
    if n < 2:
        return n
    return solution(n - 1) + solution(n - 2)
