"""Materialises the full list of squares before summing - O(n) time, O(n) memory."""


def make_input(n):
    return n


def solution(n):
    data = [i * i for i in range(n)]
    return sum(data)
