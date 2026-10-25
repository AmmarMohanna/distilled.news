import {expect, it} from 'vitest';
import {sourceEvidenceLabels} from './source-evidence-labels';
it('separates a short retained article title from its publisher', () => {
  const labels=sourceEvidenceLabels({sourceTitle:'Uber puts all 30,000 employees on ChatGPT Work',sourceUrl:'https://techcrunch.com/2026/10/story',links:[]});
  expect(labels).toEqual({headline:'Uber puts all 30,000 employees on ChatGPT Work',publisher:'techcrunch.com'});
});
it('preserves an explicit headline and resolves the publisher domain', () => {
  expect(sourceEvidenceLabels({headline:'Article headline',sourceTitle:'A different article title',sourceUrl:'https://www.techcrunch.com/story',links:[]})).toEqual({headline:'Article headline',publisher:'techcrunch.com'});
});
it('tries retained links after malformed source URLs', () => {
  expect(sourceEvidenceLabels({sourceTitle:'Headline',sourceUrl:'invalid',links:['https://zdnet.com/story']})).toEqual({headline:'Headline',publisher:'zdnet.com'});
});
