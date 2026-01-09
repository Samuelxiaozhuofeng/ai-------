/**
 * Text Marker Module
 * Handles text selection and vocabulary marking with Ctrl+B
 */

/**
 * MarkerManager class - manages text marking functionality
 */
export class MarkerManager {
    constructor(containerElement, onMarkChange) {
        this.container = containerElement;
        this.onMarkChange = onMarkChange;
        this.marks = [];
        this.markIdCounter = 0;
        
        // Bind keyboard listener
        this.handleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.handleKeyDown);
    }
    
    /**
     * Handle keyboard events for Ctrl+B marking
     * @param {KeyboardEvent} event
     */
    handleKeyDown(event) {
        if (event.ctrlKey && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            this.markSelection();
        }
    }
    
    /**
     * Mark the current text selection
     */
    markSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            return;
        }
        
        const selectedText = selection.toString().trim();
        if (!selectedText) {
            return;
        }
        
        // Check if selection is within our container
        const range = selection.getRangeAt(0);
        if (!this.container.contains(range.commonAncestorContainer)) {
            return;
        }
        
        // Check if already marked (clicking an existing mark to remove it)
        const parentMark = this.findParentMark(range.commonAncestorContainer);
        if (parentMark) {
            this.unmark(parentMark);
            return;
        }
        
        // Extract context before creating the mark
        const context = this.extractContext(range);
        
        // Create mark element
        const markId = `mark-${++this.markIdCounter}`;
        const markEl = document.createElement('mark');
        markEl.className = 'vocab-mark';
        markEl.dataset.markId = markId;
        markEl.dataset.text = selectedText;
        
        try {
            range.surroundContents(markEl);
        } catch (e) {
            // Selection spans multiple elements, use alternative approach
            const fragment = range.extractContents();
            markEl.appendChild(fragment);
            range.insertNode(markEl);
        }
        
        // Clear selection
        selection.removeAllRanges();
        
        // Add to marks array
        const markData = {
            id: markId,
            text: selectedText,
            context: context
        };
        this.marks.push(markData);
        
        // Callback
        if (this.onMarkChange) {
            this.onMarkChange(this.marks, markData);
        }
        
        // Add click handler to mark for removal
        markEl.addEventListener('click', () => {
            this.unmark(markEl);
        });
    }
    
    /**
     * Extract the sentence containing the selection.
     * @param {Range} range - Selection range
     * @returns {Object} Context object with currentSentence only
     */
    extractContext(range) {
        // Get the full text content
        const fullText = this.container.textContent;
        
        // Find the offset of the selection in the full text
        const preSelectionRange = document.createRange();
        preSelectionRange.selectNodeContents(this.container);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const offset = preSelectionRange.toString().length;
        
        // Sentence delimiters (including Spanish punctuation)
        const sentenceDelimiters = /[.!?¡¿。！？]+\s*/g;
        
        // Find all sentence boundaries
        const boundaries = [0];
        let match;
        while ((match = sentenceDelimiters.exec(fullText)) !== null) {
            boundaries.push(match.index + match[0].length);
        }
        boundaries.push(fullText.length);
        
        // Find which sentence contains the selection
        let currentSentenceIndex = -1;
        for (let i = 0; i < boundaries.length - 1; i++) {
            if (offset >= boundaries[i] && offset < boundaries[i + 1]) {
                currentSentenceIndex = i;
                break;
            }
        }
        
        if (currentSentenceIndex === -1) {
            currentSentenceIndex = boundaries.length - 2;
        }
        
        const currentSentence = fullText.substring(
            boundaries[currentSentenceIndex], 
            boundaries[currentSentenceIndex + 1]
        ).trim();

        return {
            currentSentence,
            previousSentence: '',
            nextSentence: '',
            fullContext: currentSentence
        };
    }
    
    /**
     * Find parent mark element if any
     * @param {Node} node
     * @returns {Element|null}
     */
    findParentMark(node) {
        let current = node;
        while (current && current !== this.container) {
            if (current.nodeType === Node.ELEMENT_NODE && 
                current.classList?.contains('vocab-mark')) {
                return current;
            }
            current = current.parentNode;
        }
        return null;
    }
    
    /**
     * Remove a mark
     * @param {Element} markEl - Mark element to remove
     */
    unmark(markEl) {
        const markId = markEl.dataset.markId;
        
        // Replace mark with its text content
        const textNode = document.createTextNode(markEl.textContent);
        markEl.parentNode.replaceChild(textNode, markEl);
        
        // Normalize to merge adjacent text nodes
        textNode.parentNode.normalize();
        
        // Remove from marks array
        this.marks = this.marks.filter(m => m.id !== markId);
        
        // Callback
        if (this.onMarkChange) {
            this.onMarkChange(this.marks);
        }
    }
    
    /**
     * Remove a mark by ID
     * @param {string} markId - ID of mark to remove
     */
    removeMarkById(markId) {
        const markEl = this.container.querySelector(`[data-mark-id="${markId}"]`);
        if (markEl) {
            this.unmark(markEl);
        }
    }
    
    /**
     * Get all current marks
     * @returns {Array} Array of mark objects
     */
    getMarks() {
        return [...this.marks];
    }
    
    /**
     * Get marked text strings only
     * @returns {Array<string>} Array of marked text
     */
    getMarkedTexts() {
        return this.marks.map(m => m.text);
    }
    
    /**
     * Clear all marks
     */
    clearMarks() {
        // Remove all mark elements
        const markEls = this.container.querySelectorAll('.vocab-mark');
        markEls.forEach(markEl => {
            const textNode = document.createTextNode(markEl.textContent);
            markEl.parentNode.replaceChild(textNode, markEl);
        });
        
        // Normalize
        this.container.normalize();
        
        // Clear array
        this.marks = [];
        
        // Callback
        if (this.onMarkChange) {
            this.onMarkChange(this.marks);
        }
    }
    
    /**
     * Restore marks from saved data
     * @param {Array} savedMarks - Array of saved mark objects
     * @param {string} content - The content HTML
     */
    restoreMarks(savedMarks) {
        if (!savedMarks || savedMarks.length === 0) {
            return;
        }
        
        // Search and mark each saved text
        savedMarks.forEach(mark => {
            this.markText(mark.text);
        });
    }
    
    /**
     * Mark a specific text in the content
     * @param {string} text - Text to mark
     */
    markText(text) {
        if (!text) return;
        
        const walker = document.createTreeWalker(
            this.container,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            const index = node.textContent.indexOf(text);
            if (index !== -1) {
                const range = document.createRange();
                range.setStart(node, index);
                range.setEnd(node, index + text.length);
                
                const markId = `mark-${++this.markIdCounter}`;
                const markEl = document.createElement('mark');
                markEl.className = 'vocab-mark';
                markEl.dataset.markId = markId;
                markEl.dataset.text = text;
                
                try {
                    range.surroundContents(markEl);
                    
                    this.marks.push({
                        id: markId,
                        text: text
                    });
                    
                    markEl.addEventListener('click', () => {
                        this.unmark(markEl);
                    });
                    
                    break; // Only mark first occurrence
                } catch (e) {
                    console.warn('Could not restore mark for:', text);
                }
            }
        }
    }
    
    /**
     * Destroy the marker manager
     */
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        this.clearMarks();
    }
}
