import {it,expect} from 'vitest';
import {sourceIdentityName} from './source-display';
it.each([
 ['x.com','https://x.com/Annahar','@Annahar'],
 ['twitter.com','https://twitter.com/AlMayadeenNews','@AlMayadeenNews'],
 ['x.com','https://x.com/search?q=from%3AAnnahar%20lang%3Aen','@Annahar'],
 ['t.me','https://t.me/LebanonNews','@LebanonNews'],
 ['@CustomName','https://x.com/Annahar','@CustomName'],
 ['Reuters','https://reuters.com','Reuters'],
 [undefined,'https://example.com/news','example.com']
])('resolves approved identity %s %s', (name,url,expected)=>expect(sourceIdentityName(name,url)).toBe(expected));
it.each(['https://x.com/i/status/123','https://x.com/search?q=from%3Aa%20OR%20from%3Ab','https://x.com/home','https://user:pass@x.com/Annahar','javascript:alert(1)'])('does not invent an account from %s',url=>expect(sourceIdentityName('x.com',url)).toBeUndefined());
