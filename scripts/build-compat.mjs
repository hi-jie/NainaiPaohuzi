import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import selectors from 'postcss-selector-parser';
import values from 'postcss-value-parser';

const www = resolve(import.meta.dirname, '../android/app/src/main/assets/www');
const css = postcss.parse(await readFile(resolve(www, 'css/app.css'), 'utf8'));
const stateSelectors = new Map([
  [':has(#app-update[hidden])', '.without-update'],
  [':has(#table:not([hidden]))', '.table-visible'],
  [':has(> .card:nth-child(4 of .card:not([hidden])))', '.four-cards'],
  [':has(> :is(.card[hidden], .card.hand-drop-slot))', '.reordering'],
  [':has(> .felt.dragging-hand)', '.dragging-hand'],
  [':has(.opening-pile)', '.with-opening-pile'],
  [':has(.dealer:not([inert]))', '.dealer-seat'],
  [':has(#table:not([hidden]) > .settlement:not([hidden]))', '.settlement-visible']
]);

function expand(selector) {
  const pseudo = selector.nodes.find(node => [':is', ':where', ':not'].includes(node.value) && node.nodes?.length);
  if (!pseudo) return [selector.toString()];
  if (pseudo.value === ':not' && pseudo.nodes.length === 1) return [selector.toString()];
  const index = selector.index(pseudo);
  if (pseudo.value === ':not') {
    const copy = selector.clone();
    copy.nodes[index].replaceWith(...pseudo.nodes.map(choice => {
      const inner = choice.clone();
      inner.first.spaces.before = '';
      return selectors.pseudo({ value: ':not', nodes: [inner] });
    }));
    return expand(copy);
  }
  return pseudo.nodes.flatMap(choice => {
    const copy = selector.clone();
    const inner = choice.clone();
    inner.first.spaces.before = '';
    copy.nodes[index].replaceWith(...inner.nodes);
    return expand(copy);
  });
}

css.walkRules(rule => {
  if (rule.selector.includes(':has(')) {
    for (const [native, compat] of stateSelectors) rule.selector = rule.selector.replaceAll(native, compat);
    if (rule.selector.includes(':has(')) throw new Error(`Missing compatibility selector: ${rule.selector}`);
  }
  if (/:(is|where)\(|:not\([^)]*,/.test(rule.selector)) {
    rule.selector = selectors().astSync(rule.selector).nodes.flatMap(expand).join(', ');
  }
});

css.walkAtRules('container', rule => {
  if (rule.params !== 'profile (max-height: 218px)') throw new Error(`Unknown container rule: ${rule.params}`);
  rule.walkRules(item => { item.selectors = item.selectors.map(selector => `#profile.compact-profile ${selector}`); });
  rule.replaceWith(...rule.nodes);
});

const physical = {
  inset: ['top', 'right', 'bottom', 'left'],
  'inset-inline': ['left', 'right'], 'inset-block': ['top', 'bottom'],
  'inset-inline-start': ['left'], 'inset-block-start': ['top'],
  'margin-inline': ['margin-left', 'margin-right'], 'margin-inline-start': ['margin-left'],
  'padding-inline': ['padding-left', 'padding-right']
};
const alignment = {
  'place-items': ['align-items', 'justify-items'], 'place-self': ['align-self', 'justify-self'],
  'place-content': ['align-content', 'justify-content']
};
const screenMath = [];

css.walkDecls(decl => {
  const { prop, value } = decl;
  if (prop in physical || prop in alignment) {
    const parts = values(value).nodes.filter(node => node.type !== 'space').map(node => values.stringify(node));
    const [first, second = first, third = first, fourth = second] = parts;
    for (const [i, property] of (physical[prop] || alignment[prop]).entries()) {
      decl.cloneBefore({ prop: property, value: [first, second, third, fourth][i] });
    }
    decl.remove();
    return;
  }
  if (prop === 'appearance') decl.cloneBefore({ prop: '-webkit-appearance' });
  if (prop === 'translate') {
    decl.prop = 'transform';
    decl.value = value === 'none' ? 'none' : `translate(${value.replace(/\s+/, ', ')})`;
  }
  if (prop === 'transition') decl.value = value.replace(/\btranslate /g, 'transform ');
  if (prop === 'gap') {
    const [row, column = row] = values(decl.value).nodes.filter(node => node.type !== 'space').map(node => values.stringify(node));
    decl.cloneBefore({ prop: 'grid-row-gap', value: row });
    decl.cloneBefore({ prop: 'grid-column-gap', value: column });
    decl.remove();
  }
  if (prop === 'column-gap' || prop === 'row-gap') decl.prop = `grid-${prop}`;
  if (prop === 'grid-template-columns' && value === 'subgrid') decl.remove();
  if (prop === 'aspect-ratio') {
    const width = decl.parent.nodes.find(node => node.prop === 'width');
    if (value !== '1' || !width) throw new Error(`Missing aspect ratio fallback: ${decl.parent.selector}`);
    decl.cloneBefore({ prop: 'height', value: width.value });
    decl.remove();
  }
  decl.value = decl.value.replace(/100dvh/g, 'var(--compat-height)')
    .replace(/100cqw/g, '(3 * var(--strip-width) + 2px)')
    .replace(/(#[0-9a-f]{3,8}|transparent) (\d+(?:px|%)|0) (\d+(?:px|%))(?=[,)])/gi, '$1 $2, $1 $3');
  if (decl.value.includes('env(')) decl.value = decl.value.replace(/env\(([^,)]+)\)/g, 'env($1, 0px)');
});
css.walkDecls(decl => {
  const parsed = values(decl.value);
  parsed.walk(node => {
    if (node.type !== 'function' || !['min', 'max', 'clamp'].includes(node.value)) return;
    const expression = values.stringify(node);
    const numeric = expression.replace(/var\(--screen-(width|height)\)/g, '$1').replace(/\bcalc\(/g, '(')
      .replace(/\b(min|max|clamp)\(/g, 'math.$1(').replace(/px\b/g, '');
    if (!/^[\d\s.,()+*/-]*(?:(?:math\.(?:min|max|clamp)|width|height)[\d\s.,()+*/-]*)*$/.test(numeric) ||
        !/\b(width|height)\b/.test(numeric)) return false;
    node.value = 'var';
    node.nodes = [{ type: 'word', value: `--compat-size-${screenMath.length}` }];
    screenMath.push(numeric);
    return false;
  });
  decl.value = parsed.toString();
});

const fallback = await readFile(resolve(import.meta.dirname, 'compat.css'), 'utf8');
await mkdir(resolve(www, 'compat'), { recursive: true });
await writeFile(resolve(www, 'compat/app.css'), css.toString() + '\n' + fallback);
const bundle = await build({
  absWorkingDir: www,
  entryPoints: [resolve(import.meta.dirname, 'compat-entry.mjs')],
  outfile: 'compat/game.mjs',
  write: false,
  target: 'chrome69',
  bundle: true,
  format: 'esm',
  minify: true,
  define: { __PAOHUZI_COMPAT__: 'true' },
  plugins: [{
    name: 'compatibility-assets',
    setup(builder) {
      builder.onResolve({ filter: /^compat-screen-sizes$/ }, () => ({ path: 'screen-sizes', namespace: 'compat' }));
      builder.onLoad({ filter: /./, namespace: 'compat' }, () => ({
        contents: `const math = { min: Math.min, max: Math.max, clamp: (lo, value, hi) => Math.max(lo, Math.min(value, hi)) };
          export default (width, height) => [${screenMath.join(',')}];`
      }));
      builder.onLoad({ filter: /[\\/]audio[\\/](player|music)\.mjs$/ }, async ({ path, suffix }) => {
        const source = await readFile(path, 'utf8');
        const url = `new URL(${JSON.stringify(`../js/audio/${path.split(/[\\/]/).at(-1)}${suffix}`)}, import.meta.url).href`;
        return { contents: source.replaceAll('import.meta.url', url), resolveDir: resolve(path, '..') };
      });
    }
  }]
});
await writeFile(bundle.outputFiles[0].path, bundle.outputFiles[0].contents);
