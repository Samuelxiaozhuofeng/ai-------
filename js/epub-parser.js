/**
 * EPUB Parser Module
 * Parses EPUB files and extracts chapters
 */

/**
 * Parse an EPUB file and extract its contents
 * @param {File} file - EPUB file to parse
 * @returns {Promise<Object>} Parsed book object with title and chapters
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
                
                // Try to get chapter title
                let chapterTitle = '';
                const h1 = chapterDoc.querySelector('h1, h2, h3');
                if (h1) {
                    chapterTitle = h1.textContent.trim();
                }
                
                // Extract text content
                const body = chapterDoc.querySelector('body');
                const textContent = body ? extractTextContent(body) : '';
                
                if (textContent.trim()) {
                    chapters.push({
                        id: item.id,
                        title: chapterTitle || `Chapter ${chapters.length + 1}`,
                        content: textContent.trim(),
                        rawHtml: body?.innerHTML || ''
                    });
                }
            }
        } catch (e) {
            console.warn(`Failed to parse chapter: ${filePath}`, e);
        }
    }
    
    if (chapters.length === 0) {
        throw new Error('No readable chapters found in EPUB');
    }
    
    return {
        title,
        chapters
    };
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
