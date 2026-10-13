"""The nuclear data explorer's data pipeline: EXFOR and ENSDF to the JSON
under public/data (see scripts/data/README.md).

Modules: config (paths, scope, budgets), x4 (EXFOR reader), dataset (one
dataset's metadata and points), masses (AME2020, kinematics), dictionary
(EXFOR dictionary subset), scope (slices, atlas links), source (pinned
exfor_master), build_exfor, ensdf (ENSDF reader), fetch_ensdf, build_ensdf,
store (reading the output back), export (AZURE2, CSV, JSON, BibTeX), check.
"""
