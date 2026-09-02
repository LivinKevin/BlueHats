"""Streams squares through a generator - same O(n) time, but O(1) memory.

This is the "after" of the canonical demo: on the overlay chart the memory
curve collapses while the time curve stays flat.
"""


def make_input(n):
    return n


def solution(n):
    return sum(i * i for i in range(n))
