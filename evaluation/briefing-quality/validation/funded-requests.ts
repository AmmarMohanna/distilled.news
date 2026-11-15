export function generationProvider(model:string){const prices={'openai/gpt-4.1':{prompt:2,completion:8},'openai/gpt-4.1-mini':{prompt:.4,completion:1.6}};if(!Object.hasOwn(prices,model))throw Error('MODEL_ROUTE_NOT_ALLOWED');return{allow_fallbacks:false,require_parameters:true,max_price:prices[model]}}
export const pipelineStatus=(status:string)=>status==='empty'?'quiet':status;
