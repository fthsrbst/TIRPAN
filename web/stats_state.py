"""
Shared in-process state for live stats (tokens, etc.).
"""


class _TokenCounter:
    def __init__(self):
        self.total_input: int = 0
        self.total_output: int = 0

    @property
    def total(self) -> int:
        return self.total_input + self.total_output

    def add(self, prompt_tokens: int = 0, eval_tokens: int = 0) -> None:
        self.total_input += prompt_tokens
        self.total_output += eval_tokens


token_counter = _TokenCounter()
