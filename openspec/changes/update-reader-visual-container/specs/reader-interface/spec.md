## ADDED Requirements
### Requirement: Page Container Visual Styling
The reader SHALL apply adaptive page container visuals in page mode to reduce card-like borders and support immersive reading.

#### Scenario: Light mode page container
- **WHEN** the reader is in page mode and light theme
- **THEN** the page container uses no border
- **AND** a soft shadow is applied
- **AND** the page radius is subtle

#### Scenario: Dark mode page container
- **WHEN** the reader is in page mode and dark theme
- **THEN** the page container uses a subtle border
- **AND** no heavy shadow is applied

#### Scenario: Zen Mode removes container edges
- **WHEN** Zen Mode is active
- **THEN** the page container shows no border, shadow, or radius

#### Scenario: Full-width reading removes container edges
- **WHEN** reading width is set to full
- **THEN** the page container shows no border, shadow, or radius
- **AND** pagination measurement uses the same styling rules
