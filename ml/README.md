# NoteAtlas: audience behavior research

This is an ML project you can run on your computer. Python trains a K-means model; the TypeScript website imports its JSON parameters and uses the same log1p, scaling, and nearest-centroid calculation to show aggregate audience groups.

**Age, gender, and country of residence come from an optional survey. They are not ML predictions.** Country estimated from the network is approximate, separate from residence, and can be unknown. Descriptive statistics answer demographic questions; ML explores usage patterns.

## Practice first

Use Python 3.10 or newer. Create a virtual environment, activate it, then run:

```bash
pip install -r requirements.txt
python make_demo.py
python train.py demo_activity.csv
```

This creates `results/model.json`, `results/report.json`, and `results/cluster_summary.csv`. Practice data and the resulting model are labeled **synthetic**. They are not findings about your visitors.

## Train on your website

1. Open NoteAtlas as its owner. Use **Research & privacy** to understand participation.
2. Let people choose whether to join. The starter restricts participation to adults 18+ and requires explicit agreement. They can use notes without joining.
3. In **ML lab**, turn **Sample data** off and download **Export activity CSV**. Only the research owner can export.
4. Start with at least 30 varied participating browser records. This minimum is a practical guard, not proof of adequate research sample size.
5. Save the CSV beside this script, then run:

```bash
python train.py noteatlas-activity.csv
```

6. Read `results/report.json`. In the website, click **Import model.json** and select `results/model.json`.
7. The dashboard applies that model to current 30-day behavior aggregates. Repeat training when behavior changes. Model training does not run on the website; Python runs on your machine.

## Features

The input has one row per opted-in pseudonymous browser ID. Eight numeric features cover the preceding 30 days:

| Feature | Meaning |
| --- | --- |
| page_views | Navigations between workspace views and shared note openings |
| note_views | Note editor or shared note openings |
| creates | Notes created, excluding starter examples |
| edits | Saved edits and star changes |
| uploads | Files attached |
| shares | Sharing link enable requests |
| active_seconds | Estimated time in a visible tab, sampled every 30 seconds |
| active_days | Distinct UTC dates with recorded activity |

The export contains no account IDs, names, email, note titles/content, survey demographics, raw IP addresses, or full user agents. It **is pseudonymous**, not guaranteed anonymous. Keep exports private. A browser may be used by several people, and one person may use several browsers. Clearing cookies creates another ID.

## Training and evaluation

The script validates IDs and numeric features; rejects fewer than 30 records and low-variation datasets; splits browsers 80/20 before fitting any preprocessing; applies log1p and StandardScaler; compares K=2 to K=6 on training silhouette score with a minimum training group size of three; and reports silhouette on held-out browsers without using that score for selection. The exported scaler and centroids are fitted only on the training split.

Silhouette scores range from -1 to 1, with higher values indicating better separation. This is **not classification accuracy**, demographic truth, a confidence interval, or evidence of causation. A random holdout does not test drift over future months. Neutral Group 1/2/3 labels avoid claiming an interpretation that has not been checked. Inspect aggregate feature means, rerun different seeds, and validate on a later observation period before relying on a pattern. Even a high score does not show that the sample represents all visitors.

Small groups below five are combined in exported summaries and the dashboard. This is a basic disclosure reduction, not differential privacy or a complete anonymity guarantee. A model trained on synthetic data remains labeled synthetic after import. Small or unbalanced real datasets can produce weak or unstable groups.

## Consent, retention, and withdrawal

Research is off until a visitor agrees. Research uses a random HttpOnly first-party cookie; note ownership uses the site's separate authenticated identity. Raw IPs, full user-agent strings, note content, and account identity are not stored in research tables. Infrastructure may maintain its own operational logs.

Research records expire after 90 days. Expired records are excluded from participation and removed on the next research signup, owner analytics view, or export. This is request-triggered cleanup, not a scheduled background deletion service. **Leave research & delete my records** deletes the current browser's linked participant and events. Existing downloaded exports or fitted models cannot be recalled automatically; handle withdrawal requests against your copies and retrain or remove affected models as appropriate.

Survey participants are a self-selected subset. Report denominators, skipped/unknown answers, and limitations. Do not generalize survey proportions to everyone who visits the site.

## Useful sources

- [scikit-learn clustering and silhouette documentation](https://scikit-learn.org/stable/modules/clustering.html)
- [scikit-learn common pitfalls: preprocessing and data leakage](https://scikit-learn.org/stable/common_pitfalls.html)
- [Cloudflare request country metadata](https://developers.cloudflare.com/workers/runtime-apis/request/)

## Next experiments

Try stability across random seeds, future-period evaluation, and note-topic recommendations using consented public content. Keep observed, self-reported, and modeled results separate. Do not add demographic guessing to fill skipped survey answers.
