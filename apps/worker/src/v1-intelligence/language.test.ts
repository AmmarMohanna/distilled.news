import {expect,it} from 'vitest';
import {resolveLanguage,extractiveLanguageCompatibility,languageResolutionSchema} from './language';
it('resolves declarations before trusted source metadata and records inherited provenance',()=>{
 expect(resolveLanguage({item:'ar',feed:'fr',trustedSource:{language:'en',metadataRef:'source:verified-v1'}})).toEqual({language:'ar',origin:'ITEM_DECLARED'});
 expect(resolveLanguage({feed:'en-GB'})).toEqual({language:'en',origin:'FEED_DECLARED'});
 expect(resolveLanguage({trustedSource:{language:'en',metadataRef:'source:verified-v1'}})).toEqual({language:'en',origin:'TRUSTED_SOURCE',metadataRef:'source:verified-v1'});
 expect(resolveLanguage({})).toEqual({origin:'UNKNOWN'});
});
it('unknown is distinct from a known translation requirement',()=>{
 expect(extractiveLanguageCompatibility('UNKNOWN','en')).toBe('UNKNOWN');
 expect(extractiveLanguageCompatibility(undefined,'en')).toBe('UNKNOWN');
 expect(extractiveLanguageCompatibility('en-GB','en')).toBe('SAME_LANGUAGE');
 expect(extractiveLanguageCompatibility('ar','en')).toBe('TRANSLATION_REQUIRED');
});
it('qualified undetermined language stays UNKNOWN rather than requiring translation',()=>{
 expect(resolveLanguage({item:'und-Latn'})).toEqual({origin:'UNKNOWN'});
 expect(extractiveLanguageCompatibility('und-Latn','en')).toBe('UNKNOWN');
});
it('language provenance cannot claim inheritance without a reference or UNKNOWN with a known language',()=>{
 expect(languageResolutionSchema.safeParse({origin:'TRUSTED_SOURCE',language:'en'}).success).toBe(false);
 expect(languageResolutionSchema.safeParse({origin:'UNKNOWN',language:'en'}).success).toBe(false);
 expect(languageResolutionSchema.safeParse({origin:'ITEM_DECLARED'}).success).toBe(false);
});
