# Part 6R — progress

User decisions 2026-10-29: do 6R now before 6G; self-review checkpoints against DESIGN §13 and batch the captures for the end; proposals Q1–Q14 taken as written; subset fonts; hosted accounts wait (click-list in 6G).

Order (overview §3): R1 → T0–T3 → R2 → R3 → R4 → R5 → T4–T6 → R6 (P1–P7) → S2 → R7 → R8 → T7 + R9 → 6F re-measure → 6G → 6H → 6I.

| Step | State |
|---|---|
| R1 tokens, Archivo, primitives, S6, S8 | Committed 30e4136 |
| R2 render kit, R3 landing / login / demo, R4 shell + Home, R5 gallery + 3D briefing + camera flight | Committed. Still open: coverage drape on the 3D briefing (stays on the Map view), classify-the-clip and pinned scroll on the landing, shared-element view transitions |
| R6 player (P1–P5): main view, PIP, wide radar, track card, More, threat sort, time to asset. Not built from the plan: compass tape, Comms filters, PPI leader lines, F3 cell at 1920 (RF / spectrogram stay tabs), auto-swap on cue | Committed |
| R7 result hero, large score; S2 resume with reload e2e | Committed |
| T1–T6 terrain: Sentinel-2 albedo, cover, AO, normals, detail, sky, height haze, baked shadows, trees, roofs, IR by cover, quality tiers | Committed; T4–T6 ran before R2 so renders are made once. Not done from the plan: PUNJAB tree rows (NDVI cannot separate wheat from trees in Feb–Mar) and OSM roads / water painting (the imagery already shows them) |
