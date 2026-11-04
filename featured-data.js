// FEATURED PROJECT list for index.html, top to bottom (4-5 projects planned).
// Each entry points at a project in portfolio-data.js by `id`: title, photographer
// (line1), image paths and sizes all come from there, so nothing is duplicated.
// `media` = indexes into that project's media array, in display order:
//   first  -> large main image (right column)
//   others -> the row underneath it
// Optional `layout: 'side-by-side'` (two-image projects only): both images in one row,
// same height, no large main image. Without it the default layout above is used.
// `heading` = first line of the scroll-linked caption for this project ('FEATURED',
// 'NEWEST FEATURED', ...). '' or omitted = no heading (title + photographer only).
// To add a project, append another { id, media, heading } entry.
window.FEATURED_PROJECTS = [
  { id: 'dazed-beauty', media: [1, 0, 2], heading: 'FEATURED PROJECT' }, // 3枚
  { id: 'teeth-magazine', media: [0, 1], heading: '' }, // 2枚・横並び
  { id: 'mugler', media: [1], heading: '' },    // 1枚              
  { id: 'supreme-lookbook', media: [0, 1], layout: 'side-by-side', heading: '' },
  { id: 'the-face-pusha-t', media: [1], heading: '' }

];