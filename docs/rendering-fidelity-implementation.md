# Rendering fidelity implementation

This change addresses the reproducible defects in the [16 October audit](rendering-fidelity-audit-2026-10-16.md). It improves the existing local renderer; it does not replace it with Office or establish pixel equivalence with Office.

## Changes

| Area | Implemented behavior | Audit references |
|---|---|---|
| PowerPoint transparency | Picture opacity, including zero opacity, reaches the image renderer. Shape alpha modulation and offsets are applied in order with clamping. | P01, P02 |
| PowerPoint images | Grayscale, picture-fill crop/opacity, and clipping to supported shape outlines. | P09, P10 (partial) |
| PowerPoint colors and styles | scRGB/HSL/preset colors, theme fill/line/effect indexes, layout/slide color maps, placeholder fill/line/effect/geometry inheritance. Inherited image fills use their source part's relationships. | P03 (partial), P18–P20 |
| Grouped slides | Affine matrices compose group scaling, rotation, translation and flips. Fonts and local dimensions remain inside the transformed coordinate space. | P05, P23 |
| Slide text | Baseline, tracking, caps, exact line spacing, hanging indent, common Latin/Roman/Arabic numbering and start values, distinct vertical modes, columns/rotation, inherited autofit, inherited underline/strike. No-wrap reaches paragraphs. | P11–P15 (partial), P24 |
| Slide tables and compatibility | Per-cell margins, vertical anchors and explicit borders. XML booleans accept both lexical forms. Supported AlternateContent choices render, falling back for unknown namespaces. Hidden-slide content is no longer faded. | P06, P16 (partial), P17, P26 |
| Charts | Authored linear min/max/reversal with plot clipping, stacked line series, one-slice doughnut holes, line blank policies, absolute pie values. | C01, C03, C04, C08 (partial) |
| Unsupported charts | Log/secondary-axis plots, 3D plots, incompatible stacked combinations, unsupported mixed groups and oversized caches use a visible unavailable preview. They are not approximated by dropping series or flattening 3D. | C01–C03, C06, C07 (fallback policy) |
| Spreadsheets | Authored family/size/rotation/vertical alignment/indent; text measurement uses font metrics. The document canvas retains original colors in every app theme. Print includes supplied pictures/charts, fonts, cell borders and rotation. | X01, X02 (partial), X04, X05 |
| Word | Page-view notice explains pagination differences. Printing re-renders using the authored paper width even when Reading view is active. | D01 (disclosure), D04 |
| Text | JSON formatting changes whitespace only, preserving numeric lexemes, escapes and duplicate keys. An encoding selector supports UTF variants and common non-Western legacy encodings. | F01, F02 |

The new labels are translated into all six supported UI languages.

## Verification

- Normal unit tests include `renderingFidelity.test.ts`: positive assertions for the fixed behavior, plus edge cases for alpha, clipping, chart accumulation, fallback selection and explicit style overrides.
- Browser integration tests cover actual picture opacity, JSON precision, encoding selection, authored spreadsheet colors/fonts in dark mode and Word printing from Reading view.
- Existing slide, PDF, Word and spreadsheet navigation/interaction checks were exercised against the development server.
- `playwright.dev.config.ts` allows local browser testing without building the app. Type checking uses `tsc --noEmit --incremental false`.
- GitHub CI/Validate perform production and native builds. No local production, Rust or Tauri build is part of this work.

The original diagnostics now retain only unresolved observations and fixture generation. Passing those diagnostic checks confirms the documented limitation, rather than correctness. The original audit is a historical baseline.

## Remaining work

The broader audit remains useful. In particular, this change does not implement full table styles/banding, conditional formatting, the entire DrawingML geometry/gradient/effects catalog, Office font embedding/substitution equivalence, dynamic Word pagination, missing Word drawing types, legacy-format style parity, or exact print page setup. Non-Latin numbering schemes, advanced vertical text, WordArt, tabs and some paragraph/autofit metrics still need work. Picture luminance/recoloring, fill tiling and some color transforms are also incomplete.

Charts still reconstruct much of their appearance: annotations, trendlines, secondary/log axes, authored legends, precise pie rotation and advanced marker styling need a fuller model. Unsupported configurations deliberately show an unavailable preview. This changes some formerly plausible but incorrect charts into placeholders.

The Word notice does not create a pagination engine. Encoding selection is an explicit override; automatic detection still uses the existing BOM/UTF-8/Windows-1252 policy and CSV has no new selector. Spreadsheet print areas, repeating headers and native paper orientation remain approximate.

Native PowerPoint/Word/Excel reference renders and cross-platform pixel comparisons have not been performed. Matrix composition and browser output are tested, but grouped/flipped text and unusual nonuniform transforms still warrant Office reference comparisons. These limits must not be described as complete Office fidelity.
