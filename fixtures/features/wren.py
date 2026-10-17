"""A small program, to read with its syntax coloured."""

import math


def song(n: int) -> str:
    # A comment the reader should see in grey.
    if n < 1:
        return "<silent>"
    return f"wren song {n} of {math.pi:.2f}"


class Hedge:
    birds = [1, 2, 3]
