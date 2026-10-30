"""Create explicitly synthetic practice data; never treat it as visitor research."""
from pathlib import Path
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
rows = []
for i in range(90):
    group = i % 3
    page_views = int(rng.integers(*[(2, 8), (15, 40), (40, 90)][group]))
    rows.append({
        "research_id": f"SYNTHETIC-{i:04d}",
        "page_views": page_views,
        "note_views": int(rng.integers(*[(1, 6), (12, 30), (35, 85)][group])),
        "creates": int(rng.integers(*[(0, 2), (3, 10), (18, 40)][group])),
        "edits": int(rng.integers(*[(0, 2), (6, 18), (30, 70)][group])),
        "uploads": int(rng.integers(*[(0, 1), (0, 3), (4, 15)][group])),
        "shares": int(rng.integers(*[(0, 1), (1, 4), (8, 20)][group])),
        "active_seconds": int(rng.integers(*[(20, 180), (500, 2000), (3000, 8000)][group])),
        "active_days": int(rng.integers(*[(1, 3), (3, 10), (10, 25)][group])),
        "_synthetic": 1,
    })
path = Path(__file__).with_name("demo_activity.csv")
pd.DataFrame(rows).to_csv(path, index=False)
print(f"Wrote 90 SYNTHETIC browser records to {path.name}.")
