import process from "node:process";
import readline from "node:readline/promises";
const endpoint=process.env.WEB_OPERATOR_RUNTIME_URL;const token=process.env.WEB_OPERATOR_RUNTIME_TOKEN;
if(!endpoint||!token)throw new Error("WEB_OPERATOR_RUNTIME_URL and WEB_OPERATOR_RUNTIME_TOKEN must be set in the environment");
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
const tenantId=(await rl.question("Tenant ID: ")).trim();const ownerId=(await rl.question("Owner ID: ")).trim();const username=(await rl.question("X username/email: ")).trim();
rl.close();const password=await hiddenQuestion("X password: ");
const response=await fetch(new URL("/v1/authenticated-profiles",endpoint),{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({tenantId,ownerId,site:"x",username,password})});
const result=await response.json();if(!response.ok)throw new Error(`Provisioning failed (${response.status}): ${result.error??"unknown_error"}`);process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
async function hiddenQuestion(prompt){if(!process.stdin.isTTY)throw new Error("password provisioning requires an interactive terminal");process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding("utf8");let value="";for await(const chunk of process.stdin){for(const char of chunk){if(char==="\r"||char==="\n"){process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write("\n");return value}if(char==="\u0003"){process.stdin.setRawMode(false);process.exit(130)}if(char==="\b"||char==="\u007f"){value=value.slice(0,-1);continue}value+=char}}throw new Error("password input ended unexpectedly")}
