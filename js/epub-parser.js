/**
 * EPUB Parser Module
 * Parses EPUB files and extracts chapters
 */

/**
 * Extract cover image from EPUB
 * @param {JSZip} zip - Zip object
 * @param {Document} opfDoc - OPF document
 * @param {string} opfDir - Directory containing the OPF file
 * @returns {Promise<string|null>} Base64 data URL or null
 */
async function extractCover(zip, opfDoc, opfDir) {
    try {
        // Method 1: Look for meta cover reference
        const metaCover = opfDoc.querySelector('meta[name="cover"]');
        let coverId = metaCover?.getAttribute('content');

        // Method 2: Look for cover-image property in manifest
        if (!coverId) {
            const coverItem = opfDoc.querySelector('manifest item[properties*="cover-image"]');
            if (coverItem) {
                coverId = coverItem.getAttribute('id');
            }
        }

        // Method 3: Look for item with id containing 'cover'
        if (!coverId) {
            const items = opfDoc.querySelectorAll('manifest item');
            for (const item of items) {
                const id = item.getAttribute('id')?.toLowerCase() || '';
                const href = item.getAttribute('href')?.toLowerCase() || '';
                const mediaType = item.getAttribute('media-type') || '';

                if ((id.includes('cover') || href.includes('cover')) &&
                    mediaType.startsWith('image/')) {
                    coverId = item.getAttribute('id');
                    break;
                }
            }
        }

        if (!coverId) {
            return null;
        }

        // Get the cover image href from manifest
        const coverManifestItem = opfDoc.querySelector(`manifest item[id="${coverId}"]`);
        if (!coverManifestItem) {
            return null;
        }

        const coverHref = coverManifestItem.getAttribute('href');
        const mediaType = coverManifestItem.getAttribute('media-type');

        if (!coverHref) {
            return null;
        }

        // Load the cover image
        const coverPath = opfDir + coverHref;
        const coverFile = zip.file(coverPath);

        if (!coverFile) {
            // Try without opfDir prefix
            const altCoverFile = zip.file(coverHref);
            if (!altCoverFile) {
                return null;
            }
            const coverData = await altCoverFile.async('base64');
            return `data:${mediaType};base64,${coverData}`;
        }

        const coverData = await coverFile.async('base64');
        return `data:${mediaType};base64,${coverData}`;

    } catch (error) {
        console.warn('Failed to extract cover:', error);
        return null;
    }
}

/**
 * Parse an EPUB file and extract its contents
 * @param {File} file - EPUB file to parse
 * @returns {Promise<Object>} Parsed book object with title, chapters, and cover
 */
export async function parseEpub(file) {
    // Load and unzip the EPUB
    const zip = await JSZip.loadAsync(file);

    // Find and parse container.xml to get the OPF path
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) {
        throw new Error('Invalid EPUB: container.xml not found');
    }

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    const rootfileEl = containerDoc.querySelector('rootfile');
    const opfPath = rootfileEl?.getAttribute('full-path');

    if (!opfPath) {
        throw new Error('Invalid EPUB: OPF path not found');
    }

    // Parse OPF file
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
    const opfContent = await zip.file(opfPath)?.async('text');
    if (!opfContent) {
        throw new Error('Invalid EPUB: OPF file not found');
    }

    const opfDoc = parser.parseFromString(opfContent, 'application/xml');

    // Get book title
    const titleEl = opfDoc.querySelector('metadata title, dc\\:title');
    const title = titleEl?.textContent || file.name.replace('.epub', '');

    // Get manifest items
    const manifestItems = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        const mediaType = item.getAttribute('media-type');
        manifestItems[id] = { href, mediaType };
    });

    // Get spine order
    const spineItems = [];
    opfDoc.querySelectorAll('spine itemref').forEach(itemref => {
        const idref = itemref.getAttribute('idref');
        if (manifestItems[idref]) {
            spineItems.push({
                id: idref,
                href: manifestItems[idref].href
            });
        }
    });

    // Parse chapters
    const chapters = [];
    for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i];
        const filePath = opfDir + item.href;

        try {
            const content = await zip.file(filePath)?.async('text');
            if (content) {
                const chapterDoc = parser.parseFromString(content, 'application/xhtml+xml');
                const body = chapterDoc.querySelector('body');

                if (!body) continue;

                // Try to split content by chapter headings
                const subChapters = splitContentByHeadings(body, item.id);

                if (subChapters.length > 0) {
                    // Multiple chapters found in this file
                    subChapters.forEach(subChapter => {
                        if (subChapter.content.trim()) {
                            chapters.push({
                                id: `${item.id}_${subChapter.index}`,
                                title: subChapter.title || `Chapter ${chapters.length + 1}`,
                                content: subChapter.content.trim(),
                                rawHtml: subChapter.rawHtml
                            });
                        }
                    });
                } else {
                    // Fallback to single chapter for this file
                    const chapterTitle = chapterDoc.querySelector('h1, h2, h3')?.textContent.trim() || '';
                    const textContent = extractTextContent(body);

                    if (textContent.trim()) {
                        chapters.push({
                            id: item.id,
                            title: chapterTitle || `Chapter ${chapters.length + 1}`,
                            content: textContent.trim(),
                            rawHtml: body.innerHTML || ''
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`Failed to parse chapter: ${filePath}`, e);
        }
    }

    if (chapters.length === 0) {
        throw new Error('No readable chapters found in EPUB');
    }

    // Extract cover image
    const cover = await extractCover(zip, opfDoc, opfDir);

    return {
        title,
        chapters,
        cover
    };
}

/**
 * Check if a heading element is a chapter heading
 * Identifies common chapter title patterns like:
 * - Roman numerals: I, II, III, IV, etc.
 * - Arabic numerals: 1, 2, 3, etc.
 * - Simple numeric patterns with minimal extra text
 * @param {Element} heading - Heading element to check
 * @returns {boolean} True if this looks like a chapter heading
 */
function isChapterHeading(heading) {
    const text = heading.textContent.trim();

    // Check for Roman numerals (I, II, III, IV, V, etc.)
    const romanPattern = /^[IVXLCDM]+$/i;
    if (romanPattern.test(text)) {
        return true;
    }

    // Check for simple Arabic numbers (1, 2, 3, etc.)
    const arabicPattern = /^\d+$/;
    if (arabicPattern.test(text)) {
        return true;
    }

    // Check for "Chapter X" or similar patterns
    const chapterPattern = /^(chapter|capítulo|chapitre|capitolo|kapitel)\s*\d+/i;
    if (chapterPattern.test(text)) {
        return true;
    }

    // Check for very short headings (likely chapter markers)
    // But exclude common words that might appear as headings
    if (text.length <= 5 && text.length > 0) {
        const commonWords = ['the', 'and', 'but', 'for', 'with', 'about'];
        if (!commonWords.includes(text.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Split content by chapter headings
 * @param {Element} body - Body element containing the content
 * @param {string} baseId - Base ID for the chapters
 * @returns {Array} Array of chapter objects with title, content, and rawHtml
 */
function splitContentByHeadings(body, baseId) {
    const headings = body.querySelectorAll('h1, h2, h3, h4');
    const chapterHeadings = [];

    console.log(`[EPUB Parser] Found ${headings.length} total headings in ${baseId}`);

    // Find all headings that look like chapter markers
    headings.forEach(heading => {
        const text = heading.textContent.trim();
        const isChapter = isChapterHeading(heading);
        console.log(`[EPUB Parser] Heading: "${text}" (${heading.tagName}) - isChapter: ${isChapter}`);
        if (isChapter) {
            chapterHeadings.push(heading);
        }
    });

    console.log(`[EPUB Parser] Found ${chapterHeadings.length} chapter headings`);

    // If we found fewer than 2 chapter headings, don't split
    if (chapterHeadings.length < 2) {
        console.log(`[EPUB Parser] Not enough chapter headings (${chapterHeadings.length}), skipping split`);
        return [];
    }

    const chapters = [];

    // Split content based on chapter headings
    for (let i = 0; i < chapterHeadings.length; i++) {
        const currentHeading = chapterHeadings[i];
        const nextHeading = chapterHeadings[i + 1];

        const title = currentHeading.textContent.trim();
        const contentParts = [];
        const rawHtmlParts = [];

        // Collect all elements between this heading and the next
        let current = currentHeading.nextElementSibling;
        while (current && current !== nextHeading) {
            // Skip if we've reached another chapter heading
            if (chapterHeadings.includes(current)) {
                break;
            }

            const text = current.textContent?.trim();
            if (text) {
                contentParts.push(text);
            }
            rawHtmlParts.push(current.outerHTML || '');

            current = current.nextElementSibling;
        }

        chapters.push({
            index: i,
            title: title,
            content: contentParts.join('\n\n'),
            rawHtml: rawHtmlParts.join('\n')
        });
    }

    return chapters;
}

/**
 * Extract readable text content from an HTML element
 * @param {Element} element - HTML element to extract text from
 * @returns {string} Extracted text with paragraph formatting
 */
function extractTextContent(element) {
    const blocks = [];

    // Process block-level elements
    const blockElements = element.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote');

    if (blockElements.length === 0) {
        // If no block elements, just get text content
        return element.textContent || '';
    }

    blockElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text) {
            blocks.push(text);
        }
    });

    return blocks.join('\n\n');
}

/**
 * Convert plain text to HTML paragraphs
 * @param {string} text - Plain text content
 * @returns {string} HTML with paragraph tags
 */
export function textToHtml(text) {
    const paragraphs = text.split(/\n\n+/);
    return paragraphs
        .filter(p => p.trim())
        .map(p => `<p>${escapeHtml(p.trim())}</p>`)
        .join('\n');
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
