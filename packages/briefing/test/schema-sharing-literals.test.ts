import {expect,it} from 'vitest';
import {shareSchemaDefinitions} from '../src/schema-sharing';
it('never treats enum/const/default literal objects as nested schemas',()=>{
 const literal={type:'string',description:'literal data with a sufficiently long description for sharing to appear profitable'};
 const schema={type:'object',properties:{a:{enum:[literal,literal,literal]},b:{const:{value:literal}},c:{type:'object',default:{value:literal}}},required:['a','b','c'],additionalProperties:false};
 const result=shareSchemaDefinitions(schema);expect(result.properties).toEqual(schema.properties);expect(JSON.stringify(result)).not.toContain('$ref');
});
it('does not relocate schemas with existing identifier or reference scopes',()=>{
 const row={type:'object',$id:'relative/',properties:{x:{$ref:'other.json'}},additionalProperties:false};
 const schema={type:'object',properties:{a:row,b:row,c:row}};
 expect(shareSchemaDefinitions(schema)).toBe(schema);
});
