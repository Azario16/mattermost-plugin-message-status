export function isElementVisible(element: HTMLElement, threshold: number): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }

    const viewportTop = 0;
    const viewportBottom = window.innerHeight || document.documentElement.clientHeight;
    const visibleTop = Math.max(rect.top, viewportTop);
    const visibleBottom = Math.min(rect.bottom, viewportBottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    return (visibleHeight / rect.height) >= threshold;
}
