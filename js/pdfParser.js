// PDF parsing utilities built on pdf.js with fallbacks for text extraction.
// Extension point: replace pdf.js with another parser by swapping extractPdfText implementation
// while keeping the return shape (title, pages, etc.).
export async function extractPdfText(file, { onProgress } = {}) {
    if (!window.pdfjsLib) {
        throw new Error('PDF.js library not loaded');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const pages = [];

    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
        try {
            const page = await pdf.getPage(pageIndex);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
            pages.push({
                index: pageIndex - 1,
                text: pageText,
                hasTextContent: Boolean(pageText)
            });
        } catch (error) {
            console.warn('Failed to parse page', pageIndex, error);
            pages.push({
                index: pageIndex - 1,
                text: '',
                hasTextContent: false,
                error: error instanceof Error ? error.message : 'Unknown parsing error'
            });
        }

        if (typeof onProgress === 'function') {
            onProgress(Math.round((pageIndex / totalPages) * 100));
        }
    }

    const titleMeta = (await pdf.getMetadata().catch(() => ({ info: {}, metadata: {} }))) || {};
    const title = titleMeta.info?.Title || file.name.replace(/\.pdf$/i, '');

    pdf.cleanup();

    return {
        title,
        author: titleMeta.info?.Author || 'Unknown author',
        totalPages,
        pages,
        rawSize: file.size,
        lastModified: file.lastModified
    };
}

// Simple heuristic for extracting structured tables when PDF text fails.
export function harvestTables(pages) {
    return pages
        .filter(page => page.hasTextContent && page.text)
        .flatMap(page => {
            const lines = page.text.split(/(?<=\.)\s+|\n+/);
            const tableCandidates = lines.filter(line => /\d/.test(line) && /[:,]/.test(line));
            return tableCandidates.map(line => ({
                page: page.index,
                content: line
            }));
        });
}
