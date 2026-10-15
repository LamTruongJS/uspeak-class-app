/** Chữ thường → HTML đoạn văn (nội dung web soạn bằng Tiptap là HTML): dòng trống tách đoạn, xuống dòng → <br>. */
export function plainToHtml(text: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
