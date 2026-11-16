/**
 * Lucide minimal linear vector icon helpers backed by #i-* symbols in index.html / icons.svg.
 */

export const ICON_IDS = new Set([
 'home', 'import', 'sample-draft', 'new-blank',
 'media', 'style-effects', 'camera-move', 'transition',
 'audio', 'dialogue-text', 'adjustment', 'characters-scene',
 'music-genres', 'sfx-blocks', 'search', 'plus',
 'play', 'pause', 'skip-back', 'skip-forward',
 'volume', 'volume-mute', 'fullscreen',
 'clip-settings', 'script-text', 'character-ref', 'file-settings',
 'storyboard-track', 'subtitle-track', 'sfx-track', 'music-track', 'adjust-track',
 'split', 'delete', 'undo', 'redo', 'compile-prompt', 'magnet', 'link',
 'eye', 'eye-off', 'lock', 'unlock', 'headphones',
 'sticker', 'smart-package', 'filter', 'template', 'digital-human', 'plugin',
 'save', 'export', 'settings', 'close', 'check', 'chevron-down',
 'aspect-ratio', 'layers', 'text', 'voiceover', 'image', 'gallery',
 'move', 'select', 'timer',
 'ai-spark', 'key'
]);

export function uiIcon(name, extraClass = '') {
 const safe = ICON_IDS.has(name) ? name : 'layers';
 const cls = extraClass ? `jy-icon ${extraClass}` : 'jy-icon';
 return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#i-${safe}"/></svg>`;
}
