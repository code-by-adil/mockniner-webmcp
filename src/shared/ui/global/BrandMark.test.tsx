// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';

const logoSource = readFileSync(resolve('public/mockniner-logo.svg'), 'utf8');
const faviconSource = readFileSync(resolve('public/favicon.svg'), 'utf8');

describe('MockNiner branding', () => {
  it('keeps an accessible brand name when the compact header hides the wordmark', () => {
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<BrandMark compact />), 'text/html');
    expect(document.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('MockNiner');
    expect(document.querySelector('.hidden.sm\\:flex')).not.toBeNull();
  });
  it('renders the original wordmark with a decorative, proportioned M9 asset', () => {
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<BrandMark />), 'text/html');
    expect(document.body.textContent).toBe('MockNinerPractice with your agent');
    const logo = document.querySelector('img');
    expect(logo?.getAttribute('src')).toBe('/mockniner-logo.svg');
    expect(logo?.getAttribute('alt')).toBe('');
    expect(logo?.getAttribute('width')).toBe('520');
    expect(logo?.getAttribute('height')).toBe('360');
  });

  it('keeps the wordmark red independently of the assessment theme', () => {
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<BrandMark />), 'text/html');
    const niner = [...document.querySelectorAll('span')].find(span => span.textContent === 'Niner');
    expect(niner?.className).toContain('text-[#c1121f]');
    expect(document.body.innerHTML).not.toContain('--exam-accent');
  });

  it('uses the same M9 geometry for the logo and the small-size favicon', () => {
    const logo = new DOMParser().parseFromString(logoSource, 'image/svg+xml');
    const favicon = new DOMParser().parseFromString(faviconSource, 'image/svg+xml');
    const paths = (document: Document) => [...document.querySelectorAll('path')].map(path => path.getAttribute('d'));
    expect(paths(logo)).toHaveLength(2);
    expect(paths(favicon)).toEqual(paths(logo));
    expect(logo.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 520 360');
    const [, , width, height] = favicon.querySelector('svg')!.getAttribute('viewBox')!.split(' ');
    expect(width).toBe(height);
  });

  it('ships self-contained crimson assets without the original blue-violet accents', () => {
    const logo = new DOMParser().parseFromString(logoSource, 'image/svg+xml');
    expect([...logo.querySelectorAll('#m9-nine stop')].map(stop => stop.getAttribute('stop-color')))
      .toEqual(['#e11d2e', '#c1121f', '#8f0d16']);
    for (const source of [logoSource, faviconSource]) {
      expect(source).toContain('MockNiner');
      expect(source).not.toMatch(/#(?:2f73ff|5a64ff|7957f2)/i);
      const document = new DOMParser().parseFromString(source, 'image/svg+xml');
      expect(document.querySelector('script, image, foreignObject, parsererror')).toBeNull();
    }
  });
});
