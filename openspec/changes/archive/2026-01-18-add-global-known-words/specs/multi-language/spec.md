## MODIFIED Requirements
### Requirement: Legacy Data Cleanup
The system SHALL preserve legacy data missing language by backfilling a default language instead of deleting data.

#### Scenario: Legacy books without language are preserved
- **Given** legacy book records exist without `language`
- **When** the application runs after the update
- **Then** each book is assigned a default language ("en")
- **And** related vocabulary records inherit the book language

#### Scenario: Legacy global vocabulary without language is preserved
- **Given** legacy global vocabulary records exist without `language`
- **When** the application runs after the update
- **Then** each global record is assigned a default language ("en")
- **And** the record remains available for lookup
