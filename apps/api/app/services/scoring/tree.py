"""Decision-tree engine (SPEC §9.2).

A tree is JSON: `if` nodes test one metric, `bands` nodes pick a leaf by value
range, and leaves award component points (or a session-level `adjust`) with a
feedback line. A leaf may continue to another node via `next`.

default_v4 extensions (decision 115): `roots` lists further subtrees walked for
every contact after `root`; a leaf's `pointsMetric` takes its points from a
metric (clamped to 0..`points`); `tMetric` names the metric that gives an
adjustment's time; an `if` branch may be null to end the walk. Trees that do not
use them evaluate exactly as before.

Tree versions that have scored sessions are immutable (CLAUDE.md §12).
"""

import json
import math
import string
from functools import cache
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.generated import ScoreComponents

TREE_DIR = Path(__file__).resolve().parent / "trees"
MAX_STEPS = 64

Component = Literal["detection", "classification", "decision", "report", "efficiency"]
Op = Literal["==", "!=", "<", "<=", ">", ">=", "exists", "missing"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class TreeLeaf(_Strict):
    leaf: str = Field(min_length=1)
    component: Component | None = None
    points: float = 0
    #: Session-level penalty (negative) or bonus, listed under `penalties`.
    adjust: float | None = None
    #: Leave this contact out of component averages (fairness, SPEC §9.6).
    excluded: bool = False
    #: Leave this contact out of only these components' averages (decision 56).
    exclude_components: Annotated[list[Component], Field(alias="excludeComponents")] = []
    feedback: str
    next: str | None = None
    #: v4: points come from this metric (capped at `points`); the leaf is skipped
    #: from the component when the metric is missing.
    points_metric: Annotated[str | None, Field(alias="pointsMetric")] = None
    #: v4: the metric (ms) that dates this adjustment on the result screen and timeline.
    t_metric: Annotated[str | None, Field(alias="tMetric")] = None


class Condition(_Strict):
    metric: str
    op: Op
    value: Any = None


class IfNode(_Strict):
    if_: Annotated[Condition, Field(alias="if")]
    then: str | TreeLeaf | None
    else_: Annotated[str | TreeLeaf | None, Field(alias="else")]


class Bands(_Strict):
    metric: str
    edges: list[float] = Field(min_length=1)


class BandsNode(_Strict):
    bands: Bands
    leaves: list[TreeLeaf]
    next: str | None = None

    @model_validator(mode="after")
    def _one_leaf_per_band(self) -> "BandsNode":
        if len(self.leaves) != len(self.bands.edges) + 1:
            raise ValueError("bands need exactly len(edges) + 1 leaves")
        if self.bands.edges != sorted(self.bands.edges):
            raise ValueError("band edges must be ascending")
        return self


class Tree(_Strict):
    id: str
    description: str = ""
    component_max: Annotated[ScoreComponents, Field(alias="componentMax")]
    root: str
    #: v4: further subtrees walked for every contact after `root`.
    roots: list[str] = []
    nodes: dict[str, IfNode | BandsNode]

    @model_validator(mode="after")
    def _check_references(self) -> "Tree":
        maxima = self.component_max.model_dump()
        refs: list[str] = [self.root, *self.roots]
        leaves: list[TreeLeaf] = []
        for node in self.nodes.values():
            branches = [node.then, node.else_] if isinstance(node, IfNode) else node.leaves
            if isinstance(node, BandsNode) and node.next:
                refs.append(node.next)
            for b in branches:
                if isinstance(b, str):
                    refs.append(b)
                elif b is not None:
                    leaves.append(b)
        for leaf in leaves:
            if leaf.next:
                refs.append(leaf.next)
            if leaf.component and leaf.points > maxima[leaf.component]:
                raise ValueError(f"leaf {leaf.leaf} awards more than {leaf.component} max")
        if missing := sorted({r for r in refs if r not in self.nodes}):
            raise ValueError(f"unknown nodes: {missing}")
        ids = [leaf.leaf for leaf in leaves]
        if len(ids) != len(set(ids)):
            raise ValueError("leaf ids must be unique")
        return self

    def all_leaves(self) -> list[TreeLeaf]:
        out: list[TreeLeaf] = []
        for node in self.nodes.values():
            branches = [node.then, node.else_] if isinstance(node, IfNode) else node.leaves
            out += [b for b in branches if isinstance(b, TreeLeaf)]
        return out


@cache
def load_tree(tree_id: str) -> Tree:
    path = TREE_DIR / f"{tree_id}.json"
    if not path.is_file() or not tree_id.replace("_", "").isalnum():
        raise ValueError(f"Unknown scoring tree {tree_id!r}")
    tree = Tree.model_validate(json.loads(path.read_text(encoding="utf-8")))
    if tree.id != tree_id:
        raise ValueError(f"Tree file {path.name} has id {tree.id!r}")
    return tree


def _test(cond: Condition, metrics: dict[str, Any]) -> bool:
    value = metrics.get(cond.metric)
    if cond.op == "exists":
        return value is not None
    if cond.op == "missing":
        return value is None
    if cond.op == "==":
        return value == cond.value
    if cond.op == "!=":
        return value != cond.value
    if value is None:
        return False
    if cond.op == "<":
        return value < cond.value
    if cond.op == "<=":
        return value <= cond.value
    if cond.op == ">":
        return value > cond.value
    return value >= cond.value


def evaluate(tree: Tree, metrics: dict[str, Any]) -> list[TreeLeaf]:
    """Walk the tree (root, then any extra roots) for one contact; leaves reached, in order."""
    reached: list[TreeLeaf] = []
    for root in [tree.root, *tree.roots]:
        reached += _walk(tree, root, metrics)
    return reached


def leaf_points(leaf: TreeLeaf, metrics: dict[str, Any]) -> float:
    """Component points of a leaf: fixed, or from `pointsMetric` capped at `points`."""
    if leaf.points_metric is None:
        return leaf.points
    value = metrics.get(leaf.points_metric)
    if value is None:
        return 0.0
    return min(max(float(value), 0.0), leaf.points)


def _walk(tree: Tree, root: str, metrics: dict[str, Any]) -> list[TreeLeaf]:
    reached: list[TreeLeaf] = []
    target: str | TreeLeaf | None = root
    for _ in range(MAX_STEPS):
        if target is None:
            return reached
        if isinstance(target, TreeLeaf):
            reached.append(target)
            target = target.next
            continue
        node = tree.nodes[target]
        if isinstance(node, IfNode):
            target = node.then if _test(node.if_, metrics) else node.else_
        else:
            value = metrics.get(node.bands.metric)
            if value is None:
                raise ValueError(f"metric {node.bands.metric} missing for bands")
            index = next((i for i, e in enumerate(node.bands.edges) if value < e), -1)
            leaf = node.leaves[index]
            reached.append(leaf)
            target = leaf.next or node.next
    raise ValueError(f"tree {tree.id} did not terminate within {MAX_STEPS} steps")


class _Formatter(string.Formatter):
    def format_field(self, value: Any, format_spec: str) -> str:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return "?"
        try:
            return super().format_field(value, format_spec)
        except (TypeError, ValueError):
            return str(value)

    def get_value(self, key: int | str, args: Any, kwargs: Any) -> Any:
        return kwargs.get(key) if isinstance(key, str) else None


def render_feedback(template: str, metrics: dict[str, Any]) -> str:
    return _Formatter().vformat(template, (), metrics)
