#!/usr/bin/env python3
"""JasLang 0.3: safe interpreted programming language owned by Jaslyn."""
import ast
import operator
import re
from dataclasses import dataclass

MAX_LINES = 1200
MAX_STEPS = 10000
MAX_OUTPUT = 50000
MAX_ARRAY = 1000

@dataclass
class Result:
    output: list[str]
    variables: dict[str, object]
    steps: int

@dataclass
class JasObject:
    class_name: str
    fields: dict[str, object]

class JasLangError(Exception): pass
class ReturnSignal(Exception):
    def __init__(self, value): self.value = value
class BreakSignal(Exception): pass
class ContinueSignal(Exception): pass

class JasLang:
    def __init__(self, source: str, max_steps: int = MAX_STEPS):
        self.lines = [line.strip() for line in source.splitlines() if line.strip() and not line.strip().startswith("#")]
        if len(self.lines) > MAX_LINES: raise JasLangError(f"Program exceeds {MAX_LINES} lines")
        self.vars: dict[str, object] = {}
        self.functions: dict[str, tuple[list[str], int, int]] = {}
        self.classes: dict[str, dict[str, tuple[list[str], int, int]]] = {}
        self.output: list[str] = []
        self.steps = 0
        self.max_steps = min(max(int(max_steps), 1), MAX_STEPS)
        self.index_definitions()

    def index_definitions(self):
        i = 0
        while i < len(self.lines):
            class_match = re.match(r"class\s+([A-Za-z_]\w*)", self.lines[i])
            if class_match:
                class_end = self.find_end(i, len(self.lines))
                methods = {}; j = i + 1
                while j < class_end:
                    method = re.match(r"fn\s+([A-Za-z_]\w*)\s*\((.*?)\)", self.lines[j])
                    if method:
                        method_end = self.find_end(j, class_end)
                        methods[method.group(1)] = ([x.strip() for x in method.group(2).split(",") if x.strip()], j + 1, method_end)
                        j = method_end + 1
                    else: j += 1
                self.classes[class_match.group(1)] = methods
                i = class_end + 1; continue
            match = re.match(r"fn\s+([A-Za-z_]\w*)\s*\((.*?)\)", self.lines[i])
            if match:
                end = self.find_end(i, len(self.lines))
                self.functions[match.group(1)] = ([x.strip() for x in match.group(2).split(",") if x.strip()], i + 1, end)
                i = end + 1; continue
            i += 1

    def run(self) -> Result:
        self.execute_block(0, len(self.lines), skip_definitions=True)
        return Result(self.output, self.vars, self.steps)

    def execute_block(self, start, end, skip_definitions=False):
        i = start
        while i < end:
            self.tick(); line = self.lines[i]
            if skip_definitions and (line.startswith("fn ") or line.startswith("class ")):
                i = self.find_end(i, end) + 1; continue
            if line in ("else", "end") or line.startswith("else "): return i
            if line.startswith(("fn ", "class ")): i = self.find_end(i, end) + 1; continue
            if line.startswith("if "):
                else_at, end_at = self.find_branch(i, end); condition = self.evaluate(line[3:].rstrip(":"))
                if condition: self.execute_block(i + 1, else_at if else_at is not None else end_at)
                elif else_at is not None: self.execute_block(else_at + 1, end_at)
                i = end_at + 1; continue
            if line.startswith("while "):
                end_at = self.find_end(i, end)
                while self.evaluate(line[6:].rstrip(":")):
                    try: self.execute_block(i + 1, end_at)
                    except BreakSignal: break
                    except ContinueSignal: continue
                i = end_at + 1; continue
            if line.startswith("for "):
                match = re.match(r"for\s+([A-Za-z_]\w*)\s+in\s+(.+)$", line)
                if not match: raise JasLangError(f"Invalid for loop: {line}")
                end_at = self.find_end(i, end); values = self.evaluate(match.group(2).rstrip(":"))
                if not isinstance(values, (list, str)): raise JasLangError("for expects an array or string")
                for value in values:
                    self.vars[match.group(1)] = value
                    try: self.execute_block(i + 1, end_at)
                    except BreakSignal: break
                    except ContinueSignal: continue
                i = end_at + 1; continue
            if line == "break": raise BreakSignal()
            if line == "continue": raise ContinueSignal()
            if line.startswith("return"):
                expr = line[6:].strip(); raise ReturnSignal(self.evaluate(expr) if expr else None)
            if line.startswith(("say ", "print ")):
                value = self.evaluate(line.split(" ", 1)[1]); self.output.append(str(value))
                if sum(len(item) + 1 for item in self.output) > MAX_OUTPUT: raise JasLangError("Output limit exceeded")
            elif line.startswith("let "):
                match = re.match(r"let\s+([A-Za-z_]\w*)\s*=\s*(.*)$", line)
                if not match: raise JasLangError(f"Invalid declaration: {line}")
                self.vars[match.group(1)] = self.evaluate(match.group(2))
            else:
                match = re.match(r"([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*(.*)$", line)
                if match:
                    obj = self.get_var(match.group(1))
                    if not isinstance(obj, JasObject): raise JasLangError("Property assignment requires an object")
                    obj.fields[match.group(2)] = self.evaluate(match.group(3)); i += 1; continue
                match = re.match(r"([A-Za-z_]\w*)\s*=\s*(.*)$", line)
                if not match: raise JasLangError(f"Unknown statement: {line}")
                if match.group(1) not in self.vars: raise JasLangError(f"Unknown variable: {match.group(1)}")
                self.vars[match.group(1)] = self.evaluate(match.group(2))
            i += 1
        return end

    def get_var(self, name):
        if name not in self.vars: raise JasLangError(f"Unknown variable: {name}")
        return self.vars[name]

    def call_function(self, name, args):
        if name not in self.functions: raise JasLangError(f"Unknown function: {name}")
        params, start, end = self.functions[name]
        return self.invoke(params, start, end, args)

    def call_method(self, obj, name, args):
        if not isinstance(obj, JasObject) or obj.class_name not in self.classes: raise JasLangError(f"Unknown method target: {name}")
        if name not in self.classes[obj.class_name]: raise JasLangError(f"Class {obj.class_name} has no method {name}")
        params, start, end = self.classes[obj.class_name][name]
        return self.invoke(params, start, end, args, self_obj=obj)

    def invoke(self, params, start, end, args, self_obj=None):
        expected = len(params) - (1 if params and params[0] == "self" else 0)
        if expected != len(args): raise JasLangError(f"Function expects {expected} arguments")
        previous = self.vars; self.vars = ({"self": self_obj} if self_obj else {})
        offset = 1 if params and params[0] == "self" else 0
        self.vars.update(dict(zip(params[offset:], args)))
        try: self.execute_block(start, end)
        except ReturnSignal as result: return result.value
        finally: self.vars = previous
        return None

    def find_end(self, start, end):
        depth = 0
        for i in range(start, end):
            if self.lines[i].startswith(("if ", "while ", "for ", "fn ", "class ")): depth += 1
            elif self.lines[i] == "end":
                depth -= 1
                if depth == 0: return i
        raise JasLangError("Missing end")

    def find_branch(self, start, end):
        depth = 0; else_at = None
        for i in range(start, end):
            if self.lines[i].startswith(("if ", "while ", "for ", "fn ", "class ")): depth += 1
            elif self.lines[i] == "end":
                depth -= 1
                if depth == 0: return else_at, i
            elif self.lines[i] == "else" and depth == 1: else_at = i
        raise JasLangError("Missing end")

    def evaluate(self, expression):
        expression = expression.strip(); expression = re.sub(r"\btrue\b", "True", expression, flags=re.I); expression = re.sub(r"\bfalse\b", "False", expression, flags=re.I)
        expression = re.sub(r"\bnew\s+([A-Za-z_]\w*)\s*\(", r"__new_\1(", expression)
        try: tree = ast.parse(expression, mode="eval")
        except SyntaxError as exc: raise JasLangError(f"Invalid expression: {expression}") from exc
        return self.eval_node(tree.body)

    def eval_node(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float, bool, type(None))): return node.value
        if isinstance(node, ast.List):
            values = [self.eval_node(item) for item in node.elts]
            if len(values) > MAX_ARRAY: raise JasLangError("Array limit exceeded")
            return values
        if isinstance(node, ast.Tuple): return tuple(self.eval_node(item) for item in node.elts)
        if isinstance(node, ast.Name): return self.get_var(node.id)
        if isinstance(node, ast.Attribute):
            obj = self.eval_node(node.value)
            if isinstance(obj, JasObject) and node.attr in obj.fields: return obj.fields[node.attr]
            if isinstance(obj, JasObject): return (obj, node.attr)
            raise JasLangError(f"Unknown property: {node.attr}")
        if isinstance(node, ast.Subscript):
            value = self.eval_node(node.value); index = self.eval_node(node.slice)
            if not isinstance(index, int): raise JasLangError("Array index must be an integer")
            try: return value[index]
            except (IndexError, KeyError, TypeError) as exc: raise JasLangError("Index out of bounds") from exc
        if isinstance(node, ast.BinOp) and type(node.op) in {ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod}:
            fn = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.Mod: operator.mod}[type(node.op)]; return fn(self.eval_node(node.left), self.eval_node(node.right))
        if isinstance(node, ast.Compare):
            left = self.eval_node(node.left)
            for op, comparator in zip(node.ops, node.comparators):
                right = self.eval_node(comparator); fn = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}.get(type(op))
                if not fn or not fn(left, right): return False
                left = right
            return True
        if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
            values = [bool(self.eval_node(value)) for value in node.values]; return all(values) if isinstance(node.op, ast.And) else any(values)
        if isinstance(node, ast.UnaryOp) and type(node.op) in {ast.USub, ast.Not}: return -self.eval_node(node.operand) if isinstance(node.op, ast.USub) else not self.eval_node(node.operand)
        if isinstance(node, ast.Call):
            args = [self.eval_node(arg) for arg in node.args]
            if isinstance(node.func, ast.Attribute):
                target = self.eval_node(node.func.value)
                if isinstance(target, tuple) and isinstance(target[0], JasObject): return self.call_method(target[0], target[1], args)
                return self.call_method(target, node.func.attr, args)
            if not isinstance(node.func, ast.Name): raise JasLangError("Only named calls are allowed")
            name = node.func.id
            if name.startswith("__new_"):
                class_name = name[6:]
                if class_name not in self.classes: raise JasLangError(f"Unknown class: {class_name}")
                obj = JasObject(class_name, {})
                if "init" in self.classes[class_name]: self.call_method(obj, "init", args)
                elif args: raise JasLangError(f"Class {class_name} has no init method")
                return obj
            if name == "len": return len(args[0])
            if name == "range": return list(range(*[int(arg) for arg in args]))
            if name == "str": return str(args[0])
            if name == "int": return int(args[0])
            return self.call_function(name, args)
        raise JasLangError("Expression uses a disallowed operation")

    def tick(self):
        self.steps += 1
        if self.steps > self.max_steps: raise JasLangError("Execution step limit exceeded")

def serialise(value):
    if isinstance(value, JasObject):
        return {"__class__": value.class_name, "fields": {key: serialise(item) for key, item in value.fields.items()}}
    if isinstance(value, list): return [serialise(item) for item in value]
    if isinstance(value, tuple): return [serialise(item) for item in value]
    return value

def run(source: str, max_steps: int = MAX_STEPS) -> dict:
    result = JasLang(source, max_steps).run()
    return {"output": result.output, "variables": {key: serialise(value) for key, value in result.variables.items()}, "steps": result.steps, "language": "JasLang", "version": "0.3"}
