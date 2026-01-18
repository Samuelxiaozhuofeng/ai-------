# Change: Update Reader Visual Container Styling

## Why
The current page container styling in page mode feels too card-like and distracts from reading. We need a softer, adaptive container that aligns with immersive reading and Zen Mode.

## What Changes
- Introduce CSS variables to control page border, shadow, radius, and background.
- Soften page container visuals in light mode and add subtle border in dark mode.
- Remove page container edges in Zen Mode and full-width reading.
- Apply the full-width state via a root data attribute to keep pagination measurement consistent.

## Impact
- Affected specs: reader-interface
- Affected code: styles/base/variables.css, styles/views/reader.css, js/storage.js
