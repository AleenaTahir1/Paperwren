# Rendering fidelity audit — 16 October 2026

> Historical baseline. The fixes and remaining limits are tracked in [the implementation report](rendering-fidelity-implementation.md). Findings below describe the original audited commit. Fixed probes now live in the normal regression suite.

Audited commit: `52c413b115b236a9bc2922eba63e53b07fe5944f` (`main`, synchronized with `origin/main` using fetch and fast-forward-only pull; already current).

**The reported transparency problem is real, but transparency is not universally broken.** Direct shape alpha works. Picture alpha modulation is discarded, so a picture authored at 25% opacity is displayed fully opaque. Other losses happen in both the parsers and the display components. Fixing only CSS opacity will not resolve the wider fidelity problem.

This is an audit, not a renderer rewrite. Application source and dependencies were not changed. Existing untracked user files were preserved. No local application, Rust, Tauri, or production build was run. Builds remain a GitHub responsibility; this audit did not push code or trigger a remote build.

## Evidence and limits

- **R — reproduced:** an automated diagnostic or live browser check demonstrated the behavior.
- **C — code verified:** the parsing/display path explicitly omits or replaces the feature. This establishes the limitation, but not its precise appearance in every Office file.
- **V — needs reference comparison:** a risk requiring authored files and reference renders before it can be called a confirmed visual defect.
- **High:** content can disappear, numbers/relationships can change, or the layout is materially misleading. **Medium:** visible formatting differences. **Compatibility:** intentional scope limits that should be disclosed.

Validation completed:

1. Existing suite: **27 test files, 228 tests passed**.
2. Separate diagnostic suite: **36 checks passed**. These assert observed shortcomings and working controls, not that the renderer is correct. They are intentionally outside the ordinary regression suite.
3. Live Vite development app, using the T3 collaborative browser: picture transparency, shape transparency, Word pagination, and JSON integer display checked through actual rendered DOM/computed styles.
4. Microsoft DrawingML documentation checked for picture alpha semantics; installed `docx-preview` implementation and upstream documentation checked for pagination limitations.
5. Additional live smoke checks: the sample PDF displayed its page text and nonempty canvases; the styled XLSX opened its grid. In the active dark theme its authored `#1f4e78` header fill displayed as `rgb(31, 52, 72)`, confirming document recoloring in the actual UI. The audit test file passes Biome checks.

No native PowerPoint/Word/Excel comparison or pixel-difference test was run. Browser snapshot calls failed, although navigation, interaction, and DOM evaluation worked. Therefore this report does **not** claim screenshot-based visual equivalence, Android/WebView2/macOS parity, or exhaustive coverage of every valid Office feature. A passing test suite is not evidence of that equivalence.

Diagnostic source: [tests/audit/rendering.test.ts](../tests/audit/rendering.test.ts). Commands and browser reproduction steps: [tests/audit/README.md](../tests/audit/README.md).

## Live reproductions

| Case | Authored input | Observed in Paperwren | Result |
|---|---|---|---|
| Picture opacity | `<a:alphaModFix amt="25000"/>` on a picture | Loaded image and both image wrappers have computed opacity `1`, filters `none`; parser output identical with/without the effect | Confirmed loss |
| Shape opacity control | `<a:alpha val="25000"/>` on a red shape | SVG computed fill `rgba(255, 0, 0, 0.25)` | Supported |
| Word pagination | A4 page settings; 100 paragraphs; no explicit or last-rendered page breaks | One `section.docx`, all 100 paragraphs; page counter `/ 1`; section measured 3052.5 px high while page minimum height was 1122.53 px | Confirmed misleading pagination |
| JSON precision | `{"id":9007199254740993}` | Display shows `9007199254740992` after parse/stringify | Confirmed displayed-content corruption; original file bytes are not rewritten |

The exact user deck was not supplied, so the picture-alpha defect is a demonstrated cause matching the symptom, not proof of the specific encoding in that deck. Microsoft specifies that `alphaModFix` multiplies opacity by its `amt` percentage. [Microsoft reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.alphamodulationfixed?view=openxml-3.0.1).

## PowerPoint findings

Primary code: [PPTX parser](../src/lib/pptx/parse.ts), [slide renderer](../src/screens/viewer/SlidesView.tsx), [slide CSS](../src/screens/viewer/Slides.module.css).

| ID | Priority / evidence | What differs and why | Improvement |
|---|---|---|---|
| P01 | High / R | **Picture transparency is ignored.** `readPicture` reads the image relationship/crop/shadow but no blip alpha effects; image model/rendering has no opacity field. | Preserve image alpha effects and apply them to image content; cover native PNG alpha multiplied by Office opacity. |
| P02 | High / R | **Alpha modulation/offset are ignored.** Palette handles `alpha` but not `alphaMod` or `alphaOff`. Transparent overlays can become opaque. | Apply ordered color transforms with clamping, separately from whole-object opacity. |
| P03 | Medium / R | **Some valid colors become black.** `scrgbClr` and `hslClr` are recognized but not converted; preset lookup has only a handful of names, excluding e.g. `purple`. Other hue/saturation/RGB transforms are also absent (C). | Complete color-choice conversion and transform support; test representative reference colors. |
| P04 | Medium / R | **Pattern fills disappear.** `pattFill` is never resolved. | Render foreground/background patterns or disclose a fallback. |
| P05 | High / R | **Group rotation and flipping are lost.** Group mapping adjusts child positions/sizes but ignores the outer rotation and flips. | Compose affine transforms through nested groups; test off-center children. |
| P06 | Medium / R | **Boolean encodings are inconsistent.** Shape `flipH="true"` is ignored while `flipH="1"` works. Similar literal-only checks exist for hidden slides, master visibility, merges and freeform strokes (C). | Normalize XML booleans consistently. |
| P07 | Medium / R | **Gradient geometry changes.** Circular/rectangular path gradients and focus rectangles collapse to a centered radial gradient; path-gradient backgrounds become linear gradients. Linear scaled/tile options are omitted (C). | Preserve gradient geometry/focal rectangle and coordinate system. |
| P08 | Medium / R+C | **Effects are incomplete.** Glow and soft edges disappear in diagnostics. Only an outer shadow's offset/blur/color are represented; inner shadows, reflection, effect DAGs, shadow scaling/skew and 3D effects are not carried through. | Implement common effects and disclose unsupported effects. |
| P09 | Medium / R | **Picture recoloring is lost.** Grayscale and brightness/contrast changes produce identical output to an unchanged picture. | Preserve supported blip effects in order. |
| P10 | Medium / R+C | **Picture-filled shapes are simplified.** Crop is lost in the parser; renderer stretches a rectangular CSS background, with clipping only for ellipse/rounded rectangle. Triangle/freeform picture fills are not clipped to their outline. Tiling/fill rectangles are omitted. | Use geometry clipping and a shared picture-fill renderer. |
| P11 | High / R+C | **Rich text loses baseline, character spacing and capitals.** Superscript/subscript positioning, tracking and caps do not survive parsing. Text outline/gradient/WordArt properties also lack a model. | Preserve typography independently of plain text; test scientific notation and equations embedded as text. |
| P12 | Medium / R+C | **Paragraph spacing is incomplete.** Exact point line spacing and hanging indent disappear; only percentage line spacing and selected point spacing are read. Tab stops and some percentage spacing are omitted. | Implement paragraph metrics and tabs; calibrate against reference renders. |
| P13 | High / R+C | **Numbered lists become bullet lists.** `buAutoNum` becomes `#`, losing numbering type/start; renderer replaces `#` with `•`. | Maintain numbering counters, levels, restart behavior and glyph formatting. |
| P14 | Medium / R | **Vertical text directions collapse.** `vert` and `vert270` both become `vertical-rl`; other vertical variants also lack distinct behavior. | Preserve each writing direction/orientation. |
| P15 | Medium / R+C | **Text columns and independent rotation disappear.** `numCol`, `spcCol`, and text-body rotation produce identical text models. Autofit only reads the local `fontScale`; inherited autofit and line-spacing reduction are omitted. | Model text container layout and autofit inheritance. |
| P16 | High / R+C | **Tables lose authored appearance.** Cell margins/vertical anchor are ignored in diagnostics. Table-style IDs/banding/borders are not resolved; renderer gives all cells a gray border. Text wrapping can also expand HTML table rows. | Resolve `tableStyles.xml` and per-cell overrides, with explicit dimensions/overflow policy. |
| P17 | High / R | **Alternate content can vanish.** Only `mc:Fallback` is traversed; a supported `mc:Choice` without fallback produces no elements. | Select supported choices by namespace capabilities, then fallback. |
| P18 | High / R | **Theme style-matrix references are reduced to one color.** Changing fill style index 1 to 2 does not affect output; referenced theme gradients/line styles/effect styles are not expanded. | Resolve `fmtScheme` indexes, placeholder color and effects. |
| P19 | High / R | **Slide color-map override is ignored.** Mapping `tx1` to an accent still gives the original output. Only the master's map is read. | Apply master → layout → slide color mapping and theme overrides. |
| P20 | High / R | **Placeholder visual inheritance is incomplete.** A layout placeholder's geometry is inherited but its red fill is absent on the slide placeholder. | Cascade geometry, fills, lines, effects and text properties separately. |
| P21 | High / C | **Many shapes turn into rectangles; connectors change routes.** Geometry switch implements a small subset; default is `<rect>`. `bentConnector3` is drawn as a straight diagonal; arrowheads and most adjustment handles are not represented. | Add preset geometry/connector support and stop silently substituting misleading shapes. |
| P22 | High / C | **Formula-based custom geometry is incomplete.** `readPaths` converts coordinates with `Number`; guide references are skipped and whole paths may disappear. | Evaluate DrawingML guides, adjustments, shape text rectangles and path fill modes. |
| P23 | High / C+V | **Group scaling changes boxes without scaling all content.** Child box sizes change but run font sizes, line widths, table columns/row heights and insets remain in their original units. | Render group transforms as a hierarchy or transform all relevant quantities. Verify nested/nonuniform scaling against PowerPoint. |
| P24 | Medium / C | **No-wrap text can still wrap.** Text container sets `white-space: nowrap`, but child paragraphs explicitly set `white-space: pre-wrap`, overriding inheritance. | Set wrapping on the actual paragraph/run flow. |
| P25 | High / C | **Embedded media compatibility is incomplete.** EMF/WMF are rejected by MIME lookup; TIFF is accepted without a conversion path. SVG extension alternatives are not explicitly resolved. Missing pictures can become placeholders. | Decode supported office vector/bitmap formats offline or use validated embedded alternatives, and surface missing assets. |
| P26 | Medium / C | **Hidden slides are recolored by opacity.** `.hidden .slide { opacity: 0.45 }` fades the document itself, including during cloned print output. | Mark hidden status in UI chrome while preserving document colors. |
| P27 | Compatibility / C | **Animations, authored transitions, video/audio and interactive objects are not reproduced.** Presentation mode uses its own slide transitions; the model describes static elements. | Clearly identify static preview; prioritize poster/fallback content and missing-content notices. |
| P28 | High / C+V | **Fonts differ across platforms.** Seven family aliases use local fonts or substitutes; Aptos/custom/embedded presentation fonts are not loaded by the PPTX parser. Complex-script/East Asian theme-font handling is partial. | Track resolved/substituted/missing fonts; add reference tests for Urdu/Arabic, CJK, mixed scripts, and modern Office fonts. |
| P29 | Medium / C | **SmartArt depends on saved drawing parts.** Without cached shapes it becomes a Diagram box. Drawing placement adds frame offset without fully applying frame scale/rotation. | Keep clear fallback messaging and verify saved drawing transforms; do not claim native SmartArt layout. |

Working controls: direct shape alpha, direct picture crop, basic gradients, some freeform numeric paths, outer shadows, theme RGB colors, and cached SmartArt shapes have existing/new tests. These should remain supported while fixes are made.

## Charts — shared by slides and spreadsheets

Code: [chart parser](../src/lib/pptx/chart.ts), [chart renderer](../src/screens/viewer/SlideChart.tsx).

| ID | Priority / evidence | Finding | Improvement |
|---|---|---|---|
| C01 | High / R+C | **Axis settings are discarded.** Authored min/max, log scaling, axis position and secondary axes have no effect; renderer invents a single range from values, often including zero. | Preserve axis IDs, per-series axis assignment, scaling and number formats. |
| C02 | Medium / R+C | **3D charts become 2D silently.** Parser strips `3D` from type names; pie-of-pie is also reduced to a simple pie. | Disclose flattening or preserve a faithful cached preview. |
| C03 | High / R | **Stacked line charts are not stacked.** Grouping for line series is skipped. Mixed chart groups also share global stacking/orientation fields (C). | Store grouping per plot group and test combo charts. |
| C04 | Medium / R | **One-slice doughnut loses its hole.** Renderer emits exactly the same filled path as a one-slice pie. | Preserve inner subpath/even-odd fill for a full-circle doughnut. |
| C05 | High / C | **Formatting and annotations are reconstructed.** Data labels, trendlines/error bars, axis titles, authored legend position, most point/marker styling, smoothing and pie rotation/explosion have no equivalent in the model. Legends are capped at two rows and names truncated. | Preserve meaningful annotations before cosmetic polish. |
| C06 | High / C | **Long charts silently lose points.** Cache reader caps values at 2,000 with no fidelity warning. | Report truncation; provide a deliberate full-data strategy. |
| C07 | High / C | **Unsupported mixed-series charts can be incomplete.** Unsupported plot groups are skipped; remaining supported groups can still produce a chart. Entirely unsupported charts show a placeholder. PPTX charts without usable caches cannot fall back to embedded workbook data. | Fail visibly for partial charts or supply a faithful preview; expose cache status. |
| C08 | High / C+V | **Blank/negative-value policies need work.** Line gaps always break; area gaps become zero; pie negative values are dropped. The file's empty-cell policy is not parsed. | Preserve `dispBlanksAs` and chart-specific value semantics; compare negative/blank examples with Office before declaring exact expected plots. |

## Spreadsheets

Code: [styles](../src/lib/sheetStyles.ts), [workbook model](../src/lib/workbookModel.ts), [grid](../src/screens/viewer/SheetView.tsx), [display/print helpers](../src/screens/viewer/sheetHelpers.ts).

| ID | Priority / evidence | Finding | Improvement |
|---|---|---|---|
| X01 | High / R+C | **Font family and size are discarded.** Changing workbook fonts to 36pt Courier New produces unchanged style output. Grid uses its own 13px font. Rich text within cells is flattened. | Preserve font metrics and rich runs; use them for layout and overflow. |
| X02 | Medium / R+C | **Rotation and vertical alignment disappear.** Shrink-to-fit, indent, distributed alignment and reading-order formatting also lack fields. | Complete cell alignment support. |
| X03 | High / R+C | **Conditional formatting is absent.** Color-scale rules do not affect parsed output; data bars/icon sets/differential formats are not evaluated. Structured-table style/banding is also not applied. | Implement common rule types and report unsupported rules; prevent misleading status dashboards. |
| X04 | Medium / R | **Ink theme deliberately changes authored colors.** Filled-cell color, text color and border colors are remapped; light themes still theme unfilled default-ink cells. | Separate app theme from an explicit document recoloring option. Offer an original-colors view. |
| X05 | High / R+C | **Print differs from screen.** `printSheet` emits only cells, omitting floating pictures/charts and authored border styling. It caps printing at 4,000 rows with a message. | Reuse the content/style model for print; render objects and preserve borders/wrap. |
| X06 | Medium / C | **Pattern/gradient fills and diagonal borders are lost.** Only solid fills and four border sides are parsed; several dash patterns collapse to generic dashed/dotted CSS. | Expand cell paint/border support. |
| X07 | High / C | **Drawing transforms are incomplete.** Only one-/two-cell anchors are read; absolute anchors, shape drawing content, picture crop/rotation/opacity are absent. Image types are limited to common browser bitmaps. | Parse full drawing anchors and share the Office picture/shape renderer. |
| X08 | High / C | **`.xls`, `.xlsb`, `.ods` do not get the OOXML style path.** They use neutral styling even if the source contains formatting. | Label these as simplified views; add format-specific styling deliberately. |
| X09 | High / C | **Formula values are cached, never recalculated.** Missing caches are flagged in cell detail; stale caches can still look authoritative. Pivot/data-connection state is likewise a saved view. | Explain saved-value behavior and expose missing-cache indicators in the grid. |
| X10 | Medium / C+V | **Print/page setup and layout are approximate.** Custom print areas, repeated titles, authored page breaks, page orientation and sheet-view settings are not carried into the grid/print model. Width/automatic row-height heuristics use the app font. | Separate worksheet reading from print-layout fidelity; test wide, wrapped and merged cases. |

The existing suite does cover merged cells, frozen panes, hidden rows/columns/sheets, basic colors/borders and range operations. The issues above do not mean those features are all broken.

## Word

Code: [DocxView](../src/screens/viewer/DocxView.tsx), [document CSS](../src/screens/viewer/Doc.module.css), installed `docx-preview@0.4.0` (`parseGraphic`, `parsePicture`, `renderChanges`, page splitting).

| ID | Priority / evidence | Finding | Improvement |
|---|---|---|---|
| D01 | High / R | **Page numbers are not reliably Word page numbers.** Without saved breaks, 100 paragraphs became one oversized section. The library does not implement live content-based pagination. | Label approximate pagination honestly; evaluate a layout engine or faithful local preview path for exact pages. |
| D02 | High / C | **Some DrawingML objects disappear.** Installed `parseGraphic` accepts `pic` only; charts/SmartArt/other graphical children lack that path. Picture alpha effects and flips are not parsed there. | Add missing-content detection and supported drawing rendering; verify fallback images. |
| D03 | Medium / C | **Review/field views differ.** App keeps default `renderChanges:false`; comments are initially off. Dynamic fields/TOC cannot be regenerated by this library. | Identify saved/final/review view and offer review controls where supported. |
| D04 | Medium / C | **Reading view intentionally changes layout, and print clones that view.** Width, margins, columns and image sizing are overridden; print uses current rendered DOM. | Offer explicit original-layout versus reading-layout print choices. |
| D05 | High / V | **Complex Word layout needs reference testing.** Floating images/text wrap, multi-column sections, footnotes/endnotes, repeated table headers, keep-with-next/widow rules, equations and missing fonts can interact with browser layout. | Build reference cases; do not mark all of these unsupported—some are implemented by the dependency. |

The pagination boundary is documented by the upstream renderer: it uses explicit/saved breaks and section changes, rather than real-time layout pagination. [docx-preview documentation](https://github.com/VolodymyrBaydalka/docxjs#breaks).

## Other formats, PDF and printing

| ID | Priority / evidence | Finding | Code / improvement |
|---|---|---|---|
| F01 | High / R | **JSON pretty-print can change values.** JavaScript parse/stringify rounds large integers; duplicate keys are also collapsed by that path (C). Original file remains intact. | [TextView](../src/screens/viewer/TextView.tsx): use a lossless formatter/tokenizer and preserve raw-source access. |
| F02 | High / R | **Legacy text encodings are guessed too narrowly.** UTF BOM/UTF-8 then Windows-1252; valid Shift-JIS bytes for `あ` display incorrectly. Other non-Western encodings can likewise misdecode. | [decodeText](../src/lib/text.ts): encoding selection/detection with clear override. |
| F03 | Compatibility / C | **RTF is text-only.** Formatting, pictures, objects, headers/footers and footnotes are skipped. | [RTF reader](../src/lib/office/rtf.ts): disclose extraction; prioritize rich RTF only if in scope. |
| F04 | Compatibility / C | **Legacy Word and ODT are reflowed.** Page layout is not reproduced; rich model has no full page/header/footer/positioned-object model. The app already shows a reflow notice. | [rich model](../src/lib/office/model.ts), [reflow viewer](../src/screens/viewer/ReflowView.tsx): retain disclosure and test extraction completeness. |
| F05 | Medium / C | **ODP/legacy PPT effects are simplified too.** ODP gradient uses a single `fill-color`, no opacity application; legacy PPT shape output has solid color/picture fill without gradient/alpha/effects. Both feed the limited shared slide geometry/text renderer. | [ODF](../src/lib/office/odf.ts), [PPT](../src/lib/office/ppt.ts): apply fidelity diagnostics across all deck formats. |
| F06 | Compatibility / C | **Markdown appearance is intentionally constrained.** Sanitizer removes authored styles; rendering has no math/diagram extension. Relative/local image references are not resolved as a document asset bundle. | [TextView](../src/screens/viewer/TextView.tsx): disclose supported Markdown features; keep sanitization. |
| F07 | Medium / C | **Image transparency is visually ambiguous.** Standalone images are drawn over white, so transparent pixels and white pixels look identical. | [Image CSS](../src/screens/viewer/Image.module.css): optional checkerboard/background selector. Native PNG transparency itself is not discarded. |
| F08 | Medium / C | **PDF darkening changes all canvas colors, including pictures.** Filter applies to the whole canvas wrapper; code has no per-picture restoration. This is an optional reading effect. | [PDF CSS](../src/screens/viewer/PdfView.module.css): clearly label recoloring and retain original-color mode. |
| F09 | Medium / C | **Fallback PDF print is raster/JPEG.** Desktop/browser fallback renders pages to bounded canvases then JPEG quality 0.92; vectors/text become pixels, with lower resolution for long jobs. Android can print the original PDF through a separate path. | [PdfView](../src/screens/viewer/PdfView.tsx), [backend](../src/lib/backend.ts): prefer original/vector printing where supported. |
| F10 | Medium / C+V | **General print sizing is approximate.** Shared print fitting uses a fixed 780px width; there is no matching per-document physical `@page` size/orientation. | [print helpers](../src/lib/print.ts), [global print CSS](../src/styles/global.css): test A4/Letter/landscape/mixed sizes and set document-aware page geometry. |
| F11 | High / V | **PDF specialist cases remain unverified.** Transparency groups/blend modes, embedded/substituted fonts, CMYK/ICC, optional layers, unusual annotations and XFA need reference cases. | PDF uses pdf.js rather than the custom PPTX parser; do not infer a PDF opacity defect from P01. Test against trusted PDF renders. |

## Quality gaps that let differences survive

- **No Office reference-image comparisons in the current tests.** Browser tests mostly verify opening, text, navigation and selected CSS values. No `toHaveScreenshot`/screenshot baseline assertions were found under `tests/e2e`.
- **Unsupported features are often silent.** Shape/table/color/axis information can disappear before rendering. Existing Chart/Diagram/Image placeholders and reflow notices help, but are not a complete fidelity report.
- **Desktop/phone/platform typography is not a single environment.** Local fonts and bundled substitutes can have different glyph appearance; browser layout differences need actual platform verification.
- **Current docs can overstate fidelity.** “Own page layout,” chart support, and dark-view descriptions need qualifications that reflect the implemented behavior. For example, PDF dark CSS recolors the complete canvas, and sheet dark mode changes fills.

## Recommended implementation order

1. **Protect displayed content:** fix F01 lossless JSON, P13 numbering, P17 disappearing content, C01/C03 axes and grouping; make partial/unsupported content visible. These can change meaning.
2. **Fix the reported PowerPoint issue:** P01/P02 alpha support, then P18–P20 style/color/placeholder inheritance. Add fixtures for picture opacity, native image alpha, shape fill/line/text alpha, gradient stops and nested groups.
3. **Correct slide layout:** group transforms, preset/custom geometry, tables and typography. Preserve author choices rather than using a visually plausible generic replacement.
4. **Add an original-appearance mode:** separate document colors from app theme; identify substituted fonts and approximate layouts; retain reading view as an explicit option.
5. **Address broader document fidelity:** XLSX font/conditional-format/drawing support, Word pagination strategy, print parity, and clear legacy-format limits.
6. **Gate improvements in GitHub:** generate reference PDF/PNG exports from authored Office files, retain source/license/platform metadata, and run browser comparisons on fixed fonts/viewports. Build release artifacts only in GitHub. Test Windows WebView2 and Android WebView before claiming platform parity.

For an exact-layout promise, evaluate rendering-engine options separately. Extending this custom renderer can improve common cases considerably, but a few opacity patches cannot make it a complete Office layout engine. Offline operation, Android size/performance, font availability, and licensing remain constraints for that decision.

## Acceptance criteria for the first fixes

- 0/25/50/100% picture opacity must composite correctly over colored backgrounds, including a PNG that already contains alpha.
- Shape fill, outline and text opacity must remain independent; gradients must retain each stop's alpha.
- Rotated/flipped/nested groups must match reference positions without mirrored text.
- Numbered lists must retain their numbering, start values and restarts.
- Chart axes and stacking must preserve meaning; partial rendering must be disclosed.
- Source text/JSON values must remain exact.
- Reference renders must cover normal view, thumbnails, slideshow, print, and original/dark-reading modes.
- Checks must include real user documents as well as synthetic fixtures. A native Office comparison is still required before calling a fix visually verified against Office.
