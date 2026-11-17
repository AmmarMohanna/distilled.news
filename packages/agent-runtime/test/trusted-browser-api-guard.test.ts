import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const trustedBrowserFiles = [
  resolve(import.meta.dirname, "../src/browser.ts")
];

const forbiddenMethods = new Set(['evaluate','evaluateAll','$eval','$$eval','addScriptTag','exposeFunction','dispatchEvent']);
function violations(source: string): string[] {
  const file=ts.createSourceFile('browser.ts',source,ts.ScriptTarget.Latest,true);
  const found=new Set<string>();
  const member=(node:ts.Node):string|undefined=>ts.isPropertyAccessExpression(node)?node.name.text:
    ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)?node.argumentExpression.text:undefined;
  const visit=(node:ts.Node)=>{
    if(ts.isCallExpression(node)){
      const name=member(node.expression);
      if(name&&forbiddenMethods.has(name))found.add(name);
    }
    if(member(node)==='keyboard')found.add('keyboard');
    if(ts.isStringLiteral(node)&&['Runtime.evaluate','Runtime.callFunctionOn'].includes(node.text))found.add(node.text);
    ts.forEachChild(node,visit);
  };
  visit(file);return [...found];
}

describe("trusted browser observation API guard", () => {
  it("keeps trusted observation and grounding modules out of the page JavaScript realm", () => {
    const failures = trustedBrowserFiles.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return violations(source).map(api=>`${file}: ${api}`);
    });
    expect(failures).toEqual([]);
  });
  it('checks real calls including computed access and template interpolation',()=>{
    expect(violations('page["evaluate"](() => 1); locator.dispatchEvent("click"); page.keyboard.press("Enter"); cdp.send("Runtime.callFunctionOn");')).toEqual(['evaluate','dispatchEvent','keyboard','Runtime.callFunctionOn']);
    expect(violations('const script = `text ${page.evaluate(() => 1)}`;')).toEqual(['evaluate']);
  });
  it('does not confuse literal hardening-script text or comments with host browser calls',()=>{
    expect(violations('const script = `this.dispatchEvent(new Event("error"));`; // page.evaluate()')).toEqual([]);
  });
});
