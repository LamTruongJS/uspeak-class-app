/**
 * Đồng bộ nội dung 7 chính sách từ web class-fe sang app.
 *
 * Nội dung chính sách nằm CỨNG trong code web (`uspeak-class-fe/src/constants/policies/content.tsx`
 * + `RefundPolicyContent.tsx`, viết bằng JSX), class-be chỉ lưu khoá + phiên bản + ai đã đồng ý.
 * Script này chạy JSX đó (dùng sucrase + react trong node_modules của class-fe), đi qua cây element
 * và ghi ra cây nút gọn `src/features/policies/content.generated.json` để app vẽ native.
 *
 * Sửa chính sách ở web xong thì chạy lại:  node scripts/sync-policies.cjs [đường-dẫn-class-fe]
 * (mặc định ../uspeak-class-fe)
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const feRoot = path.resolve(process.argv[2] || path.join(__dirname, '../../uspeak-class-fe'));
const policyDir = path.join(feRoot, 'src/constants/policies');
const feRequire = Module.createRequire(path.join(feRoot, 'package.json'));
const { transform } = feRequire('sucrase');
const React = feRequire('react');

// Biên dịch .tsx khi require (chỉ trong thư mục chính sách)
const origTsx = require.extensions['.tsx'];
require.extensions['.tsx'] = (mod, filename) => {
  const src = fs.readFileSync(filename, 'utf8');
  const out = transform(src, { transforms: ['typescript', 'jsx', 'imports'], jsxRuntime: 'automatic', filePath: filename }).code;
  // react/jsx-runtime phải lấy từ node_modules của class-fe
  mod._compile(out.replace(/require\((['"])react\/jsx-runtime\1\)/g, `require(${JSON.stringify(feRequire.resolve('react/jsx-runtime'))})`), filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('./') && parent?.filename?.startsWith(policyDir) && !path.extname(request)) {
    for (const ext of ['.tsx', '.ts']) {
      const p = path.resolve(path.dirname(parent.filename), request + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return origResolve.call(this, request, parent, ...rest);
};

const { LOCAL_POLICY_CONTENT } = require(path.join(policyDir, 'content.tsx'));
const { POLICY_NAV_ITEMS } = require(path.join(policyDir, 'navigation.ts'));
require.extensions['.tsx'] = origTsx;

/**
 * Element React → nút: chuỗi (chữ) hoặc { t: thẻ, cls?, id?, href?, c: con[] }.
 * Component hàm (vd RefundPolicyContent) được gọi thẳng — nội dung chính sách không dùng hook.
 */
function walk(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!React.isValidElement(node)) return [];
  const { type, props } = node;
  if (type === React.Fragment) return walk(props.children);
  if (typeof type === 'function') return walk(type(props));
  const out = { t: type };
  if (props.className) out.cls = props.className;
  if (props.id) out.id = props.id;
  if (props.href) out.href = props.href;
  if (props.style?.display === 'none') out.hidden = true;
  const c = mergeText(walk(props.children));
  if (c.length) out.c = c;
  return [out];
}

function mergeText(list) {
  const out = [];
  for (const n of list) {
    if (typeof n === 'string' && typeof out[out.length - 1] === 'string') out[out.length - 1] += n;
    else out.push(n);
  }
  return out;
}

const textOf = (n) => (typeof n === 'string' ? n : (n.c ?? []).map(textOf).join(''));

const policies = POLICY_NAV_ITEMS.map((nav) => {
  const data = LOCAL_POLICY_CONTENT[nav.key];
  if (!data) throw new Error(`Thiếu nội dung chính sách ${nav.key}`);
  let body = walk(data.content_render());
  // Mục lục (ul.toc ẩn trên web) → danh sách riêng; meta (hiệu lực / phiên bản) → danh sách riêng
  const tocNode = body.find((n) => typeof n === 'object' && n.cls === 'toc');
  const toc = (tocNode?.c ?? [])
    .map((li) => li.c?.find((a) => a.t === 'a'))
    .filter(Boolean)
    .map((a) => ({ id: a.href.replace('#', ''), label: textOf(a).trim() }));
  const metaNode = body.find((n) => typeof n === 'object' && n.cls === 'hero-meta');
  const meta = (metaNode?.c ?? []).map((box) => ({
    label: textOf(box.c.find((x) => x.cls === 'meta-label')).trim(),
    value: textOf(box.c.find((x) => x.cls === 'meta-value')).trim(),
  }));
  const heading = body.find((n) => typeof n === 'object' && n.t === 'h1');
  body = body.filter((n) => n !== tocNode && n !== metaNode && n !== heading && !(typeof n === 'string' && !n.trim()));
  return { key: nav.key, title: nav.title, heading: heading ? textOf(heading).trim() : data.title, version: data.version, meta, toc, body };
});

const outFile = path.join(__dirname, '../src/features/policies/content.generated.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ source: 'uspeak-class-fe/src/constants/policies', policies }) + '\n');
console.log(`Đã ghi ${policies.length} chính sách → ${path.relative(process.cwd(), outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
