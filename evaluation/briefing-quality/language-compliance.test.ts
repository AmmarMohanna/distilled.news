import {describe,it,expect} from 'vitest';
import {languageCompliance,combinedLanguageStatus} from './validation/language-compliance';

describe('independent output-language compliance',()=>{
 const prose={en:'The central bank left its policy rate unchanged at four percent. The decision takes effect on Monday.',fr:'La banque centrale a maintenu son taux directeur à quatre pour cent. Cette décision prend effet lundi.',ar:'أبقى البنك المركزي سعر الفائدة دون تغيير عند أربعة بالمئة. ويبدأ تنفيذ القرار يوم الاثنين.'};
 for(const expected of ['en','fr','ar'] as const)for(const actual of ['en','fr','ar'] as const)it(`${actual} narration requested in ${expected}`,()=>{const r=languageCompliance('',prose[actual],expected);expect(r.status).toBe(actual===expected?'compliant':'noncompliant');expect(r.detected).toBe(actual)});
 it.each([['Bank cuts rates','en'],['La banque réduit ses taux','fr'],['الجيش يفتح الطريق أمام السيارات','ar']] as const)('does not falsely reject short headline %s', (headline,lang)=>{expect(languageCompliance(headline,'',lang).status).not.toBe('noncompliant')});
 it('abstains rather than guessing on an ambiguous three-word English headline',()=>{expect(languageCompliance('Bank cuts rates','','en').status).toBe('unknown')});
 it.each(['Emmanuel Macron','Paris Beirut','Banque du Liban','ONU FMI MEA','بيروت باريس','123 4%'])('abstains on names, abbreviations or insufficient evidence: %s',headline=>{expect(languageCompliance(headline,'','en').status).toBe('unknown')});
 it('accepts English narration containing a French quotation',()=>{expect(languageCompliance('Minister announces a decision','The minister said “Nous allons ouvrir la route demain” while explaining that the road will reopen after inspection.','en').status).toBe('compliant')});
 it('accepts French narration containing an English quotation',()=>{expect(languageCompliance('Le ministre annonce une décision','Le ministre a déclaré « The road will reopen tomorrow » avant de préciser que la réouverture reste soumise à une inspection.','fr').status).toBe('compliant')});
 it('accepts Arabic narration containing a French quotation',()=>{expect(languageCompliance('الوزير يعلن موعد افتتاح الطريق','قال الوزير « La route sera ouverte demain » وأوضح أن إعادة فتح الطريق مرتبطة باستكمال الفحص الفني.','ar').status).toBe('compliant')});
 it('does not accept quote-only wrong-language output as compliant',()=>{expect(languageCompliance('','“The bank will cut interest rates on Monday.”','fr').status).toBe('unknown')});
 it('does not mistake contractions for a quotation',()=>{expect(languageCompliance('',"The bank doesn't expect to change its policy rate until the next meeting.",'en').status).toBe('compliant')});
 it('abstains on genuinely mixed narration',()=>{expect(languageCompliance('','The bank has announced its decision. La banque a annoncé une nouvelle décision importante.','en').status).toBe('unknown')});
 it('does not use article or judge language as the requested language',()=>{const r=languageCompliance('',prose.en,'fr');expect(r.status).toBe('noncompliant');expect(r.requested).toBe('fr')});
 it('keeps unknown evidence and detector/judge disagreements explicit',()=>{expect(combinedLanguageStatus('correct',languageCompliance('Macron','', 'en'))).toBe('uncertain');expect(combinedLanguageStatus('incorrect',languageCompliance('',prose.fr,'fr'))).toBe('uncertain');expect(combinedLanguageStatus('correct',languageCompliance('',prose.en,'fr'))).toBe('incorrect')});
});
