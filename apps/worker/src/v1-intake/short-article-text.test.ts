import {it,expect} from 'vitest';import {usableShortArticle} from './short-article-text';
it('preserves readable short descriptions but not title/date/navigation alone',()=>{
 expect(usableShortArticle('How OpenAI uses ChatGPT Atlas at work','Webinar How OpenAI uses ChatGPT Atlas at work Watch how OpenAI uses ChatGPT Atlas at work.')).toBe(true);
 expect(usableShortArticle('GPT‑5: Coding & Design','August 7, 2025 API GPT‑5: Coding & Design Try now (opens in a new window) Contact sales')).toBe(false);
 expect(usableShortArticle('Title','Short')).toBe(false);
});
